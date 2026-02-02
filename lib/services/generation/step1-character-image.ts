import { createClient } from '@/lib/supabase/server'
import { getStorageClient } from '@/lib/r2-client'
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { openai } from '@/lib/services/ai/openai-client'
import { falClient } from '@/lib/services/ai/fal-client'
import { replicateClient } from '@/lib/services/ai/replicate-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'
import { getGenerationFolderPath } from './generation-service'

export type ImageProvider = 'fal' | 'replicate'

export interface ProviderConfig {
  provider: ImageProvider
  quality?: 'low' | 'medium' | 'high' | 'auto'
}

// Cost per image based on quality (using high quality pricing as default)
export const IMAGE_GENERATION_COSTS: Record<string, number> = {
  'fal-low': 0.013,
  'fal-medium': 0.051,
  'fal-high': 0.200,
  'replicate-low': 0.013,
  'replicate-medium': 0.05,
  'replicate-high': 0.136,
  'replicate-auto': 0.136,
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'fal',
  quality: 'high',
}

export const AVAILABLE_PROVIDERS: { id: ImageProvider; name: string }[] = [
  { id: 'fal', name: 'fal.ai' },
  { id: 'replicate', name: 'Replicate' },
]

export const QUALITY_OPTIONS = [
  { id: 'low', name: 'Ниско ($0.013)' },
  { id: 'medium', name: 'Средно ($0.05)' },
  { id: 'high', name: 'Високо ($0.13-0.20)' },
]

export interface CropData {
  x: number
  y: number
  width: number
  height: number
  unit: 'px' | '%'
}

export interface SelectImageParams {
  generationId: string
  sourceImageKey: string
  version?: number
}

export interface CropImageParams {
  generationId: string
  sourceImageKey: string
  cropData: CropData
}

export class Step1CharacterImageService {
  /**
   * Select a character image from the uploaded images
   */
  async selectCharacterImage(params: SelectImageParams): Promise<any> {
    const supabase = await createClient()

    // Get the next version number
    const { data: existingImages } = await supabase
      .from('generation_character_images')
      .select('version')
      .eq('generation_id', params.generationId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = params.version || (existingImages?.[0]?.version || 0) + 1

    // Deselect all previous images
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', params.generationId)

    // Insert new character image
    const { data, error } = await supabase
      .from('generation_character_images')
      .insert({
        generation_id: params.generationId,
        source_image_key: params.sourceImageKey,
        version: nextVersion,
        is_selected: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error selecting character image:', error)
      throw new Error(`Failed to select character image: ${error.message}`)
    }

    return data
  }

  /**
   * Crop the selected image and save the processed version
   */
  async cropCharacterImage(params: CropImageParams): Promise<any> {
    const supabase = await createClient()

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(params.generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Fetch the source image from S3
    const storageClient = getStorageClient()

    // Determine which bucket to use based on image key pattern
    // Generation images follow pattern: {number}-{number}-{uuid}/...
    const isGenerationImage = /^\d+-\d+-[a-f0-9-]+\//.test(params.sourceImageKey)
    const sourceBucket = isGenerationImage ? generationsBucket : process.env.R2_BUCKET!

    const getCommand = new GetObjectCommand({
      Bucket: sourceBucket,
      Key: params.sourceImageKey,
    })

    let imageBuffer: Buffer
    try {
      const response = await storageClient.send(getCommand)
      const chunks: Uint8Array[] = []
      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(chunk)
        }
        imageBuffer = Buffer.concat(chunks)
      } else {
        throw new Error('Empty response body')
      }
    } catch (error) {
      console.error('Error fetching image from storage:', error)
      throw new Error('Failed to fetch image from storage')
    }

    // Get image metadata for crop calculations
    const metadata = await sharp(imageBuffer).metadata()
    const imageWidth = metadata.width!
    const imageHeight = metadata.height!

    // Calculate crop dimensions based on unit
    let cropX, cropY, cropWidth, cropHeight

    if (params.cropData.unit === '%') {
      cropX = Math.round((params.cropData.x / 100) * imageWidth)
      cropY = Math.round((params.cropData.y / 100) * imageHeight)
      cropWidth = Math.round((params.cropData.width / 100) * imageWidth)
      cropHeight = Math.round((params.cropData.height / 100) * imageHeight)
    } else {
      cropX = Math.round(params.cropData.x)
      cropY = Math.round(params.cropData.y)
      cropWidth = Math.round(params.cropData.width)
      cropHeight = Math.round(params.cropData.height)
    }

    // Crop the image
    const croppedImageBuffer = await sharp(imageBuffer)
      .extract({
        left: cropX,
        top: cropY,
        width: cropWidth,
        height: cropHeight,
      })
      .jpeg({ quality: 90 })
      .toBuffer()

    // Generate new key for cropped image using generation_id
    const timestamp = Date.now()
    const processedImageKey = `${folderPath}/character-cropped-${timestamp}.jpg`

    // Upload cropped image to S3
    const putCommand = new PutObjectCommand({
      Bucket: generationsBucket,
      Key: processedImageKey,
      Body: croppedImageBuffer,
      ContentType: 'image/jpeg',
    })

    try {
      await storageClient.send(putCommand)
    } catch (error) {
      console.error('Error uploading cropped image:', error)
      throw new Error('Failed to upload cropped image')
    }

    // Get the next version number
    const { data: existingImages } = await supabase
      .from('generation_character_images')
      .select('version')
      .eq('generation_id', params.generationId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingImages?.[0]?.version || 0) + 1

    // Deselect all previous versions
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', params.generationId)

    // Create a new version with the cropped image
    const { data: newVersion, error: insertError } = await supabase
      .from('generation_character_images')
      .insert({
        generation_id: params.generationId,
        source_image_key: params.sourceImageKey,
        crop_data: params.cropData as any,
        processed_image_key: processedImageKey,
        version: nextVersion,
        is_selected: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating new version:', insertError)
      throw new Error('Failed to create new version')
    }

    return newVersion
  }

  /**
   * Get all character images for a generation
   */
  async getCharacterImages(generationId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_character_images')
      .select('*')
      .eq('generation_id', generationId)
      .order('version', { ascending: true })

    if (error) {
      console.error('Error fetching character images:', error)
      throw new Error('Failed to fetch character images')
    }

    return data || []
  }

  /**
   * Set a character image as selected
   */
  async selectVersion(generationId: string, characterImageId: string): Promise<void> {
    const supabase = await createClient()

    // Deselect all
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', generationId)

    // Select the specified one
    const { error } = await supabase
      .from('generation_character_images')
      .update({ is_selected: true })
      .eq('id', characterImageId)

    if (error) {
      console.error('Error selecting version:', error)
      throw new Error('Failed to select version')
    }
  }

  /**
   * Delete a character image version
   */
  async deleteCharacterImage(characterImageId: string): Promise<void> {
    const supabase = await createClient()

    // First, get the image record to find the R2 keys
    const { data: imageRecord, error: fetchError } = await supabase
      .from('generation_character_images')
      .select('processed_image_key, generated_image_key')
      .eq('id', characterImageId)
      .single()

    if (fetchError) {
      console.error('Error fetching character image:', fetchError)
      throw new Error('Failed to fetch character image')
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('generation_character_images')
      .delete()
      .eq('id', characterImageId)

    if (deleteError) {
      console.error('Error deleting character image:', deleteError)
      throw new Error('Failed to delete character image')
    }

    const storageClient = getStorageClient()
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')

    // Delete processed image from R2 if it exists
    if (imageRecord?.processed_image_key) {
      try {
        // Determine bucket - generation images follow pattern: {number}-{number}-{uuid}/...
        const isGenerationImage = /^\d+-\d+-[a-f0-9-]+\//.test(imageRecord.processed_image_key)
        const bucket = isGenerationImage ? process.env.R2_GENERATIONS_BUCKET! : process.env.R2_BUCKET!

        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: imageRecord.processed_image_key,
        })

        await storageClient.send(deleteCommand)
        console.log(`Deleted processed image from R2: ${imageRecord.processed_image_key}`)
      } catch (error) {
        console.error('Error deleting processed image from R2:', error)
        // Don't throw - database deletion succeeded, R2 cleanup is best-effort
      }
    }

    // Delete generated image from R2 if it exists
    if (imageRecord?.generated_image_key) {
      try {
        // Determine bucket - generation images follow pattern: {number}-{number}-{uuid}/...
        const isGenerationImage = /^\d+-\d+-[a-f0-9-]+\//.test(imageRecord.generated_image_key)
        const bucket = isGenerationImage ? process.env.R2_GENERATIONS_BUCKET! : process.env.R2_BUCKET!

        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: imageRecord.generated_image_key,
        })

        await storageClient.send(deleteCommand)
        console.log(`Deleted generated image from R2: ${imageRecord.generated_image_key}`)
      } catch (error) {
        console.error('Error deleting generated image from R2:', error)
        // Don't throw - database deletion succeeded, R2 cleanup is best-effort
      }
    }
  }

  /**
   * Upload a user-provided Pixar reference image
   * Creates a new version in generation_character_images with the uploaded image as generated_image_key
   */
  async uploadPixarReference(
    generationId: string,
    file: Buffer,
    filename: string
  ): Promise<any> {
    const supabase = await createClient()

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Process image with sharp (convert to JPEG, optimize)
    const processedImage = await sharp(file)
      .jpeg({ quality: 90 })
      .toBuffer()

    // Generate unique key
    const timestamp = Date.now()
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const imageKey = `${folderPath}/character-uploaded-${timestamp}-${sanitizedFilename}.jpg`

    // Upload to R2
    const storageClient = getStorageClient()
    const putCommand = new PutObjectCommand({
      Bucket: generationsBucket,
      Key: imageKey,
      Body: processedImage,
      ContentType: 'image/jpeg',
    })

    try {
      await storageClient.send(putCommand)
    } catch (error) {
      console.error('Error uploading Pixar reference:', error)
      throw new Error('Failed to upload Pixar reference to storage')
    }

    // Get the next version number
    const { data: existingImages } = await supabase
      .from('generation_character_images')
      .select('version')
      .eq('generation_id', generationId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingImages?.[0]?.version || 0) + 1

    // Deselect all previous versions
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', generationId)

    // Create a new version with the uploaded Pixar reference
    const { data: newVersion, error: insertError } = await supabase
      .from('generation_character_images')
      .insert({
        generation_id: generationId,
        source_image_key: '', // Empty since this is a direct upload, not from original images
        generated_image_key: imageKey, // Store as generated image
        version: nextVersion,
        is_selected: true,
        notes: JSON.stringify({
          type: 'user_uploaded',
          uploadedAt: new Date().toISOString(),
          originalFilename: filename,
        }),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating uploaded Pixar reference version:', insertError)
      throw new Error('Failed to create Pixar reference version')
    }

    console.log(`Successfully uploaded Pixar reference v${nextVersion}`)

    return newVersion
  }

  /**
   * Generate a Pixar-style reference character using selected images
   */
  async generateReferenceCharacter(
    generationId: string,
    bookConfig: any,
    imageKeys: string[],
    customPrompt?: string,
    providerConfig?: ProviderConfig
  ): Promise<any> {
    const supabase = await createClient()
    const config = providerConfig || DEFAULT_PROVIDER_CONFIG

    if (!imageKeys || imageKeys.length === 0) {
      throw new Error('No images selected for generation. Please select at least one image.')
    }

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Generate presigned URLs for all selected images
    const storageClient = getStorageClient()
    const imageUrls: string[] = []

    for (const imageKey of imageKeys) {
      try {
        // Determine which bucket to use based on image key pattern
        // Generation images follow pattern: {number}-{number}-{uuid}/...
        const isGenerationImage = /^\d+-\d+-[a-f0-9-]+\//.test(imageKey)
        const sourceBucket = isGenerationImage ? generationsBucket : process.env.R2_BUCKET!

        const getCommand = new GetObjectCommand({
          Bucket: sourceBucket,
          Key: imageKey,
        })

        // Generate presigned URL valid for 1 hour
        const presignedUrl = await getSignedUrl(storageClient, getCommand, { expiresIn: 3600 })
        imageUrls.push(presignedUrl)
      } catch (error) {
        console.error(`Error generating presigned URL for ${imageKey}:`, error)
        throw new Error(`Failed to generate presigned URL for image: ${imageKey}`)
      }
    }

    console.log(`Generated ${imageUrls.length} presigned URLs for reference images`)

    // Determine final prompt - use custom prompt if provided, otherwise load from YAML
    let finalPrompt: string

    if (customPrompt) {
      // Use custom prompt directly
      finalPrompt = customPrompt
      console.log('Using custom prompt provided by user')
    } else {
      // Load prompt configuration from YAML
      const promptConfig = promptLoader.loadPrompt('0.main_character_prompt.yaml')

      // Prepare JSON data for the prompt - use only book content
      const characterData = bookConfig.content || {}

      // Replace JSON placeholder
      const userPrompt = promptLoader.replaceJsonPlaceholder(promptConfig.user_prompt, characterData)

      // Replace gender pronouns
      const pronoun = bookConfig.gender === 'момиче' || bookConfig.gender === 'girl' ? 'She' : 'He'
      const processedUserPrompt = userPrompt.replace('{He/She}', pronoun).replace('{name}', bookConfig.name)

      // Combine system prompt + user prompt for image generation
      // For image generation APIs, we combine system and user prompts into one
      const systemPromptPart = promptConfig.system_prompt ? `${promptConfig.system_prompt}\n\n` : ''
      finalPrompt = `${systemPromptPart}${processedUserPrompt}`
    }

    // Note about multiple images
    const multiImageNote =
      imageKeys.length > 1
        ? `\n\n**Reference photos**: ${imageKeys.length} photos provided. Analyze all reference photos to create the most accurate facial likeness. Pay special attention to consistent facial features across all photos.`
        : '\n\n**Reference photo**: 1 photo provided. Maintain exact facial likeness from the reference photo.'

    const fullPrompt = `${finalPrompt}${multiImageNote}\n\nCreate a full-body 3D Pixar-style character.`

    console.log(`Generating character with ${imageUrls.length} reference image(s) using ${config.provider}`)
    console.log('Prompt:', fullPrompt.substring(0, 200) + '...')

    // Generate the reference character image using configured provider
    let imageResult: { url?: string; buffer?: Buffer; contentType?: string }

    if (config.provider === 'replicate') {
      // Use Replicate
      imageResult = await replicateClient.generateImage({
        model: 'openai/gpt-image-1.5',
        prompt: fullPrompt,
        imageUrls: imageUrls,
        aspectRatio: '2:3', // Vertical format for full-body character
        additionalParams: {
          quality: config.quality || 'high',
          input_fidelity: 'high',
        },
      })
    } else {
      // Use fal.ai (default)
      imageResult = await falClient.generateImage({
        model: 'fal-ai/gpt-image-1.5/edit',
        prompt: fullPrompt,
        imageUrls: imageUrls,
        size: '1024x1536', // Vertical format for full-body character
        numImages: 1,
        additionalParams: {
          quality: config.quality || 'high',
          input_fidelity: 'high',
        },
      })
    }

    // Download the generated image
    let generatedImageBuffer: Buffer
    if (imageResult.buffer) {
      // Replicate returned a buffer directly (ReadableStream)
      generatedImageBuffer = imageResult.buffer
    } else if (imageResult.url?.startsWith('data:')) {
      // Handle data URLs (mock mode)
      const base64Data = imageResult.url.split(',')[1]
      const buffer = Buffer.from(base64Data, 'base64')

      // Convert to JPEG if needed (SVG from mock needs conversion)
      if (imageResult.contentType?.includes('svg')) {
        generatedImageBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer()
      } else {
        generatedImageBuffer = buffer
      }
    } else if (imageResult.url) {
      // Handle regular URLs from provider
      const imageResponse = await fetch(imageResult.url)
      if (!imageResponse.ok) {
        throw new Error(`Failed to download generated image: ${imageResponse.statusText}`)
      }
      generatedImageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    } else {
      throw new Error('No image data returned from provider')
    }

    // Save the generated reference character using generation_id
    const timestamp = Date.now()
    const referenceKey = `${folderPath}/character-reference-${timestamp}.jpg`

    const putCommand = new PutObjectCommand({
      Bucket: generationsBucket,
      Key: referenceKey,
      Body: generatedImageBuffer,
      ContentType: 'image/jpeg',
    })

    await storageClient.send(putCommand)

    // Get the next version number
    const { data: existingImages } = await supabase
      .from('generation_character_images')
      .select('version')
      .eq('generation_id', generationId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingImages?.[0]?.version || 0) + 1

    // Deselect all previous versions
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', generationId)

    // Calculate generation cost
    const isMockMode = process.env.USE_MOCK_AI === 'true'
    const quality = config.quality || 'high'
    const costKey = `${config.provider}-${quality}`
    const generationCost = isMockMode ? 0 : (IMAGE_GENERATION_COSTS[costKey] || IMAGE_GENERATION_COSTS['fal-high'])

    // Create a new version with the generated reference image
    const { data: newVersion, error: insertError } = await supabase
      .from('generation_character_images')
      .insert({
        generation_id: generationId,
        source_image_key: imageKeys[0], // Keep track of the primary image
        generated_image_key: referenceKey,
        version: nextVersion,
        is_selected: true,
        notes: JSON.stringify({
          type: 'pixar_reference',
          generatedAt: new Date().toISOString(),
          referenceImageKeys: imageKeys,
          imageCount: imageKeys.length,
          model: 'gpt-image-1.5',
          provider: config.provider,
          quality: quality,
          generationCost: generationCost,
        }),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating new version:', insertError)
      throw new Error('Failed to create new version')
    }

    // Update total cost in book_generations table
    if (generationCost > 0) {
      await this.updateTotalCost(generationId, generationCost)
    }

    console.log(`Successfully generated character reference v${nextVersion} using ${imageKeys.length} image(s) via ${config.provider}`)

    // Return the reference key and new version info
    return {
      referenceKey,
      imageCount: imageKeys.length,
      characterImageId: newVersion.id,
      version: nextVersion,
      provider: config.provider,
      quality: quality,
      generationCost: generationCost,
    }
  }

  /**
   * Update the total cost for a generation
   */
  private async updateTotalCost(generationId: string, additionalCost: number): Promise<void> {
    const supabase = await createClient()

    // Get current total cost
    const { data: generation } = await supabase
      .from('book_generations')
      .select('total_cost')
      .eq('id', generationId)
      .single()

    const currentCost = (generation as any)?.total_cost || 0
    const newTotalCost = Number(currentCost) + additionalCost

    // Update total cost
    await supabase
      .from('book_generations')
      .update({ total_cost: newTotalCost } as any)
      .eq('id', generationId)
  }

  /**
   * Get costs for Step 1 (main character generation)
   */
  async getStep1Costs(generationId: string): Promise<{ step1Cost: number; totalCost: number }> {
    const supabase = await createClient()

    // Get all character images with notes containing cost info
    const { data: images } = await supabase
      .from('generation_character_images')
      .select('notes')
      .eq('generation_id', generationId)

    // Sum up costs from notes
    let step1Cost = 0
    if (images) {
      for (const img of images) {
        try {
          const notes = typeof img.notes === 'string' ? JSON.parse(img.notes) : img.notes
          if (notes?.generationCost) {
            step1Cost += Number(notes.generationCost)
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Get total cost from book_generations
    const { data: generation } = await supabase
      .from('book_generations')
      .select('total_cost')
      .eq('id', generationId)
      .single()

    const totalCost = Number((generation as any)?.total_cost) || 0

    return { step1Cost, totalCost }
  }
}

// Singleton instance
let step1ServiceInstance: Step1CharacterImageService | null = null

export function getStep1Service(): Step1CharacterImageService {
  if (!step1ServiceInstance) {
    step1ServiceInstance = new Step1CharacterImageService()
  }
  return step1ServiceInstance
}

export const step1Service = getStep1Service()

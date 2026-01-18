import { createClient } from '@/lib/supabase/server'
import { getStorageClient } from '@/lib/r2-client'
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

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

    // Get the book_config_id for the generation
    const { data: generation, error: genError } = await supabase
      .from('book_generations')
      .select('book_config_id')
      .eq('id', params.generationId)
      .single()

    if (genError || !generation) {
      throw new Error('Generation not found')
    }

    // Fetch the source image from S3
    const storageClient = getStorageClient()
    const getCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
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

    // Generate new key for cropped image
    const timestamp = Date.now()
    const processedImageKey = `generations/${generation.book_config_id}/character-cropped-${timestamp}.jpg`

    // Upload cropped image to S3
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
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
        crop_data: params.cropData,
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
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET!,
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
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET!,
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
   * Generate a Pixar-style reference character using selected images
   */
  async generateReferenceCharacter(
    generationId: string,
    bookConfig: any,
    imageKeys: string[]
  ): Promise<any> {
    const supabase = await createClient()

    if (!imageKeys || imageKeys.length === 0) {
      throw new Error('No images selected for generation. Please select at least one image.')
    }

    // Get the book_config_id for the generation
    const { data: generation, error: genError } = await supabase
      .from('book_generations')
      .select('book_config_id')
      .eq('id', generationId)
      .single()

    if (genError || !generation) {
      throw new Error('Generation not found')
    }

    const bookConfigId = generation.book_config_id

    // For now, we'll use the first image as the primary reference
    // In a real implementation with GPT-4 Vision, you could analyze all images
    const primaryImageKey = imageKeys[0]

    // Fetch the primary image from S3
    const storageClient = getStorageClient()
    const getCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: primaryImageKey,
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
      throw new Error('Failed to fetch reference image from storage')
    }

    // Convert image to base64 for future use (GPT-4 Vision)
    const base64Image = imageBuffer.toString('base64')
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('0.main_character_prompt.yaml')

    // Prepare JSON data for the prompt
    const characterData = {
      name: bookConfig.name,
      age: bookConfig.age,
      gender: bookConfig.gender,
      storyDescription: bookConfig.story_description || '',
    }

    // Replace JSON placeholder
    const userPrompt = promptLoader.replaceJsonPlaceholder(promptConfig.user_prompt, characterData)

    // Replace gender pronouns
    const pronoun = bookConfig.gender === 'момиче' || bookConfig.gender === 'girl' ? 'She' : 'He'
    const finalPrompt = userPrompt.replace('{He/She}', pronoun).replace('{name}', bookConfig.name)

    // Note about multiple images
    const multiImageNote =
      imageKeys.length > 1
        ? `\n\nReference photos: ${imageKeys.length} photos provided. Use the primary reference for facial likeness.`
        : '\n\nReference photo provided. Maintain exact facial likeness.'

    const fullPrompt = `${finalPrompt}${multiImageNote}\n\nCreate a full-body 3D Pixar-style character.`

    // Generate the reference character image
    const imageResult = await openai.generateImage({
      prompt: fullPrompt,
      size: '1024x1024',
      quality: 'standard',
    })

    // Download the generated image
    let generatedImageBuffer: Buffer
    if (imageResult.url.startsWith('data:')) {
      // Handle data URLs (mock mode)
      const base64Data = imageResult.url.split(',')[1]
      const svgBuffer = Buffer.from(base64Data, 'base64')
      generatedImageBuffer = await sharp(svgBuffer).png().toBuffer()
    } else {
      // Handle regular URLs
      const imageResponse = await fetch(imageResult.url)
      generatedImageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    }

    // Save the generated reference character using book_config_id
    const timestamp = Date.now()
    const referenceKey = `generations/${bookConfigId}/character-reference-${timestamp}.jpg`

    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
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

    // Create a new version with the generated reference image
    const { data: newVersion, error: insertError } = await supabase
      .from('generation_character_images')
      .insert({
        generation_id: generationId,
        source_image_key: primaryImageKey, // Keep track of which image was used
        generated_image_key: referenceKey,
        version: nextVersion,
        is_selected: true,
        notes: JSON.stringify({
          type: 'pixar_reference',
          generatedAt: new Date().toISOString(),
          referenceImageKeys: imageKeys,
          imageCount: imageKeys.length,
        }),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating new version:', insertError)
      throw new Error('Failed to create new version')
    }

    // Return the reference key and new version info
    return {
      referenceKey,
      imageCount: imageKeys.length,
      characterImageId: newVersion.id,
      version: nextVersion,
    }
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

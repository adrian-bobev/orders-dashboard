import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { falClient } from '@/lib/services/ai/fal-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'
import { getStorageClient } from '@/lib/r2-client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getGenerationFolderPath } from './generation-service'

export interface GenerateCharacterReferenceParams {
  generationId: string
  characterListId: string
  characterName: string
  characterType?: string
  description?: string | null
  customPrompt?: string
  bookConfig?: any
}

export class Step5CharacterRefsService {
  /**
   * Generate a reference image for a character
   */
  async generateCharacterReference(params: GenerateCharacterReferenceParams): Promise<any> {
    const supabase = await createClient()

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(params.generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // If custom prompt is provided, use it directly
    if (params.customPrompt) {
      // Generate image using fal.ai nano-banana model with custom prompt
      const imageResult = await falClient.generateImage({
        model: 'fal-ai/nano-banana',
        prompt: params.customPrompt,
        size: '1024x1024',
        numImages: 1,
      })

      // Download the generated image
      let imageBuffer: Buffer
      if (imageResult.url.startsWith('data:')) {
        // Handle data URLs (mock mode with SVG)
        const base64Data = imageResult.url.split(',')[1]
        const svgBuffer = Buffer.from(base64Data, 'base64')
        // Convert SVG to PNG using sharp (it handles SVG natively)
        imageBuffer = await sharp(svgBuffer).png().toBuffer()
      } else {
        // Handle regular URLs (real OpenAI images)
        const imageResponse = await fetch(imageResult.url)
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
      }

      // Generate S3 key using generation_id
      const timestamp = Date.now()
      const prefix = params.characterType === 'object' ? 'object' : 'character'
      const imageKey = `${folderPath}/${prefix}-${params.characterName}-${timestamp}.jpg`

      // Upload to S3
      const storageClient = getStorageClient()
      const putCommand = new PutObjectCommand({
        Bucket: generationsBucket,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      })

      await storageClient.send(putCommand)

      // Get the next version number
      const { data: existingRefs } = await supabase
        .from('generation_character_references')
        .select('version')
        .eq('character_list_id', params.characterListId)
        .order('version', { ascending: false })
        .limit(1)

      const nextVersion = (existingRefs?.[0]?.version || 0) + 1

      // Deselect all previous versions for this character
      await supabase
        .from('generation_character_references')
        .update({ is_selected: false })
        .eq('character_list_id', params.characterListId)

      // Save to database
      const { data, error } = await supabase
        .from('generation_character_references')
        .insert({
          generation_id: params.generationId,
          character_list_id: params.characterListId,
          image_key: imageKey,
          image_prompt: params.customPrompt,
          version: nextVersion,
          is_selected: true,
          model_used: 'nano-banana',
          generation_params: {
            size: '1024x1024',
            model: 'fal-ai/nano-banana',
            provider: 'fal.ai',
          },
        })
        .select(
          `
          *,
          generation_character_list (
            id,
            character_name,
            character_type,
            description
          )
        `
        )
        .single()

      if (error) {
        console.error('Error saving character reference:', error)
        throw new Error(`Failed to save character reference: ${error.message}`)
      }

      return data
    }

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('4.characters_prompt.yaml')

    // Create JSON with only book content and character info
    const promptJson = {
      book: params.bookConfig?.content || {},
      character: {
        name: params.characterName,
        type: params.characterType || 'character',
        description: params.description
          ? params.description
          : params.characterType === 'object'
          ? `Generate a reference image for object: ${params.characterName}`
          : `Generate a reference image for character: ${params.characterName}`,
      },
      style: '3D Pixar style, neutral background',
    }

    // Replace JSON placeholder
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      promptJson
    )

    // Combine system prompt + user prompt for image generation
    // For image generation APIs, we combine system and user prompts into one
    const systemPromptPart = promptConfig.system_prompt ? `${promptConfig.system_prompt}\n\n` : ''
    const finalPrompt = `${systemPromptPart}${userPrompt}`

    // Generate image using fal.ai nano-banana model
    const imageResult = await falClient.generateImage({
      model: 'fal-ai/nano-banana',
      prompt: finalPrompt,
      size: '1024x1024',
      numImages: 1,
    })

    // Download the generated image
    let imageBuffer: Buffer
    if (imageResult.url.startsWith('data:')) {
      // Handle data URLs (mock mode with SVG)
      const base64Data = imageResult.url.split(',')[1]
      const svgBuffer = Buffer.from(base64Data, 'base64')
      // Convert SVG to PNG using sharp (it handles SVG natively)
      imageBuffer = await sharp(svgBuffer).png().toBuffer()
    } else {
      // Handle regular URLs (real OpenAI images)
      const imageResponse = await fetch(imageResult.url)
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    }

    // Generate S3 key using generation_id
    const timestamp = Date.now()
    const prefix = params.characterType === 'object' ? 'object' : 'character'
    const imageKey = `${folderPath}/${prefix}-${params.characterName}-${timestamp}.jpg`

    // Upload to S3
    const storageClient = getStorageClient()
    const putCommand = new PutObjectCommand({
      Bucket: generationsBucket,
      Key: imageKey,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    })

    await storageClient.send(putCommand)

    // Get the next version number
    const { data: existingRefs } = await supabase
      .from('generation_character_references')
      .select('version')
      .eq('character_list_id', params.characterListId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingRefs?.[0]?.version || 0) + 1

    // Deselect all previous versions for this character
    await supabase
      .from('generation_character_references')
      .update({ is_selected: false })
      .eq('character_list_id', params.characterListId)

    // Save to database
    const { data, error } = await supabase
      .from('generation_character_references')
      .insert({
        generation_id: params.generationId,
        character_list_id: params.characterListId,
        image_key: imageKey,
        image_prompt: finalPrompt,
        version: nextVersion,
        is_selected: true,
        model_used: 'nano-banana',
        generation_params: {
          size: '1024x1024',
          model: 'fal-ai/nano-banana',
          provider: 'fal.ai',
        },
      })
      .select(
        `
        *,
        generation_character_list (
          id,
          character_name,
          character_type,
          description
        )
      `
      )
      .single()

    if (error) {
      console.error('Error saving character reference:', error)
      throw new Error(`Failed to save character reference: ${error.message}`)
    }

    return data
  }

  /**
   * Generate references for all characters
   */
  async generateAllCharacterReferences(generationId: string, bookConfig?: any): Promise<any[]> {
    const supabase = await createClient()

    // Get all characters for this generation
    const { data: characters, error: fetchError } = await supabase
      .from('generation_character_list')
      .select('*')
      .eq('generation_id', generationId)
      .eq('is_main_character', false)

    if (fetchError) {
      throw new Error(`Failed to fetch characters: ${fetchError.message}`)
    }

    if (!characters || characters.length === 0) {
      return []
    }

    // Generate reference for each character
    const results = []
    for (const character of characters) {
      try {
        const ref = await this.generateCharacterReference({
          generationId,
          characterListId: character.id,
          characterName: character.character_name,
          characterType: character.character_type ?? undefined,
          description: character.description,
          bookConfig,
        })
        results.push(ref)
      } catch (error) {
        console.error(`Failed to generate reference for ${character.character_name}:`, error)
        // Continue with other characters
      }
    }

    return results
  }

  /**
   * Get the default prompt with book content and character info
   */
  async getDefaultPrompt(
    characterName: string,
    characterType: string,
    description: string | null,
    bookConfig: any
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('4.characters_prompt.yaml')

    // Create JSON with only book content and character info
    const promptJson = {
      book: bookConfig?.content || {},
      character: {
        name: characterName,
        type: characterType,
        description:
          description ||
          (characterType === 'object'
            ? `Generate a reference image for object: ${characterName}`
            : `Generate a reference image for character: ${characterName}`),
      },
      style: '3D Pixar style, neutral background',
    }

    // Replace JSON placeholder
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      promptJson
    )

    return {
      systemPrompt: promptConfig.system_prompt || '',
      userPrompt,
    }
  }

  /**
   * Get all character references for a generation
   */
  async getCharacterReferences(generationId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_character_references')
      .select(
        `
        *,
        generation_character_list (
          id,
          character_name,
          character_type,
          description
        )
      `
      )
      .eq('generation_id', generationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching character references:', error)
      throw new Error('Failed to fetch character references')
    }

    return data || []
  }

  /**
   * Select a version as active
   */
  async selectVersion(characterListId: string, referenceId: string): Promise<void> {
    const supabase = await createClient()

    // Deselect all versions for this character
    await supabase
      .from('generation_character_references')
      .update({ is_selected: false })
      .eq('character_list_id', characterListId)

    // Select the specified version
    const { error } = await supabase
      .from('generation_character_references')
      .update({ is_selected: true })
      .eq('id', referenceId)

    if (error) {
      console.error('Error selecting version:', error)
      throw new Error('Failed to select version')
    }
  }

  /**
   * Delete a character reference
   */
  async deleteCharacterReference(referenceId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('generation_character_references')
      .delete()
      .eq('id', referenceId)

    if (error) {
      console.error('Error deleting character reference:', error)
      throw new Error('Failed to delete character reference')
    }
  }

  /**
   * Upload a user-provided reference image for a character/object
   */
  async uploadCharacterReference(
    generationId: string,
    characterListId: string,
    characterName: string,
    characterType: string,
    imageBuffer: Buffer,
    originalFilename: string
  ): Promise<any> {
    const supabase = await createClient()

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Process image: convert to JPEG and optimize
    const processedBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 90 })
      .toBuffer()

    // Generate S3 key
    const timestamp = Date.now()
    const prefix = characterType === 'object' ? 'object' : 'character'
    const imageKey = `${folderPath}/${prefix}-${characterName}-uploaded-${timestamp}.jpg`

    // Upload to S3
    const storageClient = getStorageClient()
    const putCommand = new PutObjectCommand({
      Bucket: generationsBucket,
      Key: imageKey,
      Body: processedBuffer,
      ContentType: 'image/jpeg',
    })

    await storageClient.send(putCommand)

    // Get the next version number
    const { data: existingRefs } = await supabase
      .from('generation_character_references')
      .select('version')
      .eq('character_list_id', characterListId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingRefs?.[0]?.version || 0) + 1

    // Deselect all previous versions for this character
    await supabase
      .from('generation_character_references')
      .update({ is_selected: false })
      .eq('character_list_id', characterListId)

    // Save to database
    const { data, error } = await supabase
      .from('generation_character_references')
      .insert({
        generation_id: generationId,
        character_list_id: characterListId,
        image_key: imageKey,
        image_prompt: null,
        version: nextVersion,
        is_selected: true,
        model_used: null,
        generation_params: null,
        notes: JSON.stringify({
          type: 'user_uploaded',
          originalFilename,
          uploadedAt: new Date().toISOString(),
        }),
      })
      .select(
        `
        *,
        generation_character_list (
          id,
          character_name,
          character_type,
          description
        )
      `
      )
      .single()

    if (error) {
      console.error('Error saving uploaded character reference:', error)
      throw new Error(`Failed to save uploaded character reference: ${error.message}`)
    }

    return data
  }
}

// Singleton instance
let step5ServiceInstance: Step5CharacterRefsService | null = null

export function getStep5Service(): Step5CharacterRefsService {
  if (!step5ServiceInstance) {
    step5ServiceInstance = new Step5CharacterRefsService()
  }
  return step5ServiceInstance
}

export const step5Service = getStep5Service()

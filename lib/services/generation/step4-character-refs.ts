import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { falClient } from '@/lib/services/ai/fal-client'
import { replicateClient } from '@/lib/services/ai/replicate-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'
import { getStorageClient } from '@/lib/r2-client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getGenerationFolderPath } from './generation-service'

export type ImageProvider = 'fal' | 'replicate'

export interface ProviderConfig {
  provider: ImageProvider
  model: string
  // Fal-specific options
  falSize?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536' | 'auto_4K'
  // Replicate-specific options
  replicateSize?: '2K' | '4K' | 'custom'
  replicateAspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '3:2' | '2:3' | '21:9'
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'fal',
  model: 'fal-ai/nano-banana',
  falSize: '1024x1024',
}

// Default model for each provider (both use Nano Banana)
export const DEFAULT_MODEL_PER_PROVIDER: Record<ImageProvider, string> = {
  fal: 'fal-ai/nano-banana',
  replicate: 'google/nano-banana',
}

export const AVAILABLE_PROVIDERS: { id: ImageProvider; name: string }[] = [
  { id: 'fal', name: 'fal.ai' },
  { id: 'replicate', name: 'Replicate' },
]

// Cost per image generation (in USD)
export const IMAGE_GENERATION_COST = 0.039

export interface GenerateCharacterReferenceParams {
  generationId: string
  characterListId: string
  characterName: string
  characterType?: string
  description?: string | null
  customPrompt?: string
  bookConfig?: any
  providerConfig?: ProviderConfig
}

export class Step4CharacterRefsService {
  /**
   * Generate image using the configured provider
   */
  private async generateImageWithProvider(
    prompt: string,
    config: ProviderConfig
  ): Promise<{ url: string; contentType?: string }> {
    if (config.provider === 'replicate') {
      return replicateClient.generateImage({
        model: config.model,
        prompt,
        size: config.replicateSize || '2K',
        aspectRatio: config.replicateAspectRatio || '1:1',
      })
    } else {
      // Default to fal.ai
      return falClient.generateImage({
        model: config.model,
        prompt,
        size: config.falSize || '1024x1024',
        numImages: 1,
      })
    }
  }

  /**
   * Generate a reference image for a character
   */
  async generateCharacterReference(params: GenerateCharacterReferenceParams): Promise<any> {
    const supabase = await createClient()
    const providerConfig = params.providerConfig || DEFAULT_PROVIDER_CONFIG

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(params.generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Determine the final prompt
    let finalPrompt: string

    if (params.customPrompt) {
      finalPrompt = params.customPrompt
    } else {
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
      const systemPromptPart = promptConfig.system_prompt ? `${promptConfig.system_prompt}\n\n` : ''
      finalPrompt = `${systemPromptPart}${userPrompt}`
    }

    // Generate image using the configured provider
    const imageResult = await this.generateImageWithProvider(finalPrompt, providerConfig)

    // Download the generated image
    let imageBuffer: Buffer
    if (imageResult.url.startsWith('data:')) {
      // Handle data URLs (mock mode with SVG)
      const base64Data = imageResult.url.split(',')[1]
      const svgBuffer = Buffer.from(base64Data, 'base64')
      // Convert SVG to PNG using sharp (it handles SVG natively)
      imageBuffer = await sharp(svgBuffer).png().toBuffer()
    } else {
      // Handle regular URLs (real images)
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

    // Extract model name for display
    const modelName = providerConfig.model.split('/').pop() || providerConfig.model

    // Calculate generation cost (skip cost for mock mode)
    const isMockMode = process.env.USE_MOCK_AI === 'true'
    const generationCost = isMockMode ? 0 : IMAGE_GENERATION_COST

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
        model_used: modelName,
        generation_cost: generationCost,
        generation_params: {
          provider: providerConfig.provider,
          model: providerConfig.model,
          ...(providerConfig.provider === 'fal' && { size: providerConfig.falSize }),
          ...(providerConfig.provider === 'replicate' && {
            size: providerConfig.replicateSize,
            aspectRatio: providerConfig.replicateAspectRatio,
          }),
        },
      } as any)
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

    // Update total cost in book_generations table
    if (generationCost > 0) {
      await this.updateTotalCost(params.generationId, generationCost)
    }

    return data
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
   * Generate references for all characters
   */
  async generateAllCharacterReferences(
    generationId: string,
    bookConfig?: any,
    customPrompts?: Record<string, string>,
    providerConfig?: ProviderConfig
  ): Promise<any[]> {
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
          customPrompt: customPrompts?.[character.id],
          bookConfig,
          providerConfig,
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
          description,
          is_main_character
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
   * Get costs for Step 4 (character references)
   */
  async getStep4Costs(generationId: string): Promise<{ step4Cost: number; totalCost: number }> {
    const supabase = await createClient()

    // Get sum of all character reference costs for this generation
    const { data: refs } = await supabase
      .from('generation_character_references')
      .select('generation_cost')
      .eq('generation_id', generationId)

    const step4Cost = (refs as any[])?.reduce((sum, ref) => sum + (Number(ref.generation_cost) || 0), 0) || 0

    // Get total cost from book_generations
    const { data: generation } = await supabase
      .from('book_generations')
      .select('total_cost')
      .eq('id', generationId)
      .single()

    const totalCost = Number((generation as any)?.total_cost) || 0

    return { step4Cost, totalCost }
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
    // Note: notes field was added via migration but types may be out of date
    const { data, error } = await supabase
      .from('generation_character_references')
      .insert({
        generation_id: generationId,
        character_list_id: characterListId,
        image_key: imageKey,
        image_prompt: 'User uploaded reference',
        version: nextVersion,
        is_selected: true,
        model_used: 'user_upload',
        generation_params: JSON.stringify({
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
let step4ServiceInstance: Step4CharacterRefsService | null = null

export function getStep4Service(): Step4CharacterRefsService {
  if (!step4ServiceInstance) {
    step4ServiceInstance = new Step4CharacterRefsService()
  }
  return step4ServiceInstance
}

export const step4Service = getStep4Service()

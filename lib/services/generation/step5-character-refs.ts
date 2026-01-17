import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'
import { getStorageClient } from '@/lib/r2-client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

export interface GenerateCharacterReferenceParams {
  generationId: string
  characterListId: string
  characterName: string
}

export class Step5CharacterRefsService {
  /**
   * Generate a reference image for a character
   */
  async generateCharacterReference(params: GenerateCharacterReferenceParams): Promise<any> {
    const supabase = await createClient()

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('4.characters_prompt.yaml')

    // Create JSON for the character
    const characterJson = {
      name: params.characterName,
      description: `Generate a reference image for character: ${params.characterName}`,
      style: '3D Pixar style, neutral background',
    }

    // Replace JSON placeholder
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      characterJson
    )

    // Generate image using OpenAI
    const imageResult = await openai.generateImage({
      prompt: userPrompt,
      size: '1024x1024',
      quality: 'standard',
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

    // Generate S3 key
    const timestamp = Date.now()
    const imageKey = `generations/${params.generationId}/character-${params.characterName}-${timestamp}.jpg`

    // Upload to S3
    const storageClient = getStorageClient()
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
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
        image_prompt: userPrompt,
        version: nextVersion,
        is_selected: true,
        model_used: 'dall-e-3',
        generation_params: {
          size: '1024x1024',
          quality: 'standard',
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
  async generateAllCharacterReferences(generationId: string): Promise<any[]> {
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

import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

export interface GenerateScenePromptsParams {
  generationId: string
  correctedContent: any
  mainCharacterName?: string
}

export class Step4ScenePromptsService {
  /**
   * Generate scene prompts using OpenAI
   */
  async generateScenePrompts(params: GenerateScenePromptsParams): Promise<any[]> {
    const supabase = await createClient()

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('3.scenes_prompt.yaml')

    // Replace JSON placeholder with corrected content
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      params.correctedContent
    )

    // Call OpenAI to generate scene prompts
    const responseStr = await openai.chat({
      systemPrompt: promptConfig.system_prompt,
      userPrompt,
      model: promptConfig.model,
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.max_tokens,
    })

    // Parse the response
    let sceneData
    try {
      sceneData = JSON.parse(responseStr)
    } catch (error) {
      console.error('Failed to parse scene prompts response:', error)
      throw new Error('Failed to parse AI response as JSON')
    }

    // Delete existing scene prompts for this generation
    await supabase
      .from('generation_scene_prompts')
      .delete()
      .eq('generation_id', params.generationId)

    // Prepare prompts to insert
    const promptsToInsert = []

    // Add book cover prompt
    if (sceneData.bookCover?.imagePrompt) {
      promptsToInsert.push({
        generation_id: params.generationId,
        scene_type: 'cover',
        scene_number: null,
        image_prompt: sceneData.bookCover.imagePrompt,
        prompt_metadata: {
          bookTitle: sceneData.bookTitle,
          canon: sceneData.canon,
        },
      })
    }

    // Add scene prompts
    if (sceneData.scenes && Array.isArray(sceneData.scenes)) {
      sceneData.scenes.forEach((scene: any) => {
        promptsToInsert.push({
          generation_id: params.generationId,
          scene_type: 'scene',
          scene_number: scene.sceneNumber,
          image_prompt: scene.imagePrompt,
          prompt_metadata: {
            characters: scene.characters,
          },
        })
      })
    }

    if (promptsToInsert.length === 0) {
      return []
    }

    // Insert scene prompts
    const { data, error } = await supabase
      .from('generation_scene_prompts')
      .insert(promptsToInsert)
      .select()

    if (error) {
      console.error('Error saving scene prompts:', error)
      throw new Error(`Failed to save scene prompts: ${error.message}`)
    }

    // Extract and save characters and objects from canon
    if (sceneData.canon) {
      await this.extractAndSaveCharactersFromPrompts(
        params.generationId,
        sceneData.canon,
        params.mainCharacterName
      )
    }

    return data || []
  }

  /**
   * Extract and save characters and objects from scene prompts canon
   */
  async extractAndSaveCharactersFromPrompts(
    generationId: string,
    canon: any,
    mainCharacterName?: string
  ): Promise<void> {
    const supabase = await createClient()

    // Delete existing character list entries for this generation
    await supabase
      .from('generation_character_list')
      .delete()
      .eq('generation_id', generationId)
      .eq('is_main_character', false)

    const entitiesToInsert: any[] = []
    let sortOrder = 0

    // Extract characters
    if (canon.characters && Array.isArray(canon.characters)) {
      for (const character of canon.characters) {
        const characterName = character.name?.trim()

        if (!characterName) continue

        // Skip the main character
        if (
          mainCharacterName &&
          characterName.toLowerCase() === mainCharacterName.toLowerCase()
        ) {
          continue
        }

        // Check for duplicates (case-insensitive)
        const isDuplicate = entitiesToInsert.some(
          (entity) => entity.character_name.toLowerCase() === characterName.toLowerCase()
        )

        if (!isDuplicate) {
          entitiesToInsert.push({
            generation_id: generationId,
            character_name: characterName,
            character_type: 'character',
            description: null,
            is_main_character: false,
            sort_order: sortOrder++,
          })
        }
      }
    }

    // Extract objects
    if (canon.objects && Array.isArray(canon.objects)) {
      for (const object of canon.objects) {
        const objectName = object.name?.trim()
        const objectDescription = object.description?.trim() || null

        if (!objectName) continue

        // Check for duplicates (case-insensitive)
        const isDuplicate = entitiesToInsert.some(
          (entity) => entity.character_name.toLowerCase() === objectName.toLowerCase()
        )

        if (!isDuplicate) {
          entitiesToInsert.push({
            generation_id: generationId,
            character_name: objectName,
            character_type: 'object',
            description: objectDescription,
            is_main_character: false,
            sort_order: sortOrder++,
          })
        }
      }
    }

    // Insert all entities
    if (entitiesToInsert.length > 0) {
      const { error } = await supabase
        .from('generation_character_list')
        .insert(entitiesToInsert)

      if (error) {
        console.error('Error saving characters/objects:', error)
        throw new Error(`Failed to save characters/objects: ${error.message}`)
      }
    }
  }

  /**
   * Get all scene prompts for a generation
   */
  async getScenePrompts(generationId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_scene_prompts')
      .select('*')
      .eq('generation_id', generationId)
      .order('scene_number', { ascending: true, nullsFirst: true })

    if (error) {
      console.error('Error fetching scene prompts:', error)
      throw new Error('Failed to fetch scene prompts')
    }

    return data || []
  }

  /**
   * Get extracted characters and objects count
   */
  async getExtractedEntitiesCount(generationId: string): Promise<{
    charactersCount: number
    objectsCount: number
    totalCount: number
  }> {
    const supabase = await createClient()

    // Get characters count
    const { count: charactersCount, error: charError } = await supabase
      .from('generation_character_list')
      .select('*', { count: 'exact', head: true })
      .eq('generation_id', generationId)
      .eq('character_type', 'character')
      .eq('is_main_character', false)

    // Get objects count
    const { count: objectsCount, error: objError } = await supabase
      .from('generation_character_list')
      .select('*', { count: 'exact', head: true })
      .eq('generation_id', generationId)
      .eq('character_type', 'object')
      .eq('is_main_character', false)

    if (charError || objError) {
      console.error('Error fetching entities count:', charError || objError)
      return { charactersCount: 0, objectsCount: 0, totalCount: 0 }
    }

    const total = (charactersCount || 0) + (objectsCount || 0)

    return {
      charactersCount: charactersCount || 0,
      objectsCount: objectsCount || 0,
      totalCount: total,
    }
  }

  /**
   * Update a scene prompt manually
   */
  async updateScenePrompt(promptId: string, imagePrompt: string): Promise<any> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_scene_prompts')
      .update({ image_prompt: imagePrompt })
      .eq('id', promptId)
      .select()
      .single()

    if (error) {
      console.error('Error updating scene prompt:', error)
      throw new Error(`Failed to update scene prompt: ${error.message}`)
    }

    return data
  }

  /**
   * Delete a scene prompt
   */
  async deleteScenePrompt(promptId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('generation_scene_prompts')
      .delete()
      .eq('id', promptId)

    if (error) {
      console.error('Error deleting scene prompt:', error)
      throw new Error(`Failed to delete scene prompt: ${error.message}`)
    }
  }
}

// Singleton instance
let step4ServiceInstance: Step4ScenePromptsService | null = null

export function getStep4Service(): Step4ScenePromptsService {
  if (!step4ServiceInstance) {
    step4ServiceInstance = new Step4ScenePromptsService()
  }
  return step4ServiceInstance
}

export const step4Service = getStep4Service()

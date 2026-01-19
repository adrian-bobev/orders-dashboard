import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

export interface GenerateScenePromptsParams {
  generationId: string
  correctedContent: any
  mainCharacterName?: string
  systemPrompt: string
  userPrompt: string
}

export class Step3ScenePromptsService {
  /**
   * Generate scene prompts using OpenAI
   */
  async generateScenePrompts(params: GenerateScenePromptsParams): Promise<any[]> {
    const supabase = await createClient()

    // Ensure the main character exists in the character list
    if (params.mainCharacterName) {
      await this.ensureMainCharacterExists(params.generationId, params.mainCharacterName)
    }

    // Load prompt configuration for model settings only
    const promptConfig = promptLoader.loadPrompt('3.scenes_prompt.yaml')

    // Use the prompts provided by the caller
    const systemPrompt = params.systemPrompt
    const userPrompt = params.userPrompt

    // Call OpenAI to generate scene prompts
    const responseStr = await openai.chat({
      systemPrompt,
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

    // Auto-associate characters with scenes based on prompt_metadata
    await this.autoAssociateCharactersWithScenes(params.generationId, data || [])

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
   * Ensure the main character exists in generation_character_list
   */
  async ensureMainCharacterExists(generationId: string, characterName: string): Promise<void> {
    const supabase = await createClient()

    // Check if main character already exists
    const { data: existing } = await supabase
      .from('generation_character_list')
      .select('id')
      .eq('generation_id', generationId)
      .eq('is_main_character', true)
      .maybeSingle()

    // If it already exists, we're done
    if (existing) {
      // Make sure we have a reference from Step 1
      await this.syncMainCharacterReference(generationId, existing.id)
      return
    }

    // Create the main character entry
    const { data: newCharacter, error } = await supabase
      .from('generation_character_list')
      .insert({
        generation_id: generationId,
        character_name: characterName,
        character_type: 'character',
        description: 'Main character',
        is_main_character: true,
        is_custom: false,
        sort_order: -1, // Put main character first
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating main character:', error)
      // Don't throw - this is not critical, log and continue
      return
    }

    // Sync the reference image from Step 1
    if (newCharacter) {
      await this.syncMainCharacterReference(generationId, newCharacter.id)
    }
  }

  /**
   * Sync the main character's reference image from Step 1 (generation_character_images)
   * to Step 4 (generation_character_references)
   */
  async syncMainCharacterReference(generationId: string, characterListId: string): Promise<void> {
    const supabase = await createClient()

    // Check if a reference already exists
    const { data: existingRef } = await supabase
      .from('generation_character_references')
      .select('id')
      .eq('character_list_id', characterListId)
      .maybeSingle()

    if (existingRef) {
      // Reference already exists, no need to sync
      return
    }

    // Get the selected character image from Step 1
    const { data: characterImage } = await supabase
      .from('generation_character_images')
      .select('generated_image_key, version')
      .eq('generation_id', generationId)
      .eq('is_selected', true)
      .maybeSingle()

    if (!characterImage || !characterImage.generated_image_key) {
      // No selected main character image yet, skip for now
      return
    }

    // Create a reference entry pointing to the Step 1 image
    const { error } = await supabase
      .from('generation_character_references')
      .insert({
        generation_id: generationId,
        character_list_id: characterListId,
        image_key: characterImage.generated_image_key,
        image_prompt: 'Main character reference from Step 1',
        version: 1,
        is_selected: true,
        model_used: 'step1-reference',
        generation_params: {
          source: 'step1',
          note: 'Synced from generation_character_images',
        },
      })

    if (error) {
      console.error('Error syncing main character reference:', error)
      // Don't throw - this is not critical
    }
  }

  /**
   * Get the default prompt with corrected content
   */
  async getDefaultPrompt(correctedContent: any): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('3.scenes_prompt.yaml')

    // Replace JSON placeholder with corrected content
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      correctedContent
    )

    return {
      systemPrompt: promptConfig.system_prompt || '',
      userPrompt,
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

  /**
   * Auto-associate characters with scenes based on prompt_metadata
   */
  async autoAssociateCharactersWithScenes(
    generationId: string,
    scenePrompts: any[]
  ): Promise<void> {
    const supabase = await createClient()

    // Get all entities (characters and objects) for this generation
    const { data: entities, error: entitiesError } = await supabase
      .from('generation_character_list')
      .select('id, character_name, character_type, is_main_character')
      .eq('generation_id', generationId)

    if (entitiesError || !entities) {
      console.error('Error fetching entities:', entitiesError)
      return
    }

    // Create a map for quick lookup: name -> entity
    const entityMap = new Map<string, any>()
    entities.forEach((entity) => {
      entityMap.set(entity.character_name.toLowerCase(), entity)
    })

    // Find the main character
    const mainCharacter = entities.find((entity) => entity.is_main_character)

    // Delete existing scene-character associations for this generation
    await supabase
      .from('scene_prompt_characters')
      .delete()
      .in(
        'scene_prompt_id',
        scenePrompts.map((p) => p.id)
      )

    // Create associations based on prompt_metadata
    const associationsToInsert: any[] = []
    let sortOrder = 0

    for (const scenePrompt of scenePrompts) {
      // Handle cover prompts - associate main character + key characters from canon
      if (scenePrompt.scene_type === 'cover') {
        const addedEntities = new Set<string>()

        // Always add main character first
        if (mainCharacter) {
          associationsToInsert.push({
            scene_prompt_id: scenePrompt.id,
            character_list_id: mainCharacter.id,
            sort_order: sortOrder++,
          })
          addedEntities.add(mainCharacter.id)
        }

        // Add other characters and objects from canon (limit to top 5 to avoid overcrowding)
        const canon = scenePrompt.prompt_metadata?.canon
        if (canon) {
          // Add secondary characters (non-main characters)
          const secondaryCharacters = canon.characters?.slice(0, 3) || []
          for (const character of secondaryCharacters) {
            const characterName = character.name?.trim()
            if (!characterName) continue

            const entity = entityMap.get(characterName.toLowerCase())
            if (entity && !addedEntities.has(entity.id)) {
              associationsToInsert.push({
                scene_prompt_id: scenePrompt.id,
                character_list_id: entity.id,
                sort_order: sortOrder++,
              })
              addedEntities.add(entity.id)
            }
          }

          // Add important objects (limit to 2)
          const importantObjects = canon.objects?.slice(0, 2) || []
          for (const object of importantObjects) {
            const objectName = object.name?.trim()
            if (!objectName) continue

            const entity = entityMap.get(objectName.toLowerCase())
            if (entity && !addedEntities.has(entity.id)) {
              associationsToInsert.push({
                scene_prompt_id: scenePrompt.id,
                character_list_id: entity.id,
                sort_order: sortOrder++,
              })
              addedEntities.add(entity.id)
            }
          }
        }
        continue
      }

      // Get characters from prompt_metadata for regular scenes
      const characters = scenePrompt.prompt_metadata?.characters || []

      for (const character of characters) {
        // Handle both string format and object format { name: 'Name' }
        const characterName = typeof character === 'string' ? character : character?.name

        if (!characterName) continue

        const entity = entityMap.get(characterName.toLowerCase())
        if (entity) {
          associationsToInsert.push({
            scene_prompt_id: scenePrompt.id,
            character_list_id: entity.id,
            sort_order: sortOrder++,
          })
        }
      }
    }

    // Insert all associations
    if (associationsToInsert.length > 0) {
      const { error } = await supabase
        .from('scene_prompt_characters')
        .insert(associationsToInsert)

      if (error) {
        console.error('Error creating scene-character associations:', error)
      }
    }
  }
}

// Singleton instance
let step3ServiceInstance: Step3ScenePromptsService | null = null

export function getStep3Service(): Step3ScenePromptsService {
  if (!step3ServiceInstance) {
    step3ServiceInstance = new Step3ScenePromptsService()
  }
  return step3ServiceInstance
}

export const step3Service = getStep3Service()

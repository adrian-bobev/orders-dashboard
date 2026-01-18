import { createClient } from '@/lib/supabase/server'

export interface SceneCharacter {
  id: string
  scene_prompt_id: string
  character_list_id: string
  sort_order: number
  created_at: string
  generation_character_list?: {
    id: string
    character_name: string
    character_type: string
    description: string
    is_main_character: boolean
    is_custom: boolean
  }
}

export interface SceneCharacterWithReference extends SceneCharacter {
  selected_reference?: {
    id: string
    image_key: string
    version: number
    image_prompt: string | null
  }
}

export class Step6SceneCharactersService {
  /**
   * Get all scene-character associations for a generation
   * Returns a mapping of scene_prompt_id to array of character_list_ids
   */
  async getSceneCharacters(generationId: string): Promise<Record<string, string[]>> {
    const supabase = await createClient()

    const { data: associations, error } = await supabase
      .from('scene_prompt_characters')
      .select(
        `
        scene_prompt_id,
        character_list_id,
        generation_scene_prompts!inner(generation_id)
      `
      )
      .eq('generation_scene_prompts.generation_id', generationId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching scene characters:', error)
      throw new Error(`Failed to fetch scene characters: ${error.message}`)
    }

    // Group by scene_prompt_id
    const grouped: Record<string, string[]> = {}
    associations?.forEach((assoc: any) => {
      if (!grouped[assoc.scene_prompt_id]) {
        grouped[assoc.scene_prompt_id] = []
      }
      grouped[assoc.scene_prompt_id].push(assoc.character_list_id)
    })

    return grouped
  }

  /**
   * Get characters for a specific scene with full details
   */
  async getSceneCharactersWithDetails(scenePromptId: string): Promise<SceneCharacter[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('scene_prompt_characters')
      .select(
        `
        *,
        generation_character_list (
          id,
          character_name,
          character_type,
          description,
          is_main_character,
          is_custom
        )
      `
      )
      .eq('scene_prompt_id', scenePromptId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching scene characters with details:', error)
      throw new Error(`Failed to fetch scene characters: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get characters for a scene with their selected reference images
   */
  async getSceneCharactersWithReferences(
    scenePromptId: string
  ): Promise<SceneCharacterWithReference[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('scene_prompt_characters')
      .select(
        `
        *,
        generation_character_list (
          id,
          character_name,
          character_type,
          description,
          is_main_character,
          is_custom
        )
      `
      )
      .eq('scene_prompt_id', scenePromptId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching scene characters:', error)
      throw new Error(`Failed to fetch scene characters: ${error.message}`)
    }

    if (!data || data.length === 0) {
      return []
    }

    // Fetch selected reference images for these characters
    const characterListIds = data.map((item: any) => item.character_list_id)

    const { data: references, error: refError } = await supabase
      .from('generation_character_references')
      .select('id, character_list_id, image_key, version, image_prompt')
      .in('character_list_id', characterListIds)
      .eq('is_selected', true)

    if (refError) {
      console.error('Error fetching character references:', refError)
      // Continue without references rather than failing
    }

    // Map references to characters
    const referencesMap = new Map(
      references?.map((ref) => [ref.character_list_id, ref]) || []
    )

    return data.map((item: any) => ({
      ...item,
      selected_reference: referencesMap.get(item.character_list_id),
    }))
  }

  /**
   * Add a character/object to a scene
   */
  async addCharacterToScene(scenePromptId: string, characterListId: string): Promise<void> {
    const supabase = await createClient()

    // Get the max sort_order for this scene
    const { data: existing } = await supabase
      .from('scene_prompt_characters')
      .select('sort_order')
      .eq('scene_prompt_id', scenePromptId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = (existing?.[0]?.sort_order || 0) + 1

    const { error } = await supabase.from('scene_prompt_characters').insert({
      scene_prompt_id: scenePromptId,
      character_list_id: characterListId,
      sort_order: nextSortOrder,
    })

    if (error) {
      // Check if it's a duplicate error
      if (error.code === '23505') {
        // Unique constraint violation - character already in scene
        return // Silently ignore duplicates
      }
      console.error('Error adding character to scene:', error)
      throw new Error(`Failed to add character to scene: ${error.message}`)
    }
  }

  /**
   * Remove a character/object from a scene
   */
  async removeCharacterFromScene(
    scenePromptId: string,
    characterListId: string
  ): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('scene_prompt_characters')
      .delete()
      .eq('scene_prompt_id', scenePromptId)
      .eq('character_list_id', characterListId)

    if (error) {
      console.error('Error removing character from scene:', error)
      throw new Error(`Failed to remove character from scene: ${error.message}`)
    }
  }

  /**
   * Update the display order of characters in a scene
   */
  async updateCharacterOrder(
    scenePromptId: string,
    characterOrders: { characterListId: string; sortOrder: number }[]
  ): Promise<void> {
    const supabase = await createClient()

    // Update each character's sort_order
    const updates = characterOrders.map(({ characterListId, sortOrder }) =>
      supabase
        .from('scene_prompt_characters')
        .update({ sort_order: sortOrder })
        .eq('scene_prompt_id', scenePromptId)
        .eq('character_list_id', characterListId)
    )

    const results = await Promise.all(updates)

    // Check for errors
    const errors = results.filter((result) => result.error)
    if (errors.length > 0) {
      console.error('Error updating character order:', errors)
      throw new Error('Failed to update character order')
    }
  }

  /**
   * Get character reference IDs for a scene
   * Returns only the IDs of selected reference images
   */
  async getSceneCharacterReferenceIds(scenePromptId: string): Promise<string[]> {
    const charactersWithRefs = await this.getSceneCharactersWithReferences(scenePromptId)
    return charactersWithRefs
      .map((item) => item.selected_reference?.id)
      .filter((id): id is string => id !== undefined)
  }
}

// Export singleton instance
export const step6SceneCharactersService = new Step6SceneCharactersService()

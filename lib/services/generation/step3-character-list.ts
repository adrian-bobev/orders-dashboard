import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

export interface ExtractCharactersParams {
  generationId: string
  correctedContent: any
  mainCharacterName: string
}

export interface CreateCharacterParams {
  generationId: string
  characterName: string
  characterType?: string
  description?: string
  sortOrder?: number
}

export interface UpdateCharacterParams {
  characterId: string
  characterName?: string
  characterType?: string
  description?: string
  sortOrder?: number
}

export class Step3CharacterListService {
  /**
   * Extract characters from corrected content using OpenAI
   */
  async extractCharacters(params: ExtractCharactersParams): Promise<any[]> {
    const supabase = await createClient()

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('2.character_extractor.yaml')

    // Replace JSON placeholder with corrected content
    const userPrompt = promptLoader.replaceJsonPlaceholder(
      promptConfig.user_prompt,
      params.correctedContent
    )

    // Call OpenAI to extract characters
    const responseStr = await openai.chat({
      systemPrompt: promptConfig.system_prompt,
      userPrompt,
      model: promptConfig.model,
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.max_tokens,
    })

    // Parse the response
    let extractedData
    try {
      extractedData = JSON.parse(responseStr)
    } catch (error) {
      console.error('Failed to parse character extraction response:', error)
      throw new Error('Failed to parse AI response as JSON')
    }

    const characters = extractedData.characters || []

    console.log('[Step 3] Extracted characters:', characters)
    console.log('[Step 3] Main character name:', params.mainCharacterName)

    // Delete existing characters for this generation
    await supabase
      .from('generation_character_list')
      .delete()
      .eq('generation_id', params.generationId)

    // Insert extracted characters
    const charactersToInsert = characters
      .filter((char: string) => char.toLowerCase() !== params.mainCharacterName.toLowerCase())
      .map((char: string, index: number) => ({
        generation_id: params.generationId,
        character_name: char,
        character_type: 'character',
        is_main_character: false,
        sort_order: index,
      }))

    console.log('[Step 3] Characters to insert:', charactersToInsert)

    if (charactersToInsert.length === 0) {
      console.log('[Step 3] No characters to insert after filtering')
      return []
    }

    const { data, error } = await supabase
      .from('generation_character_list')
      .insert(charactersToInsert)
      .select()

    if (error) {
      console.error('Error saving characters:', error)
      throw new Error(`Failed to save characters: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get all characters for a generation
   */
  async getCharacters(generationId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_character_list')
      .select('*')
      .eq('generation_id', generationId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching characters:', error)
      throw new Error('Failed to fetch characters')
    }

    return data || []
  }

  /**
   * Create a new character manually
   */
  async createCharacter(params: CreateCharacterParams): Promise<any> {
    const supabase = await createClient()

    // Get max sort order
    const { data: existingChars } = await supabase
      .from('generation_character_list')
      .select('sort_order')
      .eq('generation_id', params.generationId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = params.sortOrder ?? (existingChars?.[0]?.sort_order || 0) + 1

    const { data, error } = await supabase
      .from('generation_character_list')
      .insert({
        generation_id: params.generationId,
        character_name: params.characterName,
        character_type: params.characterType || 'character',
        description: params.description,
        sort_order: nextSortOrder,
        is_main_character: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating character:', error)
      throw new Error(`Failed to create character: ${error.message}`)
    }

    return data
  }

  /**
   * Update an existing character
   */
  async updateCharacter(params: UpdateCharacterParams): Promise<any> {
    const supabase = await createClient()

    const updateData: any = {}
    if (params.characterName !== undefined) updateData.character_name = params.characterName
    if (params.characterType !== undefined) updateData.character_type = params.characterType
    if (params.description !== undefined) updateData.description = params.description
    if (params.sortOrder !== undefined) updateData.sort_order = params.sortOrder

    const { data, error } = await supabase
      .from('generation_character_list')
      .update(updateData)
      .eq('id', params.characterId)
      .select()
      .single()

    if (error) {
      console.error('Error updating character:', error)
      throw new Error(`Failed to update character: ${error.message}`)
    }

    return data
  }

  /**
   * Delete a character
   */
  async deleteCharacter(characterId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('generation_character_list')
      .delete()
      .eq('id', characterId)

    if (error) {
      console.error('Error deleting character:', error)
      throw new Error(`Failed to delete character: ${error.message}`)
    }
  }

  /**
   * Reorder characters
   */
  async reorderCharacters(generationId: string, characterIds: string[]): Promise<void> {
    const supabase = await createClient()

    // Update sort order for each character
    for (let i = 0; i < characterIds.length; i++) {
      await supabase
        .from('generation_character_list')
        .update({ sort_order: i })
        .eq('id', characterIds[i])
    }
  }
}

// Singleton instance
let step3ServiceInstance: Step3CharacterListService | null = null

export function getStep3Service(): Step3CharacterListService {
  if (!step3ServiceInstance) {
    step3ServiceInstance = new Step3CharacterListService()
  }
  return step3ServiceInstance
}

export const step3Service = getStep3Service()

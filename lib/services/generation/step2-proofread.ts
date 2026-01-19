import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

export interface ProofreadContentParams {
  generationId: string
  originalContent: any
  systemPrompt: string
  userPrompt: string
}

export class Step2ProofreadService {
  /**
   * Get the default prompt with book content
   */
  async getDefaultPrompt(content: any): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('1.grammar_prompt.yaml')

    // Replace JSON placeholder with content
    const userPrompt = promptLoader.replaceJsonPlaceholder(promptConfig.user_prompt, content)

    return {
      systemPrompt: promptConfig.system_prompt || '',
      userPrompt,
    }
  }

  /**
   * Proofread content using OpenAI
   */
  async proofreadContent(params: ProofreadContentParams): Promise<any> {
    const supabase = await createClient()

    // Load prompt configuration for model settings only
    const promptConfig = promptLoader.loadPrompt('1.grammar_prompt.yaml')

    // Use the prompts provided by the caller
    const systemPrompt = params.systemPrompt
    const userPrompt = params.userPrompt

    // Call OpenAI to proofread
    const correctedContentStr = await openai.chat({
      systemPrompt,
      userPrompt,
      model: promptConfig.model,
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.max_tokens,
    })

    // Parse the corrected content
    let correctedContent
    try {
      correctedContent = JSON.parse(correctedContentStr)
    } catch (error) {
      console.error('Failed to parse corrected content:', error)
      throw new Error('Failed to parse AI response as JSON')
    }

    // Check if we already have corrected content for this generation
    const { data: existing } = await supabase
      .from('generation_corrected_content')
      .select('id')
      .eq('generation_id', params.generationId)
      .maybeSingle()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .update({
          original_content: params.originalContent,
          corrected_content: correctedContent,
          model_used: promptConfig.model || 'gpt-4o',
        })
        .eq('generation_id', params.generationId)
        .select()
        .single()

      if (error) {
        console.error('Error updating corrected content:', error)
        throw new Error(`Failed to update corrected content: ${error.message}`)
      }

      return data
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .insert({
          generation_id: params.generationId,
          original_content: params.originalContent,
          corrected_content: correctedContent,
          model_used: promptConfig.model || 'gpt-4o',
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving corrected content:', error)
        throw new Error(`Failed to save corrected content: ${error.message}`)
      }

      return data
    }
  }

  /**
   * Get corrected content for a generation
   */
  async getCorrectedContent(generationId: string): Promise<any | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_corrected_content')
      .select('*')
      .eq('generation_id', generationId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching corrected content:', error)
      throw new Error('Failed to fetch corrected content')
    }

    return data
  }

  /**
   * Save manually edited content (before AI correction)
   */
  async saveManuallyEditedContent(generationId: string, manuallyEditedContent: any): Promise<any> {
    const supabase = await createClient()

    // Check if we already have a record for this generation
    const { data: existing } = await supabase
      .from('generation_corrected_content')
      .select('id')
      .eq('generation_id', generationId)
      .maybeSingle()

    // Note: manually_edited_content was added via migration but types may be out of date
    // Using type assertion to handle this
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .update({
          manually_edited_content: manuallyEditedContent,
        } as any)
        .eq('generation_id', generationId)
        .select()
        .single()

      if (error) {
        console.error('Error updating manually edited content:', error)
        throw new Error(`Failed to update manually edited content: ${error.message}`)
      }

      return data
    } else {
      // Insert new record for manually edited content only
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .insert({
          generation_id: generationId,
          original_content: {},
          corrected_content: {},
          manually_edited_content: manuallyEditedContent,
        } as any)
        .select()
        .single()

      if (error) {
        console.error('Error saving manually edited content:', error)
        throw new Error(`Failed to save manually edited content: ${error.message}`)
      }

      return data
    }
  }

  /**
   * Update corrected content manually (if user edits it or skips AI correction)
   * This method handles upsert - creates if doesn't exist, updates if exists
   */
  async updateCorrectedContent(generationId: string, correctedContent: any): Promise<any> {
    const supabase = await createClient()

    // Check if record exists
    const { data: existing } = await supabase
      .from('generation_corrected_content')
      .select('id')
      .eq('generation_id', generationId)
      .maybeSingle()

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .update({
          corrected_content: correctedContent,
        })
        .eq('generation_id', generationId)
        .select()
        .single()

      if (error) {
        console.error('Error updating corrected content:', error)
        throw new Error('Failed to update corrected content')
      }

      return data
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('generation_corrected_content')
        .insert({
          generation_id: generationId,
          original_content: {},
          corrected_content: correctedContent,
        })
        .select()
        .single()

      if (error) {
        console.error('Error inserting corrected content:', error)
        throw new Error('Failed to insert corrected content')
      }

      return data
    }
  }

  /**
   * Delete corrected content
   */
  async deleteCorrectedContent(generationId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('generation_corrected_content')
      .delete()
      .eq('generation_id', generationId)

    if (error) {
      console.error('Error deleting corrected content:', error)
      throw new Error('Failed to delete corrected content')
    }
  }
}

// Singleton instance
let step2ServiceInstance: Step2ProofreadService | null = null

export function getStep2Service(): Step2ProofreadService {
  if (!step2ServiceInstance) {
    step2ServiceInstance = new Step2ProofreadService()
  }
  return step2ServiceInstance
}

export const step2Service = getStep2Service()

import { createClient } from '@/lib/supabase/server'

// These types will be available after we regenerate database.types.ts
type BookGeneration = any // Will be: Database['public']['Tables']['book_generations']['Row']
type BookGenerationInsert = any // Will be: Database['public']['Tables']['book_generations']['Insert']

export class GenerationService {
  /**
   * Create a new generation for a book configuration
   */
  async createGeneration(bookConfigId: string, userId: string): Promise<BookGeneration> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('book_generations')
      .insert({
        book_config_id: bookConfigId,
        current_step: 1,
        status: 'in_progress',
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating generation:', error)
      throw new Error(`Failed to create generation: ${error.message}`)
    }

    return data
  }

  /**
   * Get generation by ID with all related data
   */
  async getGenerationById(generationId: string): Promise<any> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('book_generations')
      .select(
        `
        *,
        book_configurations!inner (
          id,
          name,
          age,
          gender,
          content,
          images,
          story_description
        )
      `
      )
      .eq('id', generationId)
      .single()

    if (error) {
      console.error('Error fetching generation:', error)
      throw new Error(`Failed to fetch generation: ${error.message}`)
    }

    return data
  }

  /**
   * Get all generations for a book configuration
   */
  async getGenerationsByBookConfigId(bookConfigId: string): Promise<BookGeneration[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('book_generations')
      .select('*')
      .eq('book_config_id', bookConfigId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching generations:', error)
      throw new Error(`Failed to fetch generations: ${error.message}`)
    }

    return data || []
  }

  /**
   * Update generation step and completion status
   */
  async updateGenerationStep(
    generationId: string,
    step: number,
    stepsCompleted: Record<string, boolean>
  ): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
      .from('book_generations')
      .update({
        current_step: step,
        steps_completed: stepsCompleted,
      })
      .eq('id', generationId)

    if (error) {
      console.error('Error updating generation:', error)
      throw new Error(`Failed to update generation: ${error.message}`)
    }
  }

  /**
   * Mark a step as completed
   */
  async markStepCompleted(generationId: string, stepNumber: number): Promise<void> {
    const supabase = await createClient()

    // Get current generation
    const { data: generation, error: fetchError } = await supabase
      .from('book_generations')
      .select('steps_completed, current_step')
      .eq('id', generationId)
      .single()

    if (fetchError) {
      throw new Error(`Failed to fetch generation: ${fetchError.message}`)
    }

    const stepsCompleted = (generation.steps_completed as Record<string, boolean>) || {}
    stepsCompleted[`step${stepNumber}`] = true

    // Determine next step
    let nextStep = generation.current_step
    if (stepNumber === generation.current_step && stepNumber < 6) {
      nextStep = stepNumber + 1
    }

    const { error: updateError } = await supabase
      .from('book_generations')
      .update({
        steps_completed: stepsCompleted,
        current_step: nextStep,
      })
      .eq('id', generationId)

    if (updateError) {
      throw new Error(`Failed to update step: ${updateError.message}`)
    }
  }

  /**
   * Update generation status (in_progress, completed, failed)
   */
  async updateGenerationStatus(
    generationId: string,
    status: 'in_progress' | 'completed' | 'failed'
  ): Promise<void> {
    const supabase = await createClient()

    const updateData: any = { status }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('book_generations')
      .update(updateData)
      .eq('id', generationId)

    if (error) {
      console.error('Error updating generation status:', error)
      throw new Error(`Failed to update generation status: ${error.message}`)
    }
  }

  /**
   * Get or create generation for a book config
   * Returns the most recent in-progress generation or creates a new one
   */
  async getOrCreateGeneration(bookConfigId: string, userId: string): Promise<BookGeneration> {
    const supabase = await createClient()

    // Try to find existing in-progress generation
    const { data: existing } = await supabase
      .from('book_generations')
      .select('*')
      .eq('book_config_id', bookConfigId)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return existing
    }

    // Create new generation
    return this.createGeneration(bookConfigId, userId)
  }

  /**
   * Delete a generation and all its related data
   */
  async deleteGeneration(generationId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase.from('book_generations').delete().eq('id', generationId)

    if (error) {
      console.error('Error deleting generation:', error)
      throw new Error(`Failed to delete generation: ${error.message}`)
    }
  }
}

// Singleton instance
let generationServiceInstance: GenerationService | null = null

export function getGenerationService(): GenerationService {
  if (!generationServiceInstance) {
    generationServiceInstance = new GenerationService()
  }
  return generationServiceInstance
}

export const generationService = getGenerationService()

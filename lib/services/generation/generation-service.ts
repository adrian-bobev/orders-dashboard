import { createClient } from '@/lib/supabase/server'
import { getStorageClient } from '@/lib/r2-client'
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// These types will be available after we regenerate database.types.ts
type BookGeneration = any // Will be: Database['public']['Tables']['book_generations']['Row']
type BookGenerationInsert = any // Will be: Database['public']['Tables']['book_generations']['Insert']

/**
 * Info needed for error notifications
 */
export interface GenerationOrderInfo {
  orderId: string
  orderNumber: string
  bookName: string
  storyName: string
}

/**
 * Get the R2 folder path for a generation
 * Format: {orderNumber}-{configNumber}-{generationId}
 * Example: 12345-1-abc123-def456-ghi789
 */
export async function getGenerationFolderPath(generationId: string): Promise<string> {
  const supabase = await createClient()

  // Get generation with book_config_id
  const { data: generation, error: genError } = await supabase
    .from('book_generations')
    .select('book_config_id')
    .eq('id', generationId)
    .single()

  if (genError || !generation) {
    throw new Error(`Generation not found: ${generationId}`)
  }

  // Get book_config with config_id and line_item_id
  const { data: bookConfig, error: configError } = await supabase
    .from('book_configurations')
    .select('config_id, line_item_id')
    .eq('id', generation.book_config_id)
    .single()

  if (configError || !bookConfig) {
    throw new Error(`Book configuration not found: ${generation.book_config_id}`)
  }

  // Get line_item with order_id
  const { data: lineItem, error: lineError } = await supabase
    .from('line_items')
    .select('order_id')
    .eq('id', bookConfig.line_item_id)
    .single()

  if (lineError || !lineItem) {
    throw new Error(`Line item not found: ${bookConfig.line_item_id}`)
  }

  // Get order with order_number (or woocommerce_order_id)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('order_number, woocommerce_order_id')
    .eq('id', lineItem.order_id)
    .single()

  if (orderError || !order) {
    throw new Error(`Order not found: ${lineItem.order_id}`)
  }

  // Use order_number if available, otherwise use woocommerce_order_id
  const orderNumber = order.order_number || order.woocommerce_order_id
  const configNumber = bookConfig.config_id

  return `${orderNumber}-${configNumber}-${generationId}`
}

/**
 * Get order info from a generation ID for error notifications
 */
export async function getOrderInfoFromGeneration(generationId: string): Promise<GenerationOrderInfo | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('book_generations')
      .select(`
        book_configurations!inner (
          id,
          name,
          content,
          line_items!inner (
            product_name,
            orders!inner (
              id,
              order_number,
              woocommerce_order_id
            )
          )
        )
      `)
      .eq('id', generationId)
      .single()

    if (error || !data) {
      console.error('Error fetching order info for generation:', error)
      return null
    }

    const bookConfig = data.book_configurations as any
    const lineItem = bookConfig.line_items
    const order = lineItem.orders
    const content = bookConfig.content as { title?: string } | null

    return {
      orderId: order.id,
      orderNumber: order.order_number || order.woocommerce_order_id?.toString() || 'N/A',
      bookName: bookConfig.name,
      storyName: content?.title || lineItem.product_name || 'Unknown',
    }
  } catch (e) {
    console.error('Error getting order info from generation:', e)
    return null
  }
}

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
    if (stepNumber === generation.current_step && stepNumber < 5) {
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
   * This includes:
   * - Step 1: Main character images (generation_character_images)
   * - Step 2: Corrected content (generation_corrected_content)
   * - Step 3: Scene prompts (generation_scene_prompts)
   * - Step 4: Character references (generation_character_references)
   * - Step 5: Scene images (generation_scene_images)
   * - All R2 files associated with the generation (entire folder)
   * - The generation record itself
   *
   * This method is reusable and can be called from UI buttons or automated cleanup processes
   */
  async deleteGeneration(generationId: string): Promise<void> {
    const supabase = await createClient()

    console.log(`Starting deletion of generation ${generationId}`)

    // 1. Get generation folder path
    const folderPath = await getGenerationFolderPath(generationId)
    console.log(`Generation folder path: ${folderPath}`)

    // 2. Delete all R2 files for this generation (entire folder)
    const storageClient = getStorageClient()
    const r2KeysToDelete: string[] = []
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: generationsBucket,
        Prefix: `${folderPath}/`,
      })

      const listResponse = await storageClient.send(listCommand)

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        for (const item of listResponse.Contents) {
          if (item.Key) {
            r2KeysToDelete.push(item.Key)
          }
        }
      }
    } catch (error) {
      console.error('Error listing R2 objects:', error)
      // Don't throw - continue with deletion
    }

    // Delete all R2 files in parallel
    console.log(`Deleting ${r2KeysToDelete.length} R2 files from ${generationsBucket} bucket`)
    const deletePromises = r2KeysToDelete.map(async (key) => {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: generationsBucket,
          Key: key,
        })
        await storageClient.send(deleteCommand)
        console.log(`Deleted R2 file: ${key}`)
      } catch (error) {
        console.error(`Error deleting R2 file ${key}:`, error)
        // Don't throw - best effort deletion
      }
    })

    await Promise.allSettled(deletePromises)

    // 4. Delete database records
    // Note: Most tables have ON DELETE CASCADE from book_generations,
    // but we'll explicitly delete them to ensure cleanup and for logging

    // 4a. Delete scene images (Step 5)
    const { error: deleteSceneImagesError } = await supabase
      .from('generation_scene_images')
      .delete()
      .eq('generation_id', generationId)

    if (deleteSceneImagesError) {
      console.error('Error deleting scene images:', deleteSceneImagesError)
    } else {
      console.log('Deleted scene images records')
    }

    // 4b. Delete scene prompts (Step 3)
    const { error: deleteScenePromptsError } = await supabase
      .from('generation_scene_prompts')
      .delete()
      .eq('generation_id', generationId)

    if (deleteScenePromptsError) {
      console.error('Error deleting scene prompts:', deleteScenePromptsError)
    } else {
      console.log('Deleted scene prompts records')
    }

    // 4c. Delete character references (Step 4)
    const { error: deleteCharRefsError } = await supabase
      .from('generation_character_references')
      .delete()
      .eq('generation_id', generationId)

    if (deleteCharRefsError) {
      console.error('Error deleting character references:', deleteCharRefsError)
    } else {
      console.log('Deleted character references records')
    }

    // 4d. Delete character list (orphaned from old step 3)
    const { error: deleteCharListError } = await supabase
      .from('generation_character_list')
      .delete()
      .eq('generation_id', generationId)

    if (deleteCharListError) {
      console.error('Error deleting character list:', deleteCharListError)
    } else {
      console.log('Deleted character list records')
    }

    // 4e. Delete corrected content (Step 2)
    const { error: deleteCorrectedError } = await supabase
      .from('generation_corrected_content')
      .delete()
      .eq('generation_id', generationId)

    if (deleteCorrectedError) {
      console.error('Error deleting corrected content:', deleteCorrectedError)
    } else {
      console.log('Deleted corrected content records')
    }

    // 4f. Delete character images (Step 1)
    const { error: deleteCharImagesError } = await supabase
      .from('generation_character_images')
      .delete()
      .eq('generation_id', generationId)

    if (deleteCharImagesError) {
      console.error('Error deleting character images:', deleteCharImagesError)
      throw new Error(`Failed to delete character images: ${deleteCharImagesError.message}`)
    } else {
      console.log('Deleted character images records')
    }

    // 5. Delete the generation record itself
    const { error: deleteError } = await supabase
      .from('book_generations')
      .delete()
      .eq('id', generationId)

    if (deleteError) {
      console.error('Error deleting generation:', deleteError)
      throw new Error(`Failed to delete generation: ${deleteError.message}`)
    }

    console.log(`Successfully deleted generation ${generationId} and all related data:`)
    console.log(`- Main character images (Step 1)`)
    console.log(`- Corrected content (Step 2)`)
    console.log(`- Scene prompts (Step 3)`)
    console.log(`- Character references (Step 4)`)
    console.log(`- Scene images (Step 5)`)
    console.log(`- ${r2KeysToDelete.length} R2 files`)
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

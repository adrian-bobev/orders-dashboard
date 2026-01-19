import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { falClient } from '@/lib/services/ai/fal-client'
import { getStorageClient, getImageUrl } from '@/lib/r2-client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getGenerationFolderPath } from './generation-service'

export interface GenerateSceneImageParams {
  generationId: string
  scenePromptId: string
  imagePrompt: string
  characterReferenceIds?: string[]
}

export interface BatchGenerateParams {
  generationId: string
  scenePromptIds: string[]
}

export class Step5SceneImagesService {
  /**
   * Generate an image for a single scene
   */
  async generateSceneImage(params: GenerateSceneImageParams): Promise<any> {
    const supabase = await createClient()

    // Get generation folder path
    const folderPath = await getGenerationFolderPath(params.generationId)
    const generationsBucket = process.env.R2_GENERATIONS_BUCKET || 'generations'

    // Get the scene prompt details
    const { data: scenePrompt, error: promptError } = await supabase
      .from('generation_scene_prompts')
      .select('*')
      .eq('id', params.scenePromptId)
      .single()

    if (promptError || !scenePrompt) {
      throw new Error('Scene prompt not found')
    }

    // Check if there's already a generation in progress for this scene
    const { data: existingGenerating } = await supabase
      .from('generation_scene_images')
      .select('id')
      .eq('scene_prompt_id', params.scenePromptId)
      .eq('generation_status', 'generating')
      .limit(1)

    if (existingGenerating && existingGenerating.length > 0) {
      throw new Error('Image generation already in progress for this scene')
    }

    // Create a new pending record for this generation attempt
    // This ensures atomic tracking of the generation process
    const { data: pendingRecord, error: pendingError } = await supabase
      .from('generation_scene_images')
      .insert({
        generation_id: params.generationId,
        scene_prompt_id: params.scenePromptId,
        image_key: '', // Placeholder, will be updated on completion
        version: 0, // Placeholder, will be updated on completion
        is_selected: false,
        generation_status: 'generating',
      })
      .select()
      .single()

    if (pendingError || !pendingRecord) {
      throw new Error('Failed to create generation record')
    }

    try {
      // Fetch reference image URLs if character references are provided
      let referenceImageUrls: string[] = []
      if (params.characterReferenceIds && params.characterReferenceIds.length > 0) {
        const { data: references } = await supabase
          .from('generation_character_references')
          .select('image_key')
          .in('id', params.characterReferenceIds)

        if (references && references.length > 0) {
          referenceImageUrls = references
            .map((ref) => getImageUrl(ref.image_key))
            .filter((url): url is string => url !== undefined)
        }
      }

      // Seedream v4.5 Edit requires at least one reference image
      if (referenceImageUrls.length === 0) {
        throw new Error(
          'ByteDance Seedream v4.5 Edit model requires at least one reference image. Please add characters or objects to this scene.'
        )
      }

      // Generate image using fal.ai ByteDance Seedream v4.5 Edit model
      const imageResult = await falClient.generateImage({
        model: 'fal-ai/bytedance/seedream/v4.5/edit',
        prompt: params.imagePrompt,
        imageUrls: referenceImageUrls,
        size: 'auto_4K',
        numImages: 1,
        additionalParams: {
          enable_safety_checker: true,
        },
      })

      // Download the generated image
      let imageBuffer: Buffer
      if (imageResult.url.startsWith('data:')) {
        // Handle data URLs (mock mode with SVG)
        const base64Data = imageResult.url.split(',')[1]
        const svgBuffer = Buffer.from(base64Data, 'base64')
        // Convert SVG to PNG using sharp
        imageBuffer = await sharp(svgBuffer).png().toBuffer()
      } else {
        // Handle regular URLs (real fal.ai images)
        const imageResponse = await fetch(imageResult.url)
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
      }

      // Generate S3 key using generation_id
      const timestamp = Date.now()
      const sceneType = scenePrompt.scene_type === 'cover' ? 'cover' : `scene-${scenePrompt.scene_number}`
      const imageKey = `${folderPath}/${sceneType}-${timestamp}.jpg`

      // Upload to S3
      const storageClient = getStorageClient()
      const putCommand = new PutObjectCommand({
        Bucket: generationsBucket,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      })

      await storageClient.send(putCommand)

      // Get the next version number (exclude the current pending record with version 0)
      const { data: existingImages } = await supabase
        .from('generation_scene_images')
        .select('version')
        .eq('scene_prompt_id', params.scenePromptId)
        .neq('id', pendingRecord.id)
        .order('version', { ascending: false })
        .limit(1)

      // Handle version 0 properly with nullish coalescing
      const nextVersion = ((existingImages?.[0]?.version ?? -1) + 1) || 1

      // Deselect all previous versions for this scene
      await supabase
        .from('generation_scene_images')
        .update({ is_selected: false })
        .eq('scene_prompt_id', params.scenePromptId)

      // Update the pending record with the final data
      const { data, error } = await supabase
        .from('generation_scene_images')
        .update({
          image_key: imageKey,
          version: nextVersion,
          is_selected: true,
          generation_status: 'completed',
          completed_at: new Date().toISOString(),
          model_used: 'fal-ai/bytedance/seedream/v4.5/edit',
          generation_params: {
            size: 'auto_4K',
            reference_images_count: referenceImageUrls.length,
          },
          image_prompt: params.imagePrompt,
          character_reference_ids: params.characterReferenceIds
            ? JSON.stringify(params.characterReferenceIds)
            : null,
        })
        .eq('id', pendingRecord.id)
        .select()
        .single()

      if (error) {
        console.error('Error saving scene image:', error)
        throw new Error(`Failed to save scene image: ${error.message}`)
      }

      return data
    } catch (error) {
      // Update status to failed on the specific record we created
      await supabase
        .from('generation_scene_images')
        .update({
          generation_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', pendingRecord.id)

      throw error
    }
  }

  /**
   * Generate images for multiple scenes (batch)
   */
  async batchGenerateSceneImages(params: BatchGenerateParams): Promise<any[]> {
    const supabase = await createClient()

    // Get all scene prompts
    const { data: scenePrompts, error: fetchError } = await supabase
      .from('generation_scene_prompts')
      .select('*')
      .in('id', params.scenePromptIds)

    if (fetchError) {
      throw new Error(`Failed to fetch scene prompts: ${fetchError.message}`)
    }

    if (!scenePrompts || scenePrompts.length === 0) {
      return []
    }

    // Import the scene characters service to fetch character references
    const { step5SceneCharactersService } = await import('./step5-scene-characters-service')

    // Generate images sequentially (to avoid rate limits)
    const results = []
    for (const prompt of scenePrompts) {
      try {
        // Fetch character reference IDs for this scene
        const characterReferenceIds = await step5SceneCharactersService.getSceneCharacterReferenceIds(
          prompt.id
        )

        const image = await this.generateSceneImage({
          generationId: params.generationId,
          scenePromptId: prompt.id,
          imagePrompt: prompt.image_prompt,
          characterReferenceIds: characterReferenceIds.length > 0 ? characterReferenceIds : undefined,
        })
        results.push({ success: true, scenePromptId: prompt.id, image })
      } catch (error) {
        console.error(`Failed to generate image for scene ${prompt.scene_number}:`, error)
        results.push({
          success: false,
          scenePromptId: prompt.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return results
  }

  /**
   * Get all scene images for a generation
   */
  async getSceneImages(generationId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_scene_images')
      .select(
        `
        *,
        generation_scene_prompts (
          id,
          scene_type,
          scene_number,
          image_prompt
        )
      `
      )
      .eq('generation_id', generationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching scene images:', error)
      throw new Error('Failed to fetch scene images')
    }

    return data || []
  }

  /**
   * Select a version as active
   */
  async selectVersion(scenePromptId: string, imageId: string): Promise<void> {
    const supabase = await createClient()

    // Deselect all versions for this scene
    await supabase
      .from('generation_scene_images')
      .update({ is_selected: false })
      .eq('scene_prompt_id', scenePromptId)

    // Select the specified version
    const { error } = await supabase
      .from('generation_scene_images')
      .update({ is_selected: true })
      .eq('id', imageId)

    if (error) {
      console.error('Error selecting version:', error)
      throw new Error('Failed to select version')
    }
  }

  /**
   * Delete a scene image
   */
  async deleteSceneImage(imageId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase.from('generation_scene_images').delete().eq('id', imageId)

    if (error) {
      console.error('Error deleting scene image:', error)
      throw new Error('Failed to delete scene image')
    }
  }

  /**
   * Get scenes without images (for batch generation)
   * Returns IDs of all prompts (including cover) that don't have completed images
   */
  async getScenesWithoutImages(generationId: string): Promise<string[]> {
    const supabase = await createClient()

    // Get all scene prompts (including cover)
    const { data: allPrompts } = await supabase
      .from('generation_scene_prompts')
      .select('id')
      .eq('generation_id', generationId)

    if (!allPrompts) return []

    // Get scene prompts that already have completed images
    const { data: imagesData } = await supabase
      .from('generation_scene_images')
      .select('scene_prompt_id')
      .eq('generation_id', generationId)
      .eq('generation_status', 'completed')

    const promptsWithImages = new Set(imagesData?.map((img) => img.scene_prompt_id) || [])

    // Return prompts without images (cover will be included if it has no image)
    return allPrompts.filter((p) => !promptsWithImages.has(p.id)).map((p) => p.id)
  }

  /**
   * Get generation history for a specific scene
   * Returns all versions with full metadata
   */
  async getSceneGenerationHistory(scenePromptId: string): Promise<any[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('generation_scene_images')
      .select('*')
      .eq('scene_prompt_id', scenePromptId)
      .order('version', { ascending: false })

    if (error) {
      console.error('Error fetching generation history:', error)
      throw new Error('Failed to fetch generation history')
    }

    return data || []
  }
}

// Singleton instance
let step5ServiceInstance: Step5SceneImagesService | null = null

export function getStep5Service(): Step5SceneImagesService {
  if (!step5ServiceInstance) {
    step5ServiceInstance = new Step5SceneImagesService()
  }
  return step5ServiceInstance
}

export const step5Service = getStep5Service()

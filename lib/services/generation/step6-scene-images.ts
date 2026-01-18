import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/services/ai/openai-client'
import { getStorageClient } from '@/lib/r2-client'
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

export class Step6SceneImagesService {
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

    // Update status to generating
    await supabase
      .from('generation_scene_images')
      .update({ generation_status: 'generating' })
      .eq('scene_prompt_id', params.scenePromptId)
      .eq('generation_status', 'pending')

    try {
      // Generate image using OpenAI
      const imageResult = await openai.generateImage({
        prompt: params.imagePrompt,
        size: '1024x1024',
        quality: 'standard',
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
        // Handle regular URLs (real OpenAI images)
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

      // Get the next version number
      const { data: existingImages } = await supabase
        .from('generation_scene_images')
        .select('version')
        .eq('scene_prompt_id', params.scenePromptId)
        .order('version', { ascending: false })
        .limit(1)

      const nextVersion = (existingImages?.[0]?.version || 0) + 1

      // Deselect all previous versions for this scene
      await supabase
        .from('generation_scene_images')
        .update({ is_selected: false })
        .eq('scene_prompt_id', params.scenePromptId)

      // Save to database
      const { data, error } = await supabase
        .from('generation_scene_images')
        .insert({
          generation_id: params.generationId,
          scene_prompt_id: params.scenePromptId,
          image_key: imageKey,
          version: nextVersion,
          is_selected: true,
          generation_status: 'completed',
          completed_at: new Date().toISOString(),
          model_used: 'dall-e-3',
          generation_params: {
            size: '1024x1024',
            quality: 'standard',
          },
          image_prompt: params.imagePrompt,
          character_reference_ids: params.characterReferenceIds
            ? JSON.stringify(params.characterReferenceIds)
            : null,
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving scene image:', error)
        throw new Error(`Failed to save scene image: ${error.message}`)
      }

      return data
    } catch (error) {
      // Update status to failed
      await supabase
        .from('generation_scene_images')
        .update({
          generation_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('scene_prompt_id', params.scenePromptId)
        .eq('generation_status', 'generating')

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

    // Generate images sequentially (to avoid rate limits)
    const results = []
    for (const prompt of scenePrompts) {
      try {
        const image = await this.generateSceneImage({
          generationId: params.generationId,
          scenePromptId: prompt.id,
          imagePrompt: prompt.image_prompt,
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
   */
  async getScenesWithoutImages(generationId: string): Promise<string[]> {
    const supabase = await createClient()

    // Get all scene prompts
    const { data: allPrompts } = await supabase
      .from('generation_scene_prompts')
      .select('id')
      .eq('generation_id', generationId)

    if (!allPrompts) return []

    // Get scene prompts that already have images
    const { data: imagesData } = await supabase
      .from('generation_scene_images')
      .select('scene_prompt_id')
      .eq('generation_id', generationId)
      .eq('generation_status', 'completed')

    const promptsWithImages = new Set(imagesData?.map((img) => img.scene_prompt_id) || [])

    // Return prompts without images
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
let step6ServiceInstance: Step6SceneImagesService | null = null

export function getStep6Service(): Step6SceneImagesService {
  if (!step6ServiceInstance) {
    step6ServiceInstance = new Step6SceneImagesService()
  }
  return step6ServiceInstance
}

export const step6Service = getStep6Service()

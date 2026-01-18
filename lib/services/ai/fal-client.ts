import { fal } from '@fal-ai/client'

export interface FalImageGenerationParams {
  prompt: string
  imageUrls?: string[]
  model: string // e.g., 'fal-ai/gpt-image-1.5/edit', 'fal-ai/nano-banana', 'fal-ai/seedream-4.5'
  size?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
  numImages?: number
  additionalParams?: Record<string, any> // For model-specific parameters
}

export interface FalImageGenerationResult {
  url: string
  contentType?: string
}

export class FalClient {
  private useMock: boolean
  private apiKey: string | undefined

  constructor() {
    this.useMock = process.env.USE_MOCK_AI === 'true'

    if (!this.useMock) {
      this.apiKey = process.env.FAL_KEY
      if (!this.apiKey) {
        throw new Error('FAL_KEY environment variable is required when USE_MOCK_AI is not true')
      }
    }
  }

  /**
   * Generate image using any fal.ai model
   * Flexible method that works with multiple models
   */
  async generateImage(params: FalImageGenerationParams): Promise<FalImageGenerationResult> {
    if (this.useMock) {
      return this.mockGenerateImage(params)
    }

    try {
      // Build input parameters based on what's provided
      const input: Record<string, any> = {
        prompt: params.prompt,
        num_images: params.numImages || 1,
      }

      // Add image URLs if provided (for edit/reference models)
      if (params.imageUrls && params.imageUrls.length > 0) {
        input.image_urls = params.imageUrls
      }

      // Add size if provided
      if (params.size) {
        input.image_size = params.size
      }

      // Merge any additional model-specific parameters
      if (params.additionalParams) {
        Object.assign(input, params.additionalParams)
      }

      console.log(`Calling fal.ai model: ${params.model}`)
      console.log(`Input parameters:`, JSON.stringify(input, null, 2))

      const result = await fal.subscribe(params.model, {
        input,
        logs: true,
      })

      // Extract the generated image URL from the result
      // Try different response formats as different models may structure responses differently
      const imageUrl =
        result.data?.images?.[0]?.url ||
        result.data?.image?.url ||
        result.data?.url

      if (!imageUrl) {
        console.error('Fal.ai response:', JSON.stringify(result, null, 2))
        throw new Error('No image URL returned from fal.ai')
      }

      return {
        url: imageUrl,
        contentType: result.data?.images?.[0]?.content_type || result.data?.content_type || 'image/jpeg',
      }
    } catch (error) {
      console.error('Error generating image with fal.ai:', error)
      throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Mock image generation for local testing
   */
  private mockGenerateImage(params: FalImageGenerationParams): FalImageGenerationResult {
    const imageCount = params.imageUrls?.length || 0
    const modelName = params.model.split('/').pop() || params.model

    console.log('[MOCK] Fal.ai called with:', {
      model: params.model,
      prompt: params.prompt.substring(0, 150) + '...',
      imageCount: imageCount,
      imageUrls: params.imageUrls,
      size: params.size,
      additionalParams: params.additionalParams,
    })

    // Determine dimensions based on size parameter
    let width = 1024
    let height = 1024
    if (params.size === '1536x1024') {
      width = 1536
      height = 1024
    } else if (params.size === '1024x1536') {
      width = 1024
      height = 1536
    }

    // Return a mock SVG image as data URL
    const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#e0f2fe"/>
      <text x="${width / 2}" y="${height * 0.35}" font-family="Arial" font-size="24" fill="#0369a1" text-anchor="middle">
        Mock Pixar Character
      </text>
      <text x="${width / 2}" y="${height * 0.42}" font-family="Arial" font-size="16" fill="#0284c7" text-anchor="middle">
        Generated with ${imageCount} reference image(s)
      </text>
      <text x="${width / 2}" y="${height * 0.48}" font-family="Arial" font-size="14" fill="#0ea5e9" text-anchor="middle">
        Model: ${modelName}
      </text>
      <text x="${width / 2}" y="${height * 0.54}" font-family="Arial" font-size="12" fill="#38bdf8" text-anchor="middle">
        Size: ${params.size || 'default'}
      </text>
      <circle cx="${width / 2}" cy="${height * 0.65}" r="80" fill="#fbbf24"/>
      <circle cx="${width / 2 - 32}" cy="${height * 0.63}" r="10" fill="#374151"/>
      <circle cx="${width / 2 + 32}" cy="${height * 0.63}" r="10" fill="#374151"/>
      <path d="M ${width / 2 - 42} ${height * 0.7} Q ${width / 2} ${height * 0.73} ${width / 2 + 42} ${height * 0.7}" stroke="#374151" stroke-width="3" fill="none"/>
    </svg>`

    const base64Svg = Buffer.from(mockSvg).toString('base64')
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`

    return {
      url: dataUrl,
      contentType: 'image/svg+xml',
    }
  }
}

// Singleton instance
let falClientInstance: FalClient | null = null

export function getFalClient(): FalClient {
  if (!falClientInstance) {
    falClientInstance = new FalClient()
  }
  return falClientInstance
}

// Lazy getter to avoid instantiation during build
export const falClient = {
  get instance(): FalClient {
    return getFalClient()
  },
  generateImage: (params: FalImageGenerationParams) => getFalClient().generateImage(params),
}

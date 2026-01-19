import { fal } from '@fal-ai/client'

export interface FalImageGenerationParams {
  prompt: string
  imageUrls?: string[]
  model: string // e.g., 'fal.ai/gpt-image-1.5/edit', 'fal.ai/nano-banana', 'fal.ai/seedream-4.5'
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
    } else if (params.size === 'auto_4K') {
      width = 1920
      height = 1080
    }

    // Detect if this is a scene image (has reference images) or character image
    const isSceneImage = imageCount > 0
    const title = isSceneImage ? 'Mock Scene Image' : 'Mock Character Image'
    const bgColor = isSceneImage ? '#e0f2fe' : '#fef3c7'
    const textColor = isSceneImage ? '#0369a1' : '#92400e'
    const accentColor = isSceneImage ? '#0284c7' : '#d97706'

    // Truncate prompt for display
    const displayPrompt = params.prompt.substring(0, 80)
    const promptLines = displayPrompt.match(/.{1,40}/g) || [displayPrompt]

    // Return a mock SVG image as data URL
    const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${bgColor === '#e0f2fe' ? '#bae6fd' : '#fde68a'};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>

      <!-- Title -->
      <text x="${width / 2}" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${textColor}" text-anchor="middle">
        ${title}
      </text>

      <!-- Model info -->
      <text x="${width / 2}" y="100" font-family="Arial, sans-serif" font-size="16" fill="${accentColor}" text-anchor="middle">
        Model: ${modelName}
      </text>

      ${isSceneImage ? `<text x="${width / 2}" y="125" font-family="Arial, sans-serif" font-size="14" fill="${accentColor}" text-anchor="middle">
        Characters: ${imageCount}
      </text>` : ''}

      <!-- Prompt -->
      <text x="${width / 2}" y="160" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${textColor}" text-anchor="middle">
        Prompt:
      </text>
      ${promptLines.map((line, i) => `
      <text x="${width / 2}" y="${185 + i * 20}" font-family="Arial, sans-serif" font-size="13" fill="${accentColor}" text-anchor="middle">
        ${line}
      </text>`).join('')}

      <!-- Visual representation -->
      ${isSceneImage ? `
      <!-- Scene illustration - landscape with characters -->
      <rect x="${width / 2 - 300}" y="${height / 2 - 100}" width="600" height="400" rx="10" fill="rgba(255,255,255,0.4)" stroke="${textColor}" stroke-width="2"/>

      <!-- Sky -->
      <ellipse cx="${width / 2 - 150}" cy="${height / 2 - 50}" rx="50" ry="50" fill="#fbbf24" opacity="0.7"/>

      <!-- Ground -->
      <path d="M ${width / 2 - 280} ${height / 2 + 150} Q ${width / 2} ${height / 2 + 100} ${width / 2 + 280} ${height / 2 + 150} L ${width / 2 + 280} ${height / 2 + 280} L ${width / 2 - 280} ${height / 2 + 280} Z" fill="#86efac" opacity="0.6"/>

      <!-- Characters (simple figures) -->
      ${Array.from({ length: Math.min(imageCount, 3) }, (_, i) => {
        const xPos = width / 2 - 150 + i * 150
        const yPos = height / 2 + 80
        const colors = ['#f87171', '#60a5fa', '#a78bfa']
        return `
        <!-- Character ${i + 1} -->
        <circle cx="${xPos}" cy="${yPos}" r="30" fill="${colors[i]}" opacity="0.8"/>
        <ellipse cx="${xPos}" cy="${yPos + 50}" rx="25" ry="40" fill="${colors[i]}" opacity="0.8"/>
        `
      }).join('')}
      ` : `
      <!-- Character illustration - single character -->
      <circle cx="${width / 2}" cy="${height / 2 + 40}" r="80" fill="#fbbf24" opacity="0.8"/>
      <circle cx="${width / 2 - 32}" cy="${height / 2 + 25}" r="12" fill="#374151"/>
      <circle cx="${width / 2 + 32}" cy="${height / 2 + 25}" r="12" fill="#374151"/>
      <path d="M ${width / 2 - 45} ${height / 2 + 65} Q ${width / 2} ${height / 2 + 75} ${width / 2 + 45} ${height / 2 + 65}" stroke="#374151" stroke-width="4" fill="none"/>
      <ellipse cx="${width / 2}" cy="${height / 2 + 120}" rx="60" ry="80" fill="#3b82f6" opacity="0.8"/>
      `}

      <!-- Size info -->
      <text x="${width / 2}" y="${height - 40}" font-family="Arial, sans-serif" font-size="12" fill="${accentColor}" text-anchor="middle">
        Size: ${params.size || 'default'} (${width}x${height})
      </text>

      <text x="${width / 2}" y="${height - 20}" font-family="Arial, sans-serif" font-size="11" fill="${textColor}" text-anchor="middle" opacity="0.7">
        Mock mode - USE_MOCK_AI=true
      </text>
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

import Replicate from 'replicate'

export interface ReplicateImageGenerationParams {
  prompt: string
  imageUrls?: string[]
  model: string // e.g., 'bytedance/seedream-4.5'
  size?: '2K' | '4K' | 'custom'
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '3:2' | '2:3' | '21:9' | 'match_input_image'
  width?: number
  height?: number
  maxImages?: number
  additionalParams?: Record<string, any>
}

export interface ReplicateImageGenerationResult {
  url: string
  contentType?: string
}

export class ReplicateClient {
  private useMock: boolean
  private client: Replicate | null = null

  constructor() {
    this.useMock = process.env.USE_MOCK_AI === 'true'

    if (!this.useMock) {
      const apiToken = process.env.REPLICATE_API_TOKEN
      if (!apiToken) {
        throw new Error('REPLICATE_API_TOKEN environment variable is required when USE_MOCK_AI is not true')
      }
      this.client = new Replicate({ auth: apiToken })
    }
  }

  /**
   * Generate image using Replicate API
   */
  async generateImage(params: ReplicateImageGenerationParams): Promise<ReplicateImageGenerationResult> {
    if (this.useMock) {
      return this.mockGenerateImage(params)
    }

    try {
      // Build input parameters
      const input: Record<string, any> = {
        prompt: params.prompt,
      }

      // Add image URLs if provided (for image-to-image generation)
      if (params.imageUrls && params.imageUrls.length > 0) {
        input.image_input = params.imageUrls
      }

      // Add size
      if (params.size) {
        input.size = params.size
      }

      // Add aspect ratio
      if (params.aspectRatio) {
        input.aspect_ratio = params.aspectRatio
      }

      // Add custom dimensions if size is 'custom'
      if (params.size === 'custom') {
        if (params.width) input.width = params.width
        if (params.height) input.height = params.height
      }

      // Add max images
      if (params.maxImages) {
        input.max_images = params.maxImages
      }

      // Merge any additional model-specific parameters
      if (params.additionalParams) {
        Object.assign(input, params.additionalParams)
      }

      console.log(`Calling Replicate model: ${params.model}`)
      console.log(`Input parameters:`, JSON.stringify(input, null, 2))

      const output = await this.client!.run(params.model as `${string}/${string}`, { input })

      // Handle different output formats
      let imageUrl: string | undefined

      if (Array.isArray(output) && output.length > 0) {
        // Output is an array of URLs
        imageUrl = output[0]
      } else if (typeof output === 'string') {
        // Output is a single URL string
        imageUrl = output
      } else if (output && typeof output === 'object') {
        // Output is an object with url property
        const outputObj = output as Record<string, any>
        imageUrl = outputObj.url || outputObj.image || outputObj.output
      }

      if (!imageUrl) {
        console.error('Replicate response:', JSON.stringify(output, null, 2))
        throw new Error('No image URL returned from Replicate')
      }

      return {
        url: imageUrl,
        contentType: 'image/webp', // Replicate typically returns webp
      }
    } catch (error) {
      console.error('Error generating image with Replicate:', error)
      throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Mock image generation for local testing
   */
  private mockGenerateImage(params: ReplicateImageGenerationParams): ReplicateImageGenerationResult {
    const imageCount = params.imageUrls?.length || 0
    const modelName = params.model.split('/').pop() || params.model

    console.log('[MOCK] Replicate called with:', {
      model: params.model,
      prompt: params.prompt.substring(0, 150) + '...',
      imageCount: imageCount,
      size: params.size,
      aspectRatio: params.aspectRatio,
    })

    // Determine dimensions based on size/aspect ratio
    let width = 2048
    let height = 2048
    if (params.size === '4K') {
      width = 4096
      height = 4096
    } else if (params.size === 'custom' && params.width && params.height) {
      width = params.width
      height = params.height
    }

    // Adjust for aspect ratio
    if (params.aspectRatio === '16:9') {
      height = Math.round(width * 9 / 16)
    } else if (params.aspectRatio === '9:16') {
      height = Math.round(width * 16 / 9)
      ;[width, height] = [height, width]
    } else if (params.aspectRatio === '4:3') {
      height = Math.round(width * 3 / 4)
    } else if (params.aspectRatio === '3:4') {
      height = Math.round(width * 4 / 3)
      ;[width, height] = [height, width]
    }

    // Scale down for mock SVG
    const displayWidth = Math.min(width, 1024)
    const displayHeight = Math.round(displayWidth * height / width)

    const isSceneImage = imageCount > 0
    const title = isSceneImage ? 'Mock Scene Image' : 'Mock Character Image'
    const bgColor = '#fef3c7'
    const textColor = '#92400e'
    const accentColor = '#d97706'

    const displayPrompt = params.prompt.substring(0, 80)
    const promptLines = displayPrompt.match(/.{1,40}/g) || [displayPrompt]

    const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#fde68a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${displayWidth}" height="${displayHeight}" fill="url(#bg)"/>

      <text x="${displayWidth / 2}" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${textColor}" text-anchor="middle">
        ${title}
      </text>

      <text x="${displayWidth / 2}" y="100" font-family="Arial, sans-serif" font-size="16" fill="${accentColor}" text-anchor="middle">
        Model: ${modelName} (Replicate)
      </text>

      <text x="${displayWidth / 2}" y="160" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${textColor}" text-anchor="middle">
        Prompt:
      </text>
      ${promptLines.map((line, i) => `
      <text x="${displayWidth / 2}" y="${185 + i * 20}" font-family="Arial, sans-serif" font-size="13" fill="${accentColor}" text-anchor="middle">
        ${line}
      </text>`).join('')}

      <circle cx="${displayWidth / 2}" cy="${displayHeight / 2 + 40}" r="80" fill="#fbbf24" opacity="0.8"/>
      <circle cx="${displayWidth / 2 - 32}" cy="${displayHeight / 2 + 25}" r="12" fill="#374151"/>
      <circle cx="${displayWidth / 2 + 32}" cy="${displayHeight / 2 + 25}" r="12" fill="#374151"/>
      <path d="M ${displayWidth / 2 - 45} ${displayHeight / 2 + 65} Q ${displayWidth / 2} ${displayHeight / 2 + 75} ${displayWidth / 2 + 45} ${displayHeight / 2 + 65}" stroke="#374151" stroke-width="4" fill="none"/>

      <text x="${displayWidth / 2}" y="${displayHeight - 40}" font-family="Arial, sans-serif" font-size="12" fill="${accentColor}" text-anchor="middle">
        Size: ${params.size || '2K'} | Aspect: ${params.aspectRatio || '1:1'}
      </text>

      <text x="${displayWidth / 2}" y="${displayHeight - 20}" font-family="Arial, sans-serif" font-size="11" fill="${textColor}" text-anchor="middle" opacity="0.7">
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
let replicateClientInstance: ReplicateClient | null = null

export function getReplicateClient(): ReplicateClient {
  if (!replicateClientInstance) {
    replicateClientInstance = new ReplicateClient()
  }
  return replicateClientInstance
}

// Lazy getter to avoid instantiation during build
export const replicateClient = {
  get instance(): ReplicateClient {
    return getReplicateClient()
  },
  generateImage: (params: ReplicateImageGenerationParams) => getReplicateClient().generateImage(params),
}

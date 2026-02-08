export interface KieImageGenerationParams {
  prompt: string
  imageUrls?: string[]
  model: string // e.g., 'google/nano-banana', 'seedream/4.5-text-to-image', 'seedream/4.5-edit'
  imageSize?: '1:1' | '9:16' | '16:9' | '3:4' | '4:3' | '3:2' | '2:3' | '5:4' | '4:5' | '21:9' | 'auto'
  outputFormat?: 'png' | 'jpeg'
  quality?: 'basic' | 'high' // For seedream: basic = 2K, high = 4K
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '21:9'
  additionalParams?: Record<string, any>
}

export interface KieImageGenerationResult {
  url?: string
  buffer?: Buffer
  contentType?: string
  taskId?: string
}

interface KieCreateTaskResponse {
  code: number
  message?: string
  msg?: string
  data?: {
    taskId?: string
    task_id?: string
  }
  taskId?: string
  task_id?: string
}

interface KieRecordInfoResponse {
  code: number
  message?: string
  msg?: string
  data?: {
    taskId?: string
    model?: string
    state?: string // kie.ai uses "state" not "status"
    status?: string
    taskStatus?: string
    param?: string
    resultJson?: string // JSON string containing resultUrls array
    failCode?: string | null
    failMsg?: string | null
    costTime?: number
    completeTime?: number
    createTime?: number
    output?: {
      images?: Array<{ url: string }>
      image_url?: string
      imageUrl?: string
      mediaUrl?: string
    }
    result?: {
      images?: Array<{ url: string }>
      image_url?: string
      imageUrl?: string
      mediaUrl?: string
    }
    images?: Array<{ url: string }>
    image_url?: string
    imageUrl?: string
    mediaUrl?: string
    error?: string
    errorMessage?: string
  }
  status?: string
  taskStatus?: string
}

export class KieClient {
  private useMock: boolean
  private apiKey: string | undefined
  private baseUrl = 'https://api.kie.ai/api/v1'

  constructor() {
    this.useMock = process.env.USE_MOCK_AI === 'true'

    if (!this.useMock) {
      this.apiKey = process.env.KIE_API_KEY
      // Don't throw during construction - we'll check when actually making requests
      // This allows the client to be instantiated during build time
    }
  }

  private ensureApiKey(): void {
    if (!this.useMock && !this.apiKey) {
      throw new Error('KIE_API_KEY environment variable is required when USE_MOCK_AI is not true')
    }
  }

  /**
   * Generate image using kie.ai API
   */
  async generateImage(params: KieImageGenerationParams): Promise<KieImageGenerationResult> {
    if (this.useMock) {
      return this.mockGenerateImage(params)
    }

    this.ensureApiKey()

    try {
      // Build input parameters based on model type
      const input: Record<string, any> = {
        prompt: params.prompt,
      }

      // Handle different model types
      if (params.model === 'google/nano-banana') {
        // Nano Banana parameters
        input.output_format = params.outputFormat || 'png'
        input.image_size = params.imageSize || '1:1'
      } else if (params.model.includes('seedream')) {
        // Seedream 4.5 parameters
        input.aspect_ratio = params.aspectRatio || '1:1'
        input.quality = params.quality || 'basic'

        // For edit model, add image URLs
        if (params.model.includes('edit') && params.imageUrls && params.imageUrls.length > 0) {
          input.image_urls = params.imageUrls
        }
      }

      // Merge additional parameters
      if (params.additionalParams) {
        Object.assign(input, params.additionalParams)
      }

      // Build request body with model and input wrapper
      const body = {
        model: params.model,
        input,
      }

      console.log(`[KIE] Calling model: ${params.model}`)
      console.log(`[KIE] Request body:`, JSON.stringify(body, null, 2))

      // Make the initial request to start generation with timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      try {
        const response = await fetch(`${this.baseUrl}/jobs/createTask`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[KIE] API error response: ${response.status} - ${errorText}`)
          throw new Error(`Kie.ai API error: ${response.status} - ${errorText}`)
        }

        const result: KieCreateTaskResponse = await response.json()
        console.log('[KIE] createTask response:', JSON.stringify(result, null, 2))

        if (result.code !== 0 && result.code !== 200) {
          throw new Error(`Kie.ai API error: ${result.message || result.msg || 'Unknown error'}`)
        }

        // Try multiple possible locations for taskId
        const taskId = result.data?.taskId || result.data?.task_id || result.taskId || result.task_id
        if (!taskId) {
          console.error('[KIE] No taskId in response:', JSON.stringify(result, null, 2))
          throw new Error('No taskId returned from kie.ai API')
        }

        console.log(`[KIE] Got taskId: ${taskId}`)

        // Poll for completion with graduated intervals
        const imageUrl = await this.pollForResult(taskId)

        return {
          url: imageUrl,
          contentType: params.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
          taskId,
        }
      } catch (error) {
        clearTimeout(timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds')
        }
        throw error
      }
    } catch (error) {
      console.error('Error generating image with kie.ai:', error)
      throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Poll for task completion with graduated intervals (kie.ai best practices)
   * - First 30 seconds: every 2-3 seconds
   * - 30s to 2 minutes: every 5-10 seconds
   * - Beyond 2 minutes: every 15-30 seconds
   * - Max duration: 10 minutes
   */
  private async pollForResult(taskId: string): Promise<string> {
    console.log(`[KIE] Starting to poll for taskId: ${taskId}`)

    const startTime = Date.now()
    const maxDuration = 10 * 60 * 1000 // 10 minutes max

    while (Date.now() - startTime < maxDuration) {
      const elapsed = Date.now() - startTime

      // Get result
      const result = await this.getTaskResult(taskId)
      if (result) return result

      // Calculate interval based on elapsed time (graduated backoff)
      let interval: number
      if (elapsed < 30000) {
        // First 30 seconds: poll every 3 seconds
        interval = 3000
      } else if (elapsed < 120000) {
        // 30s to 2 minutes: poll every 7 seconds
        interval = 7000
      } else {
        // Beyond 2 minutes: poll every 20 seconds
        interval = 20000
      }

      console.log(`[KIE] Task not ready (${Math.round(elapsed / 1000)}s elapsed), waiting ${interval / 1000}s...`)
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Task timed out after 10 minutes')
  }

  /**
   * Get task result (single request)
   */
  private async getTaskResult(taskId: string): Promise<string | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(`${this.baseUrl}/jobs/recordInfo?taskId=${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[KIE] Error getting task result: ${response.status} - ${errorText}`)
        return null
      }

      const result: KieRecordInfoResponse = await response.json()
      const { state, resultJson, failMsg } = result.data || {}

      console.log(`[KIE] Task state: ${state}`)

      if (state === 'success') {
        if (resultJson) {
          try {
            const resultData = JSON.parse(resultJson)
            const imageUrl = resultData.resultUrls?.[0]
            if (imageUrl) {
              console.log(`[KIE] Got image URL: ${imageUrl}`)
              return imageUrl
            }
          } catch (e) {
            console.error('[KIE] Failed to parse resultJson:', e)
          }
        }
        throw new Error('No image URL in completed task response')
      }

      if (state === 'fail') {
        throw new Error(`Task failed: ${failMsg || 'Unknown error'}`)
      }

      // Task still processing
      return null
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[KIE] Request timed out`)
        return null
      }
      throw error
    }
  }

  /**
   * Mock image generation for local testing
   */
  private mockGenerateImage(params: KieImageGenerationParams): KieImageGenerationResult {
    const imageCount = params.imageUrls?.length || 0
    const modelName = params.model.split('/').pop() || params.model

    console.log('[MOCK] Kie.ai called with:', {
      model: params.model,
      prompt: params.prompt.substring(0, 150) + '...',
      imageCount: imageCount,
      imageSize: params.imageSize,
      aspectRatio: params.aspectRatio,
      quality: params.quality,
    })

    // Determine dimensions based on parameters
    let width = 1024
    let height = 1024
    const aspectRatio = params.aspectRatio || params.imageSize || '1:1'

    if (aspectRatio === '16:9') {
      width = 1536
      height = 864
    } else if (aspectRatio === '9:16') {
      width = 864
      height = 1536
    } else if (aspectRatio === '4:3') {
      width = 1280
      height = 960
    } else if (aspectRatio === '3:4') {
      width = 960
      height = 1280
    } else if (aspectRatio === '3:2') {
      width = 1440
      height = 960
    } else if (aspectRatio === '2:3') {
      width = 960
      height = 1440
    }

    const isSceneImage = imageCount > 0
    const title = isSceneImage ? 'Mock Scene Image' : 'Mock Character Image'
    const bgColor = '#dbeafe' // Blue tint to distinguish from fal.ai mock
    const textColor = '#1e40af'
    const accentColor = '#3b82f6'

    const displayPrompt = params.prompt.substring(0, 80)
    const promptLines = displayPrompt.match(/.{1,40}/g) || [displayPrompt]

    const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#bfdbfe;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>

      <text x="${width / 2}" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${textColor}" text-anchor="middle">
        ${title}
      </text>

      <text x="${width / 2}" y="100" font-family="Arial, sans-serif" font-size="16" fill="${accentColor}" text-anchor="middle">
        Model: ${modelName} (kie.ai)
      </text>

      ${isSceneImage ? `<text x="${width / 2}" y="125" font-family="Arial, sans-serif" font-size="14" fill="${accentColor}" text-anchor="middle">
        Characters: ${imageCount}
      </text>` : ''}

      <text x="${width / 2}" y="160" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${textColor}" text-anchor="middle">
        Prompt:
      </text>
      ${promptLines.map((line, i) => `
      <text x="${width / 2}" y="${185 + i * 20}" font-family="Arial, sans-serif" font-size="13" fill="${accentColor}" text-anchor="middle">
        ${line}
      </text>`).join('')}

      ${isSceneImage ? `
      <!-- Scene illustration - landscape with characters -->
      <rect x="${width / 2 - 300}" y="${height / 2 - 100}" width="600" height="400" rx="10" fill="rgba(255,255,255,0.4)" stroke="${textColor}" stroke-width="2"/>
      <ellipse cx="${width / 2 - 150}" cy="${height / 2 - 50}" rx="50" ry="50" fill="#fbbf24" opacity="0.7"/>
      <path d="M ${width / 2 - 280} ${height / 2 + 150} Q ${width / 2} ${height / 2 + 100} ${width / 2 + 280} ${height / 2 + 150} L ${width / 2 + 280} ${height / 2 + 280} L ${width / 2 - 280} ${height / 2 + 280} Z" fill="#86efac" opacity="0.6"/>
      ${Array.from({ length: Math.min(imageCount, 3) }, (_, i) => {
        const xPos = width / 2 - 150 + i * 150
        const yPos = height / 2 + 80
        const colors = ['#f87171', '#60a5fa', '#a78bfa']
        return `
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

      <text x="${width / 2}" y="${height - 40}" font-family="Arial, sans-serif" font-size="12" fill="${accentColor}" text-anchor="middle">
        Size: ${aspectRatio} | Quality: ${params.quality || 'default'}
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
let kieClientInstance: KieClient | null = null

export function getKieClient(): KieClient {
  if (!kieClientInstance) {
    kieClientInstance = new KieClient()
  }
  return kieClientInstance
}

// Lazy getter to avoid instantiation during build
export const kieClient = {
  get instance(): KieClient {
    return getKieClient()
  },
  generateImage: (params: KieImageGenerationParams) => getKieClient().generateImage(params),
}

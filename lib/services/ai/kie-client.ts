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
    state?: string
    resultJson?: string
    failMsg?: string | null
  }
}

export class KieClient {
  private useMock: boolean
  private apiKey: string | undefined
  private baseUrl = 'https://api.kie.ai/api/v1'

  constructor() {
    this.useMock = process.env.USE_MOCK_AI === 'true'
    if (!this.useMock) {
      this.apiKey = process.env.KIE_API_KEY
    }
  }

  private ensureApiKey(): void {
    if (!this.useMock && !this.apiKey) {
      throw new Error('KIE_API_KEY environment variable is required when USE_MOCK_AI is not true')
    }
  }

  async generateImage(params: KieImageGenerationParams): Promise<KieImageGenerationResult> {
    if (this.useMock) {
      return this.mockGenerateImage(params)
    }

    this.ensureApiKey()

    // Build input parameters based on model type
    const input: Record<string, any> = {
      prompt: params.prompt,
    }

    if (params.model === 'google/nano-banana') {
      input.output_format = params.outputFormat || 'png'
      input.image_size = params.imageSize || '1:1'
    } else if (params.model.includes('seedream')) {
      input.aspect_ratio = params.aspectRatio || '1:1'
      input.quality = params.quality || 'basic'
      if (params.model.includes('edit') && params.imageUrls && params.imageUrls.length > 0) {
        input.image_urls = params.imageUrls
      }
    }

    if (params.additionalParams) {
      Object.assign(input, params.additionalParams)
    }

    const body = { model: params.model, input }

    // Create task
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

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
        throw new Error(`Kie.ai API error: ${response.status} - ${errorText}`)
      }

      const result: KieCreateTaskResponse = await response.json()

      if (result.code !== 0 && result.code !== 200) {
        throw new Error(`Kie.ai API error: ${result.message || result.msg || 'Unknown error'}`)
      }

      const taskId = result.data?.taskId || result.data?.task_id || result.taskId || result.task_id
      if (!taskId) {
        throw new Error('No taskId returned from kie.ai API')
      }

      // Poll for completion
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
      throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Poll for task completion with graduated intervals (kie.ai best practices)
   */
  private async pollForResult(taskId: string): Promise<string> {
    const startTime = Date.now()
    const maxDuration = 10 * 60 * 1000 // 10 minutes max

    while (Date.now() - startTime < maxDuration) {
      const elapsed = Date.now() - startTime

      const result = await this.getTaskResult(taskId)
      if (result) return result

      // Graduated backoff intervals
      let interval: number
      if (elapsed < 30000) {
        interval = 3000 // First 30s: every 3s
      } else if (elapsed < 120000) {
        interval = 7000 // 30s-2min: every 7s
      } else {
        interval = 20000 // Beyond 2min: every 20s
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Task timed out after 10 minutes')
  }

  private async getTaskResult(taskId: string): Promise<string | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(`${this.baseUrl}/jobs/recordInfo?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) return null

      const result: KieRecordInfoResponse = await response.json()
      const { state, resultJson, failMsg } = result.data || {}

      if (state === 'success' && resultJson) {
        const resultData = JSON.parse(resultJson)
        const imageUrl = resultData.resultUrls?.[0]
        if (imageUrl) return imageUrl
        throw new Error('No image URL in completed task response')
      }

      if (state === 'fail') {
        throw new Error(`Task failed: ${failMsg || 'Unknown error'}`)
      }

      return null // Still processing
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') return null
      throw error
    }
  }

  private mockGenerateImage(params: KieImageGenerationParams): KieImageGenerationResult {
    const imageCount = params.imageUrls?.length || 0
    const modelName = params.model.split('/').pop() || params.model

    let width = 1024
    let height = 1024
    const aspectRatio = params.aspectRatio || params.imageSize || '1:1'

    if (aspectRatio === '16:9') { width = 1536; height = 864 }
    else if (aspectRatio === '9:16') { width = 864; height = 1536 }
    else if (aspectRatio === '4:3') { width = 1280; height = 960 }
    else if (aspectRatio === '3:4') { width = 960; height = 1280 }
    else if (aspectRatio === '3:2') { width = 1440; height = 960 }
    else if (aspectRatio === '2:3') { width = 960; height = 1440 }

    const isSceneImage = imageCount > 0
    const title = isSceneImage ? 'Mock Scene Image' : 'Mock Character Image'
    const bgColor = '#dbeafe'
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
      <text x="${width / 2}" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${textColor}" text-anchor="middle">${title}</text>
      <text x="${width / 2}" y="100" font-family="Arial, sans-serif" font-size="16" fill="${accentColor}" text-anchor="middle">Model: ${modelName} (kie.ai)</text>
      ${isSceneImage ? `<text x="${width / 2}" y="125" font-family="Arial, sans-serif" font-size="14" fill="${accentColor}" text-anchor="middle">Characters: ${imageCount}</text>` : ''}
      <text x="${width / 2}" y="160" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${textColor}" text-anchor="middle">Prompt:</text>
      ${promptLines.map((line, i) => `<text x="${width / 2}" y="${185 + i * 20}" font-family="Arial, sans-serif" font-size="13" fill="${accentColor}" text-anchor="middle">${line}</text>`).join('')}
      ${isSceneImage ? `
      <rect x="${width / 2 - 300}" y="${height / 2 - 100}" width="600" height="400" rx="10" fill="rgba(255,255,255,0.4)" stroke="${textColor}" stroke-width="2"/>
      <ellipse cx="${width / 2 - 150}" cy="${height / 2 - 50}" rx="50" ry="50" fill="#fbbf24" opacity="0.7"/>
      ` : `
      <circle cx="${width / 2}" cy="${height / 2 + 40}" r="80" fill="#fbbf24" opacity="0.8"/>
      <circle cx="${width / 2 - 32}" cy="${height / 2 + 25}" r="12" fill="#374151"/>
      <circle cx="${width / 2 + 32}" cy="${height / 2 + 25}" r="12" fill="#374151"/>
      <ellipse cx="${width / 2}" cy="${height / 2 + 120}" rx="60" ry="80" fill="#3b82f6" opacity="0.8"/>
      `}
      <text x="${width / 2}" y="${height - 20}" font-family="Arial, sans-serif" font-size="11" fill="${textColor}" text-anchor="middle" opacity="0.7">Mock mode - USE_MOCK_AI=true</text>
    </svg>`

    return {
      url: `data:image/svg+xml;base64,${Buffer.from(mockSvg).toString('base64')}`,
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

export const kieClient = {
  get instance(): KieClient {
    return getKieClient()
  },
  generateImage: (params: KieImageGenerationParams) => getKieClient().generateImage(params),
}

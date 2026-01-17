import OpenAI from 'openai'

export interface OpenAIConfig {
  apiKey?: string
  model?: string
  temperature?: number
}

export interface ChatParams {
  systemPrompt: string
  userPrompt: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface GenerateImageParams {
  prompt: string
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
}

export interface GenerateImageResult {
  url: string
  revisedPrompt?: string
}

export class OpenAIClient {
  private client: OpenAI | null = null
  private useMock: boolean

  constructor(config?: OpenAIConfig) {
    this.useMock = process.env.USE_MOCK_AI === 'true'

    if (!this.useMock) {
      const apiKey = config?.apiKey || process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key required when USE_MOCK_AI is not true')
      }

      this.client = new OpenAI({
        apiKey,
      })
    }
  }

  /**
   * Generate text using OpenAI chat completion
   */
  async chat(params: ChatParams): Promise<string> {
    if (this.useMock) {
      return this.mockChat(params)
    }

    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }

    const response = await this.client.chat.completions.create({
      model: params.model || 'gpt-4o',
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    })

    return response.choices[0]?.message?.content || ''
  }

  /**
   * Generate an image using DALL-E 3
   */
  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    if (this.useMock) {
      return this.mockGenerateImage(params)
    }

    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }

    const response = await this.client.images.generate({
      model: 'dall-e-3',
      prompt: params.prompt,
      size: params.size || '1024x1024',
      quality: params.quality || 'standard',
      n: 1,
    })

    return {
      url: response.data[0].url!,
      revisedPrompt: response.data[0].revised_prompt,
    }
  }

  /**
   * Mock chat implementation for local testing
   */
  private mockChat(params: ChatParams): string {
    console.log('[MOCK] OpenAI chat called with:', {
      model: params.model,
      systemPrompt: params.systemPrompt.substring(0, 50) + '...',
      userPrompt: params.userPrompt.substring(0, 100) + '...',
    })

    // Mock character extraction - check FIRST before JSON parsing
    if (params.systemPrompt.includes('extract') || params.systemPrompt.includes('analyzes stories')) {
      const mockResponse = JSON.stringify({
        characters: [
          'Баба',
          'Дядо',
          'Магически заек',
          'Фея на мечтите',
          'Малкото драконче',
          'Приятелят Мечо',
          'Магическа книга',
        ],
      })
      console.log('[MOCK] Character extraction response:', mockResponse)
      return mockResponse
    }

    // Mock scene prompts - check BEFORE parsing JSON
    if (params.systemPrompt.includes('scene descriptions') || params.systemPrompt.includes('transforms children')) {
      // Try to parse the input to get scene count
      let sceneCount = 5 // default
      try {
        const jsonMatch = params.userPrompt.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const inputJson = JSON.parse(jsonMatch[0])
          sceneCount = inputJson.scenes?.length || 5
        }
      } catch (e) {
        // Use default
      }

      const mockResponse = JSON.stringify({
        bookTitle: 'Магическото приключение',
        bookCover: {
          imagePrompt:
            'A magical book cover featuring a young child protagonist surrounded by sparkles and magical creatures, enchanted forest background with glowing mushrooms and fairy lights, 3D Disney-Pixar style, vibrant colors, soft shading, whimsical atmosphere, kid-safe, no text in image',
        },
        shortDescription: 'Едно вълшебно пътешествие',
        motivationEnd: 'И така всички живяха щастливо',
        canon: {
          characters: [{ name: 'Главен герой' }],
        },
        scenes: Array.from({ length: sceneCount }, (_, i) => ({
          sceneNumber: i + 1,
          characters: [{ name: 'Главен герой' }],
          imagePrompt: `Scene ${i + 1}: A young child in a magical setting, vibrant enchanted forest with colorful flowers and friendly woodland creatures, warm sunlight filtering through trees, medium shot at eye-level, 3D Disney-Pixar style with soft shading and vibrant colors, whimsical atmosphere, kid-safe, no text in image, original characters`,
        })),
      })
      console.log('[MOCK] Scene prompts response generated for', sceneCount, 'scenes')
      return mockResponse
    }

    // Try to parse userPrompt as JSON for smart mocking (for other cases like proofread)
    try {
      const jsonMatch = params.userPrompt.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const inputJson = JSON.parse(jsonMatch[0])

        // Mock proofread: Return slightly modified content
        if (params.systemPrompt.includes('proofreader') || params.systemPrompt.includes('grammar')) {
          return JSON.stringify({
            ...inputJson,
            __mocked: true,
            __note: 'This is mock proofread content',
          })
        }
      }
    } catch (e) {
      // If parsing fails, return generic mock
    }

    return JSON.stringify({
      mocked: true,
      message: 'This is a mock response from OpenAI',
      prompt: params.userPrompt.substring(0, 100),
    })
  }

  /**
   * Mock image generation for local testing
   */
  private mockGenerateImage(params: GenerateImageParams): GenerateImageResult {
    console.log('[MOCK] Image generation called with prompt:', params.prompt.substring(0, 100))

    // Detect image type and assign different colors
    const prompt = params.prompt.toLowerCase()
    let bgColor = '9333ea' // Default purple
    let imageType = 'Image'

    if (prompt.includes('cover') || prompt.includes('book cover')) {
      bgColor = 'ec4899' // Pink for book covers
      imageType = 'Cover'
    } else if (prompt.includes('character') || prompt.includes('reference')) {
      bgColor = '3b82f6' // Blue for character references
      imageType = 'Character'
    } else if (prompt.includes('scene')) {
      // Vary scene colors based on scene number
      const sceneMatch = prompt.match(/scene\s*(\d+)/i)
      const sceneNum = sceneMatch ? parseInt(sceneMatch[1]) : 0
      const colors = ['22c55e', 'eab308', 'f97316', '06b6d4', 'a855f7', '84cc16']
      bgColor = colors[sceneNum % colors.length]
      imageType = `Scene ${sceneNum}`
    }

    // Generate a data URL with SVG for a colored placeholder
    // This allows the image to be "downloaded" and saved without external dependencies
    const shortText = params.prompt.substring(0, 30).replace(/[<>&"']/g, '')
    const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="#${bgColor}"/>
      <text x="512" y="462" font-family="Arial, sans-serif" font-size="40" fill="#ffffff" text-anchor="middle">${imageType}</text>
      <text x="512" y="512" font-family="Arial, sans-serif" font-size="24" fill="#ffffff" text-anchor="middle" opacity="0.8">${shortText}</text>
      <text x="512" y="562" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" text-anchor="middle" opacity="0.6">[MOCK MODE]</text>
    </svg>`

    const base64Svg = Buffer.from(svg).toString('base64')
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`

    return {
      url: dataUrl,
      revisedPrompt: `[MOCK] ${params.prompt}`,
    }
  }
}

// Singleton instance
let openaiInstance: OpenAIClient | null = null

export function getOpenAIClient(): OpenAIClient {
  if (!openaiInstance) {
    openaiInstance = new OpenAIClient()
  }
  return openaiInstance
}

export const openai = getOpenAIClient()

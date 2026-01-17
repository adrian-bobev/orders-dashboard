import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'

export interface PromptConfig {
  model?: string
  provider?: string
  temperature?: number
  max_tokens?: number
  reasoning_effort?: string
  verbosity?: string
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  system_prompt: string
  user_prompt: string
}

export class PromptLoader {
  private promptsDir: string
  private cache: Map<string, PromptConfig>

  constructor(promptsDir?: string) {
    this.promptsDir = promptsDir || path.join(process.cwd(), 'prompts')
    this.cache = new Map()
  }

  /**
   * Load a prompt configuration from a YAML file
   */
  loadPrompt(filename: string): PromptConfig {
    // Check cache first
    if (this.cache.has(filename)) {
      return this.cache.get(filename)!
    }

    const filePath = path.join(this.promptsDir, filename)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt file not found: ${filePath}`)
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const config = parseYaml(fileContent)

    const promptConfig: PromptConfig = {
      model: config.model,
      provider: config.provider,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      reasoning_effort: config.reasoning_effort,
      verbosity: config.verbosity,
      top_p: config.top_p,
      frequency_penalty: config.frequency_penalty,
      presence_penalty: config.presence_penalty,
      system_prompt: config.system_prompt?.trim() || '',
      user_prompt: config.user_prompt?.trim() || '',
    }

    // Cache it
    this.cache.set(filename, promptConfig)

    return promptConfig
  }

  /**
   * Replace {YOUR_JSON_HERE} placeholder with actual JSON
   */
  replaceJsonPlaceholder(userPrompt: string, json: any): string {
    const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
    return userPrompt.replace('{YOUR_JSON_HERE}', jsonString)
  }

  /**
   * Replace {He/She} placeholder with actual pronoun based on gender
   */
  replaceGenderPlaceholder(text: string, gender: string): string {
    const pronoun = gender?.toLowerCase() === 'boy' || gender?.toLowerCase() === 'male' ? 'He' : 'She'
    return text.replace('{He/She}', pronoun)
  }

  /**
   * Replace {name} placeholder with actual name
   */
  replaceNamePlaceholder(text: string, name: string): string {
    return text.replace('{name}', name)
  }

  /**
   * Clear the cache (useful for testing or if prompts are updated)
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
let promptLoaderInstance: PromptLoader | null = null

export function getPromptLoader(): PromptLoader {
  if (!promptLoaderInstance) {
    promptLoaderInstance = new PromptLoader()
  }
  return promptLoaderInstance
}

export const promptLoader = getPromptLoader()

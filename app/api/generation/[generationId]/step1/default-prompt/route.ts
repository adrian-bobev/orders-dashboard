import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { promptLoader } from '@/lib/services/ai/prompt-loader'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { bookConfig } = await request.json()

    // Load prompt configuration
    const promptConfig = promptLoader.loadPrompt('0.main_character_prompt.yaml')

    // Prepare JSON data for the prompt - use only book content
    const characterData = bookConfig.content || {}

    // Replace JSON placeholder
    const userPrompt = promptLoader.replaceJsonPlaceholder(promptConfig.user_prompt, characterData)

    // Replace gender pronouns
    const pronoun = bookConfig.gender === 'момиче' || bookConfig.gender === 'girl' ? 'She' : 'He'
    const finalUserPrompt = userPrompt.replace('{He/She}', pronoun).replace('{name}', bookConfig.name)

    return NextResponse.json({
      systemPrompt: promptConfig.system_prompt || '',
      userPrompt: finalUserPrompt,
    })
  } catch (error) {
    console.error('Error loading default prompt:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load default prompt' },
      { status: 500 }
    )
  }
}

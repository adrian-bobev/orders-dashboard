import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step4Service } from '@/lib/services/generation/step4-character-refs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const body = await request.json()
    const { characterName, characterType, description, bookConfig } = body

    if (!characterName || !characterType || !bookConfig) {
      return NextResponse.json(
        { error: 'characterName, characterType, and bookConfig are required' },
        { status: 400 }
      )
    }

    const { systemPrompt, userPrompt } = await step4Service.getDefaultPrompt(
      characterName,
      characterType,
      description,
      bookConfig
    )

    return NextResponse.json({
      systemPrompt,
      userPrompt,
    })
  } catch (error) {
    console.error('Error getting default prompt:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get default prompt' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-scene-prompts'
import { step2Service } from '@/lib/services/generation/step2-proofread'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params

    // Get corrected content from step 2
    const correctedContent = await step2Service.getCorrectedContent(generationId)

    if (!correctedContent) {
      return NextResponse.json({ error: 'Corrected content not found. Complete Step 2 first.' }, { status: 404 })
    }

    const { systemPrompt, userPrompt } = await step3Service.getDefaultPrompt(
      correctedContent.corrected_content
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

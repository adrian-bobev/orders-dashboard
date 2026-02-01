import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-scene-prompts'
import { step2Service } from '@/lib/services/generation/step2-proofread'
import { generationService } from '@/lib/services/generation/generation-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    // Get generation with book configuration to get the main character name
    const generation = await generationService.getGenerationById(generationId)
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Get corrected content from step 2
    const correctedContent = await step2Service.getCorrectedContent(generationId)

    if (!correctedContent) {
      return NextResponse.json({ error: 'Corrected content not found. Complete Step 2 first.' }, { status: 404 })
    }

    const { systemPrompt, userPrompt } = await step3Service.getDefaultPrompt(
      correctedContent.corrected_content,
      generation.book_configurations.name,
      generation.book_configurations.age
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

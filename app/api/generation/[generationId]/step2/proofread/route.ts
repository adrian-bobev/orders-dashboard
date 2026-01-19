import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
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
    const body = await request.json()
    const { systemPrompt, userPrompt, contentToCorrect } = body

    if (!systemPrompt || !userPrompt) {
      return NextResponse.json(
        { error: 'systemPrompt and userPrompt are required' },
        { status: 400 }
      )
    }

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)

    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    const bookConfig = generation.book_configurations
    if (!bookConfig || !bookConfig.content) {
      return NextResponse.json({ error: 'Book configuration content not found' }, { status: 404 })
    }

    // Use provided content if available, otherwise use original book config content
    const originalContent = contentToCorrect || bookConfig.content

    // Proofread the content with provided prompts
    const correctedContent = await step2Service.proofreadContent({
      generationId,
      originalContent,
      systemPrompt,
      userPrompt,
    })

    return NextResponse.json({ correctedContent })
  } catch (error) {
    console.error('Error proofreading content:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to proofread content' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    const data = await step2Service.getCorrectedContent(generationId)

    // Check if corrected_content actually has data (not null and not empty object)
    const hasCorrectedContent = data?.corrected_content &&
      Object.keys(data.corrected_content).length > 0

    return NextResponse.json({
      correctedContent: hasCorrectedContent ? data : null,
      manuallyEditedContent: data?.manually_edited_content || null,
    })
  } catch (error) {
    console.error('Error fetching corrected content:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch corrected content' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const { correctedContent } = await request.json()

    if (!correctedContent) {
      return NextResponse.json({ error: 'correctedContent is required' }, { status: 400 })
    }

    const updated = await step2Service.updateCorrectedContent(generationId, correctedContent)

    return NextResponse.json({ correctedContent: updated })
  } catch (error) {
    console.error('Error updating corrected content:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update corrected content' },
      { status: 500 }
    )
  }
}

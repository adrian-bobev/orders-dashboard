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

    // Try to get content from request body (for manually edited content)
    let contentToUse = null
    try {
      const body = await request.json()
      contentToUse = body.content
    } catch {
      // No body provided, will use book config content
    }

    // If no content provided in body, get from book configuration
    if (!contentToUse) {
      const generation = await generationService.getGenerationById(generationId)

      if (!generation) {
        return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
      }

      const bookConfig = generation.book_configurations
      if (!bookConfig || !bookConfig.content) {
        return NextResponse.json({ error: 'Book configuration content not found' }, { status: 404 })
      }

      contentToUse = bookConfig.content
    }

    const { systemPrompt, userPrompt } = await step2Service.getDefaultPrompt(contentToUse)

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

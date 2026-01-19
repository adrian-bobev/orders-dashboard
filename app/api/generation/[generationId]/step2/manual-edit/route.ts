import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step2Service } from '@/lib/services/generation/step2-proofread'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const { manuallyEditedContent } = await request.json()

    if (!manuallyEditedContent) {
      return NextResponse.json({ error: 'manuallyEditedContent is required' }, { status: 400 })
    }

    const saved = await step2Service.saveManuallyEditedContent(generationId, manuallyEditedContent)

    return NextResponse.json({ manuallyEditedContent: saved.manually_edited_content })
  } catch (error) {
    console.error('Error saving manually edited content:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save manually edited content' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step2Service } from '@/lib/services/generation/step2-proofread'
import { generationService } from '@/lib/services/generation/generation-service'

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

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)

    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    const bookConfig = generation.book_configurations
    if (!bookConfig || !bookConfig.content) {
      return NextResponse.json({ error: 'Book configuration content not found' }, { status: 404 })
    }

    // Proofread the content
    const correctedContent = await step2Service.proofreadContent({
      generationId,
      originalContent: bookConfig.content,
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
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params

    const correctedContent = await step2Service.getCorrectedContent(generationId)

    return NextResponse.json({ correctedContent })
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
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

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

    const { systemPrompt, userPrompt } = await step2Service.getDefaultPrompt(bookConfig.content)

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

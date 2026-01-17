import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-character-list'
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

    // Get corrected content from Step 2
    const correctedContent = await step2Service.getCorrectedContent(generationId)
    if (!correctedContent) {
      return NextResponse.json(
        { error: 'Please complete Step 2 (proofreading) first' },
        { status: 400 }
      )
    }

    // Extract characters
    const characters = await step3Service.extractCharacters({
      generationId,
      correctedContent: correctedContent.corrected_content,
      mainCharacterName: generation.book_configurations.name,
    })

    return NextResponse.json({ characters })
  } catch (error) {
    console.error('Error extracting characters:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract characters' },
      { status: 500 }
    )
  }
}

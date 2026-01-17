import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'
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
    const body = await request.json()
    const { imageKeys } = body

    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return NextResponse.json(
        { error: 'At least one image must be selected' },
        { status: 400 }
      )
    }

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Generate the reference character with multiple images
    const result = await step1Service.generateReferenceCharacter(
      generationId,
      generation.book_configurations,
      imageKeys
    )

    return NextResponse.json({
      success: true,
      referenceKey: result.referenceKey,
      imageCount: result.imageCount,
    })
  } catch (error) {
    console.error('Error generating reference character:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate reference character' },
      { status: 500 }
    )
  }
}

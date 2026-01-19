import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-scene-prompts'
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
    const { sceneData } = body

    if (!sceneData) {
      return NextResponse.json(
        { error: 'sceneData is required' },
        { status: 400 }
      )
    }

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Save the manually pasted scene data
    const prompts = await step3Service.saveManualSceneData({
      generationId,
      sceneData,
      mainCharacterName: generation.book_configurations.name,
    })

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('Error saving manual scene data:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save manual scene data' },
      { status: 500 }
    )
  }
}

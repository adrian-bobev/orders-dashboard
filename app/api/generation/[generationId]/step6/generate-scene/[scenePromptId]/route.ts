import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step6Service } from '@/lib/services/generation/step6-scene-images'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string; scenePromptId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId, scenePromptId } = await params
    const { imagePrompt } = await request.json()

    if (!imagePrompt) {
      return NextResponse.json({ error: 'imagePrompt is required' }, { status: 400 })
    }

    // Generate single scene image
    const image = await step6Service.generateSceneImage({
      generationId,
      scenePromptId,
      imagePrompt,
    })

    return NextResponse.json({ image })
  } catch (error) {
    console.error('Error generating scene image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate scene image' },
      { status: 500 }
    )
  }
}

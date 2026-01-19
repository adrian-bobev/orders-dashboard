import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step5Service } from '@/lib/services/generation/step5-scene-images'
import { sceneCharactersService as sceneCharactersService } from '@/lib/services/generation/step5-scene-characters-service'

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
    const { imagePrompt, characterReferenceIds } = await request.json()

    if (!imagePrompt) {
      return NextResponse.json({ error: 'imagePrompt is required' }, { status: 400 })
    }

    // If no character references provided, fetch from scene-character associations
    let finalCharacterReferenceIds = characterReferenceIds
    if (!finalCharacterReferenceIds) {
      finalCharacterReferenceIds = await sceneCharactersService.getSceneCharacterReferenceIds(
        scenePromptId
      )
    }

    // Generate single scene image
    const image = await step5Service.generateSceneImage({
      generationId,
      scenePromptId,
      imagePrompt,
      characterReferenceIds: finalCharacterReferenceIds,
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

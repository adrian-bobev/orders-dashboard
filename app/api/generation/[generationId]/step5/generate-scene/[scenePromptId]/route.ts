import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step5Service } from '@/lib/services/generation/step5-scene-images'
import { step5SceneCharactersService } from '@/lib/services/generation/step5-scene-characters-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string; scenePromptId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId, scenePromptId } = await params
    const { imagePrompt, characterReferenceIds } = await request.json()

    if (!imagePrompt) {
      return NextResponse.json({ error: 'imagePrompt is required' }, { status: 400 })
    }

    // If no character references provided, fetch from scene-character associations
    let finalCharacterReferenceIds = characterReferenceIds
    if (!finalCharacterReferenceIds) {
      finalCharacterReferenceIds = await step5SceneCharactersService.getSceneCharacterReferenceIds(
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

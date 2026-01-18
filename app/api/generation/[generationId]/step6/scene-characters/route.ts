import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step6SceneCharactersService } from '@/lib/services/generation/step6-scene-characters-service'

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
    const { searchParams } = new URL(request.url)
    const scenePromptId = searchParams.get('scenePromptId')

    if (scenePromptId) {
      // Get characters for a specific scene with references
      const characters = await step6SceneCharactersService.getSceneCharactersWithReferences(
        scenePromptId
      )
      return NextResponse.json({ characters })
    } else {
      // Get all scene-character associations for the generation
      const sceneCharacters = await step6SceneCharactersService.getSceneCharacters(generationId)
      return NextResponse.json({ sceneCharacters })
    }
  } catch (error) {
    console.error('Error fetching scene characters:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch scene characters' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { scenePromptId, characterListId } = await request.json()

    if (!scenePromptId || !characterListId) {
      return NextResponse.json(
        { error: 'scenePromptId and characterListId are required' },
        { status: 400 }
      )
    }

    await step6SceneCharactersService.addCharacterToScene(scenePromptId, characterListId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding character to scene:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add character to scene' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const scenePromptId = searchParams.get('scenePromptId')
    const characterListId = searchParams.get('characterListId')

    if (!scenePromptId || !characterListId) {
      return NextResponse.json(
        { error: 'scenePromptId and characterListId are required' },
        { status: 400 }
      )
    }

    await step6SceneCharactersService.removeCharacterFromScene(scenePromptId, characterListId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing character from scene:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove character from scene' },
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

    const { scenePromptId, characterOrders } = await request.json()

    if (!scenePromptId || !characterOrders || !Array.isArray(characterOrders)) {
      return NextResponse.json(
        { error: 'scenePromptId and characterOrders array are required' },
        { status: 400 }
      )
    }

    await step6SceneCharactersService.updateCharacterOrder(scenePromptId, characterOrders)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating character order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update character order' },
      { status: 500 }
    )
  }
}

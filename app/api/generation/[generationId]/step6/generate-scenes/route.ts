import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step6Service } from '@/lib/services/generation/step6-scene-images'

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
    const { scenePromptIds } = await request.json()

    if (!scenePromptIds || !Array.isArray(scenePromptIds)) {
      return NextResponse.json({ error: 'scenePromptIds array is required' }, { status: 400 })
    }

    // Batch generate scene images
    const results = await step6Service.batchGenerateSceneImages({
      generationId,
      scenePromptIds,
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error batch generating scene images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate scene images' },
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
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'without-images') {
      // Get scenes without images
      const scenePromptIds = await step6Service.getScenesWithoutImages(generationId)
      return NextResponse.json({ scenePromptIds })
    } else {
      // Get all scene images
      const images = await step6Service.getSceneImages(generationId)
      return NextResponse.json({ images })
    }
  } catch (error) {
    console.error('Error fetching scene images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch scene images' },
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

    const { scenePromptId, imageId } = await request.json()

    if (!scenePromptId || !imageId) {
      return NextResponse.json(
        { error: 'scenePromptId and imageId are required' },
        { status: 400 }
      )
    }

    await step6Service.selectVersion(scenePromptId, imageId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error selecting scene image version:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select version' },
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
    const imageId = searchParams.get('imageId')

    if (!imageId) {
      return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
    }

    await step6Service.deleteSceneImage(imageId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting scene image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete scene image' },
      { status: 500 }
    )
  }
}

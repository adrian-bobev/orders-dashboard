import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-character-list'

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

    const characters = await step3Service.getCharacters(generationId)

    return NextResponse.json({ characters })
  } catch (error) {
    console.error('Error fetching characters:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch characters' },
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

    const { generationId } = await params
    const { characterName, characterType, description } = await request.json()

    if (!characterName) {
      return NextResponse.json({ error: 'characterName is required' }, { status: 400 })
    }

    const character = await step3Service.createCharacter({
      generationId,
      characterName,
      characterType,
      description,
    })

    return NextResponse.json({ character })
  } catch (error) {
    console.error('Error creating character:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create character' },
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

    const { characterId, characterName, characterType, description, sortOrder } =
      await request.json()

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    const character = await step3Service.updateCharacter({
      characterId,
      characterName,
      characterType,
      description,
      sortOrder,
    })

    return NextResponse.json({ character })
  } catch (error) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update character' },
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
    const characterId = searchParams.get('characterId')

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    await step3Service.deleteCharacter(characterId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting character:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete character' },
      { status: 500 }
    )
  }
}

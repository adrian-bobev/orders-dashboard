import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { generationService } from '@/lib/services/generation/generation-service'

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { bookConfigId } = await request.json()

    if (!bookConfigId) {
      return NextResponse.json({ error: 'bookConfigId is required' }, { status: 400 })
    }

    const generation = await generationService.getOrCreateGeneration(bookConfigId, currentUser.id)

    return NextResponse.json({ generation })
  } catch (error) {
    console.error('Error creating generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create generation' },
      { status: 500 }
    )
  }
}

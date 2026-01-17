import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'

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

    const images = await step1Service.getCharacterImages(generationId)

    return NextResponse.json({ images })
  } catch (error) {
    console.error('Error fetching character images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch character images' },
      { status: 500 }
    )
  }
}

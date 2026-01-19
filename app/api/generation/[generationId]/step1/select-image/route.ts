import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const { sourceImageKey } = await request.json()

    if (!sourceImageKey) {
      return NextResponse.json({ error: 'sourceImageKey is required' }, { status: 400 })
    }

    const characterImage = await step1Service.selectCharacterImage({
      generationId,
      sourceImageKey,
    })

    return NextResponse.json({ characterImage })
  } catch (error) {
    console.error('Error selecting character image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select character image' },
      { status: 500 }
    )
  }
}

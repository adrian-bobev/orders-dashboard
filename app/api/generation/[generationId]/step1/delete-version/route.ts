import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { searchParams } = new URL(request.url)
    const characterImageId = searchParams.get('characterImageId')

    if (!characterImageId) {
      return NextResponse.json({ error: 'characterImageId is required' }, { status: 400 })
    }

    await step1Service.deleteCharacterImage(characterImageId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting character image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete image' },
      { status: 500 }
    )
  }
}

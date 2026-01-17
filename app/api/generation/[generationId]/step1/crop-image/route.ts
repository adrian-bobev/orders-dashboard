import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'
import type { CropData } from '@/lib/services/generation/step1-character-image'

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
    const { sourceImageKey, cropData } = await request.json()

    if (!sourceImageKey || !cropData) {
      return NextResponse.json(
        { error: 'sourceImageKey and cropData are required' },
        { status: 400 }
      )
    }

    const croppedImage = await step1Service.cropCharacterImage({
      generationId,
      sourceImageKey,
      cropData: cropData as CropData,
    })

    return NextResponse.json({ croppedImage })
  } catch (error) {
    console.error('Error cropping character image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to crop character image' },
      { status: 500 }
    )
  }
}

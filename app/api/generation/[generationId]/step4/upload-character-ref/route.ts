import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step4Service } from '@/lib/services/generation/step4-character-refs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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

    // Get the form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const characterListId = formData.get('characterListId') as string
    const characterName = formData.get('characterName') as string
    const characterType = formData.get('characterType') as string

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!characterListId || !characterName || !characterType) {
      return NextResponse.json(
        { error: 'Character list ID, name, and type are required' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and WEBP are allowed.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 413 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload the character reference
    const result = await step4Service.uploadCharacterReference(
      generationId,
      characterListId,
      characterName,
      characterType,
      buffer,
      file.name
    )

    return NextResponse.json({
      success: true,
      reference: result,
    })
  } catch (error) {
    console.error('Error uploading character reference:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload character reference' },
      { status: 500 }
    )
  }
}

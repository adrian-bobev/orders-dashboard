import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { generationService } from '@/lib/services/generation/generation-service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    // Delete the generation and all related data
    await generationService.deleteGeneration(generationId)

    return NextResponse.json({
      success: true,
      message: 'Generation deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete generation' },
      { status: 500 }
    )
  }
}

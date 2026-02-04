import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { retriggerJob } from '@/lib/queue/client'

/**
 * POST /api/admin/jobs/[id]/retrigger
 *
 * Create a new job from a failed or cancelled one
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const { newJobId } = await retriggerJob(id)

    return NextResponse.json({
      success: true,
      originalJobId: id,
      newJobId,
    })
  } catch (error) {
    console.error('Error retriggering job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrigger job' },
      { status: 500 }
    )
  }
}

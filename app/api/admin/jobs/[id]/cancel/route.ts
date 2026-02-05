import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { cancelJob } from '@/lib/queue/client'

/**
 * POST /api/admin/jobs/[id]/cancel
 *
 * Cancel a pending job
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const cancelled = await cancelJob(id)

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job cannot be cancelled (may not be in pending status)' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      jobId: id,
    })
  } catch (error) {
    console.error('Error cancelling job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel job' },
      { status: 500 }
    )
  }
}

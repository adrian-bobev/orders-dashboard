import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { forceCancelJob } from '@/lib/queue/client'

/**
 * POST /api/admin/jobs/[id]/force-cancel
 *
 * Force cancel a stuck processing job
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const cancelled = await forceCancelJob(id)

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job cannot be force cancelled (may not be in processing status)' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      jobId: id,
    })
  } catch (error) {
    console.error('Error force cancelling job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to force cancel job' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { getJobStatus } from '@/lib/queue/client'

/**
 * GET /api/admin/jobs/[id]
 *
 * Get a single job by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const job = await getJobStatus(id)

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error('Error getting job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get job' },
      { status: 500 }
    )
  }
}

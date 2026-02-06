import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { listJobs, getJobStats } from '@/lib/queue/client'
import type { JobType, JobStatus } from '@/lib/queue/types'

/**
 * GET /api/admin/jobs
 *
 * List jobs with optional filters for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') as JobStatus | null
    const type = searchParams.get('type') as JobType | null
    const orderId = searchParams.get('orderId')
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const includeStats = searchParams.get('includeStats') === 'true'

    const { jobs, total } = await listJobs({
      status: status || undefined,
      type: type || undefined,
      orderId: orderId || undefined,
      limit,
      offset,
    })

    let stats = null
    if (includeStats) {
      stats = await getJobStats(24) // Last 24 hours
    }

    return NextResponse.json({
      jobs,
      total,
      limit,
      offset,
      stats,
    })
  } catch (error) {
    console.error('Error listing jobs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list jobs' },
      { status: 500 }
    )
  }
}

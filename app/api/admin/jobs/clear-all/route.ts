import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/jobs/clear-all
 *
 * Delete all jobs (pending, processing, failed, cancelled)
 * Optionally filter by status
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const body = await request.json().catch(() => ({}))
    const { statuses } = body as { statuses?: string[] }

    const supabase = createServiceRoleClient()

    // Build the query
    let query = supabase.from('jobs').delete()

    if (statuses && statuses.length > 0) {
      // Delete only specific statuses
      query = query.in('status', statuses)
    }

    // Execute delete (need to add a filter to make it work - delete all)
    const { error, count } = await supabase
      .from('jobs')
      .delete()
      .in('status', statuses && statuses.length > 0
        ? statuses
        : ['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .select('id')

    if (error) {
      throw new Error(`Failed to delete jobs: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      deletedCount: count ?? 0,
      message: `Deleted ${count ?? 0} jobs`,
    })
  } catch (error) {
    console.error('Error clearing jobs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear jobs' },
      { status: 500 }
    )
  }
}

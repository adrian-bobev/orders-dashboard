import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { wakeWorker } from '@/lib/worker/client'

/**
 * POST /api/admin/worker/wake
 *
 * Wake the worker to immediately check for pending jobs
 */
export async function POST() {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    await wakeWorker()

    return NextResponse.json({
      success: true,
      message: 'Worker awakened',
    })
  } catch (error) {
    console.error('Error waking worker:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to wake worker' },
      { status: 500 }
    )
  }
}

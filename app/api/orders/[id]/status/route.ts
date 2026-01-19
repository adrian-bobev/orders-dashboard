import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { updateOrderStatus } from '@/lib/services/order-service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    // Get order ID
    const { id } = await params

    // Parse request body
    const { status } = await request.json()

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      )
    }

    // Valid statuses
    const validStatuses = [
      'NEW',
      'VALIDATION_PENDING',
      'READY_FOR_PRINT',
      'PRINTING',
      'IN_TRANSIT',
      'COMPLETED',
    ]

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Update order status
    await updateOrderStatus(id, status)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating order status:', error)
    return NextResponse.json(
      {
        error: 'Failed to update order status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

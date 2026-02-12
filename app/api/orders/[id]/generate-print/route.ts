import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { queueJob } from '@/lib/queue/client'

/**
 * POST /api/orders/[id]/generate-print
 *
 * Queue a print generation job for an order
 * Body: { includeShippingLabel?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const includeShippingLabel = body.includeShippingLabel !== false // default true

    const supabase = createServiceRoleClient()

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, woocommerce_order_id, order_number')
      .eq('id', id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Queue the print generation job (with duplicate check)
    const { jobId, isDuplicate } = await queueJob('PRINT_GENERATION', {
      woocommerceOrderId: order.woocommerce_order_id,
      orderId: order.id,
      orderNumber: order.order_number || undefined,
      includeShippingLabel,
    })

    // Wake the worker (only if not a duplicate)
    if (!isDuplicate) {
      try {
        const workerUrl = process.env.WORKER_URL || 'http://localhost:4000'
        await fetch(`${workerUrl}/wake`, { method: 'POST' })
      } catch (e) {
        console.warn('Failed to wake worker:', e)
      }
    }

    return NextResponse.json({
      success: true,
      jobId,
      isDuplicate,
      message: isDuplicate
        ? 'Print generation job already exists and is in progress'
        : `Print generation job queued${includeShippingLabel ? ' with shipping label' : ' without shipping label'}`,
    })
  } catch (error) {
    console.error('Error queueing print generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue print generation' },
      { status: 500 }
    )
  }
}

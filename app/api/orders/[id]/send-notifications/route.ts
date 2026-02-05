import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'
import { queueJob } from '@/lib/queue/client'

/**
 * POST /api/orders/[id]/send-notifications
 *
 * Queues a job to generate preview images (uploaded to R2) and send notifications (Telegram + Email).
 * Also updates order status to VALIDATION_PENDING.
 *
 * Prerequisites:
 * - All book configurations must have at least one completed generation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id: orderId } = await params
    const supabase = await createClient()

    console.log('📤 Send notifications called for order:', orderId)

    // Get the order with all its line_items and book_configurations
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        order_number,
        woocommerce_order_id,
        billing_first_name,
        billing_last_name,
        billing_email,
        line_items!line_items_order_id_fkey (
          id,
          product_name,
          book_configurations!book_configurations_line_item_id_fkey (
            id,
            name,
            content
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Get all book_config_ids for this order
    const allBookConfigIds: string[] = []
    const books: { childName: string; storyName: string }[] = []
    for (const li of order.line_items || []) {
      for (const bc of li.book_configurations || []) {
        allBookConfigIds.push(bc.id)
        const content = bc.content as { title?: string } | null
        books.push({
          childName: bc.name,
          storyName: content?.title || li.product_name,
        })
      }
    }

    if (allBookConfigIds.length === 0) {
      return NextResponse.json(
        { error: 'No book configurations found for this order' },
        { status: 400 }
      )
    }

    // Check if all book configs have at least one completed generation
    const { data: completedGenerations, error: cgError } = await supabase
      .from('book_generations')
      .select('book_config_id')
      .in('book_config_id', allBookConfigIds)
      .eq('status', 'completed')

    if (cgError) {
      throw new Error(`Failed to check generations: ${cgError.message}`)
    }

    const completedBookConfigIds = new Set(
      (completedGenerations || []).map((g: { book_config_id: string }) => g.book_config_id)
    )

    const allReady = allBookConfigIds.every((id) => completedBookConfigIds.has(id))

    if (!allReady) {
      const missingCount = allBookConfigIds.length - completedBookConfigIds.size
      return NextResponse.json(
        { error: `Not all book configurations are completed. ${missingCount} book(s) still pending.` },
        { status: 400 }
      )
    }

    console.log('📤 All books ready! Queuing preview generation job...')

    // Ensure we have a WooCommerce order ID for the approval URL
    if (!order.woocommerce_order_id) {
      return NextResponse.json(
        { error: 'Order has no WooCommerce order ID' },
        { status: 400 }
      )
    }

    const wooOrderId = order.woocommerce_order_id.toString()

    // Update order status to VALIDATION_PENDING
    const { error: statusError } = await supabase
      .from('orders')
      .update({ status: 'VALIDATION_PENDING' })
      .eq('id', order.id)

    if (statusError) {
      console.error('📤 Error updating order status:', statusError)
    } else {
      console.log('📤 Order status updated to VALIDATION_PENDING')
    }

    // Queue preview generation job with notification details
    const { jobId } = await queueJob('PREVIEW_GENERATION', {
      orderId: order.id,
      wooOrderId,
      orderNumber: order.order_number || wooOrderId,
      sendNotifications: true,
      customerEmail: order.billing_email,
      customerName: order.billing_first_name,
      books,
    }, { priority: 5 })

    console.log(`📤 Preview generation job queued: ${jobId}`)

    return NextResponse.json({
      success: true,
      message: 'Preview generation and notifications job queued',
      jobId,
      booksCount: allBookConfigIds.length,
    })
  } catch (error) {
    console.error('Error queuing notifications job:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue notifications job' },
      { status: 500 }
    )
  }
}

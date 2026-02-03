import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'
import { sendAllBooksReadyNotification } from '@/lib/services/telegram-service'
import { sendBooksReadyEmail } from '@/lib/services/email-service'
import { generateOrderPreviews } from '@/lib/services/pdf-preview-service'

/**
 * POST /api/orders/[id]/send-notifications
 *
 * Generates preview PDFs and sends notifications (Telegram + Email) for an order.
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
      (completedGenerations || []).map((g: any) => g.book_config_id)
    )

    const allReady = allBookConfigIds.every((id) => completedBookConfigIds.has(id))

    if (!allReady) {
      const missingCount = allBookConfigIds.length - completedBookConfigIds.size
      return NextResponse.json(
        { error: `Not all book configurations are completed. ${missingCount} book(s) still pending.` },
        { status: 400 }
      )
    }

    console.log('📤 All books ready! Processing...')

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

    // Generate preview PDFs for all books
    console.log('📄 Generating preview PDFs...')
    let previews: Array<{ childName: string; storyName: string; pdfBuffer: Buffer }> = []
    try {
      previews = await generateOrderPreviews(order.id)
      console.log(`📄 Generated ${previews.length} preview PDFs`)
    } catch (previewError) {
      console.error('📄 Failed to generate preview PDFs:', previewError)
      // Continue with notifications without previews
    }

    // Send Telegram notification with preview PDFs
    console.log('📱 Sending Telegram notification...')
    await sendAllBooksReadyNotification({
      orderId: order.id,
      orderNumber: order.order_number || order.woocommerce_order_id?.toString() || 'Unknown',
      bookCount: allBookConfigIds.length,
      books,
      previews,
    })

    // Send email notification to customer with preview PDFs
    console.log('📧 Sending email notification...')
    await sendBooksReadyEmail({
      orderId: order.id,
      orderNumber: order.order_number || order.woocommerce_order_id?.toString() || 'Unknown',
      customerEmail: order.billing_email,
      customerName: order.billing_first_name,
      books,
      previews,
    })

    console.log('📤 Notifications sent successfully')

    return NextResponse.json({
      success: true,
      message: 'Notifications sent successfully',
      previewsGenerated: previews.length,
      booksCount: allBookConfigIds.length,
    })
  } catch (error) {
    console.error('Error sending notifications:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send notifications' },
      { status: 500 }
    )
  }
}

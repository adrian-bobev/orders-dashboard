import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'
import { getSignedPrintDownloadUrl } from '@/lib/r2-client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication (both admin and viewer allowed)
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params
    const supabase = await createClient()

    // Get order with print file info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, print_file_r2_key')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Viewers can only download from READY_FOR_PRINT and PRINTING orders
    if (currentUser.role === 'viewer') {
      const allowedStatuses = ['READY_FOR_PRINT', 'PRINTING']
      if (!allowedStatuses.includes(order.status)) {
        return NextResponse.json(
          { error: 'Not authorized to download this order' },
          { status: 403 }
        )
      }
    }

    // Check if print file exists
    if (!order.print_file_r2_key) {
      return NextResponse.json(
        { error: 'Print file not available for this order' },
        { status: 404 }
      )
    }

    // Generate presigned URL (1 hour expiry)
    const downloadUrl = await getSignedPrintDownloadUrl(
      order.print_file_r2_key,
      3600
    )

    // Update download tracking
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        download_count: (order as any).download_count ? (order as any).download_count + 1 : 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to update download tracking:', updateError)
      // Don't fail the request, tracking is non-critical
    }

    return NextResponse.json({
      downloadUrl,
      orderNumber: order.order_number,
    })
  } catch (error) {
    console.error('Error generating download URL:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate download URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

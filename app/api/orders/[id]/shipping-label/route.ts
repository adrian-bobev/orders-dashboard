import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'
import { createShippingLabel, cancelShippingLabel } from '@/lib/services/speedy-service'
import { Agent, fetch as undiciFetch } from 'undici'

/**
 * Update WooCommerce order meta data
 */
async function updateWooCommerceOrderMeta(
  woocommerceOrderId: number,
  metaData: Array<{ key: string; value: string }>
): Promise<void> {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

  if (!storeUrl || !consumerKey || !consumerSecret) {
    console.warn('WooCommerce API credentials not configured, skipping meta update')
    return
  }

  const url = `${storeUrl}/wp-json/wc/v3/orders/${woocommerceOrderId}`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ meta_data: metaData }),
  }

  // Allow self-signed certificates for local development
  if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') {
    fetchOptions.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    })
  }

  const response = await undiciFetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Failed to update WooCommerce order meta: ${response.status} ${errorText}`)
  } else {
    console.log(`[WooCommerce] Updated order ${woocommerceOrderId} meta:`, metaData.map(m => m.key).join(', '))
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only authentication
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id: orderId } = await params
    const supabase = await createClient()

    // Fetch order with all necessary fields for shipping
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        woocommerce_order_id,
        billing_first_name,
        billing_last_name,
        billing_phone,
        billing_email,
        billing_city,
        billing_address_1,
        billing_postcode,
        total,
        payment_method,
        bg_carriers_delivery_type,
        bg_carriers_carrier,
        speedy_pickup_location_id,
        speedy_pickup_location_type,
        speedy_pickup_location_city_id,
        speedy_delivery_city_id,
        speedy_delivery_city_name,
        speedy_delivery_postcode,
        speedy_delivery_street_id,
        speedy_delivery_street_name,
        speedy_delivery_street_type,
        speedy_delivery_street_number,
        speedy_shipment_id,
        speedy_label_created_at
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // NOTE: We allow multiple labels for testing purposes
    // No check for existing labels - we just create a new one

    // Validate that this is a Speedy delivery
    if (order.bg_carriers_carrier !== 'speedy') {
      return NextResponse.json(
        { error: 'This order is not using Speedy delivery' },
        { status: 400 }
      )
    }

    // Validate delivery type
    const deliveryType = order.bg_carriers_delivery_type
    if (!deliveryType || !['pickup', 'home'].includes(deliveryType)) {
      return NextResponse.json(
        { error: `Invalid delivery type: ${deliveryType}` },
        { status: 400 }
      )
    }

    // Fetch line items for weight calculation and COD
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select(`
        id,
        product_name,
        quantity,
        total,
        book_configurations!book_configurations_line_item_id_fkey (
          id,
          name,
          content
        )
      `)
      .eq('order_id', orderId)

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError)
      return NextResponse.json(
        { error: 'Failed to fetch order items' },
        { status: 500 }
      )
    }

    if (!lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: 'Order has no line items' },
        { status: 400 }
      )
    }

    // Build order data for Speedy service
    const orderData = {
      id: order.id,
      woocommerce_order_id: order.woocommerce_order_id,
      billing_first_name: order.billing_first_name,
      billing_last_name: order.billing_last_name,
      billing_phone: order.billing_phone,
      billing_email: order.billing_email,
      billing_city: order.billing_city,
      billing_address_1: order.billing_address_1,
      billing_postcode: order.billing_postcode,
      total: order.total,
      payment_method: order.payment_method,
      bg_carriers_delivery_type: deliveryType as 'pickup' | 'home',
      speedy_pickup_location_id: order.speedy_pickup_location_id,
      speedy_pickup_location_type: order.speedy_pickup_location_type as 'office' | 'apm' | null,
      speedy_pickup_location_city_id: order.speedy_pickup_location_city_id,
      speedy_delivery_city_id: order.speedy_delivery_city_id,
      speedy_delivery_city_name: order.speedy_delivery_city_name,
      speedy_delivery_postcode: order.speedy_delivery_postcode,
      speedy_delivery_street_id: order.speedy_delivery_street_id,
      speedy_delivery_street_name: order.speedy_delivery_street_name,
      speedy_delivery_street_type: order.speedy_delivery_street_type as 'street' | 'complex' | 'custom' | null,
      speedy_delivery_street_number: order.speedy_delivery_street_number,
      line_items: lineItems.map((item) => ({
        id: item.id,
        product_name: item.product_name,
        quantity: item.quantity,
        total: item.total,
        book_configurations: item.book_configurations as Array<{
          id: string
          name: string
          content?: { title?: string }
        }> | undefined,
      })),
    }

    // Create shipping label via Speedy API
    const result = await createShippingLabel(orderData)

    // Store shipment ID in shipping_labels table
    const { error: insertError } = await supabase
      .from('shipping_labels')
      .insert({
        order_id: orderId,
        shipment_id: result.shipmentId,
        price_amount: result.price?.amount,
        price_total: result.price?.total,
        price_currency: result.price?.currency || 'BGN',
        pickup_date: result.pickupDate,
        delivery_deadline: result.deliveryDeadline,
      })

    if (insertError) {
      console.error('Failed to save shipment to database:', insertError)
      // Don't fail the request - the shipment was created successfully
      // Log for manual intervention if needed
    }

    // Also update the main orders table with the latest shipment (for backward compatibility)
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        speedy_shipment_id: result.shipmentId,
        speedy_label_created_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to update order with latest shipment ID:', updateError)
    }

    // Update WooCommerce order meta (non-blocking)
    updateWooCommerceOrderMeta(order.woocommerce_order_id, [
      { key: '_speedy_shipment_id', value: result.shipmentId },
    ]).catch(err => {
      console.error('Failed to update WooCommerce order meta:', err)
    })

    return NextResponse.json({
      success: true,
      shipmentId: result.shipmentId,
      trackingUrl: result.trackingUrl,
      price: result.price,
      pickupDate: result.pickupDate,
      deliveryDeadline: result.deliveryDeadline,
    })
  } catch (error) {
    console.error('Error creating shipping label:', error)
    return NextResponse.json(
      {
        error: 'Failed to create shipping label',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only authentication
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id: orderId } = await params
    const supabase = await createClient()

    // Fetch all shipping labels for this order
    const { data: labels, error: labelsError } = await supabase
      .from('shipping_labels')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (labelsError) {
      console.error('Error fetching shipping labels:', labelsError)
      return NextResponse.json(
        { error: 'Failed to fetch shipping labels' },
        { status: 500 }
      )
    }

    if (!labels || labels.length === 0) {
      return NextResponse.json({ labels: [] })
    }

    // Format labels for response
    const formattedLabels = labels.map(label => ({
      id: label.id,
      shipmentId: label.shipment_id,
      trackingUrl: `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${label.shipment_id}`,
      createdAt: label.created_at,
      price: {
        amount: label.price_amount,
        total: label.price_total,
        currency: label.price_currency,
      },
      pickupDate: label.pickup_date,
      deliveryDeadline: label.delivery_deadline,
    }))

    return NextResponse.json({ labels: formattedLabels })
  } catch (error) {
    console.error('Error fetching shipping labels:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch shipping labels',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Delete WooCommerce order meta data
 */
async function deleteWooCommerceOrderMeta(
  woocommerceOrderId: number,
  keys: string[]
): Promise<void> {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

  if (!storeUrl || !consumerKey || !consumerSecret) {
    console.warn('WooCommerce API credentials not configured, skipping meta delete')
    return
  }

  const url = `${storeUrl}/wp-json/wc/v3/orders/${woocommerceOrderId}`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  // To delete meta, set the value to empty string
  const metaData = keys.map(key => ({ key, value: '' }))

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ meta_data: metaData }),
  }

  if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') {
    fetchOptions.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    })
  }

  const response = await undiciFetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Failed to delete WooCommerce order meta: ${response.status} ${errorText}`)
  } else {
    console.log(`[WooCommerce] Deleted order ${woocommerceOrderId} meta:`, keys.join(', '))
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only authentication
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { id: orderId } = await params
    const supabase = await createClient()

    // Get labelId from query params
    const url = new URL(request.url)
    const labelId = url.searchParams.get('labelId')

    if (!labelId) {
      return NextResponse.json(
        { error: 'labelId query parameter is required' },
        { status: 400 }
      )
    }

    // Fetch the label to get shipment ID and verify it belongs to this order
    const { data: label, error: labelError } = await supabase
      .from('shipping_labels')
      .select('shipment_id, order_id')
      .eq('id', labelId)
      .single()

    if (labelError || !label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    if (label.order_id !== orderId) {
      return NextResponse.json(
        { error: 'Label does not belong to this order' },
        { status: 403 }
      )
    }

    const shipmentId = label.shipment_id

    // Cancel shipment via Speedy API
    await cancelShippingLabel(shipmentId)

    // Remove label from database
    const { error: deleteError } = await supabase
      .from('shipping_labels')
      .delete()
      .eq('id', labelId)

    if (deleteError) {
      console.error('Failed to remove label from database:', deleteError)
    }

    // Update orders table to clear latest shipment if this was it
    const { data: order } = await supabase
      .from('orders')
      .select('speedy_shipment_id')
      .eq('id', orderId)
      .single()

    if (order?.speedy_shipment_id === shipmentId) {
      // Find the next latest label
      const { data: latestLabel } = await supabase
        .from('shipping_labels')
        .select('shipment_id, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      await supabase
        .from('orders')
        .update({
          speedy_shipment_id: latestLabel?.shipment_id || null,
          speedy_label_created_at: latestLabel?.created_at || null,
        })
        .eq('id', orderId)
    }

    // Get WooCommerce order ID for meta update
    const { data: orderData } = await supabase
      .from('orders')
      .select('woocommerce_order_id')
      .eq('id', orderId)
      .single()

    if (orderData) {
      // Delete from WooCommerce order meta (non-blocking) - only if no more labels
      const { data: remainingLabels } = await supabase
        .from('shipping_labels')
        .select('id')
        .eq('order_id', orderId)

      if (!remainingLabels || remainingLabels.length === 0) {
        deleteWooCommerceOrderMeta(orderData.woocommerce_order_id, [
          '_speedy_shipment_id',
        ]).catch(err => {
          console.error('Failed to delete WooCommerce order meta:', err)
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Shipping label ${shipmentId} cancelled`,
    })
  } catch (error) {
    console.error('Error cancelling shipping label:', error)
    return NextResponse.json(
      {
        error: 'Failed to cancel shipping label',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

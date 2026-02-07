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
        bg_carriers_service_type,
        bg_carriers_carrier,
        speedy_pickup_location_id,
        speedy_delivery_city_id,
        speedy_delivery_city_name,
        speedy_delivery_postcode,
        speedy_delivery_street_id,
        speedy_delivery_street_name,
        speedy_delivery_street_number,
        speedy_delivery_full_address,
        speedy_shipment_id,
        speedy_label_created_at
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check if label already exists
    if (order.speedy_shipment_id) {
      return NextResponse.json(
        {
          error: 'Shipping label already exists',
          shipmentId: order.speedy_shipment_id,
          trackingUrl: `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${order.speedy_shipment_id}`,
          createdAt: order.speedy_label_created_at,
        },
        { status: 409 }
      )
    }

    // Validate that this is a Speedy delivery
    if (order.bg_carriers_carrier !== 'speedy') {
      return NextResponse.json(
        { error: 'This order is not using Speedy delivery' },
        { status: 400 }
      )
    }

    // Validate delivery type
    const serviceType = order.bg_carriers_service_type
    if (!serviceType || !['office', 'apm', 'home'].includes(serviceType)) {
      return NextResponse.json(
        { error: `Invalid delivery type: ${serviceType}` },
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
      bg_carriers_service_type: serviceType as 'office' | 'apm' | 'home',
      speedy_pickup_location_id: order.speedy_pickup_location_id,
      speedy_delivery_city_id: order.speedy_delivery_city_id,
      speedy_delivery_city_name: order.speedy_delivery_city_name,
      speedy_delivery_postcode: order.speedy_delivery_postcode,
      speedy_delivery_street_id: order.speedy_delivery_street_id,
      speedy_delivery_street_name: order.speedy_delivery_street_name,
      speedy_delivery_street_number: order.speedy_delivery_street_number,
      speedy_delivery_full_address: order.speedy_delivery_full_address,
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

    // Store shipment ID in database
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        speedy_shipment_id: result.shipmentId,
        speedy_label_created_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to save shipment ID to database:', updateError)
      // Don't fail the request - the shipment was created successfully
      // Log for manual intervention if needed
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

    // Fetch order shipping label info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, speedy_shipment_id, speedy_label_created_at')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (!order.speedy_shipment_id) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      shipmentId: order.speedy_shipment_id,
      trackingUrl: `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${order.speedy_shipment_id}`,
      createdAt: order.speedy_label_created_at,
    })
  } catch (error) {
    console.error('Error fetching shipping label info:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch shipping label info',
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

    // Fetch order with shipment info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, woocommerce_order_id, speedy_shipment_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (!order.speedy_shipment_id) {
      return NextResponse.json(
        { error: 'No shipping label exists for this order' },
        { status: 400 }
      )
    }

    const shipmentId = order.speedy_shipment_id

    // Cancel shipment via Speedy API
    await cancelShippingLabel(shipmentId)

    // Remove shipment ID from database
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        speedy_shipment_id: null,
        speedy_label_created_at: null,
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to remove shipment ID from database:', updateError)
    }

    // Delete from WooCommerce order meta (non-blocking)
    deleteWooCommerceOrderMeta(order.woocommerce_order_id, [
      '_speedy_shipment_id',
    ]).catch(err => {
      console.error('Failed to delete WooCommerce order meta:', err)
    })

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

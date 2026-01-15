import { createServiceRoleClient, createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'

type OrderInsert = Database['public']['Tables']['orders']['Insert']
type LineItemInsert = Database['public']['Tables']['line_items']['Insert']
type BookConfigInsert =
  Database['public']['Tables']['book_configurations']['Insert']
type OrderStatus = Database['public']['Enums']['order_status']
type Order = Database['public']['Tables']['orders']['Row']

/**
 * Extract a value from WooCommerce meta_data array
 * Returns null if key not found
 */
function extractMetadata(
  metaDataArray: any[] | undefined,
  key: string
): string | null {
  if (!metaDataArray || !Array.isArray(metaDataArray)) return null
  const item = metaDataArray.find((m: any) => m.key === key)
  return item?.value || null
}

/**
 * Build order insert data from WooCommerce order data
 */
function buildOrderInsertData(orderData: any): OrderInsert {
  const metaData = orderData.meta_data || []

  return {
    woocommerce_order_id: orderData.id,
    order_number: orderData.number,
    total: orderData.total,
    currency: orderData.currency || 'EUR',
    payment_method: orderData.payment_method,
    payment_method_title: orderData.payment_method_title,
    status: 'NEW' as OrderStatus,

    // Billing information
    billing_first_name: orderData.billing?.first_name || '',
    billing_last_name: orderData.billing?.last_name || '',
    billing_email: orderData.billing?.email || '',
    billing_phone: orderData.billing?.phone || null,
    billing_postcode: orderData.billing?.postcode || null,
    billing_company: orderData.billing?.company || null,
    billing_address_1: orderData.billing?.address_1 || null,
    billing_address_2: orderData.billing?.address_2 || null,
    billing_city: orderData.billing?.city || null,
    billing_state: orderData.billing?.state || null,
    billing_country: orderData.billing?.country || null,

    // Delivery metadata
    speedy_office_id: extractMetadata(metaData, '_speedy_office_id'),
    speedy_office_name: extractMetadata(metaData, '_speedy_office_name'),
    delivery_city_id: extractMetadata(metaData, '_delivery_city_id'),
    delivery_city_name: extractMetadata(metaData, '_delivery_city_name'),
    delivery_city_region: extractMetadata(metaData, '_delivery_city_region'),
    delivery_city_type: extractMetadata(metaData, '_delivery_city_type'),
    delivery_address_component_id: extractMetadata(
      metaData,
      '_delivery_address_component_id'
    ),
    delivery_address_component_name: extractMetadata(
      metaData,
      '_delivery_address_component_name'
    ),
    delivery_address_component_type: extractMetadata(
      metaData,
      '_delivery_address_component_type'
    ),
    delivery_address_type_prefix: extractMetadata(
      metaData,
      '_delivery_address_type_prefix'
    ),

    // Shipping details
    shipping_total: orderData.shipping_total || null,
    shipping_method_title:
      orderData.shipping_lines?.[0]?.method_title || null,

    // WooCommerce timestamps
    woocommerce_created_at: orderData.date_created_gmt || null,
  }
}

/**
 * Build line items insert data from WooCommerce line items
 */
function buildLineItemsInsertData(
  lineItems: any[] | undefined,
  orderId: string
): LineItemInsert[] {
  if (!lineItems || !Array.isArray(lineItems)) return []

  return lineItems.map((item) => {
    const metaData = item.meta_data || []
    const configId = extractMetadata(metaData, '_prikazko_wizard_config_id')

    return {
      order_id: orderId,
      woocommerce_line_item_id: item.id,
      product_name: item.name,
      product_id: item.product_id || null,
      quantity: item.quantity || 1,
      total: item.total,
      prikazko_wizard_config_id: configId,
    }
  })
}

/**
 * Build book configurations insert data from book configurations
 * Maps config_id to line_item_id using the line items data
 */
function buildBookConfigsInsertData(
  bookConfigurations: any[] | undefined,
  lineItems: any[]
): BookConfigInsert[] {
  if (!bookConfigurations || !Array.isArray(bookConfigurations)) return []

  return bookConfigurations.map((config) => {
    // Find the matching line item by config_id
    const lineItem = lineItems.find(
      (li) => li.prikazko_wizard_config_id === config.prikazko_wizard_config_id
    )

    if (!lineItem) {
      throw new Error(
        `No line item found for config_id: ${config.prikazko_wizard_config_id}`
      )
    }

    const configData = config.configuration_data || {}

    return {
      line_item_id: lineItem.id,
      config_id: config.prikazko_wizard_config_id,
      name: configData.name || '',
      age: configData.age || null,
      gender: configData.gender || null,
      content: configData.content || {},
      images: configData.images || [],
      story_description: configData.story_description || null,
      woocommerce_created_at: configData.created_at || null,
      woocommerce_completed_at: configData.completed_at || null,
    }
  })
}

/**
 * Create order from WooCommerce webhook data
 * Inserts order, line items, and book configurations atomically
 */
export async function createOrderFromWebhook(
  orderData: any,
  bookConfigurations: any[]
): Promise<{ success: true; orderId: string }> {
  const supabase = createServiceRoleClient()

  try {
    // 1. Insert order
    const orderInsertData = buildOrderInsertData(orderData)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderInsertData)
      .select()
      .single()

    if (orderError) {
      throw new Error(`Failed to insert order: ${orderError.message}`)
    }

    console.log('✅ Order inserted:', order.id)

    // 2. Insert line items
    const lineItemsInsertData = buildLineItemsInsertData(
      orderData.line_items,
      order.id
    )

    if (lineItemsInsertData.length === 0) {
      console.log('⚠️  No line items to insert')
      return { success: true, orderId: order.id }
    }

    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .insert(lineItemsInsertData)
      .select()

    if (lineItemsError) {
      throw new Error(`Failed to insert line items: ${lineItemsError.message}`)
    }

    console.log('✅ Line items inserted:', lineItems.length)

    // 3. Insert book configurations
    if (!bookConfigurations || bookConfigurations.length === 0) {
      console.log('⚠️  No book configurations to insert')
      return { success: true, orderId: order.id }
    }

    const bookConfigsInsertData = buildBookConfigsInsertData(
      bookConfigurations,
      lineItems
    )

    const { data: bookConfigs, error: bookConfigsError } = await supabase
      .from('book_configurations')
      .insert(bookConfigsInsertData)
      .select()

    if (bookConfigsError) {
      throw new Error(
        `Failed to insert book configurations: ${bookConfigsError.message}`
      )
    }

    console.log('✅ Book configurations inserted:', bookConfigs.length)

    return { success: true, orderId: order.id }
  } catch (error) {
    console.error('❌ Error creating order from webhook:', error)
    throw error
  }
}

/**
 * Get all orders with their line items and book configurations
 * Filters by status based on user role
 */
export async function getOrders(
  userRole: 'admin' | 'viewer',
  statusFilter?: OrderStatus
): Promise<Order[]> {
  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  // Viewers can only see READY_FOR_PRINT and PRINTING orders
  if (userRole === 'viewer') {
    query = query.in('status', ['READY_FOR_PRINT', 'PRINTING'])
  } else if (statusFilter) {
    // Admins can filter by status
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single order with all related data
 */
export async function getOrderById(orderId: string): Promise<any> {
  const supabase = await createClient()

  // First get the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (orderError) {
    throw new Error(`Failed to fetch order: ${orderError.message}`)
  }

  // Get line items
  const { data: lineItems, error: lineItemsError } = await supabase
    .from('line_items')
    .select('*')
    .eq('order_id', orderId)

  if (lineItemsError) {
    throw new Error(`Failed to fetch line items: ${lineItemsError.message}`)
  }

  // Get book configurations for each line item
  if (lineItems && lineItems.length > 0) {
    const lineItemIds = lineItems.map((li) => li.id)
    const { data: bookConfigs, error: bookConfigsError } = await supabase
      .from('book_configurations')
      .select('*')
      .in('line_item_id', lineItemIds)

    if (bookConfigsError) {
      throw new Error(
        `Failed to fetch book configurations: ${bookConfigsError.message}`
      )
    }

    // Attach book configs to their respective line items
    lineItems.forEach((lineItem) => {
      lineItem.book_configurations = bookConfigs?.filter(
        (config) => config.line_item_id === lineItem.id
      )
    })
  }

  // Get status history
  const { data: statusHistory, error: statusHistoryError } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false })

  if (statusHistoryError) {
    throw new Error(
      `Failed to fetch status history: ${statusHistoryError.message}`
    )
  }

  return {
    ...order,
    line_items: lineItems || [],
    order_status_history: statusHistory || [],
  }
}

/**
 * Update order status
 * Only accessible by admins
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)

  if (error) {
    throw new Error(`Failed to update order status: ${error.message}`)
  }
}


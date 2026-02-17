/**
 * Enhanced order fetching script with detailed logging
 *
 * Usage: npx tsx scripts/fetch-order-with-logging.ts <woocommerce-order-id>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { get } from '../lib/services/http-client'
import * as fs from 'fs'
import * as path from 'path'

config({ path: '.env.local' })

const LOG_DIR = path.join(process.cwd(), 'logs')

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}`

  console.log(logMessage)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }

  // Also write to file
  const logFile = path.join(LOG_DIR, `order-fetch-${new Date().toISOString().split('T')[0]}.log`)
  const logLine = data
    ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n\n`
    : `${logMessage}\n`

  fs.appendFileSync(logFile, logLine)
}

async function fetchOrderWithLogging(wooOrderId: number) {
  log(`🚀 Starting order fetch for WooCommerce Order ID: ${wooOrderId}`)

  const storeUrl = process.env.WOOCOMMERCE_STORE_URL
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

  if (!storeUrl || !consumerKey || !consumerSecret) {
    log('❌ WooCommerce API credentials not configured')
    process.exit(1)
  }

  log('✅ WooCommerce credentials found')
  log(`   Store URL: ${storeUrl}`)

  // Fetch order from WooCommerce
  const url = `${storeUrl}/wp-json/wc/v3/orders/${wooOrderId}`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  try {
    log('📡 Fetching order from WooCommerce API...')

    const allowSelfSignedCerts = process.env.ALLOW_SELF_SIGNED_CERTS === 'true'

    const response = await get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      allowSelfSignedCerts,
    })

    if (response.status !== 200) {
      log(`❌ Failed to fetch order: ${response.status} ${response.statusText}`)
      process.exit(1)
    }

    const orderData = response.data
    log('✅ Order fetched successfully')

    // Save full order data to JSON file
    const jsonFile = path.join(LOG_DIR, `order-${wooOrderId}-full-data.json`)
    fs.writeFileSync(jsonFile, JSON.stringify(orderData, null, 2))
    log(`💾 Full order data saved to: ${jsonFile}`)

    // Log basic order info
    log('📋 Order Information:', {
      id: orderData.id,
      number: orderData.number,
      status: orderData.status,
      total: orderData.total,
      currency: orderData.currency,
      customer: `${orderData.billing?.first_name || ''} ${orderData.billing?.last_name || ''}`.trim(),
    })

    // Log shipping method
    log('🚚 Shipping Lines:')
    if (orderData.shipping_lines && orderData.shipping_lines.length > 0) {
      orderData.shipping_lines.forEach((line: any, idx: number) => {
        log(`   [${idx}] ${line.method_title} (${line.method_id})`, line)
      })
    } else {
      log('   ⚠️ No shipping lines found')
    }

    // Extract and log ALL metadata
    const metaData = orderData.meta_data || []
    log(`📦 Total Meta Data Keys: ${metaData.length}`)

    // Log all meta keys
    log('📝 All Meta Data Keys:', metaData.map((m: any) => m.key))

    // Focus on shipping-related metadata
    log('\n🎯 SHIPPING METADATA ANALYSIS:')
    log('=' .repeat(60))

    const shippingKeys = metaData.filter((m: any) =>
      m.key.startsWith('_bg_carriers') ||
      m.key.startsWith('_speedy') ||
      m.key.includes('delivery') ||
      m.key.includes('shipping')
    )

    if (shippingKeys.length > 0) {
      log('✅ Found shipping-related metadata:')
      shippingKeys.forEach((m: any) => {
        log(`   ${m.key}:`, m.value)
      })
    } else {
      log('❌ No shipping metadata found!')
    }

    // Check specific required keys for shipping labels
    log('\n🔍 REQUIRED FIELDS CHECK:')
    log('=' .repeat(60))

    const requiredChecks = {
      'Carrier': '_bg_carriers_carrier',
      'Delivery Type': '_bg_carriers_delivery_type',  // NEW FIELD
      'Pickup Location ID': '_speedy_pickup_location_id',
      'Pickup Location Type': '_speedy_pickup_location_type',
      'Pickup City ID': '_speedy_pickup_location_city_id',
      'Delivery City ID': '_speedy_delivery_city_id',
      'Delivery Street ID': '_speedy_delivery_street_id',
      'Delivery Street Type': '_speedy_delivery_street_type',  // NEW FIELD
    }

    const extractedData: Record<string, any> = {}

    for (const [label, key] of Object.entries(requiredChecks)) {
      const meta = metaData.find((m: any) => m.key === key)
      const value = meta?.value
      extractedData[key] = value

      const status = value ? '✅' : '❌'
      log(`   ${status} ${label} (${key}): ${value || 'NOT FOUND'}`)
    }

    // Analyze what type of delivery this is
    log('\n🎯 DELIVERY TYPE ANALYSIS:')
    log('=' .repeat(60))

    const deliveryType = extractedData['_bg_carriers_delivery_type']  // NEW
    const pickupLocationType = extractedData['_speedy_pickup_location_type']
    const pickupLocationId = extractedData['_speedy_pickup_location_id']
    const deliveryCityId = extractedData['_speedy_delivery_city_id']
    const streetType = extractedData['_speedy_delivery_street_type']  // NEW

    log(`   Delivery Type: ${deliveryType}`)
    log(`   Pickup Location Type: ${pickupLocationType}`)
    log(`   Has Pickup Location ID: ${pickupLocationId ? 'YES' : 'NO'}`)
    log(`   Has Delivery City ID: ${deliveryCityId ? 'YES' : 'NO'}`)
    log(`   Street Type: ${streetType}`)

    // Validate new structure
    if (deliveryType === 'pickup' && pickupLocationId) {
      log('\n✅ Correct: Pickup delivery with location ID')
      log(`   Location Type: ${pickupLocationType || 'NOT SET'}`)
    } else if (deliveryType === 'home' && deliveryCityId) {
      log('\n✅ Correct: Home delivery with city ID')
      log(`   Street Type: ${streetType || 'NOT SET'}`)
    } else {
      log('\n⚠️  Unable to determine delivery type - insufficient data')
    }

    // Show what will be saved to database
    log('\n💾 DATA THAT WILL BE SAVED TO DATABASE:')
    log('=' .repeat(60))

    const dbData = {
      bg_carriers_carrier: extractedData['_bg_carriers_carrier'],
      bg_carriers_delivery_type: extractedData['_bg_carriers_delivery_type'],  // NEW
      speedy_pickup_location_id: extractedData['_speedy_pickup_location_id'],
      speedy_pickup_location_type: extractedData['_speedy_pickup_location_type'],
      speedy_pickup_location_city_id: extractedData['_speedy_pickup_location_city_id'],
      speedy_delivery_city_id: extractedData['_speedy_delivery_city_id'],
      speedy_delivery_street_id: extractedData['_speedy_delivery_street_id'],
      speedy_delivery_street_type: extractedData['_speedy_delivery_street_type'],  // NEW
    }

    log('Database fields:', dbData)

    log('\n✅ Analysis complete!')
    log(`📄 Full logs saved to: ${LOG_DIR}`)

  } catch (error) {
    log('❌ Error:', error)
    process.exit(1)
  }
}

const wooOrderId = process.argv[2]

if (!wooOrderId) {
  console.error('❌ Please provide a WooCommerce order ID')
  console.log('\nUsage: npx tsx scripts/fetch-order-with-logging.ts <woocommerce-order-id>')
  process.exit(1)
}

fetchOrderWithLogging(parseInt(wooOrderId, 10))

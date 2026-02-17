/**
 * Diagnostic script to check shipping data for an order
 *
 * Usage: npx tsx scripts/diagnose-shipping.ts <woocommerce-order-id>
 */

import { config } from 'dotenv'
import { get } from '../lib/services/http-client'

config({ path: '.env.local' })

async function diagnoseShipping(wooOrderId: number) {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

  if (!storeUrl || !consumerKey || !consumerSecret) {
    console.error('❌ WooCommerce API credentials not configured')
    process.exit(1)
  }

  console.log(`🔍 Fetching order ${wooOrderId} from WooCommerce...`)

  const url = `${storeUrl}/wp-json/wc/v3/orders/${wooOrderId}`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  try {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const allowSelfSignedCerts = isDevelopment && process.env.ALLOW_SELF_SIGNED_CERTS === 'true'

    const response = await get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      allowSelfSignedCerts,
    })

    if (response.status !== 200) {
      console.error(`❌ Failed to fetch order: ${response.status} ${response.statusText}`)
      process.exit(1)
    }

    const orderData = response.data

    console.log('\n📋 Order Information:')
    console.log(`   ID: ${orderData.id}`)
    console.log(`   Number: ${orderData.number}`)
    console.log(`   Status: ${orderData.status}`)
    console.log(`   Customer: ${orderData.billing.first_name} ${orderData.billing.last_name}`)

    console.log('\n🚚 Shipping Method:')
    if (orderData.shipping_lines && orderData.shipping_lines.length > 0) {
      orderData.shipping_lines.forEach((line: any) => {
        console.log(`   - ${line.method_title} (${line.method_id})`)
      })
    } else {
      console.log('   ⚠️ No shipping lines found')
    }

    console.log('\n📦 Order Meta Data:')
    const metaData = orderData.meta_data || []

    // Filter and display relevant metadata
    const relevantKeys = [
      '_bg_carriers_method_id',
      '_bg_carriers_carrier',
      '_bg_carriers_service_type',
      '_bg_carriers_location_id',
      '_bg_carriers_location_name',
      '_bg_carriers_location_address',
      '_speedy_pickup_location_id',
      '_speedy_pickup_location_name',
      '_speedy_pickup_location_address',
      '_speedy_pickup_location_type',
      '_speedy_pickup_location_city',
      '_speedy_pickup_location_city_id',
      '_speedy_pickup_location_postcode',
      '_speedy_delivery_city_id',
      '_speedy_delivery_city_name',
      '_speedy_delivery_street_id',
      '_speedy_delivery_street_name',
      '_speedy_delivery_street_type',
      '_speedy_delivery_street_number',
      '_speedy_delivery_postcode',
      '_speedy_delivery_full_address',
    ]

    const shippingMeta = metaData.filter((m: any) =>
      relevantKeys.includes(m.key) || m.key.startsWith('_bg_carriers') || m.key.startsWith('_speedy')
    )

    if (shippingMeta.length > 0) {
      console.log('   Found shipping metadata:')
      shippingMeta.forEach((m: any) => {
        console.log(`   ✓ ${m.key}: ${JSON.stringify(m.value)}`)
      })
    } else {
      console.log('   ❌ No shipping metadata found!')
      console.log('\n   This means the BG Carriers plugin is not saving shipping data to order meta.')
      console.log('   The order was likely created before the plugin was properly configured.')
    }

    console.log('\n📝 All Meta Data Keys:')
    metaData.forEach((m: any) => {
      console.log(`   - ${m.key}`)
    })

    // Check what the expected values should be
    console.log('\n💡 Expected Metadata for Shipping Label Creation:')
    console.log('   For OFFICE delivery:')
    console.log('     - _bg_carriers_service_type: "office"')
    console.log('     - _bg_carriers_carrier: "speedy"')
    console.log('     - _speedy_pickup_location_id: <office ID>')
    console.log('     - _speedy_pickup_location_name: <office name>')
    console.log('     - _speedy_pickup_location_city_id: <city ID>')
    console.log('')
    console.log('   For HOME delivery:')
    console.log('     - _bg_carriers_service_type: "home"')
    console.log('     - _bg_carriers_carrier: "speedy"')
    console.log('     - _speedy_delivery_city_id: <city ID>')
    console.log('     - _speedy_delivery_city_name: <city name>')
    console.log('     - _speedy_delivery_street_id: <street ID>')
    console.log('     - _speedy_delivery_street_name: <street name>')
    console.log('     - _speedy_delivery_street_number: <street number>')
    console.log('     - _speedy_delivery_full_address: <full address>')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

const wooOrderId = process.argv[2]

if (!wooOrderId) {
  console.error('❌ Please provide a WooCommerce order ID')
  console.log('\nUsage: npx tsx scripts/diagnose-shipping.ts <woocommerce-order-id>')
  process.exit(1)
}

diagnoseShipping(parseInt(wooOrderId, 10))

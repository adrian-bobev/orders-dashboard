#!/usr/bin/env tsx

/**
 * Fetch order from WooCommerce API and save to database
 *
 * Usage:
 *   npm run fetch-order <woocommerce-order-id>
 *
 * Example:
 *   npm run fetch-order 1578
 */

import https from 'https';
import http from 'http';
import { config } from 'dotenv';
import { createOrderFromWebhook } from '../lib/services/order-service';

// Load environment variables
config({ path: '.env.local' });

/**
 * Create HTTPS agent that accepts self-signed certificates for local development
 */
function createHttpsAgent() {
  const allowSelfSignedCerts = process.env.ALLOW_SELF_SIGNED_CERTS === 'true';

  if (allowSelfSignedCerts) {
    return new https.Agent({
      rejectUnauthorized: false,
    });
  }

  return new https.Agent({
    rejectUnauthorized: true,
  });
}

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(url: string, options: {
  method?: string;
  headers: Record<string, string>;
  agent?: https.Agent | http.Agent;
}): Promise<{ status: number; statusText: string; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers,
      agent: options.agent,
    };

    const req = requestModule.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode || 500,
            statusText: res.statusMessage || 'Unknown',
            data: jsonData,
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Fetch order from WooCommerce API
 */
async function fetchOrderFromWooCommerce(orderId: number) {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new Error('WooCommerce API credentials not configured (WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET)');
  }

  const url = `${storeUrl}/wp-json/wc/v3/orders/${orderId}`;

  // Create Basic Auth header
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  console.log(`🔍 Fetching order ${orderId} from WooCommerce...`);

  const response = await makeRequest(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    agent: createHttpsAgent(),
  });

  if (response.status === 404) {
    throw new Error(`Order ${orderId} not found in WooCommerce`);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `WooCommerce API error: ${response.status} ${response.statusText}`
    );
  }

  return response.data;
}

/**
 * Fetch order configuration from WooCommerce custom API endpoint
 */
async function fetchOrderConfiguration(orderId: number) {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!storeUrl || !consumerKey || !consumerSecret) {
    console.warn('⚠️ WooCommerce API credentials not configured, skipping configuration fetch');
    return null;
  }

  const url = `${storeUrl}/wp-json/prikazko/v1/orders/${orderId}/configurations`;

  // Create Basic Auth header
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await makeRequest(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      agent: createHttpsAgent(),
    });

    if (response.status === 404) {
      console.log('ℹ️ No configurations found for this order');
      return null;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `WooCommerce API error: ${response.status} ${response.statusText}`
      );
    }

    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch order configuration:', error);
    return null;
  }
}

/**
 * Process order configurations
 */
async function processOrderConfigurations(orderData: any) {
  const configurations = [];

  console.log('📚 Fetching book configurations...');

  // Process each line item
  for (const item of orderData.line_items || []) {
    // Check if this item has a prikazko wizard config
    const configId = item.meta_data?.find(
      (m) => m.key === '_prikazko_wizard_config_id'
    )?.value;

    if (!configId) {
      continue;
    }

    try {
      console.log(`🔍 Fetching configuration ${configId} for order ${orderData.id}`);

      // Fetch configuration from WooCommerce API
      const configData = await fetchOrderConfiguration(orderData.id);

      if (!configData) {
        console.warn(`⚠️ No configuration found for order ${orderData.id}`);
        continue;
      }

      // Find the matching configuration by ID
      const matchingConfig = configData.configurations?.find(
        (c) => c.id === parseInt(configId, 10)
      );

      if (!matchingConfig) {
        console.warn(`⚠️ Configuration ${configId} not found in API response`);
        continue;
      }

      configurations.push({
        line_item_id: item.id,
        prikazko_wizard_config_id: configId,
        configuration_data: matchingConfig,
        book_title: matchingConfig.content?.title,
        main_character_name: matchingConfig.name,
        character_count: 1,
        scene_count: matchingConfig.content?.scenes?.length || 0,
      });

      console.log(`✅ Configuration ${configId} fetched successfully`);
    } catch (error) {
      console.error(`❌ Failed to process configuration ${configId}:`, error);
    }
  }

  if (configurations.length > 0) {
    console.log(`✅ Found ${configurations.length} book configuration(s)`);
  } else {
    console.log('ℹ️ No book configurations found for this order');
  }

  return configurations;
}

/**
 * Main function
 */
async function fetchAndSaveOrder(wooOrderId: number) {
  console.log('🚀 Starting order fetch from WooCommerce...\n');

  try {
    // Fetch order from WooCommerce
    const orderData = await fetchOrderFromWooCommerce(wooOrderId);
    console.log(`✅ Order ${wooOrderId} fetched from WooCommerce`);
    console.log(`   Order Number: ${orderData.number}`);
    console.log(`   Status: ${orderData.status}`);
    console.log(`   Total: ${orderData.total} ${orderData.currency}`);
    console.log(`   Customer: ${orderData.billing?.first_name} ${orderData.billing?.last_name}`);

    // Fetch book configurations
    const configurations = await processOrderConfigurations(orderData);

    // Save to database
    console.log('\n💾 Saving order to database...');
    const result = await createOrderFromWebhook(orderData, configurations);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Order saved successfully!');
    console.log(`   Database Order ID: ${result.orderId}`);
    console.log(`   WooCommerce Order ID: ${wooOrderId}`);
    console.log(`   Configurations saved: ${configurations.length}`);
    console.log('='.repeat(60));

    return result.orderId;

  } catch (error) {
    console.error('\n❌ Error fetching order:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Get order ID from command line
const wooOrderId = process.argv[2];

if (!wooOrderId) {
  console.error('❌ Error: Please provide a WooCommerce order ID');
  console.log('\nUsage:');
  console.log('  node scripts/fetch-order.js <woocommerce-order-id>');
  console.log('\nExample:');
  console.log('  node scripts/fetch-order.js 1578');
  process.exit(1);
}

// Validate order ID is a number
const orderIdNum = parseInt(wooOrderId, 10);
if (isNaN(orderIdNum)) {
  console.error('❌ Error: Order ID must be a number');
  process.exit(1);
}

// Run the fetch
fetchAndSaveOrder(orderIdNum);

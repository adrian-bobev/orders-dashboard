import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { createOrderFromWebhook } from '@/lib/services/order-service';

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
      method: 'GET',
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
 * Fetch order configuration from WooCommerce custom API endpoint
 */
async function fetchOrderConfiguration(orderId: number): Promise<any | null> {
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
async function processOrderConfigurations(orderData: any): Promise<any[]> {
  const configurations = [];

  // Process each line item
  for (const item of orderData.line_items || []) {
    // Check if this item has a prikazko wizard config
    const configId = item.meta_data?.find(
      (m: any) => m.key === '_prikazko_wizard_config_id'
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
        (c: any) => c.id === parseInt(configId, 10)
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

  return configurations;
}

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Webhook received');

    // Get the raw body
    const body = await request.text();
    const signature = request.headers.get('x-wc-webhook-signature');

    console.log('🔑 Signature:', signature);
    console.log('📦 Body length:', body.length);

    // Check if this is a test ping from WooCommerce
    const isTestPing = body.startsWith('webhook_id=') && body.length < 50;

    if (isTestPing) {
      console.log('🏓 Test ping detected, accepting without verification');
      return NextResponse.json({
        success: true,
        message: 'Test ping accepted'
      });
    }

    // Verify signature if not a test ping
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;

    if (!secret) {
      console.error('❌ WOOCOMMERCE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    if (signature) {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('base64');

      const signatureBuffer = Buffer.from(signature);
      const hashBuffer = Buffer.from(hash);

      if (signatureBuffer.length !== hashBuffer.length ||
          !crypto.timingSafeEqual(signatureBuffer, hashBuffer)) {
        console.error('❌ Signature verification failed');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }

      console.log('✅ Signature verified');
    }

    // Parse the order data
    const orderData = JSON.parse(body);
    console.log('📋 Order ID:', orderData.id);
    console.log('📋 Order Number:', orderData.number);

    // Fetch book configurations if available
    console.log('📚 Fetching book configurations...');
    const configurations = await processOrderConfigurations(orderData);

    if (configurations.length > 0) {
      console.log(`✅ Found ${configurations.length} book configuration(s)`);
    } else {
      console.log('ℹ️ No book configurations found for this order');
    }

    // Save order to database
    try {
      console.log('💾 Saving order to database...');
      const result = await createOrderFromWebhook(orderData, configurations);

      console.log('✅ Order saved to database:', result.orderId);
      console.log('📋 WooCommerce Order ID:', orderData.id);

      return NextResponse.json({
        success: true,
        message: 'Webhook received and saved to database',
        orderId: result.orderId,
        woocommerceOrderId: orderData.id,
        configurationsFound: configurations.length,
      });
    } catch (dbError) {
      console.error('❌ Failed to save order to database:', dbError);

      // Return error response
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save order to database',
          details: dbError instanceof Error ? dbError.message : 'Unknown error',
          woocommerceOrderId: orderData.id,
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

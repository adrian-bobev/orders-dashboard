import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createOrderFromWebhook, updateOrderStatusByWooCommerceId } from '@/lib/services/order-service';
import { sendOrderNotification } from '@/lib/services/telegram-service';
import { get } from '@/lib/services/http-client';

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
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowSelfSignedCerts = isDevelopment && process.env.ALLOW_SELF_SIGNED_CERTS === 'true';

    if (allowSelfSignedCerts) {
      console.log('⚠️ Using HTTPS with self-signed cert support (development only)');
    }

    const response = await get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      allowSelfSignedCerts,
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

    // Check the webhook topic from headers
    const webhookTopic = request.headers.get('x-wc-webhook-topic');
    console.log('📌 Webhook topic:', webhookTopic);

    // Parse the order data
    const orderData = JSON.parse(body);
    console.log('📋 Order ID:', orderData.id);
    console.log('📋 Order Number:', orderData.number);

    // Handle order.updated webhook
    if (webhookTopic === 'order.updated') {
      console.log('📝 Order update webhook received');

      // If WooCommerce order status is "processing", update our order to READY_FOR_PRINT
      let statusUpdateResult = null;
      if (orderData.status === 'processing') {
        console.log('🔄 Order status is "processing", updating to READY_FOR_PRINT...');
        statusUpdateResult = await updateOrderStatusByWooCommerceId(orderData.id, 'READY_FOR_PRINT');
        if (statusUpdateResult.success) {
          console.log(`✅ Order ${statusUpdateResult.orderId} marked as READY_FOR_PRINT`);
        } else {
          console.error(`❌ Failed to update order status: ${statusUpdateResult.error}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Order update webhook processed',
        orderId: orderData.id,
        statusUpdate: statusUpdateResult,
      });
    }

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

      // Send Telegram notification (non-blocking)
      try {
        await sendOrderNotification({
          orderId: result.orderId,
          orderNumber: orderData.number,
          total: orderData.total,
          currency: orderData.currency || 'EUR',
          customerName: `${orderData.billing?.first_name || ''} ${orderData.billing?.last_name || ''}`.trim(),
          paymentMethod: orderData.payment_method_title || orderData.payment_method,
          woocommerceOrderId: orderData.id,
        });
        console.log('📱 Telegram notification sent');
      } catch (notificationError) {
        console.error('⚠️  Failed to send Telegram notification (non-critical):', notificationError);
        // Don't fail the webhook - notification is non-critical
      }

      // Trigger image sync in background (non-blocking)
      if (configurations.length > 0) {
        try {
          console.log('🖼️  Starting background image sync...');
          const syncProcess = spawn('node', ['scripts/sync-order-images.js', orderData.id.toString()], {
            detached: true,
            stdio: 'ignore',
            cwd: process.cwd(),
          });
          syncProcess.unref();
          console.log('✅ Image sync started in background');
        } catch (syncError) {
          console.error('⚠️  Failed to start image sync (non-critical):', syncError);
          // Don't fail the webhook - image sync is non-critical
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Webhook received and saved to database',
        orderId: result.orderId,
        woocommerceOrderId: orderData.id,
        configurationsFound: configurations.length,
        imageSyncStarted: configurations.length > 0,
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

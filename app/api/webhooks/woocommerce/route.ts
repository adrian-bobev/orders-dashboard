import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createOrderFromWebhook, updateOrderStatusByWooCommerceId } from '@/lib/services/order-service';
import { sendOrderNotification } from '@/lib/services/telegram-service';
import { queueJob } from '@/lib/queue/client';
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
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowSelfSignedCerts = isDevelopment && process.env.ALLOW_SELF_SIGNED_CERTS === 'true';

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
      throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
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

  for (const item of orderData.line_items || []) {
    const configId = item.meta_data?.find(
      (m: any) => m.key === '_prikazko_wizard_config_id'
    )?.value;

    if (!configId) {
      continue;
    }

    try {
      console.log(`🔍 Fetching configuration ${configId} for order ${orderData.id}`);
      const configData = await fetchOrderConfiguration(orderData.id);

      if (!configData) {
        console.warn(`⚠️ No configuration found for order ${orderData.id}`);
        continue;
      }

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

    const body = await request.text();
    const signature = request.headers.get('x-wc-webhook-signature');

    // Check if this is a test ping from WooCommerce
    const isTestPing = body.startsWith('webhook_id=') && body.length < 50;

    if (isTestPing) {
      console.log('🏓 Test ping detected, accepting without verification');
      return NextResponse.json({ success: true, message: 'Test ping accepted' });
    }

    // Verify signature
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;

    if (!secret) {
      console.error('❌ WOOCOMMERCE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    if (signature) {
      const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
      const signatureBuffer = Buffer.from(signature);
      const hashBuffer = Buffer.from(hash);

      if (signatureBuffer.length !== hashBuffer.length ||
          !crypto.timingSafeEqual(signatureBuffer, hashBuffer)) {
        console.error('❌ Signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }

      console.log('✅ Signature verified');
    }

    const webhookTopic = request.headers.get('x-wc-webhook-topic');
    console.log('📌 Webhook topic:', webhookTopic);

    const payloadData = JSON.parse(body);

    // Handle order approved action webhook
    if (webhookTopic === 'action.woocommerce_prikazko_order_approved') {
      console.log('✅ Order APPROVED webhook received');
      const orderId = payloadData.arg;
      console.log('📋 WooCommerce Order ID:', orderId);

      // Find the order in our database
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();
      const { data: order, error: findError } = await supabase
        .from('orders')
        .select('id')
        .eq('woocommerce_order_id', orderId)
        .single();

      if (findError || !order) {
        console.error(`❌ Order with WooCommerce ID ${orderId} not found`);
        return NextResponse.json({ success: false, error: `Order not found` }, { status: 404 });
      }

      // Queue print generation job (status will be updated to READY_FOR_PRINT after ZIP upload)
      try {
        console.log('🖨️ Queuing print generation job...');
        const result = await queueJob('PRINT_GENERATION', {
          woocommerceOrderId: orderId,
          orderId: order.id,
        }, { priority: 5 });

        console.log(`✅ Print generation job queued: ${result.jobId}`);

        return NextResponse.json({
          success: true,
          message: 'Order approved and print job queued',
          orderId: order.id,
          jobId: result.jobId,
        });
      } catch (queueError) {
        console.error('❌ Failed to queue print generation job:', queueError);
        return NextResponse.json({
          success: false,
          error: queueError instanceof Error ? queueError.message : 'Unknown error',
        }, { status: 500 });
      }
    }

    // Handle order rejected action webhook
    if (webhookTopic === 'action.woocommerce_prikazko_order_rejected') {
      console.log('❌ Order REJECTED webhook received');
      const orderId = payloadData.arg;
      console.log('📋 WooCommerce Order ID:', orderId);

      const statusUpdateResult = await updateOrderStatusByWooCommerceId(orderId, 'REJECTED');

      if (statusUpdateResult.success) {
        console.log(`✅ Order ${statusUpdateResult.orderId} marked as REJECTED`);
        return NextResponse.json({
          success: true,
          message: 'Order rejected',
          orderId: statusUpdateResult.orderId,
        });
      } else {
        console.error(`❌ Failed to update order status: ${statusUpdateResult.error}`);
        return NextResponse.json({ success: false, error: statusUpdateResult.error }, { status: 500 });
      }
    }

    // Handle order.created webhook
    if (webhookTopic !== 'order.created') {
      console.log(`ℹ️ Ignoring webhook topic: ${webhookTopic}`);
      return NextResponse.json({ success: true, message: `Webhook topic ${webhookTopic} ignored` });
    }

    const orderData = payloadData;
    console.log('📋 Order ID:', orderData.id);
    console.log('📋 Order Number:', orderData.number);

    // Fetch book configurations
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
        console.error('⚠️ Failed to send Telegram notification (non-critical):', notificationError);
      }

      // Trigger image sync in background (non-blocking)
      if (configurations.length > 0) {
        try {
          console.log('🖼️ Starting background image sync...');
          const syncProcess = spawn('node', ['scripts/sync-order-images.js', orderData.id.toString()], {
            detached: true,
            stdio: 'ignore',
            cwd: process.cwd(),
          });
          syncProcess.unref();
          console.log('✅ Image sync started in background');
        } catch (syncError) {
          console.error('⚠️ Failed to start image sync (non-critical):', syncError);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Order created and saved to database',
        orderId: result.orderId,
        woocommerceOrderId: orderData.id,
        configurationsFound: configurations.length,
        imageSyncStarted: configurations.length > 0,
      });
    } catch (dbError) {
      console.error('❌ Failed to save order to database:', dbError);
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

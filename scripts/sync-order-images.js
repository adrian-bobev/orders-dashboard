#!/usr/bin/env node

/**
 * Sync specific images from R2 child-images bucket to MinIO
 * Fetches order data from database and downloads images for that order
 *
 * Usage:
 *   node scripts/sync-order-images.js <order-id>
 *   node scripts/sync-order-images.js [path-to-webhook-json] (legacy support)
 *
 * The order ID can be either:
 *   - WooCommerce order ID (e.g., 1578)
 *   - Internal UUID (e.g., abc123-def456-ghi789)
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

// R2 (Production) Configuration
const R2_CONFIG = {
  endpoint: 'https://8ef5a0782101b3cba1df4d7595e11df5.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '8bb8d3cad70b5409360586a06ce00fcb',
    secretAccessKey: 'e2657b4d0e5464f4ec24791660677cd74cb3c6b9972f3c948f6fcf815715e68e',
  },
  region: 'auto',
};

// MinIO (Local) Configuration
const MINIO_CONFIG = {
  endpoint: 'http://localhost:9000',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin123',
  },
  region: 'auto',
  forcePathStyle: true,
};

const BUCKET_NAME = 'child-images';

// Create S3 clients
const r2Client = new S3Client(R2_CONFIG);
const minioClient = new S3Client(MINIO_CONFIG);

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadFromR2(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);
  const body = await streamToBuffer(response.Body);

  return {
    body,
    contentType: response.ContentType,
    metadata: response.Metadata,
  };
}

async function uploadToMinio(key, data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: data.body,
    ContentType: data.contentType,
    Metadata: data.metadata,
  });

  await minioClient.send(command);
}

/**
 * Create Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fetch order data directly from Supabase
 */
async function fetchOrderFromDatabase(orderIdOrWooId) {
  console.log('🔍 Fetching order from database:', orderIdOrWooId);

  const supabase = getSupabaseClient();

  try {
    // Try to fetch by UUID first, then by WooCommerce order ID
    let order;
    let orderError;

    // Check if it looks like a UUID (contains dashes)
    if (orderIdOrWooId.includes('-')) {
      const result = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderIdOrWooId)
        .single();

      order = result.data;
      orderError = result.error;
    } else {
      // Try as WooCommerce order ID (number)
      const wooOrderId = parseInt(orderIdOrWooId, 10);
      if (isNaN(wooOrderId)) {
        throw new Error('Invalid order ID format');
      }

      const result = await supabase
        .from('orders')
        .select('*')
        .eq('woocommerce_order_id', wooOrderId)
        .single();

      order = result.data;
      orderError = result.error;
    }

    if (orderError) {
      if (orderError.code === 'PGRST116') {
        throw new Error('Order not found');
      }
      throw new Error(`Failed to fetch order: ${orderError.message}`);
    }

    if (!order) {
      throw new Error('Order not found');
    }

    const orderId = order.id;

    // Get line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('order_id', orderId);

    if (lineItemsError) {
      throw new Error(`Failed to fetch line items: ${lineItemsError.message}`);
    }

    // Get book configurations
    if (lineItems && lineItems.length > 0) {
      const lineItemIds = lineItems.map((li) => li.id);
      const { data: bookConfigs, error: bookConfigsError } = await supabase
        .from('book_configurations')
        .select('*')
        .in('line_item_id', lineItemIds);

      if (bookConfigsError) {
        throw new Error(`Failed to fetch book configurations: ${bookConfigsError.message}`);
      }

      // Attach book configs to their respective line items
      lineItems.forEach((lineItem) => {
        lineItem.book_configurations = bookConfigs?.filter(
          (config) => config.line_item_id === lineItem.id
        ) || [];
      });
    }

    return {
      ...order,
      line_items: lineItems || [],
    };
  } catch (error) {
    throw new Error(`Failed to fetch order from database: ${error.message}`);
  }
}

/**
 * Extract image keys from order data (both webhook format and API format)
 */
function extractImageKeysFromOrder(orderData) {
  const imageKeys = new Set();

  // Handle webhook format (bookConfigurations array)
  if (orderData.bookConfigurations && Array.isArray(orderData.bookConfigurations)) {
    for (const config of orderData.bookConfigurations) {
      if (config.configuration_data?.images && Array.isArray(config.configuration_data.images)) {
        for (const image of config.configuration_data.images) {
          if (image.r2_key) {
            imageKeys.add(image.r2_key);
          }
        }
      }
    }
  }

  // Handle API format (line_items with book_configurations)
  if (orderData.line_items && Array.isArray(orderData.line_items)) {
    for (const lineItem of orderData.line_items) {
      if (lineItem.book_configurations && Array.isArray(lineItem.book_configurations)) {
        for (const config of lineItem.book_configurations) {
          if (config.images && Array.isArray(config.images)) {
            for (const image of config.images) {
              if (image.r2_key) {
                imageKeys.add(image.r2_key);
              }
            }
          }
        }
      }
    }
  }

  return Array.from(imageKeys);
}

async function syncOrderImages(input) {
  console.log('🚀 Starting selective image sync from R2 to MinIO...\n');

  try {
    let orderData;
    let orderId;
    let isFromFile = false;

    // Check if input is a file path (legacy support) or an order ID
    if (input && existsSync(input)) {
      // Legacy: Read from webhook JSON file
      console.log('📄 Reading webhook file:', input);
      const webhookContent = readFileSync(input, 'utf-8');
      orderData = JSON.parse(webhookContent);
      orderId = orderData.orderData?.id || orderData.id || 'unknown';
      isFromFile = true;
    } else {
      // New: Fetch from database
      if (!input) {
        throw new Error('Please provide an order ID or webhook file path');
      }
      orderId = input;
      orderData = await fetchOrderFromDatabase(orderId);
    }

    // Extract image keys
    const imageKeys = extractImageKeysFromOrder(orderData);

    if (imageKeys.length === 0) {
      console.log('⚠️  No images found in order data');
      return;
    }

    console.log(`✅ Found ${imageKeys.length} images to sync:\n`);
    imageKeys.forEach((key, index) => {
      console.log(`   ${index + 1}. ${key}`);
    });

    console.log('\n📥 Downloading and uploading images...\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < imageKeys.length; i++) {
      const key = imageKeys[i];
      const progress = `[${i + 1}/${imageKeys.length}]`;

      try {
        process.stdout.write(`${progress} ${key}... `);

        // Download from R2
        const data = await downloadFromR2(key);

        // Upload to MinIO
        await uploadToMinio(key, data);

        console.log('✅');
        successCount++;
      } catch (error) {
        console.log(`❌ ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Source: ${isFromFile ? 'Local file' : 'Database'}`);
    console.log(`   Total images: ${imageKeys.length}`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log('='.repeat(60));

    if (successCount > 0) {
      console.log('\n🎉 Images synced successfully!');
      console.log('   You can now view them in MinIO Console: http://localhost:9001');
      console.log('   Or use them in your application');
    }

  } catch (error) {
    console.error('\n❌ Error during sync:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Get order ID or file path from command line
const input = process.argv[2];

if (!input) {
  console.error('❌ Error: Please provide an order ID or webhook file path');
  console.log('\nUsage:');
  console.log('  node scripts/sync-order-images.js <order-id>');
  console.log('  node scripts/sync-order-images.js <path-to-webhook-json>');
  console.log('\nExamples:');
  console.log('  node scripts/sync-order-images.js abc123-def456-ghi789');
  console.log('  node scripts/sync-order-images.js webhook-order-1576.json');
  process.exit(1);
}

// Run the sync
syncOrderImages(input);

#!/usr/bin/env node

/**
 * Sync specific images from R2 child-images bucket to MinIO
 * Only downloads images referenced in a specific webhook order JSON file
 *
 * Usage:
 *   node scripts/sync-order-images.js [path-to-webhook-json]
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

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

function extractImageKeysFromWebhook(webhookData) {
  const imageKeys = new Set();

  if (webhookData.bookConfigurations && Array.isArray(webhookData.bookConfigurations)) {
    for (const config of webhookData.bookConfigurations) {
      if (config.configuration_data?.images && Array.isArray(config.configuration_data.images)) {
        for (const image of config.configuration_data.images) {
          if (image.r2_key) {
            imageKeys.add(image.r2_key);
          }
        }
      }
    }
  }

  return Array.from(imageKeys);
}

async function syncOrderImages(webhookPath) {
  console.log('🚀 Starting selective image sync from R2 to MinIO...\n');

  try {
    // Read and parse webhook JSON
    console.log('📄 Reading webhook file:', webhookPath);
    const webhookContent = readFileSync(webhookPath, 'utf-8');
    const webhookData = JSON.parse(webhookContent);

    // Extract image keys
    const imageKeys = extractImageKeysFromWebhook(webhookData);

    if (imageKeys.length === 0) {
      console.log('⚠️  No images found in webhook data');
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
    console.log(`   Order ID: ${webhookData.orderData?.id || 'unknown'}`);
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

// Get webhook path from command line or use default
const webhookPath = process.argv[2] || 'webhook-order-1576-2026-01-15T20-50-52-696Z.json';

// Run the sync
syncOrderImages(webhookPath);

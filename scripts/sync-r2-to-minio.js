#!/usr/bin/env node

/**
 * Sync images from R2 (production) to MinIO (local development)
 *
 * This script downloads all images from your R2 bucket and uploads them
 * to your local MinIO instance so you can preview real images in development.
 *
 * Usage:
 *   node scripts/sync-r2-to-minio.js
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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

const BUCKET_NAME = 'images';

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

async function listAllObjects() {
  console.log('📋 Listing all objects in R2 bucket...');

  const objects = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    });

    const response = await r2Client.send(command);

    if (response.Contents) {
      objects.push(...response.Contents);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ Found ${objects.length} objects in R2`);
  return objects;
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

async function syncImages() {
  console.log('🚀 Starting R2 to MinIO sync...\n');

  try {
    // List all objects in R2
    const objects = await listAllObjects();

    if (objects.length === 0) {
      console.log('⚠️  No objects found in R2 bucket');
      return;
    }

    console.log('\n📥 Downloading and uploading images...\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const key = obj.Key;
      const progress = `[${i + 1}/${objects.length}]`;

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
    console.log(`   Total objects: ${objects.length}`);
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

// Run the sync
syncImages();

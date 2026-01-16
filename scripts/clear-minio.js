#!/usr/bin/env node

/**
 * Clear all objects from MinIO bucket
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

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

const minioClient = new S3Client(MINIO_CONFIG);

async function clearBucket() {
  console.log('🗑️  Clearing MinIO bucket:', BUCKET_NAME);

  try {
    let continuationToken = undefined;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      });

      const listResponse = await minioClient.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key })),
          },
        });

        await minioClient.send(deleteCommand);
        totalDeleted += listResponse.Contents.length;
        console.log(`   Deleted ${listResponse.Contents.length} objects...`);
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    console.log(`✅ Successfully deleted ${totalDeleted} objects from MinIO`);
  } catch (error) {
    console.error('❌ Error clearing bucket:', error.message);
    process.exit(1);
  }
}

clearBucket();

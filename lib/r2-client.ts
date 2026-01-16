import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Creates and returns an S3-compatible client (R2 in production, MinIO in local dev)
 * Uses environment variables directly - no smart detection
 */
export function getStorageClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Storage env vars not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for MinIO
  });
}

/**
 * Fetches an image from storage (R2 or MinIO)
 */
export async function fetchImageFromStorage(
  imageKey: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getStorageClient();
  const bucket = process.env.R2_BUCKET;

  if (!bucket) {
    throw new Error('R2_BUCKET environment variable not configured');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: imageKey,
    });

    interface ObjectResponse {
      Body?: {
        transformToByteArray?: () => Promise<Uint8Array>;
      };
      ContentType?: string;
    }

    const response = (await client.send(command)) as ObjectResponse;

    if (!response.Body?.transformToByteArray) {
      return null;
    }

    const body = await response.Body.transformToByteArray();

    return {
      body,
      contentType: response.ContentType,
    };
  } catch (error) {
    console.error('Error fetching image from storage:', error);
    return null;
  }
}

/**
 * Generates a URL for accessing an image via API proxy
 */
export function getImageUrl(imageKey: string | undefined): string | undefined {
  if (!imageKey) return undefined;
  return `/api/images?key=${encodeURIComponent(imageKey)}`;
}

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
 *
 * Bucket logic:
 * - Generation images (format: {orderNumber}-{configNumber}-{generationId}/...) → generations bucket
 * - Original order images (everything else) → child-images bucket
 */
export async function fetchImageFromStorage(
  imageKey: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getStorageClient();

  // Generation images follow pattern: {number}-{number}-{uuid}/...
  const isGenerationImage = /^\d+-\d+-[a-f0-9-]+\//.test(imageKey);

  const bucket = isGenerationImage
    ? (process.env.R2_GENERATIONS_BUCKET || 'generations')
    : process.env.R2_BUCKET;

  if (!bucket) {
    throw new Error('Bucket environment variable not configured');
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

/**
 * Uploads a print-ready ZIP file to R2 storage
 * Storage: 'prints' bucket, filename is {woocommerceOrderId}.zip
 *
 * @returns Object with r2Key and fileSize
 */
export async function uploadPrintFile(
  woocommerceOrderId: number,
  zipBuffer: Buffer
): Promise<{ r2Key: string; fileSize: number }> {
  const bucket = process.env.R2_PRINTS_BUCKET;

  if (!bucket) {
    throw new Error('R2_PRINTS_BUCKET environment variable not configured');
  }

  const client = getStorageClient();

  const r2Key = `${woocommerceOrderId}.zip`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    Body: zipBuffer,
    ContentType: 'application/zip',
  });

  await client.send(command);

  return {
    r2Key,
    fileSize: zipBuffer.length,
  };
}

/**
 * Generates a presigned URL for downloading a print file from R2
 *
 * @param r2Key - The R2 storage key for the file (e.g., "12345.zip")
 * @param expiresInSeconds - URL expiration time (default: 3600 = 1 hour)
 * @returns Presigned download URL
 */
export async function getSignedPrintDownloadUrl(
  r2Key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const bucket = process.env.R2_PRINTS_BUCKET;

  if (!bucket) {
    throw new Error('R2_PRINTS_BUCKET environment variable not configured');
  }

  const client = getStorageClient();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });

  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return signedUrl;
}

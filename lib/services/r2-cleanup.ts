import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getStorageClient } from '@/lib/r2-client';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('R2Cleanup');

export interface R2CleanupResult {
  success: boolean;
  deletedCount: number;
  error?: string;
}

/**
 * Delete all preview images for an order from R2
 * Deletes entire folder: {orderId}/
 *
 * @param wooOrderId - WooCommerce order ID
 * @returns Cleanup result
 */
export async function cleanupOrderPreviewImages(wooOrderId: number): Promise<R2CleanupResult> {
  try {
    const bucket = process.env.R2_PREVIEWS_BUCKET || 'book-previews';
    const client = getStorageClient();
    const prefix = `${wooOrderId}/`;

    logger.info('Starting R2 preview cleanup', { wooOrderId, bucket, prefix });

    // List all objects with this prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const listResponse = await client.send(listCommand);
    const objects = listResponse.Contents || [];

    if (objects.length === 0) {
      logger.info('No preview images found to delete', { wooOrderId });
      return { success: true, deletedCount: 0 };
    }

    // Delete all objects
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects.map(obj => ({ Key: obj.Key! })),
      },
    });

    const deleteResponse = await client.send(deleteCommand);
    const deletedCount = deleteResponse.Deleted?.length || 0;

    logger.info('R2 preview cleanup completed', {
      wooOrderId,
      deletedCount,
      errors: deleteResponse.Errors?.length || 0
    });

    if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
      const errorMessages = deleteResponse.Errors.map(e => `${e.Key}: ${e.Message}`).join(', ');
      logger.error('Some R2 deletions failed', { wooOrderId, errors: errorMessages });
      return {
        success: false,
        deletedCount,
        error: `Partial failure: ${errorMessages}`,
      };
    }

    return { success: true, deletedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('R2 preview cleanup failed', { wooOrderId, error: errorMessage });
    return {
      success: false,
      deletedCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * Delete preview images for a specific book from R2
 * Used for partial cleanup in case of job failure
 *
 * @param wooOrderId - WooCommerce order ID
 * @param bookConfigId - Book configuration ID
 * @returns Cleanup result
 */
export async function cleanupBookPreviewImages(
  wooOrderId: number,
  bookConfigId: string
): Promise<R2CleanupResult> {
  try {
    const bucket = process.env.R2_PREVIEWS_BUCKET || 'book-previews';
    const client = getStorageClient();
    const prefix = `${wooOrderId}/${bookConfigId}/`;

    logger.info('Starting R2 book preview cleanup', { wooOrderId, bookConfigId, prefix });

    // List all objects with this prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const listResponse = await client.send(listCommand);
    const objects = listResponse.Contents || [];

    if (objects.length === 0) {
      logger.info('No book preview images found to delete', { wooOrderId, bookConfigId });
      return { success: true, deletedCount: 0 };
    }

    // Delete all objects
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects.map(obj => ({ Key: obj.Key! })),
      },
    });

    const deleteResponse = await client.send(deleteCommand);
    const deletedCount = deleteResponse.Deleted?.length || 0;

    logger.info('R2 book preview cleanup completed', {
      wooOrderId,
      bookConfigId,
      deletedCount
    });

    return { success: true, deletedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('R2 book preview cleanup failed', {
      wooOrderId,
      bookConfigId,
      error: errorMessage
    });
    return {
      success: false,
      deletedCount: 0,
      error: errorMessage,
    };
  }
}

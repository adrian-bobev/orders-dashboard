#!/usr/bin/env tsx
/**
 * Cleanup script for downloaded print files
 * Deletes print ZIP files from R2 if they have been downloaded at least once
 * Run this daily via cron
 */

import { config } from 'dotenv'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { deletePrintFile } from '@/lib/r2-client'
import { createLogger } from '@/lib/utils/logger'

// Load environment variables
config({ path: '.env.local' })

const logger = createLogger('PrintCleanup')

async function cleanupDownloadedPrints() {
  try {
    logger.info('Starting cleanup of downloaded print files')

    const supabase = createServiceRoleClient()

    // Find orders that have:
    // 1. A print file in R2 (print_file_r2_key is not null)
    // 2. Been downloaded at least once (download_count >= 1)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_number, print_file_r2_key, download_count, last_downloaded_at')
      .not('print_file_r2_key', 'is', null)
      .gte('download_count', 1)

    if (error) {
      logger.error('Failed to fetch orders for cleanup', { error: error.message })
      throw error
    }

    if (!orders || orders.length === 0) {
      logger.info('No print files to clean up')
      return
    }

    logger.info(`Found ${orders.length} print files to clean up`)

    let successCount = 0
    let failCount = 0

    for (const order of orders) {
      try {
        // Delete from R2
        await deletePrintFile(order.print_file_r2_key!)

        // Clear R2 key from database
        const { error: updateError } = await supabase
          .from('orders')
          .update({ print_file_r2_key: null })
          .eq('id', order.id)

        if (updateError) {
          logger.error('Failed to update order after R2 deletion', {
            orderId: order.id,
            orderNumber: order.order_number,
            error: updateError.message,
          })
          failCount++
          continue
        }

        logger.info('Deleted print file from R2', {
          orderId: order.id,
          orderNumber: order.order_number,
          r2Key: order.print_file_r2_key,
          downloadCount: order.download_count,
          lastDownloadedAt: order.last_downloaded_at,
        })

        successCount++
      } catch (error) {
        logger.error('Failed to delete print file', {
          orderId: order.id,
          orderNumber: order.order_number,
          r2Key: order.print_file_r2_key,
          error: error instanceof Error ? error.message : String(error),
        })
        failCount++
      }
    }

    logger.info('Cleanup complete', {
      total: orders.length,
      success: successCount,
      failed: failCount,
    })

    // Exit with error code if any failures
    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    logger.error('Cleanup script failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Run cleanup
cleanupDownloadedPrints()

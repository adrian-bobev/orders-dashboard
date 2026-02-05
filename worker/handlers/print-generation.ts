import type { TypedJob } from '../../lib/queue/types'
import { logger } from '../utils/logger'

// Import functions dynamically to avoid Next.js-specific imports at top level
async function getGenerateOrderForPrint() {
  const { generateOrderForPrint } = await import('../../lib/services/print-service')
  return generateOrderForPrint
}

async function getUploadPrintFile() {
  const { uploadPrintFile } = await import('../../lib/r2-client')
  return uploadPrintFile
}

async function getSupabaseClient() {
  const { createServiceRoleClient } = await import('../../lib/supabase/server')
  return createServiceRoleClient()
}

/**
 * Handle PRINT_GENERATION jobs
 * Generates print-ready PDFs for all completed books in an order,
 * uploads to R2, and updates the order record
 */
export async function handlePrintGeneration(
  job: TypedJob<'PRINT_GENERATION'>
): Promise<object> {
  const { woocommerceOrderId, orderId, orderNumber } = job.payload

  logger.info('Starting print generation', {
    jobId: job.id,
    woocommerceOrderId,
    orderId,
    orderNumber,
  })

  const generateOrderForPrint = await getGenerateOrderForPrint()

  let result
  try {
    result = await generateOrderForPrint(woocommerceOrderId)
  } catch (error) {
    // Send error notification on complete failure
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Print generation failed', {
      jobId: job.id,
      error: errorMessage,
    })

    try {
      const { sendErrorNotification } = await import(
        '../../lib/services/telegram-service'
      )
      await sendErrorNotification({
        orderId: orderId || 'unknown',
        orderNumber: orderNumber || 'unknown',
        errorMessage: errorMessage,
        context: 'Генериране на книги за печат',
      })
    } catch (notificationError) {
      logger.warn('Failed to send error notification', {
        jobId: job.id,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      })
    }

    throw error
  }

  if (!result.success) {
    // Send error notification on failure
    const errorMessage = result.error || 'Print generation failed'
    try {
      const { sendErrorNotification } = await import(
        '../../lib/services/telegram-service'
      )
      await sendErrorNotification({
        orderId: orderId || 'unknown',
        orderNumber: orderNumber || 'unknown',
        errorMessage: errorMessage,
        context: 'Генериране на книги за печат',
      })
    } catch (notificationError) {
      logger.warn('Failed to send error notification', {
        jobId: job.id,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      })
    }

    throw new Error(errorMessage)
  }

  logger.info('Print generation completed', {
    jobId: job.id,
    booksGenerated: result.books.length,
  })

  // Upload combined ZIP to R2
  let r2Key: string | undefined
  let fileSize: number | undefined

  if (result.combinedZipBuffer) {
    try {
      logger.info('Uploading print ZIP to R2...', { jobId: job.id })
      const uploadPrintFile = await getUploadPrintFile()
      const uploadResult = await uploadPrintFile(woocommerceOrderId, result.combinedZipBuffer)
      r2Key = uploadResult.r2Key
      fileSize = uploadResult.fileSize

      logger.info('Print ZIP uploaded to R2', {
        jobId: job.id,
        r2Key,
        fileSize,
      })

      // Update order record with print file info
      const supabase = await getSupabaseClient()
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          print_file_r2_key: r2Key,
          print_file_size_bytes: fileSize,
          print_generated_at: new Date().toISOString(),
        })
        .eq('id', result.orderId)

      if (updateError) {
        logger.error('Failed to update order with print file info', {
          jobId: job.id,
          error: updateError.message,
        })
      } else {
        logger.info('Order updated with print file info', { jobId: job.id })
      }
    } catch (uploadError) {
      logger.error('Failed to upload print ZIP to R2', {
        jobId: job.id,
        error: uploadError instanceof Error ? uploadError.message : String(uploadError),
      })
      // Don't fail the job - the print was generated successfully
    }
  }

  // Send Telegram notification on success
  try {
    const { sendSentToPrintNotification, sendErrorNotification } = await import(
      '../../lib/services/telegram-service'
    )

    await sendSentToPrintNotification({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      bookCount: result.books.length,
      books: result.books.map((b) => ({
        childName: b.childName,
        storyName: b.storyName,
      })),
    })

    logger.info('Telegram notification sent', { jobId: job.id })

    // If there was a partial failure, also send error notification
    if (result.error) {
      await sendErrorNotification({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        errorMessage: result.error,
        context: 'Генериране на книги за печат (частичен неуспех)',
      })
    }
  } catch (notificationError) {
    logger.warn('Failed to send Telegram notification', {
      jobId: job.id,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }

  return {
    success: true,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    books: result.books,
    r2Key,
    fileSize,
    partialError: result.error,
  }
}

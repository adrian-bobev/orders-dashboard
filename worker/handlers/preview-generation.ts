import type { TypedJob } from '../../lib/queue/types'
import type { JobHandlerOptions } from './index'
import { logger } from '../utils/logger'

// Import the preview service function dynamically
async function getGenerateOrderPreviews() {
  const { generateOrderPreviews } = await import('../../lib/services/pdf-preview-service')
  return generateOrderPreviews
}

async function getSupabaseClient() {
  const { createServiceRoleClient } = await import('../../lib/supabase/server')
  return createServiceRoleClient()
}

/**
 * Handle PREVIEW_GENERATION jobs
 * Generates watermarked preview images for customer review
 * Optionally sends notifications after successful preview generation
 */
export async function handlePreviewGeneration(
  job: TypedJob<'PREVIEW_GENERATION'>,
  options?: JobHandlerOptions
): Promise<object> {
  const {
    orderId,
    wooOrderId,
    orderNumber,
    sendNotifications,
    customerEmail,
    customerName,
    books,
  } = job.payload
  const signal = options?.signal

  // Extract context for structured logging
  const context = { wooOrderId, phase: 'preview-generation' }

  logger.info('Starting preview generation', {
    jobId: job.id,
    orderId,
    wooOrderId,
    orderNumber,
    sendNotifications,
  }, context)

  const generateOrderPreviews = await getGenerateOrderPreviews()

  try {
    await generateOrderPreviews(orderId, { signal })

    logger.info('Preview generation completed', {
      jobId: job.id,
      orderId,
    }, context)

    // Update order status to VALIDATION_PENDING after preview upload completes
    const supabase = await getSupabaseClient()
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'VALIDATION_PENDING' })
      .eq('id', orderId)

    if (updateError) {
      logger.error('Failed to update order status to VALIDATION_PENDING', {
        jobId: job.id,
        orderId,
        error: updateError.message,
      }, context)
      throw new Error(`Failed to update order status: ${updateError.message}`)
    }

    logger.info('Order status updated to VALIDATION_PENDING', {
      jobId: job.id,
      orderId,
    }, context)

    // Send notifications if requested
    if (sendNotifications && customerEmail && books) {
      logger.info('Sending notifications...', { jobId: job.id }, context)

      try {
        const { sendAllBooksReadyNotification } = await import(
          '../../lib/services/telegram-service'
        )
        const { sendBooksReadyEmail } = await import('../../lib/services/email-service')

        // Send Telegram notification
        await sendAllBooksReadyNotification({
          orderId,
          wooOrderId,
          orderNumber: orderNumber || wooOrderId,
          bookCount: books.length,
          books,
        })

        // Send email notification
        await sendBooksReadyEmail({
          orderId,
          wooOrderId,
          orderNumber: orderNumber || wooOrderId,
          customerEmail,
          customerName: customerName || '',
          books,
        })

        logger.info('Notifications sent successfully', { jobId: job.id }, context)
      } catch (notificationError) {
        logger.error('Failed to send notifications', {
          jobId: job.id,
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        }, context)
        // Don't fail the job for notification errors - previews were generated successfully
      }
    }

    return {
      success: true,
      orderId,
      wooOrderId,
      notificationsSent: sendNotifications ?? false,
    }
  } catch (error) {
    // Send error notification
    try {
      const { sendErrorNotification } = await import('../../lib/services/telegram-service')

      await sendErrorNotification({
        orderId,
        orderNumber: orderNumber || wooOrderId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        context: 'Генериране на preview изображения',
      })
    } catch (notificationError) {
      logger.warn('Failed to send error notification', {
        jobId: job.id,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      }, context)
    }

    throw error
  }
}

import type { TypedJob } from '../../lib/queue/types'
import { logger } from '../utils/logger'

// Import the preview service function dynamically
async function getGenerateOrderPreviews() {
  const { generateOrderPreviews } = await import('../../lib/services/pdf-preview-service')
  return generateOrderPreviews
}

/**
 * Handle PREVIEW_GENERATION jobs
 * Generates watermarked preview images for customer review
 * Optionally sends notifications after successful preview generation
 */
export async function handlePreviewGeneration(
  job: TypedJob<'PREVIEW_GENERATION'>
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

  logger.info('Starting preview generation', {
    jobId: job.id,
    orderId,
    wooOrderId,
    orderNumber,
    sendNotifications,
  })

  const generateOrderPreviews = await getGenerateOrderPreviews()

  try {
    await generateOrderPreviews(orderId)

    logger.info('Preview generation completed', {
      jobId: job.id,
      orderId,
    })

    // Send notifications if requested
    if (sendNotifications && customerEmail && books) {
      logger.info('Sending notifications...', { jobId: job.id })

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

        logger.info('Notifications sent successfully', { jobId: job.id })
      } catch (notificationError) {
        logger.error('Failed to send notifications', {
          jobId: job.id,
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        })
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
      })
    }

    throw error
  }
}

import path from 'path'
import type { TypedJob } from '../../lib/queue/types'
import { logger } from '../utils/logger'

// Import the print service function
// Note: We need to use dynamic import because the service uses Next.js-specific imports
async function getGenerateOrderForPrint() {
  const { generateOrderForPrint } = await import('../../lib/services/print-service')
  return generateOrderForPrint
}

/**
 * Handle PRINT_GENERATION jobs
 * Generates print-ready PDFs for all completed books in an order
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
  const outputDir = path.join(process.cwd(), 'webhook-logs')

  const result = await generateOrderForPrint(woocommerceOrderId, outputDir)

  if (!result.success) {
    throw new Error(result.error || 'Print generation failed')
  }

  logger.info('Print generation completed', {
    jobId: job.id,
    booksGenerated: result.books.length,
  })

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
      outputDir: path.join(outputDir, `order-${result.orderNumber}`),
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
    partialError: result.error,
  }
}

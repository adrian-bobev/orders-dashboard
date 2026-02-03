import { createHmac } from 'crypto'

/**
 * Generate HMAC-SHA256 token for order approval
 */
export function generateApprovalToken(orderId: string): string {
  const secretKey = process.env.APPROVAL_SECRET_KEY
  if (!secretKey) {
    throw new Error('APPROVAL_SECRET_KEY environment variable is not set')
  }
  return createHmac('sha256', secretKey)
    .update(orderId)
    .digest('hex')
}

/**
 * Generate the full approval URL for an order
 */
export function generateApprovalUrl(orderId: string): string {
  const wordpressUrl = process.env.WOOCOMMERCE_STORE_URL
  if (!wordpressUrl) {
    throw new Error('WOOCOMMERCE_STORE_URL environment variable is not set')
  }
  const token = generateApprovalToken(orderId)
  return `${wordpressUrl}/order-approval/${orderId}/${token}/`
}

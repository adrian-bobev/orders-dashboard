import { Resend } from 'resend'
import * as nodemailer from 'nodemailer'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { generateApprovalUrl } from '@/lib/services/approval-token'

/**
 * Book info for email
 */
export interface BookInfo {
  childName: string
  storyName: string
}

/**
 * Data for books ready email
 */
export interface BooksReadyEmailData {
  orderId: string
  wooOrderId: string
  orderNumber: string
  customerEmail: string
  customerName: string
  books: BookInfo[]
}

/**
 * Load email template from YAML file
 */
function loadEmailTemplate(templateName: string): Record<string, string> {
  const templatePath = path.join(process.cwd(), 'emails', `${templateName}.yaml`)
  const content = fs.readFileSync(templatePath, 'utf-8')
  return yaml.parse(content)
}

/**
 * Replace placeholders in template
 */
function replacePlaceholders(template: string, data: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

/**
 * Build email content from template and data
 */
function buildEmailContent(data: BooksReadyEmailData): { subject: string; body: string } {
  const template = loadEmailTemplate('books-ready')
  const isSingleBook = data.books.length === 1
  const approvalUrl = generateApprovalUrl(data.wooOrderId)

  // Determine subject and body based on book count
  const subjectTemplate = isSingleBook ? template.subject_single : template.subject_multiple
  const bodyTemplate = isSingleBook ? template.body_single : template.body_multiple

  // Build book list for multiple books
  const booksList = data.books
    .map((book) => `• ${book.childName} – „${book.storyName}"`)
    .join('\n')

  // Build children names list (e.g., "Иван, Мария и Петър")
  const childrenNames = data.books.map((book) => book.childName)
  let childrenNamesFormatted: string
  if (childrenNames.length === 1) {
    childrenNamesFormatted = childrenNames[0]
  } else if (childrenNames.length === 2) {
    childrenNamesFormatted = `${childrenNames[0]} и ${childrenNames[1]}`
  } else {
    const lastChild = childrenNames.pop()
    childrenNamesFormatted = `${childrenNames.join(', ')} и ${lastChild}`
  }

  // Prepare placeholder data
  const placeholderData: Record<string, string> = {
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    childName: data.books[0]?.childName || '',
    storyName: data.books[0]?.storyName || '',
    booksList,
    childrenNames: childrenNamesFormatted,
    approvalUrl,
  }

  return {
    subject: replacePlaceholders(subjectTemplate, placeholderData),
    body: replacePlaceholders(bodyTemplate, placeholderData),
  }
}

/**
 * Send email via SMTP (for local development with Mailpit)
 */
async function sendViaSMTP(
  to: string,
  from: string,
  subject: string,
  body: string
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST || 'localhost'
  const smtpPort = parseInt(process.env.SMTP_PORT || '54325', 10)

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false, // Mailpit doesn't use TLS
  })

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  })
}

/**
 * Send email via Resend (for production)
 */
async function sendViaResend(
  to: string,
  from: string,
  subject: string,
  body: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    text: body,
  })

  if (error) {
    throw new Error(`Resend API error: ${JSON.stringify(error)}`)
  }
}

/**
 * Send email when all books in an order are ready for review
 * Non-blocking - logs errors but never throws
 *
 * Uses SMTP (Mailpit) for local development, Resend for production
 */
export async function sendBooksReadyEmail(data: BooksReadyEmailData): Promise<void> {
  const useSmtp = process.env.USE_SMTP_EMAIL === 'true'
  const resendApiKey = process.env.RESEND_API_KEY

  // Silent skip if no email provider configured
  if (!useSmtp && !resendApiKey) {
    console.warn('⚠️  No email provider configured (set USE_SMTP_EMAIL=true for Mailpit or RESEND_API_KEY for production)')
    return
  }

  try {
    const { subject, body } = buildEmailContent(data)
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Приказко БГ <noreply@prikazko.bg>'

    // For development/testing, override the recipient
    const recipientEmail = process.env.NODE_ENV === 'production' && process.env.ENABLE_CUSTOMER_EMAILS === 'true'
      ? data.customerEmail
      : 'test@example.com' // Will be visible in Mailpit

    console.log('📧 Sending "Books Ready" email notification...')
    console.log('   Order:', data.orderNumber)
    console.log('   Book count:', data.books.length)
    console.log('   Recipient:', recipientEmail)
    console.log('   (Original customer email:', data.customerEmail, ')')
    console.log('   Provider:', useSmtp ? 'SMTP (Mailpit)' : 'Resend')

    if (useSmtp) {
      await sendViaSMTP(recipientEmail, fromEmail, subject, body)
    } else {
      await sendViaResend(recipientEmail, fromEmail, subject, body)
    }

    console.log('✅ "Books Ready" email sent successfully')
  } catch (error) {
    console.error('❌ Failed to send "Books Ready" email:', error)
    // Don't throw - this is a non-critical operation
  }
}

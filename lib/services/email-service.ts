import { Resend } from 'resend'
import * as nodemailer from 'nodemailer'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'

/**
 * Book info for email
 */
export interface BookInfo {
  childName: string
  storyName: string
}

/**
 * Preview PDF attachment
 */
export interface PreviewPdfAttachment {
  childName: string
  storyName: string
  pdfBuffer: Buffer
}

/**
 * Data for books ready email
 */
export interface BooksReadyEmailData {
  orderId: string
  orderNumber: string
  customerEmail: string
  customerName: string
  books: BookInfo[]
  previews?: PreviewPdfAttachment[]
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

  // Determine subject and body based on book count
  const subjectTemplate = isSingleBook ? template.subject_single : template.subject_multiple
  const bodyTemplate = isSingleBook ? template.body_single : template.body_multiple

  // Build book list for multiple books
  const booksList = data.books
    .map((book) => `• ${book.childName} – „${book.storyName}"`)
    .join('\n')

  // Prepare placeholder data
  const placeholderData: Record<string, string> = {
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    childName: data.books[0]?.childName || '',
    storyName: data.books[0]?.storyName || '',
    booksList,
  }

  return {
    subject: replacePlaceholders(subjectTemplate, placeholderData),
    body: replacePlaceholders(bodyTemplate, placeholderData),
  }
}

/**
 * Helper to create URL-safe filenames
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєґ\s-]/gi, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

/**
 * Send email via SMTP (for local development with Mailpit)
 */
async function sendViaSMTP(
  to: string,
  from: string,
  subject: string,
  body: string,
  attachments?: Array<{ filename: string; content: Buffer }>
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
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: 'application/pdf',
    })),
  })
}

/**
 * Send email via Resend (for production)
 */
async function sendViaResend(
  to: string,
  from: string,
  subject: string,
  body: string,
  attachments?: Array<{ filename: string; content: Buffer }>
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
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
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
 * Optionally attaches preview PDFs
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

    // Build attachments from previews
    const attachments = data.previews?.map((preview) => ({
      filename: `${data.orderNumber}-${slugify(preview.childName)}-preview.pdf`,
      content: preview.pdfBuffer,
    }))

    console.log('📧 Sending "Books Ready" email notification...')
    console.log('   Order:', data.orderNumber)
    console.log('   Book count:', data.books.length)
    console.log('   Recipient:', recipientEmail)
    console.log('   (Original customer email:', data.customerEmail, ')')
    console.log('   Provider:', useSmtp ? 'SMTP (Mailpit)' : 'Resend')
    console.log('   Attachments:', attachments?.length || 0)

    if (useSmtp) {
      await sendViaSMTP(recipientEmail, fromEmail, subject, body, attachments)
    } else {
      await sendViaResend(recipientEmail, fromEmail, subject, body, attachments)
    }

    console.log('✅ "Books Ready" email sent successfully')
  } catch (error) {
    console.error('❌ Failed to send "Books Ready" email:', error)
    // Don't throw - this is a non-critical operation
  }
}

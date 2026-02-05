import { Resend } from 'resend'
import * as nodemailer from 'nodemailer'
import { render } from '@react-email/components'
import { generateApprovalUrl } from './approval-token'
import BooksReadyEmail from '../../emails/templates/books-ready-email'

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
 * Build email content using React Email template
 */
async function buildEmailContent(data: BooksReadyEmailData): Promise<{ subject: string; html: string; text: string }> {
  const isSingleBook = data.books.length === 1
  const approvalUrl = generateApprovalUrl(data.wooOrderId)

  // Build children names list (e.g., "Иван, Мария и Петър")
  const childrenNames = data.books.map((book) => book.childName)
  let childrenNamesFormatted: string
  if (childrenNames.length === 1) {
    childrenNamesFormatted = childrenNames[0]
  } else if (childrenNames.length === 2) {
    childrenNamesFormatted = `${childrenNames[0]} и ${childrenNames[1]}`
  } else {
    const allButLast = childrenNames.slice(0, -1)
    const lastChild = childrenNames[childrenNames.length - 1]
    childrenNamesFormatted = `${allButLast.join(', ')} и ${lastChild}`
  }

  // Generate subject
  const subject = isSingleBook
    ? `[${data.orderNumber}] 📚 ${data.books[0].childName} е главният герой! Вижте персоналната книжка преди печат`
    : `[${data.orderNumber}] 📚 Книжките за ${childrenNamesFormatted} са готови за преглед!`

  // Render React Email template
  const html = await render(
    BooksReadyEmail({
      customerName: data.customerName,
      childName: data.books[0]?.childName,
      childrenNames: childrenNamesFormatted,
      storyName: data.books[0]?.storyName,
      booksList: data.books,
      approvalUrl,
      isSingleBook,
    })
  )

  // Generate plain text version
  const text = generatePlainText(data, childrenNamesFormatted, approvalUrl, isSingleBook)

  return { subject, html, text }
}

/**
 * Generate plain text fallback
 */
function generatePlainText(
  data: BooksReadyEmailData,
  childrenNamesFormatted: string,
  approvalUrl: string,
  isSingleBook: boolean
): string {
  if (isSingleBook) {
    return `Здравейте, ${data.customerName}!

Имаме вълнуващи новини – персонализираната книжка за ${data.books[0].childName} е готова!

「${data.books[0].storyName}」

Вложихме много любов и внимание, за да създадем тази уникална история, в която ${data.books[0].childName} е истинският герой. Сега е моментът да я видите!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

КАКВО ДА НАПРАВИТЕ СЕГА:

1. Отворете линка по-долу
2. Разгледайте всяка страница от книжката на ${data.books[0].childName}
3. Натиснете „Одобри и изпрати за печат" или „Откажи"

ПРЕГЛЕД НА КНИЖКАТА: ${approvalUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Моля, прегледайте книжката в рамките на 48 часа, за да можем да я изпратим за печат възможно най-скоро.

Ако имате въпроси, просто отговорете на този имейл – винаги сме насреща.

С топли пожелания,
Екипът на Приказко БГ`
  }

  const booksList = data.books
    .map((book) => `• ${book.childName} – „${book.storyName}"`)
    .join('\n')

  return `Здравейте, ${data.customerName}!

Имаме страхотни новини – персонализираните книжки за ${childrenNamesFormatted} са готови!

КНИЖКИ ЗА ВАШИТЕ МАЛЧУГАНИ:
${booksList}

Всяка история е създадена с много внимание и любов, за да превърне ${childrenNamesFormatted} в истински герои. Сега е моментът да ги видите!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

КАКВО ДА НАПРАВИТЕ СЕГА:

1. Отворете линка по-долу
2. Разгледайте внимателно всяка книжка, страница по страница
3. Натиснете „Одобри и изпрати за печат" или „Откажи"

ПРЕГЛЕД НА КНИЖКИТЕ: ${approvalUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Моля, прегледайте книжките в рамките на 48 часа, за да можем да ги изпратим за печат възможно най-скоро.

Ако имате въпроси, просто отговорете на този имейл – винаги сме насреща.

С топли пожелания,
Екипът на Приказко БГ`
}

/**
 * Send email via SMTP (for local development with Mailpit)
 */
async function sendViaSMTP(
  to: string,
  from: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST || 'localhost'
  const smtpPort = parseInt(process.env.SMTP_PORT || '54325', 10)

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
  })

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
  })
}

/**
 * Send email via Resend (for production)
 */
async function sendViaResend(
  to: string,
  from: string,
  subject: string,
  html: string,
  text: string
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
    html,
    text,
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
    const { subject, html, text } = await buildEmailContent(data)
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Приказко БГ <noreply@prikazko.bg>'

    // Determine recipient email:
    // 1. TEST_EMAIL_RECIPIENT - for testing with real email providers (Resend)
    // 2. ENABLE_CUSTOMER_EMAILS=true - actual customer email
    // 3. Otherwise - test@example.com (for local SMTP/Mailpit only)
    let recipientEmail: string
    if (process.env.TEST_EMAIL_RECIPIENT) {
      recipientEmail = process.env.TEST_EMAIL_RECIPIENT
    } else if (process.env.ENABLE_CUSTOMER_EMAILS === 'true') {
      recipientEmail = data.customerEmail
    } else {
      recipientEmail = 'test@example.com'
    }

    console.log('📧 Sending "Books Ready" email notification...')
    console.log('   Order:', data.orderNumber)
    console.log('   Book count:', data.books.length)
    console.log('   Recipient:', recipientEmail)
    if (process.env.TEST_EMAIL_RECIPIENT) {
      console.log('   (Using TEST_EMAIL_RECIPIENT override)')
    }
    console.log('   (Original customer email:', data.customerEmail, ')')
    console.log('   Provider:', useSmtp ? 'SMTP (Mailpit)' : 'Resend')

    if (useSmtp) {
      await sendViaSMTP(recipientEmail, fromEmail, subject, html, text)
    } else {
      await sendViaResend(recipientEmail, fromEmail, subject, html, text)
    }

    console.log('✅ "Books Ready" email sent successfully')
  } catch (error) {
    console.error('❌ Failed to send "Books Ready" email:', error)
    // Don't throw - this is a non-critical operation
  }
}

import { postJson } from '@/lib/services/http-client'
import { generateApprovalUrl } from '@/lib/services/approval-token'

/**
 * Order notification data structure
 */
export interface OrderNotificationData {
  orderId: string;
  orderNumber: string;
  total: string;
  currency: string;
  customerName: string;
  paymentMethod: string;
  woocommerceOrderId: number;
}

/**
 * Book info for notifications
 */
export interface BookInfo {
  childName: string;
  storyName: string;
}

/**
 * All books ready notification data structure
 */
export interface AllBooksReadyNotificationData {
  orderId: string;
  wooOrderId: string;
  orderNumber: string;
  bookCount: number;
  books: BookInfo[];
}

/**
 * Sent to print notification data structure
 */
export interface SentToPrintNotificationData {
  orderId: string;
  orderNumber: string;
  bookCount: number;
  books: BookInfo[];
  outputDir: string;
}

/**
 * Error notification data structure
 */
export interface ErrorNotificationData {
  orderId: string;
  orderNumber: string;
  errorMessage: string;
  context?: string;
}

/**
 * Format message for Telegram notification
 */
function formatOrderMessage(data: OrderNotificationData): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const orderUrl = `${dashboardUrl}/dashboard/orders/${data.orderId}`;

  return `🎉 <b>Нова Поръчка!</b> (New Order!)

<b>Поръчка №:</b> ${data.orderNumber}
<b>Клиент:</b> ${data.customerName}
<b>Сума:</b> ${data.total} ${data.currency}
<b>Плащане:</b> ${data.paymentMethod}

<a href="${orderUrl}">🔗 Преглед в Dashboard</a>`;
}

/**
 * Format message for all books ready notification
 */
function formatAllBooksReadyMessage(data: AllBooksReadyNotificationData): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const orderUrl = `${dashboardUrl}/orders/${data.orderId}`;
  const approvalUrl = generateApprovalUrl(data.wooOrderId);

  const bookList = data.books.map((book, i) => `  ${i + 1}. ${book.childName} – „${book.storyName}"`).join('\n');

  return `✅ <b>Всички книги готови!</b>

<b>Поръчка №:</b> ${data.orderNumber}
<b>Брой книги:</b> ${data.bookCount}

<b>Книги:</b>
${bookList}

<a href="${orderUrl}">🔗 Преглед на поръчката</a>
<a href="${approvalUrl}">✓ Линк за одобрение от клиента</a>`;
}

/**
 * Format message for sent to print notification
 */
function formatSentToPrintMessage(data: SentToPrintNotificationData): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const orderUrl = `${dashboardUrl}/orders/${data.orderId}`;

  const bookList = data.books.map((book, i) => `  ${i + 1}. ${book.childName} – „${book.storyName}"`).join('\n');

  return `🖨️ <b>Изпратено за печат!</b>

<b>Поръчка №:</b> ${data.orderNumber}
<b>Брой книги:</b> ${data.bookCount}

<b>Книги:</b>
${bookList}

<b>Файлове:</b> ${data.outputDir}

<a href="${orderUrl}">🔗 Преглед на поръчката</a>`;
}

/**
 * Format message for error notification
 */
function formatErrorMessage(data: ErrorNotificationData): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const orderUrl = `${dashboardUrl}/orders/${data.orderId}`;

  return `❌ <b>Грешка при обработка!</b>

<b>Поръчка №:</b> ${data.orderNumber}
${data.context ? `<b>Контекст:</b> ${data.context}\n` : ''}
<b>Грешка:</b> ${data.errorMessage}

<a href="${orderUrl}">🔗 Преглед на поръчката</a>`;
}

/**
 * Send order notification to Telegram
 * Non-blocking - logs errors but never throws
 */
export async function sendOrderNotification(
  data: OrderNotificationData
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Silent skip if credentials not configured
  if (!botToken || !chatId) {
    console.warn('⚠️  Telegram credentials not configured, skipping notification');
    return;
  }

  try {
    const message = formatOrderMessage(data);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    console.log('📱 Sending Telegram notification...');
    console.log('   Order ID:', data.orderId);
    console.log('   Dashboard URL:', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    console.log('   Message preview:', message.substring(0, 100) + '...');

    const response = await postJson(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });

    if (response.status !== 200 || !response.data?.ok) {
      console.error('❌ Telegram API returned error:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return;
    }

    console.log('✅ Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Send notification when all books in an order are ready
 * Non-blocking - logs errors but never throws
 */
export async function sendAllBooksReadyNotification(
  data: AllBooksReadyNotificationData
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Silent skip if credentials not configured
  if (!botToken || !chatId) {
    console.warn('⚠️  Telegram credentials not configured, skipping notification');
    return;
  }

  try {
    const message = formatAllBooksReadyMessage(data);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    console.log('📱 Sending "All Books Ready" Telegram notification...');
    console.log('   Order:', data.orderNumber);
    console.log('   Book count:', data.bookCount);

    const response = await postJson(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });

    if (response.status !== 200 || !response.data?.ok) {
      console.error('❌ Telegram API returned error:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return;
    }

    console.log('✅ "All Books Ready" Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send "All Books Ready" notification:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Send notification when order is sent to print
 * Non-blocking - logs errors but never throws
 */
export async function sendSentToPrintNotification(
  data: SentToPrintNotificationData
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Silent skip if credentials not configured
  if (!botToken || !chatId) {
    console.warn('⚠️  Telegram credentials not configured, skipping notification');
    return;
  }

  try {
    const message = formatSentToPrintMessage(data);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    console.log('📱 Sending "Sent to Print" Telegram notification...');
    console.log('   Order:', data.orderNumber);
    console.log('   Book count:', data.bookCount);

    const response = await postJson(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });

    if (response.status !== 200 || !response.data?.ok) {
      console.error('❌ Telegram API returned error:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return;
    }

    console.log('✅ "Sent to Print" Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send "Sent to Print" notification:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Send error notification to Telegram
 * Non-blocking - logs errors but never throws
 */
export async function sendErrorNotification(
  data: ErrorNotificationData
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Silent skip if credentials not configured
  if (!botToken || !chatId) {
    console.warn('⚠️  Telegram credentials not configured, skipping error notification');
    return;
  }

  try {
    const message = formatErrorMessage(data);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    console.log('📱 Sending error Telegram notification...');
    console.log('   Order:', data.orderNumber);
    console.log('   Error:', data.errorMessage);

    const response = await postJson(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });

    if (response.status !== 200 || !response.data?.ok) {
      console.error('❌ Telegram API returned error:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return;
    }

    console.log('✅ Error Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send error notification:', error);
    // Don't throw - this is a non-critical operation
  }
}

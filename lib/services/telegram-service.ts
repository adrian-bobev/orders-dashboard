import https from 'https';

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
 * Make HTTPS POST request to Telegram Bot API
 */
function makeHttpsRequest(
  url: string,
  body: object
): Promise<{ status: number; statusText: string; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyString = JSON.stringify(body);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString),
      },
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode || 500,
            statusText: res.statusMessage || 'Unknown',
            data: jsonData,
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(bodyString);
    req.end();
  });
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

    const response = await makeHttpsRequest(url, {
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

const crypto = require('crypto');

// Test order data
const testOrder = {
  id: 12345,
  number: "12345",
  order_key: "wc_order_test123",
  status: "processing",
  currency: "EUR",
  date_created: "2026-01-14T12:00:00",
  total: "59.90",
  subtotal: "49.90",
  total_tax: "10.00",
  shipping_total: "5.00",
  payment_method: "cod",
  payment_method_title: "Наложен платеж",
  billing: {
    first_name: "Иван",
    last_name: "Иванов",
    company: "",
    address_1: "ул. Цар Освободител 5",
    address_2: "",
    city: "София",
    state: "",
    postcode: "1000",
    country: "BG",
    email: "ivan@example.com",
    phone: "+359888123456"
  },
  shipping: {
    first_name: "Иван",
    last_name: "Иванов",
    company: "",
    address_1: "ул. Цар Освободител 5",
    address_2: "",
    city: "София",
    state: "",
    postcode: "1000",
    country: "BG"
  },
  line_items: [
    {
      id: 1,
      name: "Персонализирана Приказка",
      product_id: 123,
      variation_id: 0,
      quantity: 1,
      total: "49.90",
      meta_data: [
        {
          key: "_prikazko_wizard_config_id",
          value: "config_123456"
        },
        {
          key: "_book_title",
          value: "Приключението на Мария"
        },
        {
          key: "_main_character_name",
          value: "Мария"
        }
      ]
    }
  ],
  shipping_lines: [
    {
      id: 1,
      method_title: "Speedy до офис",
      method_id: "speedy_office",
      total: "0.00"
    }
  ],
  meta_data: [
    {
      key: "_speedy_office_id",
      value: "1234"
    },
    {
      key: "_speedy_office_name",
      value: "Speedy офис София - Център"
    },
    {
      key: "_delivery_city_id",
      value: "68134"
    },
    {
      key: "_delivery_city_name",
      value: "София"
    }
  ]
};

// Configuration
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/woocommerce';
const SECRET = 'local-dev-secret-123';

async function sendTestWebhook() {
  const payload = JSON.stringify(testOrder);

  // Create signature
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64');

  console.log('🚀 Sending test webhook...');
  console.log('📍 URL:', WEBHOOK_URL);
  console.log('🔑 Signature:', signature);
  console.log('📦 Payload size:', payload.length, 'bytes');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WC-Webhook-Signature': signature,
        'User-Agent': 'WooCommerce/Test'
      },
      body: payload
    });

    const responseData = await response.json();

    console.log('\n✅ Response Status:', response.status);
    console.log('📄 Response Body:', JSON.stringify(responseData, null, 2));

    if (responseData.filename) {
      console.log('\n📁 File saved:', responseData.filename);
      console.log('💡 Check the root directory of order-dashboard-2 for the file');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

sendTestWebhook();

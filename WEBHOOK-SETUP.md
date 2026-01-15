# WooCommerce Webhook Setup

This webhook endpoint receives WooCommerce order data and saves it to JSON files for inspection.

## Webhook Endpoint

**URL:** `http://localhost:3000/api/webhooks/woocommerce` (local development)
**Method:** POST
**Authentication:** HMAC SHA256 signature

## Features

- ✅ HMAC SHA256 signature verification for security
- ✅ Handles WooCommerce test pings automatically
- ✅ Saves complete order data to JSON files in root directory
- ✅ Includes headers and timestamp for debugging
- ✅ **Fetches book configurations from WooCommerce API**
- ✅ Includes complete book configuration data (title, character, scenes, etc.)
- ✅ No database required - just file inspection

## Setup Instructions

### 1. Environment Variables

The required environment variables are already configured in `.env.local`:

```
# Webhook Secret
WOOCOMMERCE_WEBHOOK_SECRET=local-dev-secret-123

# WooCommerce API (for fetching book configurations)
WOOCOMMERCE_STORE_URL=https://prikazko.local
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...
ALLOW_SELF_SIGNED_CERTS=true
```

### 2. Start the Development Server

```bash
npm run dev
```

The webhook will be available at `http://localhost:3000/api/webhooks/woocommerce`

### 3. Configure WooCommerce Webhook

In your WooCommerce admin panel:

1. Go to **WooCommerce → Settings → Advanced → Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **Name:** Order Created - Dashboard
   - **Status:** Active
   - **Topic:** Order created
   - **Delivery URL:** `http://localhost:3000/api/webhooks/woocommerce`
   - **Secret:** `local-dev-secret-123`
   - **API Version:** WP REST API Integration v3

### 4. Test the Webhook

#### Option A: Use the test script

```bash
node test-webhook.js
```

This will send a test order to the webhook endpoint.

#### Option B: Create a test order in WooCommerce

Simply create a new order in WooCommerce, and it will automatically trigger the webhook.

## Output Files

When an order is received, a JSON file will be created in the root directory:

```
webhook-order-{order_id}-{timestamp}.json
```

Example: `webhook-order-12345-2026-01-14T12-30-45-123Z.json`

### File Structure

```json
{
  "timestamp": "2026-01-14T12:30:45.123Z",
  "headers": {
    "signature": "base64_signature_here",
    "contentType": "application/json",
    "userAgent": "WooCommerce/8.0.0"
  },
  "orderData": {
    "id": 12345,
    "number": "12345",
    "status": "processing",
    "billing": { ... },
    "shipping": { ... },
    "line_items": [ ... ],
    "meta_data": [ ... ]
  },
  "bookConfigurations": [
    {
      "line_item_id": 1,
      "prikazko_wizard_config_id": "config_123456",
      "configuration_data": {
        "id": 123456,
        "name": "Мария",
        "content": {
          "title": "Приключението на Мария",
          "scenes": [ ... ]
        }
      },
      "book_title": "Приключението на Мария",
      "main_character_name": "Мария",
      "character_count": 1,
      "scene_count": 10
    }
  ]
}
```

## Webhook Security

- HMAC SHA256 signature verification ensures requests come from WooCommerce
- Uses constant-time comparison to prevent timing attacks
- Test pings are automatically detected and accepted
- Invalid signatures return 401 Unauthorized

## Troubleshooting

### Webhook not receiving data

1. Check that the dev server is running (`npm run dev`)
2. Verify the webhook URL in WooCommerce settings
3. Check that the secret matches in both places
4. Look at the console output for error messages

### Signature verification failing

1. Ensure the secret in `.env.local` matches WooCommerce
2. Check that the webhook is sending the `X-WC-Webhook-Signature` header
3. Verify no proxy is modifying the request body

### File not being created

1. Check console output for the filename and path
2. Verify write permissions in the project root directory
3. Look for error messages in the console

## Next Steps

After inspecting the webhook data, you can:

1. Enhance database integration with Supabase
2. Process line items for book configurations
3. Trigger background jobs for book generation
4. Send confirmation emails

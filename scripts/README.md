# Order Management Scripts

This directory contains scripts for managing orders and images between WooCommerce, the database, and storage services.

## Available Scripts

### 1. `fetch-order.ts` - Fetch Order from WooCommerce

Fetches order data from WooCommerce API and saves it to the database, including book configurations.

**Usage:**
```bash
npm run fetch-order <woocommerce-order-id>
```

**Example:**
```bash
npm run fetch-order 1578
```

**What it does:**
1. Fetches order details from WooCommerce REST API
2. Fetches associated book configurations from custom Prikazko API endpoint
3. Saves order to the database (orders, line_items, book_configurations tables)

**Requirements:**
- `WOOCOMMERCE_STORE_URL` - WooCommerce store URL
- `WOOCOMMERCE_CONSUMER_KEY` - WooCommerce API consumer key
- `WOOCOMMERCE_CONSUMER_SECRET` - WooCommerce API consumer secret
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

---

### 2. `sync-order-images.js` - Sync Images from R2 to MinIO

Syncs order images from Cloudflare R2 (production) to local MinIO (development).

**Usage:**
```bash
npm run sync-order-images <woocommerce-order-id>
# or
npm run sync-order-images <database-order-uuid>
# or
npm run sync-order-images <path-to-webhook-json>
```

**Examples:**
```bash
# Using WooCommerce order ID
npm run sync-order-images 1578

# Using database UUID
npm run sync-order-images 8a4783b7-6e84-483d-b598-85cc0337a221

# Using webhook file (legacy)
npm run sync-order-images webhook-order-1576.json
```

**What it does:**
1. Fetches order from database (or reads from JSON file)
2. Extracts all R2 image keys from book configurations
3. Downloads images from Cloudflare R2
4. Uploads images to local MinIO

**Requirements:**
- R2 credentials (hardcoded in script)
- MinIO running locally on port 9000
- Order must exist in database (or provide webhook JSON file)

---

### 3. `fetch-and-sync.ts` - Complete Order Import

Combines both scripts above - fetches order from WooCommerce and syncs images in one command.

**Usage:**
```bash
npm run fetch-and-sync <woocommerce-order-id>
```

**Example:**
```bash
npm run fetch-and-sync 1578
```

**What it does:**
1. Fetches order from WooCommerce and saves to database
2. Syncs all order images from R2 to MinIO

This is the recommended way to import orders for local development.

---

### 4. `sync-r2-to-minio.js` - Sync All Images

Syncs ALL images from R2 to MinIO (not order-specific).

**Usage:**
```bash
npm run sync-images
```

**What it does:**
- Downloads all images from R2 child-images bucket
- Uploads them to local MinIO

**⚠️ Warning:** This can take a long time if there are many images. Use `sync-order-images` for specific orders instead.

---

## Webhook Integration

The webhook handler at `app/api/webhooks/woocommerce/route.ts` automatically:
1. Saves incoming orders to the database
2. Triggers background image sync if the order has book configurations

This means when WooCommerce sends a webhook, images will be synced automatically without manual intervention.

---

## Troubleshooting

### "Order not found" error
- Make sure the order exists in WooCommerce
- Check that WooCommerce API credentials are correct
- Try fetching the order first: `npm run fetch-order <order-id>`

### "Failed to fetch order configuration"
- The order might not have book configurations
- Check that the Prikazko API endpoint is accessible
- Verify the custom API endpoint URL in `.env.local`

### Image sync fails
- Ensure MinIO is running: `docker ps | grep minio`
- Check R2 credentials
- Verify the bucket name is correct ("child-images")

### Module not found errors
- Run `npm install` to ensure all dependencies are installed
- Make sure `tsx` is installed for TypeScript scripts

---

## Environment Variables Required

```bash
# WooCommerce API
WOOCOMMERCE_STORE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxx

# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Optional
ALLOW_SELF_SIGNED_CERTS=true  # For local development with self-signed certs
```

---

## Development Workflow

**Typical workflow for testing with production orders:**

1. Find an order ID in WooCommerce (e.g., 1578)
2. Import it locally:
   ```bash
   npm run fetch-and-sync 1578
   ```
3. View the order in your local dashboard
4. Images will be available from MinIO

**For webhook testing:**

1. Start your development server: `npm run dev`
2. Use a tool like ngrok to expose your local server
3. Configure WooCommerce webhook to point to your ngrok URL
4. Create a test order in WooCommerce
5. The webhook will automatically save the order and sync images

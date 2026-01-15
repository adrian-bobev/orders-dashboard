# Inserting Test Orders

This document explains how to insert test orders into the database from webhook JSON files.

## Method 1: Using Supabase Studio SQL Editor (Recommended)

1. Open Supabase Studio in your browser
2. Go to the SQL Editor
3. Use the webhook JSON file structure to create INSERT statements

### Example SQL Template

```sql
-- Insert the order
INSERT INTO orders (
  woocommerce_order_id,
  order_number,
  total,
  currency,
  payment_method,
  payment_method_title,
  status,
  billing_first_name,
  billing_last_name,
  billing_email,
  billing_phone,
  billing_postcode,
  billing_company,
  billing_address_1,
  billing_address_2,
  billing_city,
  billing_state,
  billing_country,
  delivery_city_id,
  delivery_city_name,
  delivery_city_region,
  delivery_city_type,
  delivery_address_component_id,
  delivery_address_component_name,
  delivery_address_component_type,
  delivery_address_type_prefix,
  shipping_total,
  shipping_method_title,
  woocommerce_created_at,
  created_at
) VALUES (
  <woocommerce_order_id>,
  '<order_number>',
  <total>,
  '<currency>',
  '<payment_method>',
  '<payment_method_title>',
  '<status>',
  '<billing_first_name>',
  '<billing_last_name>',
  '<billing_email>',
  '<billing_phone>',
  '<billing_postcode>',
  '<billing_company>',
  '<billing_address_1>',
  '<billing_address_2>',
  '<billing_city>',
  '<billing_state>',
  '<billing_country>',
  '<delivery_city_id>',
  '<delivery_city_name>',
  '<delivery_city_region>',
  '<delivery_city_type>',
  '<delivery_address_component_id>',
  '<delivery_address_component_name>',
  '<delivery_address_component_type>',
  '<delivery_address_type_prefix>',
  <shipping_total>,
  '<shipping_method_title>',
  '<woocommerce_created_at>',
  '<created_at>'
) RETURNING id;
```

## Method 2: Using the Webhook Endpoint

The application already has a webhook endpoint at `/api/webhooks/woocommerce` that processes incoming webhook data and saves it to the database.

You can POST a webhook JSON file to this endpoint:

```bash
curl -X POST http://localhost:3000/api/webhooks/woocommerce \
  -H "Content-Type: application/json" \
  -d @webhook-order-1576-2026-01-15T20-50-52-696Z.json
```

## Webhook JSON Structure

Webhook files should be saved in the root directory and follow this naming pattern:
`webhook-order-{order_id}-{timestamp}.json`

The JSON structure should include:
- `orderData`: The WooCommerce order object
- `bookConfigurations`: Array of book configuration objects with line item details

See `webhook-order-1576-2026-01-15T20-50-52-696Z.json` for an example.

## Inserting Line Items and Book Configurations

After inserting an order, you'll need to insert the related line items and book configurations:

```sql
-- Insert line item
INSERT INTO line_items (
  order_id,
  woocommerce_line_item_id,
  product_name,
  product_id,
  quantity,
  total,
  prikazko_wizard_config_id
) VALUES (
  '<order_id_from_previous_insert>',
  <woocommerce_line_item_id>,
  '<product_name>',
  <product_id>,
  <quantity>,
  <total>,
  '<config_id>'
) RETURNING id;

-- Insert book configuration
INSERT INTO book_configurations (
  line_item_id,
  config_id,
  name,
  age,
  gender,
  content,
  images,
  story_description,
  woocommerce_created_at,
  woocommerce_completed_at
) VALUES (
  '<line_item_id_from_previous_insert>',
  '<config_id>',
  '<name>',
  '<age>',
  '<gender>',
  '<content_json>'::jsonb,
  '<images_json>'::jsonb,
  '<story_description>',
  '<woocommerce_created_at>',
  '<woocommerce_completed_at>'
);
```

## Status Values

Valid order status values:
- `NEW`
- `VALIDATION_PENDING`
- `READY_FOR_PRINT`
- `PRINTING`
- `IN_TRANSIT`
- `COMPLETED`

## Notes

- Use `ON CONFLICT (woocommerce_order_id) DO NOTHING` to prevent duplicate orders
- The `content` and `images` fields in `book_configurations` must be valid JSONB
- Timestamps should be in ISO 8601 format
- The order status history is automatically logged via database triggers

-- Orders Schema Migration
-- This migration creates tables for storing WooCommerce order data

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create order status enum
CREATE TYPE order_status AS ENUM (
  'NEW',
  'VALIDATION_PENDING',
  'PRINTING',
  'IN_TRANSIT',
  'COMPLETED'
);

-- Create orders table
CREATE TABLE orders (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  woocommerce_order_id INTEGER NOT NULL UNIQUE,
  order_number TEXT,

  -- Order details
  total DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  payment_method TEXT NOT NULL,
  payment_method_title TEXT,
  status order_status NOT NULL DEFAULT 'NEW',

  -- Billing information
  billing_first_name TEXT NOT NULL,
  billing_last_name TEXT NOT NULL,
  billing_email TEXT NOT NULL,
  billing_phone TEXT,
  billing_postcode TEXT,
  billing_company TEXT,
  billing_address_1 TEXT,
  billing_address_2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_country TEXT,

  -- Delivery metadata (separate columns as required)
  speedy_office_id TEXT,
  speedy_office_name TEXT,
  delivery_city_id TEXT,
  delivery_city_name TEXT,
  delivery_city_region TEXT,
  delivery_city_type TEXT,
  delivery_address_component_id TEXT,
  delivery_address_component_name TEXT,
  delivery_address_component_type TEXT,
  delivery_address_type_prefix TEXT,

  -- Shipping details
  shipping_total DECIMAL(10, 2),
  shipping_method_title TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  woocommerce_created_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_total CHECK (total >= 0)
);

-- Indexes for orders table
CREATE INDEX idx_orders_woocommerce_id ON orders(woocommerce_order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_billing_email ON orders(billing_email);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- Updated_at trigger for orders
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create line_items table
CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  woocommerce_line_item_id INTEGER NOT NULL,

  -- Product details
  product_name TEXT NOT NULL,
  product_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  total DECIMAL(10, 2) NOT NULL,

  -- Book configuration reference
  prikazko_wizard_config_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT valid_quantity CHECK (quantity > 0),
  CONSTRAINT valid_total CHECK (total >= 0),
  CONSTRAINT unique_wc_line_item UNIQUE(order_id, woocommerce_line_item_id)
);

-- Indexes for line_items table
CREATE INDEX idx_line_items_order_id ON line_items(order_id);
CREATE INDEX idx_line_items_config_id ON line_items(prikazko_wizard_config_id);

-- Create book_configurations table
CREATE TABLE book_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_item_id UUID NOT NULL REFERENCES line_items(id) ON DELETE CASCADE,
  config_id TEXT NOT NULL,

  -- Character details (separate columns as required)
  name TEXT NOT NULL,
  age TEXT,
  gender TEXT,

  -- Book content (JSONB for complex nested data)
  content JSONB NOT NULL,
  -- Structure: {
  --   title: string,
  --   shortDescription: string,
  --   scenes: [{text: string}],
  --   motivationEnd: string
  -- }

  -- Images (JSONB array)
  images JSONB,
  -- Structure: [{r2_key: string, sort_order: number}]

  -- Additional metadata
  story_description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  woocommerce_created_at TIMESTAMPTZ,
  woocommerce_completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_line_item FOREIGN KEY (line_item_id) REFERENCES line_items(id),
  CONSTRAINT unique_line_item_config UNIQUE(line_item_id, config_id)
);

-- Indexes for book_configurations table
CREATE INDEX idx_book_configs_line_item_id ON book_configurations(line_item_id);
CREATE INDEX idx_book_configs_config_id ON book_configurations(config_id);
CREATE INDEX idx_book_configs_name ON book_configurations(name);

-- GIN indexes for JSONB queries (if needed for content/images search)
CREATE INDEX idx_book_configs_content ON book_configurations USING GIN (content);
CREATE INDEX idx_book_configs_images ON book_configurations USING GIN (images);

-- Create order_status_history table
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,

  CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Indexes for order_status_history table
CREATE INDEX idx_status_history_order_id ON order_status_history(order_id, changed_at DESC);
CREATE INDEX idx_status_history_status ON order_status_history(status);

-- Trigger function to automatically log status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed or on insert
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO order_status_history (order_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_status_change
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_status_change();

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders table
CREATE POLICY "Authenticated users can read all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for line_items table
CREATE POLICY "Authenticated users can read all line items"
  ON line_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert line items"
  ON line_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for book_configurations table
CREATE POLICY "Authenticated users can read all book configs"
  ON book_configurations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert book configs"
  ON book_configurations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for order_status_history table
CREATE POLICY "Authenticated users can read order history"
  ON order_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert status history"
  ON order_status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comments to track migration purpose
COMMENT ON TABLE orders IS 'Stores WooCommerce order data from webhooks';
COMMENT ON TABLE line_items IS 'Stores line items for each order';
COMMENT ON TABLE book_configurations IS 'Stores book personalization configurations';
COMMENT ON TABLE order_status_history IS 'Audit log of order status changes';

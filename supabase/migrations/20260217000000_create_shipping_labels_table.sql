-- Create shipping_labels table to store multiple shipping labels per order
CREATE TABLE IF NOT EXISTS shipping_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Additional metadata from Speedy API
  price_amount NUMERIC(10, 2),
  price_total NUMERIC(10, 2),
  price_currency TEXT DEFAULT 'BGN',
  pickup_date TEXT,
  delivery_deadline TEXT,

  UNIQUE(shipment_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_shipping_labels_order_id ON shipping_labels(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_labels_created_at ON shipping_labels(created_at DESC);

-- Enable RLS
ALTER TABLE shipping_labels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view shipping labels for orders they can view"
  ON shipping_labels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = shipping_labels.order_id
    )
  );

CREATE POLICY "Admins can insert shipping labels"
  ON shipping_labels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete shipping labels"
  ON shipping_labels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add comment
COMMENT ON TABLE shipping_labels IS 'Stores Speedy shipping labels (товарителници) for orders. Supports multiple labels per order for testing purposes.';

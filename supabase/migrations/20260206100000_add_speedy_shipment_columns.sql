-- Add Speedy shipping label columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS speedy_shipment_id TEXT,
ADD COLUMN IF NOT EXISTS speedy_label_created_at TIMESTAMPTZ;

-- Add index for querying by shipment ID
CREATE INDEX IF NOT EXISTS idx_orders_speedy_shipment_id ON orders (speedy_shipment_id) WHERE speedy_shipment_id IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN orders.speedy_shipment_id IS 'Speedy waybill number (товарителница)';
COMMENT ON COLUMN orders.speedy_label_created_at IS 'When the Speedy shipping label was created';

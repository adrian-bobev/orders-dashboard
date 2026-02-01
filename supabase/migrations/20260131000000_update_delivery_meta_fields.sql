-- Migration: Update delivery meta fields for new BG Carriers plugin
-- This replaces the old Speedy delivery fields with the new structure

-- Drop old columns that are no longer used
ALTER TABLE orders
  DROP COLUMN IF EXISTS speedy_office_id,
  DROP COLUMN IF EXISTS speedy_office_name,
  DROP COLUMN IF EXISTS delivery_city_id,
  DROP COLUMN IF EXISTS delivery_city_name,
  DROP COLUMN IF EXISTS delivery_city_region,
  DROP COLUMN IF EXISTS delivery_city_type,
  DROP COLUMN IF EXISTS delivery_address_component_id,
  DROP COLUMN IF EXISTS delivery_address_component_name,
  DROP COLUMN IF EXISTS delivery_address_component_type,
  DROP COLUMN IF EXISTS delivery_address_type_prefix;

-- Add new generic BG Carriers columns
ALTER TABLE orders
  ADD COLUMN bg_carriers_method_id TEXT,
  ADD COLUMN bg_carriers_carrier TEXT,
  ADD COLUMN bg_carriers_service_type TEXT,
  ADD COLUMN bg_carriers_location_id TEXT,
  ADD COLUMN bg_carriers_location_name TEXT,
  ADD COLUMN bg_carriers_location_address TEXT;

-- Add Speedy pickup (office/APM) columns
ALTER TABLE orders
  ADD COLUMN speedy_pickup_location_id TEXT,
  ADD COLUMN speedy_pickup_location_name TEXT,
  ADD COLUMN speedy_pickup_location_address TEXT,
  ADD COLUMN speedy_pickup_location_type TEXT,
  ADD COLUMN speedy_pickup_location_city TEXT,
  ADD COLUMN speedy_pickup_location_city_id TEXT,
  ADD COLUMN speedy_pickup_location_postcode TEXT;

-- Add Speedy home delivery columns
ALTER TABLE orders
  ADD COLUMN speedy_delivery_city_id TEXT,
  ADD COLUMN speedy_delivery_city_name TEXT,
  ADD COLUMN speedy_delivery_street_id TEXT,
  ADD COLUMN speedy_delivery_street_name TEXT,
  ADD COLUMN speedy_delivery_street_type TEXT,
  ADD COLUMN speedy_delivery_street_number TEXT,
  ADD COLUMN speedy_delivery_postcode TEXT,
  ADD COLUMN speedy_delivery_full_address TEXT;

-- Add index for service type queries
CREATE INDEX idx_orders_service_type ON orders(bg_carriers_service_type);

-- Add comments
COMMENT ON COLUMN orders.bg_carriers_method_id IS 'Delivery method ID (e.g., speedy_office, speedy_apm, speedy_home)';
COMMENT ON COLUMN orders.bg_carriers_carrier IS 'Carrier ID (e.g., speedy)';
COMMENT ON COLUMN orders.bg_carriers_service_type IS 'Service type: office, apm, home, pickup';

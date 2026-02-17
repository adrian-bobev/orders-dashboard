-- =============================================================================
-- SHIPPING METADATA REFACTORING
-- Breaking Change - No Backwards Compatibility
-- Date: 2026-02-17
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RENAME COLUMN
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  RENAME COLUMN bg_carriers_service_type TO bg_carriers_delivery_type;

-- -----------------------------------------------------------------------------
-- 2. CONVERT VALUES: office/apm → pickup
-- -----------------------------------------------------------------------------
UPDATE orders
SET bg_carriers_delivery_type = 'pickup'
WHERE bg_carriers_delivery_type IN ('office', 'apm');

-- -----------------------------------------------------------------------------
-- 3. DROP OLD COLUMNS (no fallbacks)
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  DROP COLUMN IF EXISTS bg_carriers_method_id,
  DROP COLUMN IF EXISTS bg_carriers_location_id,
  DROP COLUMN IF EXISTS bg_carriers_location_name,
  DROP COLUMN IF EXISTS bg_carriers_location_address,
  DROP COLUMN IF EXISTS speedy_delivery_full_address;

-- -----------------------------------------------------------------------------
-- 4. ADD NEW COLUMN
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS speedy_delivery_street_type TEXT;

-- -----------------------------------------------------------------------------
-- 5. UPDATE INDEX
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_orders_service_type;
CREATE INDEX idx_orders_delivery_type
  ON orders(bg_carriers_delivery_type)
  WHERE bg_carriers_delivery_type IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. ADD CONSTRAINTS (enforce valid values only)
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD CONSTRAINT check_delivery_type_valid
    CHECK (bg_carriers_delivery_type IS NULL OR bg_carriers_delivery_type IN ('pickup', 'home'));

ALTER TABLE orders
  ADD CONSTRAINT check_pickup_location_type_valid
    CHECK (speedy_pickup_location_type IS NULL OR speedy_pickup_location_type IN ('office', 'apm'));

ALTER TABLE orders
  ADD CONSTRAINT check_street_type_valid
    CHECK (speedy_delivery_street_type IS NULL OR speedy_delivery_street_type IN ('street', 'complex', 'custom'));

-- -----------------------------------------------------------------------------
-- 7. UPDATE COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN orders.bg_carriers_delivery_type IS
  'Delivery type: "pickup" (office/APM) or "home". New structure as of 2026-02-17';

COMMENT ON COLUMN orders.speedy_pickup_location_type IS
  'For pickup: "office" (staffed) or "apm" (automatic machine)';

COMMENT ON COLUMN orders.speedy_delivery_street_type IS
  'For home: "street" (from DB), "complex" (жк), "custom" (manual)';

-- -----------------------------------------------------------------------------
-- 8. DATA INTEGRITY VALIDATION
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  invalid_pickup INT := 0;
  invalid_home INT := 0;
  invalid_types INT := 0;
  converted_count INT := 0;
BEGIN
  -- Check pickup orders have required fields
  SELECT COUNT(*) INTO invalid_pickup
  FROM orders
  WHERE bg_carriers_delivery_type = 'pickup'
    AND bg_carriers_carrier = 'speedy'
    AND (speedy_pickup_location_id IS NULL OR speedy_pickup_location_city_id IS NULL);

  -- Check home orders have required fields
  SELECT COUNT(*) INTO invalid_home
  FROM orders
  WHERE bg_carriers_delivery_type = 'home'
    AND bg_carriers_carrier = 'speedy'
    AND speedy_delivery_city_id IS NULL;

  -- Check for any invalid type values
  SELECT COUNT(*) INTO invalid_types
  FROM orders
  WHERE bg_carriers_delivery_type IS NOT NULL
    AND bg_carriers_delivery_type NOT IN ('pickup', 'home');

  -- Get conversion stats
  SELECT COUNT(*) INTO converted_count
  FROM orders
  WHERE bg_carriers_delivery_type = 'pickup';

  RAISE NOTICE '✓ Renamed bg_carriers_service_type to bg_carriers_delivery_type';
  RAISE NOTICE '✓ Converted % orders to pickup type', converted_count;
  RAISE NOTICE '✓ Dropped 5 obsolete columns';
  RAISE NOTICE '✓ Added speedy_delivery_street_type column';
  RAISE NOTICE '✓ Updated index';
  RAISE NOTICE '✓ Added constraints';
  RAISE NOTICE '✓ Updated comments';

  IF invalid_types > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % orders have invalid delivery_type values', invalid_types;
  END IF;

  IF invalid_pickup > 0 THEN
    RAISE WARNING '% pickup orders missing required location data', invalid_pickup;
  END IF;

  IF invalid_home > 0 THEN
    RAISE WARNING '% home orders missing required city data', invalid_home;
  END IF;

  IF invalid_pickup = 0 AND invalid_home = 0 AND invalid_types = 0 THEN
    RAISE NOTICE '✓ Data integrity validation PASSED';
  END IF;

  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Shipping metadata refactoring';
  RAISE NOTICE '=================================================================';
END $$;

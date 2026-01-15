-- Migration to update order status enum
-- Replaces PRINTING with READY_FOR_PRINT and PRINTING

-- Drop the trigger first (will recreate it)
DROP TRIGGER IF EXISTS on_order_status_change ON orders;
DROP FUNCTION IF EXISTS log_order_status_change();

-- Remove default temporarily
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

-- Convert to text
ALTER TABLE orders ALTER COLUMN status TYPE TEXT;
ALTER TABLE order_status_history ALTER COLUMN status TYPE TEXT;

-- Drop old enum
DROP TYPE IF EXISTS order_status;

-- Create new enum with updated values
CREATE TYPE order_status AS ENUM (
  'NEW',
  'VALIDATION_PENDING',
  'READY_FOR_PRINT',
  'PRINTING',
  'IN_TRANSIT',
  'COMPLETED'
);

-- Convert back to enum
ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::order_status;
ALTER TABLE order_status_history ALTER COLUMN status TYPE order_status USING status::order_status;

-- Restore default
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'NEW'::order_status;

-- Recreate the trigger function
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

-- Recreate the trigger
CREATE TRIGGER on_order_status_change
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_status_change();


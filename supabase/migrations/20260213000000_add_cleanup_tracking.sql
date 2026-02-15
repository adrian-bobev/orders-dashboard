-- Add cleanup tracking to jobs table (PDF service cleanup)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pdf_cleanup_status TEXT DEFAULT 'pending';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pdf_cleanup_error TEXT;

-- Add cleanup tracking to orders table (R2 preview cleanup)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preview_cleanup_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preview_cleanup_error TEXT;

-- Create index for finding cleanup failures
CREATE INDEX IF NOT EXISTS idx_jobs_pdf_cleanup_failed ON jobs (pdf_cleanup_status) WHERE pdf_cleanup_status = 'failed';
CREATE INDEX IF NOT EXISTS idx_orders_preview_cleanup_failed ON orders (preview_cleanup_status) WHERE preview_cleanup_status = 'failed';

-- Add comments for documentation
COMMENT ON COLUMN jobs.pdf_cleanup_status IS 'Status of PDF service cleanup: pending, completed, failed';
COMMENT ON COLUMN jobs.pdf_cleanup_error IS 'Error message if PDF cleanup failed';
COMMENT ON COLUMN orders.preview_cleanup_status IS 'Status of R2 preview cleanup: pending, completed, failed';
COMMENT ON COLUMN orders.preview_cleanup_error IS 'Error message if preview cleanup failed';

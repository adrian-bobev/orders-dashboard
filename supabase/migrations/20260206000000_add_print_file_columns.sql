-- Add print file columns to orders table for R2 storage and download tracking

ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_file_r2_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_file_size_bytes BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_generated_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN orders.print_file_r2_key IS 'R2 storage key for the print-ready ZIP file';
COMMENT ON COLUMN orders.print_file_size_bytes IS 'Size of the print ZIP file in bytes';
COMMENT ON COLUMN orders.download_count IS 'Number of times the print file has been downloaded';
COMMENT ON COLUMN orders.last_downloaded_at IS 'Timestamp of the last download';
COMMENT ON COLUMN orders.print_generated_at IS 'Timestamp when the print file was generated';

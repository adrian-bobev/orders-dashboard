-- Make corrected_content nullable since we may save manually_edited_content first
-- before running AI correction

ALTER TABLE generation_corrected_content
  ALTER COLUMN corrected_content DROP NOT NULL;

COMMENT ON COLUMN generation_corrected_content.corrected_content IS 'Content after AI correction. May be null if only manually_edited_content exists.';

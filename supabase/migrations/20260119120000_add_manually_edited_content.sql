-- Add manually_edited_content field to generation_corrected_content table
-- This stores content that was manually edited before AI correction

ALTER TABLE generation_corrected_content
  ADD COLUMN manually_edited_content JSONB;

-- Add comment to explain the field
COMMENT ON COLUMN generation_corrected_content.manually_edited_content IS 'Content that was manually edited by the user before running AI correction. If present, this should be used instead of original_content when running corrections.';

-- Add is_custom field to generation_character_list table
-- This allows distinguishing between AI-extracted characters and user-added custom characters

ALTER TABLE generation_character_list
ADD COLUMN is_custom BOOLEAN DEFAULT false;

-- Add index for faster queries filtering by is_custom
CREATE INDEX idx_character_list_custom ON generation_character_list(generation_id, is_custom);

-- Add notes field to generation_character_references table
-- This allows storing metadata about uploaded images (original filename, upload date, etc.)

ALTER TABLE generation_character_references
ADD COLUMN notes TEXT;

-- Make image_prompt nullable to support user-uploaded images
-- (AI-generated images will have a prompt, but uploaded ones won't)

ALTER TABLE generation_character_references
ALTER COLUMN image_prompt DROP NOT NULL;

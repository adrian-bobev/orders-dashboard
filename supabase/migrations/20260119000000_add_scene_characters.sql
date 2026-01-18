-- Migration: Add scene-character associations and generation metadata
-- This enables per-scene character/object selection and detailed generation history

-- 1. Create junction table for scene-character associations
CREATE TABLE scene_prompt_characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_prompt_id UUID NOT NULL REFERENCES generation_scene_prompts(id) ON DELETE CASCADE,
  character_list_id UUID NOT NULL REFERENCES generation_character_list(id) ON DELETE CASCADE,

  -- Ordering for display and importance
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints: Each character can only appear once per scene
  CONSTRAINT unique_scene_character UNIQUE(scene_prompt_id, character_list_id)
);

-- Indexes for scene_prompt_characters
CREATE INDEX idx_scene_prompt_characters_scene ON scene_prompt_characters(scene_prompt_id);
CREATE INDEX idx_scene_prompt_characters_character ON scene_prompt_characters(character_list_id);
CREATE INDEX idx_scene_prompt_characters_order ON scene_prompt_characters(scene_prompt_id, sort_order);

-- RLS Policy for scene_prompt_characters
ALTER TABLE scene_prompt_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can access all scene_prompt_characters"
  ON scene_prompt_characters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- 2. Add columns to generation_scene_images for generation history
-- These columns store what was actually used for each generation
ALTER TABLE generation_scene_images
ADD COLUMN image_prompt TEXT,
ADD COLUMN character_reference_ids JSONB;

-- Add comments for clarity
COMMENT ON COLUMN generation_scene_images.image_prompt IS 'The actual prompt text used for this specific image generation';
COMMENT ON COLUMN generation_scene_images.character_reference_ids IS 'Array of character reference image IDs used in this generation';

-- Add index for querying by character references
CREATE INDEX idx_scene_images_character_refs ON generation_scene_images USING GIN (character_reference_ids);

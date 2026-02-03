-- Add 'back_cover' to the scene_type constraint

-- Drop the existing constraint
ALTER TABLE generation_scene_prompts
DROP CONSTRAINT IF EXISTS valid_scene_type;

-- Add the new constraint with 'back_cover' included
ALTER TABLE generation_scene_prompts
ADD CONSTRAINT valid_scene_type CHECK (scene_type IN ('cover', 'back_cover', 'scene'));

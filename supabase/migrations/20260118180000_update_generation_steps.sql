-- Migration: Update generation steps from 6 to 5
-- This migration removes the old Step 3 (character list extraction)
-- which is now merged into Step 4 (scene prompts)

-- Update the valid_step constraint to allow only 5 steps
ALTER TABLE book_generations DROP CONSTRAINT IF EXISTS valid_step;
ALTER TABLE book_generations ADD CONSTRAINT valid_step CHECK (current_step >= 1 AND current_step <= 5);

-- Update default steps_completed JSON structure for new generations
-- Note: Existing generations will continue to work as they already have their steps_completed
ALTER TABLE book_generations
  ALTER COLUMN steps_completed
  SET DEFAULT '{"step1": false, "step2": false, "step3": false, "step4": false, "step5": false}'::jsonb;

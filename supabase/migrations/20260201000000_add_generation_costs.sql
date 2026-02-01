-- Add cost tracking to generation tables

-- Add generation_cost to character references (Step 4)
ALTER TABLE generation_character_references
ADD COLUMN generation_cost DECIMAL(10, 4) DEFAULT 0;

-- Add generation_cost to scene images (Step 5)
ALTER TABLE generation_scene_images
ADD COLUMN generation_cost DECIMAL(10, 4) DEFAULT 0;

-- Add total_cost to main generations table
ALTER TABLE book_generations
ADD COLUMN total_cost DECIMAL(10, 4) DEFAULT 0;

-- Create index for cost queries
CREATE INDEX idx_book_generations_cost ON book_generations(total_cost);

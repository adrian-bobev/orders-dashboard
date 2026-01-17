-- Book Generation Schema Migration
-- This migration creates tables for the book generation workflow system

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Main generation tracking table
CREATE TABLE book_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_config_id UUID NOT NULL REFERENCES book_configurations(id) ON DELETE CASCADE,

  -- Progress tracking
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress',
  steps_completed JSONB DEFAULT '{"step1": false, "step2": false, "step3": false, "step4": false, "step5": false, "step6": false}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- User tracking
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT valid_step CHECK (current_step >= 1 AND current_step <= 6),
  CONSTRAINT valid_status CHECK (status IN ('in_progress', 'completed', 'failed'))
);

-- Indexes for book_generations
CREATE INDEX idx_book_generations_config ON book_generations(book_config_id);
CREATE INDEX idx_book_generations_status ON book_generations(status);
CREATE INDEX idx_book_generations_created ON book_generations(created_at DESC);

-- Updated_at trigger for book_generations
CREATE TRIGGER update_book_generations_updated_at
  BEFORE UPDATE ON book_generations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Main character reference images (Step 1)
CREATE TABLE generation_character_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,

  -- Image source (from uploaded images)
  source_image_key TEXT NOT NULL,

  -- Cropping data
  crop_data JSONB,

  -- Generated/processed image
  processed_image_key TEXT,

  -- AI-generated reference image
  generated_image_key TEXT,

  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  is_selected BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Constraints
  CONSTRAINT unique_generation_version UNIQUE(generation_id, version)
);

-- Indexes for generation_character_images
CREATE INDEX idx_character_images_generation ON generation_character_images(generation_id);
CREATE INDEX idx_character_images_selected ON generation_character_images(generation_id, is_selected) WHERE is_selected = true;

-- 3. Proofread content (Step 2)
CREATE TABLE generation_corrected_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,

  -- Original and corrected content
  original_content JSONB NOT NULL,
  corrected_content JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_used TEXT,
  tokens_used INTEGER,

  -- Constraints
  CONSTRAINT one_per_generation UNIQUE(generation_id)
);

-- Indexes for generation_corrected_content
CREATE INDEX idx_corrected_content_generation ON generation_corrected_content(generation_id);

-- 4. Character list (Step 3)
CREATE TABLE generation_character_list (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,

  -- Character data
  character_name TEXT NOT NULL,
  character_type TEXT,
  description TEXT,
  is_main_character BOOLEAN DEFAULT false,

  -- Order for display
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for generation_character_list
CREATE INDEX idx_character_list_generation ON generation_character_list(generation_id);
CREATE INDEX idx_character_list_order ON generation_character_list(generation_id, sort_order);

-- Updated_at trigger for generation_character_list
CREATE TRIGGER update_generation_character_list_updated_at
  BEFORE UPDATE ON generation_character_list
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Scene image prompts (Step 4)
CREATE TABLE generation_scene_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,

  -- Scene identification
  scene_type TEXT NOT NULL,
  scene_number INTEGER,

  -- Prompt data
  image_prompt TEXT NOT NULL,
  prompt_metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_scene_type CHECK (scene_type IN ('cover', 'scene'))
);

-- Indexes for generation_scene_prompts
CREATE INDEX idx_scene_prompts_generation ON generation_scene_prompts(generation_id);
CREATE INDEX idx_scene_prompts_scene ON generation_scene_prompts(generation_id, scene_number);
CREATE UNIQUE INDEX idx_scene_prompts_unique ON generation_scene_prompts(generation_id, scene_type, scene_number);

-- Updated_at trigger for generation_scene_prompts
CREATE TRIGGER update_generation_scene_prompts_updated_at
  BEFORE UPDATE ON generation_scene_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Character reference images (Step 5)
CREATE TABLE generation_character_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,
  character_list_id UUID NOT NULL REFERENCES generation_character_list(id) ON DELETE CASCADE,

  -- Generated image
  image_key TEXT NOT NULL,
  image_prompt TEXT NOT NULL,

  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  is_selected BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_used TEXT,
  generation_params JSONB
);

-- Indexes for generation_character_references
CREATE INDEX idx_character_refs_generation ON generation_character_references(generation_id);
CREATE INDEX idx_character_refs_character ON generation_character_references(character_list_id);
CREATE INDEX idx_character_refs_selected ON generation_character_references(character_list_id, is_selected) WHERE is_selected = true;

-- 7. Scene images (Step 6)
CREATE TABLE generation_scene_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES book_generations(id) ON DELETE CASCADE,
  scene_prompt_id UUID NOT NULL REFERENCES generation_scene_prompts(id) ON DELETE CASCADE,

  -- Generated image
  image_key TEXT NOT NULL,

  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  is_selected BOOLEAN DEFAULT false,

  -- Generation status
  generation_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Metadata
  model_used TEXT,
  generation_params JSONB,

  -- Constraints
  CONSTRAINT valid_generation_status CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed'))
);

-- Indexes for generation_scene_images
CREATE INDEX idx_scene_images_generation ON generation_scene_images(generation_id);
CREATE INDEX idx_scene_images_prompt ON generation_scene_images(scene_prompt_id);
CREATE INDEX idx_scene_images_selected ON generation_scene_images(scene_prompt_id, is_selected) WHERE is_selected = true;
CREATE INDEX idx_scene_images_status ON generation_scene_images(generation_status);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE book_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_character_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_corrected_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_character_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_scene_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_character_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_scene_images ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admin users can access all generation data
CREATE POLICY "Admin users can access all book_generations"
  ON book_generations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_character_images"
  ON generation_character_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_corrected_content"
  ON generation_corrected_content FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_character_list"
  ON generation_character_list FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_scene_prompts"
  ON generation_scene_prompts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_character_references"
  ON generation_character_references FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

CREATE POLICY "Admin users can access all generation_scene_images"
  ON generation_scene_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

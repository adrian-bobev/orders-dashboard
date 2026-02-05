-- Create job_type enum
CREATE TYPE job_type AS ENUM ('PRINT_GENERATION', 'PREVIEW_GENERATION', 'CONTENT_GENERATION');

-- Create job_status enum
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Create jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  priority INTEGER NOT NULL DEFAULT 10
);

-- Create index for finding pending jobs efficiently
CREATE INDEX idx_jobs_pending ON jobs (status, scheduled_for, priority, created_at) WHERE status = 'pending';

-- Create index for finding stale processing jobs
CREATE INDEX idx_jobs_processing ON jobs (status, locked_at) WHERE status = 'processing';

-- Create index for querying by type
CREATE INDEX idx_jobs_type ON jobs (type, created_at DESC);

-- Create index for admin dashboard queries
CREATE INDEX idx_jobs_created_at ON jobs (created_at DESC);

-- Function to claim the next available job with row-level locking
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT, p_stale_timeout_minutes INTEGER DEFAULT 5)
RETURNS SETOF jobs LANGUAGE plpgsql AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  -- Reclaim stale jobs from crashed workers
  UPDATE jobs
  SET status = 'pending', locked_by = NULL, locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < NOW() - (p_stale_timeout_minutes || ' minutes')::INTERVAL;

  -- Claim next available job with row locking
  SELECT * INTO v_job FROM jobs
  WHERE status = 'pending' AND scheduled_for <= NOW()
  ORDER BY priority ASC, created_at ASC
  LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NOT NULL THEN
    UPDATE jobs
    SET
      status = 'processing',
      locked_by = p_worker_id,
      locked_at = NOW(),
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
    WHERE id = v_job.id;

    RETURN QUERY SELECT * FROM jobs WHERE id = v_job.id;
  END IF;
END;
$$;

-- Function to complete a job
CREATE OR REPLACE FUNCTION complete_job(p_job_id UUID, p_result JSONB DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jobs
  SET
    status = 'completed',
    result = COALESCE(p_result, result),
    completed_at = NOW(),
    updated_at = NOW(),
    locked_by = NULL,
    locked_at = NULL
  WHERE id = p_job_id;
END;
$$;

-- Function to fail a job
CREATE OR REPLACE FUNCTION fail_job(p_job_id UUID, p_error TEXT, p_should_retry BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  -- Check if we should retry
  IF p_should_retry AND v_job.retry_count < v_job.max_retries THEN
    -- Schedule retry with exponential backoff (30s, 60s, 120s)
    UPDATE jobs
    SET
      status = 'pending',
      error = p_error,
      retry_count = retry_count + 1,
      scheduled_for = NOW() + ((30 * POWER(2, retry_count)) || ' seconds')::INTERVAL,
      updated_at = NOW(),
      locked_by = NULL,
      locked_at = NULL
    WHERE id = p_job_id;
  ELSE
    -- Max retries exceeded or no retry requested
    UPDATE jobs
    SET
      status = 'failed',
      error = p_error,
      completed_at = NOW(),
      updated_at = NOW(),
      locked_by = NULL,
      locked_at = NULL
    WHERE id = p_job_id;
  END IF;
END;
$$;

-- Function to cancel a pending job
CREATE OR REPLACE FUNCTION cancel_job(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  UPDATE jobs
  SET
    status = 'cancelled',
    updated_at = NOW(),
    completed_at = NOW()
  WHERE id = p_job_id AND status = 'pending';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION update_jobs_updated_at();

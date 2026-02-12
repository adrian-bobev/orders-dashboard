-- Remove automatic retry logic from fail_job function
-- This migration removes exponential backoff retry logic to prevent jobs from
-- automatically retrying. The p_should_retry parameter is kept for API compatibility
-- but is now ignored. Manual retrigger via admin UI still works (creates new job).

CREATE OR REPLACE FUNCTION fail_job(p_job_id UUID, p_error TEXT, p_should_retry BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Always set status to failed (no automatic retry)
  -- p_should_retry parameter kept for API compatibility but ignored
  -- retry_count and max_retries fields preserved for historical data
  UPDATE jobs
  SET
    status = 'failed',
    error = p_error,
    completed_at = NOW(),
    updated_at = NOW(),
    locked_by = NULL,
    locked_at = NULL
  WHERE id = p_job_id;
END;
$$;

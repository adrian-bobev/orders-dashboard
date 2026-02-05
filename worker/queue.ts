import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '../lib/database.types'
import type { Job } from '../lib/queue/types'
import { logger } from './utils/logger'

// Create Supabase client for worker (can't use the server client as it uses Next.js cookies)
function createWorkerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

let supabase: ReturnType<typeof createWorkerSupabaseClient> | null = null
const STALE_TIMEOUT_MINUTES = 5

function getSupabase() {
  if (!supabase) {
    supabase = createWorkerSupabaseClient()
  }
  return supabase
}

/**
 * Claim the next available job using the database function
 */
export async function claimNextJob(workerId: string): Promise<Job | null> {
  const { data, error } = await getSupabase().rpc('claim_next_job', {
    p_worker_id: workerId,
    p_stale_timeout_minutes: STALE_TIMEOUT_MINUTES,
  })

  if (error) {
    logger.error('Failed to claim job', { error: error.message })
    return null
  }

  // The function returns SETOF jobs, so data is an array
  const jobs = data as Job[] | null
  if (!jobs || jobs.length === 0) {
    return null
  }

  return jobs[0]
}

/**
 * Mark a job as completed
 */
export async function completeJob(jobId: string, result?: object): Promise<void> {
  const { error } = await getSupabase().rpc('complete_job', {
    p_job_id: jobId,
    p_result: (result ?? null) as Json,
  })

  if (error) {
    logger.error('Failed to complete job', { jobId, error: error.message })
    throw new Error(`Failed to complete job: ${error.message}`)
  }

  logger.info('Job completed', { jobId })
}

/**
 * Mark a job as failed
 */
export async function failJob(
  jobId: string,
  error: string,
  shouldRetry: boolean = true
): Promise<void> {
  const { error: dbError } = await getSupabase().rpc('fail_job', {
    p_job_id: jobId,
    p_error: error,
    p_should_retry: shouldRetry,
  })

  if (dbError) {
    logger.error('Failed to mark job as failed', { jobId, error: dbError.message })
    throw new Error(`Failed to mark job as failed: ${dbError.message}`)
  }

  logger.info('Job failed', { jobId, error, shouldRetry })
}

/**
 * Update job progress (optional, for long-running jobs)
 */
export async function updateJobProgress(
  jobId: string,
  progress: { stage?: string; percent?: number }
): Promise<void> {
  const { error } = await getSupabase()
    .from('jobs')
    .update({
      result: progress as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')

  if (error) {
    logger.warn('Failed to update job progress', { jobId, error: error.message })
  }
}

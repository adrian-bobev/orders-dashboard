import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Job, JobType, JobPayload, QueueJobOptions } from './types'
import type { Json } from '@/lib/database.types'

/**
 * Check if a duplicate job already exists (pending or processing)
 * Returns the existing job if found, null otherwise
 */
export async function findExistingJob(
  type: JobType,
  payload: JobPayload
): Promise<Job | null> {
  const supabase = createServiceRoleClient()

  // Build payload filter based on job type
  // For PRINT_GENERATION: match woocommerceOrderId
  // For PREVIEW_GENERATION: match orderId
  let payloadFilter: string | null = null

  if (type === 'PRINT_GENERATION' && 'woocommerceOrderId' in payload) {
    payloadFilter = `payload->>woocommerceOrderId.eq.${payload.woocommerceOrderId}`
  } else if (type === 'PREVIEW_GENERATION' && 'orderId' in payload) {
    payloadFilter = `payload->>orderId.eq.${payload.orderId}`
  } else if (type === 'CONTENT_GENERATION' && 'generationId' in payload) {
    payloadFilter = `payload->>generationId.eq.${payload.generationId}`
  }

  if (!payloadFilter) {
    return null // Can't deduplicate without a key
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('type', type)
    .in('status', ['pending', 'processing'])
    .or(payloadFilter)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('Failed to check for duplicate job:', error.message)
    return null // Fail open - allow the job to be queued
  }

  return data
}

/**
 * Queue a new job for async processing
 * @param skipDuplicateCheck - If true, skips the duplicate check (default: false)
 */
export async function queueJob<T extends JobType>(
  type: T,
  payload: JobPayload,
  options?: QueueJobOptions & { skipDuplicateCheck?: boolean }
): Promise<{ jobId: string; isDuplicate?: boolean; existingJobId?: string }> {
  const supabase = createServiceRoleClient()

  // Check for duplicates unless explicitly skipped
  if (!options?.skipDuplicateCheck) {
    const existingJob = await findExistingJob(type, payload)
    if (existingJob) {
      console.log(`Duplicate job found for ${type}, returning existing job ${existingJob.id}`)
      return {
        jobId: existingJob.id,
        isDuplicate: true,
        existingJobId: existingJob.id,
      }
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      type,
      payload: payload as unknown as Json,
      priority: options?.priority ?? 10,
      max_retries: options?.maxRetries ?? 3,
      scheduled_for: options?.scheduledFor?.toISOString() ?? new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`)
  }

  return { jobId: data.id }
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string): Promise<Job | null> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    throw new Error(`Failed to get job status: ${error.message}`)
  }

  return data
}

/**
 * Create a new job from a failed one (retrigger)
 */
export async function retriggerJob(jobId: string): Promise<{ newJobId: string }> {
  const supabase = createServiceRoleClient()

  // Get the original job
  const { data: originalJob, error: fetchError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (fetchError || !originalJob) {
    throw new Error(`Failed to find job to retrigger: ${fetchError?.message || 'Not found'}`)
  }

  if (originalJob.status !== 'failed' && originalJob.status !== 'cancelled') {
    throw new Error('Can only retrigger failed or cancelled jobs')
  }

  // Create a new job with the same payload
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      type: originalJob.type,
      payload: originalJob.payload,
      priority: originalJob.priority,
      max_retries: originalJob.max_retries,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create retriggered job: ${error.message}`)
  }

  return { newJobId: data.id }
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.rpc('cancel_job', {
    p_job_id: jobId,
  })

  if (error) {
    throw new Error(`Failed to cancel job: ${error.message}`)
  }

  return data as boolean
}

/**
 * Force cancel a stuck processing job
 * This bypasses the normal cancel which only works for pending jobs
 */
export async function forceCancelJob(jobId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error: 'Force cancelled by admin',
      locked_by: null,
      locked_at: null,
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .select('id')

  if (error) {
    throw new Error(`Failed to force cancel job: ${error.message}`)
  }

  return (data?.length ?? 0) > 0
}

/**
 * List jobs with optional filters
 */
export async function listJobs(options?: {
  status?: Job['status']
  type?: JobType
  orderId?: string
  limit?: number
  offset?: number
}): Promise<{ jobs: Job[]; total: number }> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.type) {
    query = query.eq('type', options.type)
  }

  // Filter by order ID in the payload JSON
  // The order ID can be stored as woocommerceOrderId, wooOrderId, or orderNumber
  // Use ->> for text extraction and ilike for partial matching
  if (options?.orderId) {
    query = query.or(
      `payload->>woocommerceOrderId.ilike.%${options.orderId}%,` +
      `payload->>wooOrderId.ilike.%${options.orderId}%,` +
      `payload->>orderNumber.ilike.%${options.orderId}%`
    )
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to list jobs: ${error.message}`)
  }

  return {
    jobs: data || [],
    total: count || 0,
  }
}

/**
 * Get job statistics for the dashboard
 */
export async function getJobStats(hours: number = 24): Promise<{
  pending: number
  processing: number
  completed: number
  failed: number
}> {
  const supabase = createServiceRoleClient()
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('jobs')
    .select('status')
    .gte('created_at', since)

  if (error) {
    throw new Error(`Failed to get job stats: ${error.message}`)
  }

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  }

  for (const job of data || []) {
    if (job.status in stats) {
      stats[job.status as keyof typeof stats]++
    }
  }

  return stats
}

import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Job, JobType, JobPayload, QueueJobOptions } from './types'
import type { Json } from '@/lib/database.types'

/**
 * Queue a new job for async processing
 */
export async function queueJob<T extends JobType>(
  type: T,
  payload: JobPayload,
  options?: QueueJobOptions
): Promise<{ jobId: string }> {
  const supabase = createServiceRoleClient()

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
  if (options?.orderId) {
    query = query.or(
      `payload->woocommerceOrderId.eq.${options.orderId},` +
      `payload->wooOrderId.eq.${options.orderId},` +
      `payload->orderNumber.eq.${options.orderId},` +
      `payload->>woocommerceOrderId.eq.${options.orderId},` +
      `payload->>wooOrderId.eq.${options.orderId},` +
      `payload->>orderNumber.eq.${options.orderId}`
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

import type { Database } from '@/lib/database.types'

export type JobType = Database['public']['Enums']['job_type']
export type JobStatus = Database['public']['Enums']['job_status']
export type Job = Database['public']['Tables']['jobs']['Row']
export type JobInsert = Database['public']['Tables']['jobs']['Insert']

// Payload types for each job type
export interface PrintGenerationPayload {
  woocommerceOrderId: number
  orderId: string
  orderNumber?: string
  includeShippingLabel?: boolean // defaults to true if not specified
}

export interface PreviewGenerationPayload {
  orderId: string
  wooOrderId: string
  orderNumber?: string
  // Optional: include notification details for sending after preview generation
  sendNotifications?: boolean
  customerEmail?: string
  customerName?: string
  books?: Array<{ childName: string; storyName: string }>
}

export interface ContentGenerationPayload {
  generationId: string
  bookConfigId: string
  step?: number
}

// Union type for all payloads
export type JobPayload =
  | PrintGenerationPayload
  | PreviewGenerationPayload
  | ContentGenerationPayload

// Result types for each job type
export interface PrintGenerationResult {
  success: boolean
  books: Array<{
    childName: string
    storyName: string
    downloadPath: string
  }>
  error?: string
}

export interface PreviewGenerationResult {
  success: boolean
  r2Folders: string[]
  error?: string
}

export interface ContentGenerationResult {
  success: boolean
  step?: number
  error?: string
}

// Job with typed payload/result
export interface TypedJob<T extends JobType> extends Omit<Job, 'payload' | 'result'> {
  type: T
  payload: T extends 'PRINT_GENERATION'
    ? PrintGenerationPayload
    : T extends 'PREVIEW_GENERATION'
    ? PreviewGenerationPayload
    : T extends 'CONTENT_GENERATION'
    ? ContentGenerationPayload
    : never
  result: T extends 'PRINT_GENERATION'
    ? PrintGenerationResult | null
    : T extends 'PREVIEW_GENERATION'
    ? PreviewGenerationResult | null
    : T extends 'CONTENT_GENERATION'
    ? ContentGenerationResult | null
    : never
}

// Options for queuing a job
export interface QueueJobOptions {
  priority?: number
  maxRetries?: number
  scheduledFor?: Date
}

// Job handler function type
export type JobHandler<T extends JobType> = (
  job: TypedJob<T>
) => Promise<object | void>

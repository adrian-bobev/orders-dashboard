import type { Job, JobType } from '../../lib/queue/types'
import { handlePrintGeneration } from './print-generation'
import { handlePreviewGeneration } from './preview-generation'
import { logger } from '../utils/logger'

type HandlerFunction = (job: Job) => Promise<object | void>

// Registry of job handlers
// We cast the handlers to HandlerFunction since they expect typed payloads
// but at runtime we handle the generic Job type
const handlers: Record<JobType, HandlerFunction> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PRINT_GENERATION: handlePrintGeneration as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PREVIEW_GENERATION: handlePreviewGeneration as any,
  CONTENT_GENERATION: async (job) => {
    // Placeholder for future content generation handler
    logger.warn('CONTENT_GENERATION handler not implemented', { jobId: job.id })
    throw new Error('CONTENT_GENERATION handler not implemented')
  },
}

/**
 * Get the handler function for a job type
 */
export function getHandler(type: JobType): HandlerFunction | undefined {
  return handlers[type]
}

/**
 * Execute a job using the appropriate handler
 */
export async function executeJob(job: Job): Promise<object | void> {
  const handler = getHandler(job.type)

  if (!handler) {
    throw new Error(`No handler registered for job type: ${job.type}`)
  }

  return handler(job)
}

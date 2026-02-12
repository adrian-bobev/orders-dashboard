import { config } from 'dotenv'
config({ path: '.env.local' })
import { randomUUID } from 'crypto'
import { claimNextJob, completeJob, failJob } from './queue'
import { executeJob } from './handlers'
import { logger } from './utils/logger'
import { setupGracefulShutdown, onShutdown, isShutdownRequested } from './utils/graceful-shutdown'
import { createHttpServer } from './http-server'

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '3600000', 10) // Default 1 hour
const WORKER_HTTP_PORT = parseInt(process.env.WORKER_HTTP_PORT || '4000', 10)
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`

let isProcessing = false
let currentJobId: string | null = null
let wakeResolver: (() => void) | null = null

async function processNextJob(): Promise<boolean> {
  if (isShutdownRequested()) {
    logger.info('Shutdown requested, skipping job claim')
    return false
  }

  try {
    const job = await claimNextJob(WORKER_ID)

    if (!job) {
      return false // No job available
    }

    currentJobId = job.id
    isProcessing = true

    logger.info('Processing job', {
      jobId: job.id,
      type: job.type,
      retryCount: job.retry_count,
    })

    try {
      const result = await executeJob(job)
      await completeJob(job.id, result as object | undefined)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Job execution failed', {
        jobId: job.id,
        type: job.type,
        error: errorMessage,
      })

      // No auto-retry - failed jobs require manual investigation and retrigger
      await failJob(job.id, errorMessage, false)
    }

    return true
  } catch (error) {
    logger.error('Error in job processing loop', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  } finally {
    isProcessing = false
    currentJobId = null
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sleep that can be interrupted by wake signal
 */
async function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms)
    wakeResolver = () => {
      clearTimeout(timeout)
      resolve()
    }
  })
}

/**
 * Called by HTTP server when /wake is hit
 */
function triggerWake(): void {
  if (wakeResolver) {
    wakeResolver()
    wakeResolver = null
  }
}

async function workerLoop(): Promise<void> {
  logger.info('Worker loop started', { workerId: WORKER_ID, pollInterval: POLL_INTERVAL_MS })

  while (!isShutdownRequested()) {
    const hadJob = await processNextJob()

    if (hadJob) {
      // Job found - immediately check for next job (no sleep)
      continue
    } else {
      // No job - sleep for poll interval (interruptible by wake)
      logger.debug('No jobs found, sleeping', { sleepMs: POLL_INTERVAL_MS })
      await interruptibleSleep(POLL_INTERVAL_MS)
    }
  }

  logger.info('Worker loop ended')
}

async function main(): Promise<void> {
  logger.info('Starting worker', { workerId: WORKER_ID })

  // Setup graceful shutdown
  setupGracefulShutdown()

  // Start HTTP server for health checks and wake endpoint
  const httpServer = createHttpServer(WORKER_HTTP_PORT, triggerWake)

  // Register shutdown callback to wait for current job
  onShutdown(async () => {
    // Close HTTP server
    httpServer.close()

    if (isProcessing && currentJobId) {
      logger.info('Waiting for current job to complete...', { jobId: currentJobId })
      // Wait up to 30 seconds for current job to complete
      const maxWait = 30000
      const checkInterval = 1000
      let waited = 0

      while (isProcessing && waited < maxWait) {
        await sleep(checkInterval)
        waited += checkInterval
      }

      if (isProcessing) {
        logger.warn('Job did not complete within timeout, job will be reclaimed by another worker')
      }
    }
  })

  // Start the worker loop
  await workerLoop()
}

main().catch((error) => {
  logger.error('Worker crashed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})

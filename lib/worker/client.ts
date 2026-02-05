const WORKER_URL = process.env.WORKER_URL || 'http://worker:4000'
const WORKER_WAKE_TOKEN = process.env.WORKER_WAKE_TOKEN

/**
 * Wake the worker to immediately check for pending jobs.
 * Fire-and-forget - failures are logged but don't throw.
 */
export async function wakeWorker(): Promise<void> {
  const response = await fetch(`${WORKER_URL}/wake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(WORKER_WAKE_TOKEN && { 'x-worker-token': WORKER_WAKE_TOKEN }),
    },
  })

  if (!response.ok) {
    throw new Error(`Worker wake failed: ${response.status}`)
  }
}

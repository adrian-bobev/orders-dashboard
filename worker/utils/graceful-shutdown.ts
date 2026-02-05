import { logger } from './logger'

type ShutdownCallback = () => Promise<void>

const shutdownCallbacks: ShutdownCallback[] = []
let isShuttingDown = false

export function onShutdown(callback: ShutdownCallback): void {
  shutdownCallbacks.push(callback)
}

export function isShutdownRequested(): boolean {
  return isShuttingDown
}

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal })
    return
  }

  isShuttingDown = true
  logger.info(`Received ${signal}, starting graceful shutdown...`)

  // Run all shutdown callbacks
  for (const callback of shutdownCallbacks) {
    try {
      await callback()
    } catch (error) {
      logger.error('Error during shutdown callback', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('Graceful shutdown complete')
  process.exit(0)
}

export function setupGracefulShutdown(): void {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'))
  process.on('SIGINT', () => handleShutdown('SIGINT'))

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    })
    handleShutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    })
    // Don't exit on unhandled rejection, just log it
  })

  logger.info('Graceful shutdown handlers registered')
}

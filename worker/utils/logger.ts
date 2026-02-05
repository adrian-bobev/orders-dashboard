export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  return ' ' + JSON.stringify(meta)
}

export function createLogger(prefix: string = 'worker'): Logger {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.log(`[${formatTimestamp()}] [${prefix}] INFO: ${message}${formatMeta(meta)}`)
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(`[${formatTimestamp()}] [${prefix}] WARN: ${message}${formatMeta(meta)}`)
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(`[${formatTimestamp()}] [${prefix}] ERROR: ${message}${formatMeta(meta)}`)
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.DEBUG === 'true') {
        console.log(`[${formatTimestamp()}] [${prefix}] DEBUG: ${message}${formatMeta(meta)}`)
      }
    },
  }
}

export const logger = createLogger()

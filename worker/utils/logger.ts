export interface LogContext {
  wooOrderId?: number | string
  bookConfigId?: number | string
  generationId?: string
  phase?: string
}

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>, context?: LogContext) => void
  warn: (message: string, meta?: Record<string, unknown>, context?: LogContext) => void
  error: (message: string, meta?: Record<string, unknown>, context?: LogContext) => void
  debug: (message: string, meta?: Record<string, unknown>, context?: LogContext) => void
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function formatContext(context?: LogContext): string {
  if (!context) return ''

  const parts: string[] = []
  if (context.wooOrderId !== undefined) {
    parts.push(`[wooOrderId:${context.wooOrderId}]`)
  }
  if (context.bookConfigId !== undefined) {
    parts.push(`[configId:${context.bookConfigId}]`)
  }
  if (context.generationId !== undefined) {
    parts.push(`[genId:${context.generationId}]`)
  }
  if (context.phase !== undefined) {
    parts.push(`[phase:${context.phase}]`)
  }

  return parts.join('')
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  return ' ' + JSON.stringify(meta)
}

export function createLogger(prefix: string = 'worker'): Logger {
  return {
    info: (message: string, meta?: Record<string, unknown>, context?: LogContext) => {
      const contextStr = formatContext(context)
      console.log(`[${formatTimestamp()}] [${prefix}]${contextStr} INFO: ${message}${formatMeta(meta)}`)
    },
    warn: (message: string, meta?: Record<string, unknown>, context?: LogContext) => {
      const contextStr = formatContext(context)
      console.warn(`[${formatTimestamp()}] [${prefix}]${contextStr} WARN: ${message}${formatMeta(meta)}`)
    },
    error: (message: string, meta?: Record<string, unknown>, context?: LogContext) => {
      const contextStr = formatContext(context)
      console.error(`[${formatTimestamp()}] [${prefix}]${contextStr} ERROR: ${message}${formatMeta(meta)}`)
    },
    debug: (message: string, meta?: Record<string, unknown>, context?: LogContext) => {
      if (process.env.DEBUG === 'true') {
        const contextStr = formatContext(context)
        console.log(`[${formatTimestamp()}] [${prefix}]${contextStr} DEBUG: ${message}${formatMeta(meta)}`)
      }
    },
  }
}

export const logger = createLogger()

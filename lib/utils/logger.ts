/**
 * Structured logging utility with trace context support
 *
 * Provides consistent log formatting across services:
 * [timestamp] [prefix] [wooOrderId:X][configId:Y][genId:Z][phase:P] LEVEL: message {json}
 *
 * Usage:
 *   const logger = createLogger('PrintService');
 *   const context = { wooOrderId: 123, phase: 'print-generation' };
 *   logger.info('Starting print generation', { bookCount: 2 }, context);
 */

export interface LogContext {
  wooOrderId?: number | string;
  bookConfigId?: number | string;
  generationId?: string;
  phase?: string;
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Formats log context into bracketed string
 * Example: [wooOrderId:123][configId:456][genId:abc][phase:step5]
 */
function formatContext(context?: LogContext): string {
  if (!context) return '';

  const parts: string[] = [];
  if (context.wooOrderId !== undefined) {
    parts.push(`[wooOrderId:${context.wooOrderId}]`);
  }
  if (context.bookConfigId !== undefined) {
    parts.push(`[configId:${context.bookConfigId}]`);
  }
  if (context.generationId !== undefined) {
    parts.push(`[genId:${context.generationId}]`);
  }
  if (context.phase !== undefined) {
    parts.push(`[phase:${context.phase}]`);
  }

  return parts.join('');
}

/**
 * Formats log message with timestamp, prefix, context, level, and optional metadata
 */
function formatLogMessage(
  prefix: string,
  level: LogLevel,
  message: string,
  metadata?: LogMetadata,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const contextStr = formatContext(context);
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';

  return `[${timestamp}] [${prefix}]${contextStr} ${level}: ${message}${metaStr}`;
}

interface Logger {
  debug(message: string, metadata?: LogMetadata, context?: LogContext): void;
  info(message: string, metadata?: LogMetadata, context?: LogContext): void;
  warn(message: string, metadata?: LogMetadata, context?: LogContext): void;
  error(message: string, metadata?: LogMetadata, context?: LogContext): void;
}

/**
 * Creates a logger instance with the specified prefix
 *
 * @param prefix - Service or component name (e.g., 'PrintService', 'worker')
 * @returns Logger instance with debug, info, warn, error methods
 */
export function createLogger(prefix: string): Logger {
  return {
    debug(message: string, metadata?: LogMetadata, context?: LogContext): void {
      console.debug(formatLogMessage(prefix, 'DEBUG', message, metadata, context));
    },

    info(message: string, metadata?: LogMetadata, context?: LogContext): void {
      console.log(formatLogMessage(prefix, 'INFO', message, metadata, context));
    },

    warn(message: string, metadata?: LogMetadata, context?: LogContext): void {
      console.warn(formatLogMessage(prefix, 'WARN', message, metadata, context));
    },

    error(message: string, metadata?: LogMetadata, context?: LogContext): void {
      console.error(formatLogMessage(prefix, 'ERROR', message, metadata, context));
    },
  };
}

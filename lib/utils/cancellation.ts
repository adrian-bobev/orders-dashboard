/**
 * Cancellation utilities for graceful job abortion
 *
 * Provides helpers to check AbortSignal throughout the generation pipeline,
 * enabling mid-execution cancellation with proper cleanup.
 */

import { LogContext, createLogger } from './logger';

const logger = createLogger('Cancellation');

/**
 * Custom error thrown when operation is cancelled
 */
export class CancellationError extends Error {
  constructor(message = 'Operation cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

/**
 * Checks if signal is aborted and throws CancellationError if so
 *
 * @param signal - Optional AbortSignal to check
 * @param context - Optional log context for tracing
 * @throws {CancellationError} If signal is aborted
 */
export function checkCancellation(signal?: AbortSignal, context?: LogContext): void {
  if (signal?.aborted) {
    const contextStr = context
      ? ` (${Object.entries(context)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')})`
      : '';
    logger.info(`Operation cancelled${contextStr}`, undefined, context);
    throw new CancellationError();
  }
}

/**
 * Signal-aware Promise.all that checks cancellation before and after promises
 *
 * @param promises - Array of promises to await
 * @param signal - Optional AbortSignal to check
 * @param context - Optional log context for tracing
 * @returns Promise resolving to array of results
 * @throws {CancellationError} If signal is aborted
 */
export async function promiseAllWithSignal<T>(
  promises: Promise<T>[],
  signal?: AbortSignal,
  context?: LogContext
): Promise<T[]> {
  checkCancellation(signal, context);

  const results = await Promise.all(promises);

  checkCancellation(signal, context);

  return results;
}

/**
 * Interruptible sleep that can be cancelled via signal
 *
 * @param ms - Milliseconds to sleep
 * @param signal - Optional AbortSignal to check
 * @returns Promise that resolves after delay or rejects if cancelled
 * @throws {CancellationError} If signal is aborted during sleep
 */
export async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  checkCancellation(signal);

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new CancellationError());
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Wraps an async function to make it cancellable
 *
 * @param fn - Async function to wrap
 * @param signal - AbortSignal to check
 * @param context - Optional log context
 * @returns Promise that rejects with CancellationError if signal aborts
 */
export async function withCancellation<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  context?: LogContext
): Promise<T> {
  checkCancellation(signal, context);

  const result = await fn();

  checkCancellation(signal, context);

  return result;
}

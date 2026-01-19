/**
 * Next.js instrumentation file
 * Runs on application startup (both server and edge runtimes)
 */

export async function register() {
  // Only run on server startup, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logEnvValidation } = await import('./lib/env-validation')
    logEnvValidation()
  }
}

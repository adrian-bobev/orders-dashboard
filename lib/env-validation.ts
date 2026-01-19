/**
 * Environment variable validation
 * Run at application startup to ensure required env vars are set
 */

interface EnvVar {
  name: string
  required: boolean
  description: string
}

const ENV_VARS: EnvVar[] = [
  // Supabase - Required for database
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, description: 'Supabase project URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anonymous key' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, description: 'Supabase service role key (for admin operations)' },

  // R2/S3 Storage - Required for image storage
  { name: 'R2_ENDPOINT', required: true, description: 'R2/S3 endpoint URL' },
  { name: 'R2_ACCESS_KEY_ID', required: true, description: 'R2/S3 access key ID' },
  { name: 'R2_SECRET_ACCESS_KEY', required: true, description: 'R2/S3 secret access key' },
  { name: 'R2_BUCKET', required: true, description: 'R2/S3 bucket for child images' },
  { name: 'R2_GENERATIONS_BUCKET', required: true, description: 'R2/S3 bucket for generation images' },

  // AI Services - Required unless USE_MOCK_AI=true
  { name: 'FAL_KEY', required: false, description: 'FAL AI API key (required if USE_MOCK_AI is not true)' },
  { name: 'OPENAI_API_KEY', required: false, description: 'OpenAI API key (required if USE_MOCK_AI is not true)' },

  // WooCommerce - Optional
  { name: 'WOOCOMMERCE_STORE_URL', required: false, description: 'WooCommerce store URL' },
  { name: 'WOOCOMMERCE_CONSUMER_KEY', required: false, description: 'WooCommerce API consumer key' },
  { name: 'WOOCOMMERCE_CONSUMER_SECRET', required: false, description: 'WooCommerce API consumer secret' },
  { name: 'WOOCOMMERCE_WEBHOOK_SECRET', required: false, description: 'WooCommerce webhook secret' },

  // Telegram - Optional
  { name: 'TELEGRAM_BOT_TOKEN', required: false, description: 'Telegram bot token for notifications' },
  { name: 'TELEGRAM_CHAT_ID', required: false, description: 'Telegram chat ID for notifications' },
]

export interface EnvValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnv(): EnvValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const useMockAI = process.env.USE_MOCK_AI === 'true'

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name]

    if (envVar.required && !value) {
      errors.push(`Missing required env var: ${envVar.name} - ${envVar.description}`)
    } else if (!envVar.required && !value) {
      // Special case for AI keys
      if ((envVar.name === 'FAL_KEY' || envVar.name === 'OPENAI_API_KEY') && !useMockAI) {
        errors.push(`Missing ${envVar.name} - ${envVar.description}. Set USE_MOCK_AI=true to use mock AI.`)
      } else {
        warnings.push(`Optional env var not set: ${envVar.name} - ${envVar.description}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function logEnvValidation(): void {
  const result = validateEnv()

  if (result.errors.length > 0) {
    console.error('\n❌ Environment validation failed:\n')
    result.errors.forEach((error) => console.error(`  - ${error}`))
    console.error('\nPlease set the required environment variables and restart the application.\n')
  }

  if (result.warnings.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('\n⚠️  Optional environment variables not set:\n')
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`))
    console.warn('\n')
  }

  if (result.valid) {
    console.log('✅ Environment validation passed')
  }
}

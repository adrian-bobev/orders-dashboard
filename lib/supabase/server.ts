import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

// Server-side URL may differ from client-side URL in Docker environments
const getServerSupabaseUrl = () => {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    getServerSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Create a service role client for server-side operations
 * that don't require user authentication (e.g., webhooks)
 * This bypasses RLS policies and has full database access
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    getServerSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

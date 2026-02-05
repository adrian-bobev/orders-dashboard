import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Server-side URL may differ from client-side URL in Docker environments
const getServerSupabaseUrl = () => {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    getServerSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // IMPORTANT: Don't use getUser() in middleware - it causes 403
  // Instead, just refresh the session which handles auth properly
  await supabase.auth.getSession()

  // Protected routes - redirect to sign-in if not authenticated
  const isProtectedRoute = !request.nextUrl.pathname.startsWith('/sign-in') &&
    !request.nextUrl.pathname.startsWith('/sign-up') &&
    !request.nextUrl.pathname.startsWith('/api/webhooks') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    request.nextUrl.pathname !== '/'

  // Check if we have auth cookies
  const hasAuthCookie = request.cookies.getAll()
    .some(cookie => cookie.name.includes('auth-token'))

  if (!hasAuthCookie && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

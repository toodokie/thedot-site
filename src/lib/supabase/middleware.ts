import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseFetch, SUPABASE_MIDDLEWARE_TIMEOUT_MS } from './request-timeout'

export async function refreshPortalSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: createSupabaseFetch(SUPABASE_MIDDLEWARE_TIMEOUT_MS),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(list, headers) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // @supabase/ssr 0.12.x passes cache-prevention headers alongside the
          // cookies (Cache-Control / Expires / Pragma); copy them so a session
          // response is never cached by a CDN or reverse proxy.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )
  // getClaims verifies the access token locally when the project uses asymmetric signing keys.
  // It can still refresh an expiring session, which keeps the existing cookie propagation intact,
  // without sending every protected page request through the regional Auth user endpoint.
  const { data, error } = await supabase.auth.getClaims()
  const userId = typeof data?.claims.sub === 'string' ? data.claims.sub : null
  return { response, userId, error }
}

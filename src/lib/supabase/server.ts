import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createSupabaseFetch, SUPABASE_SERVER_TIMEOUT_MS } from './request-timeout'

// Read-only by default (safe in Server Components, where cookie mutation throws and the middleware
// already handles refresh). Pass { writable: true } from Route Handlers (auth callback, logout) that
// must set the session cookie, so a genuine write failure surfaces instead of being swallowed.
export async function createSupabaseServer({ writable = false }: { writable?: boolean } = {}) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: createSupabaseFetch(SUPABASE_SERVER_TIMEOUT_MS),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(list) {
          if (!writable) return // Server Components cannot set cookies; skip silently
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

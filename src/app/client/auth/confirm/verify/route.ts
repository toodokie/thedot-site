import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/auth-js'
import { safeNext } from '@/lib/portal/redirect'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

// POST target for the prefetch-proof confirm page's "Sign in" button. A mail scanner only ever GETs the
// confirm page (plain HTML, no token spent); the single-use token is verified here ONLY on the human's
// explicit POST. This mirrors the /client/auth/callback route handler, whose session-cookie persistence
// across a redirect is proven, rather than a Server Action (which did not persist the session).
//
// Cookie hygiene: repeated failed login attempts (the pre-fix loop) can leave stale sb-* auth cookies
// (chunked remnants, PKCE code verifiers) that confuse later session reads. We record which cookies the
// fresh verify writes and expire every other sb-* cookie on the response.
export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const form = await request.formData()
  const tokenHash = String(form.get('token_hash') || '')
  const rawType = String(form.get('type') || 'email')
  const type: EmailOtpType = OTP_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : 'email'
  const destination = safeNext(String(form.get('next') || ''), origin) // validated same-origin /client path

  // 303 so the browser issues a GET on the target (a form POST must not carry through as a POST).
  const seeOther = (url: string | URL) => {
    const res = NextResponse.redirect(url, 303)
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }
  // 'expired' keeps the login page's message honest: with single-use tokens, a failed verify almost
  // always means the link was superseded or already used, not a system fault.
  const fail = seeOther(`${origin}/client/login?error=expired`)

  if (!tokenHash) return fail
  const cookieStore = await cookies()
  const preexisting = cookieStore.getAll().map((c) => c.name)
  const written = new Set<string>()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(list) {
          list.forEach(({ name, value, options }) => {
            written.add(name)
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return fail
  for (const name of preexisting) {
    if (name.startsWith('sb-') && !written.has(name)) cookieStore.delete(name)
  }
  return seeOther(destination)
}

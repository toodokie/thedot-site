import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAuthSessionMissingError } from '@supabase/auth-js'
import type { EmailOtpType } from '@supabase/auth-js'
import { safeNext } from '@/lib/portal/redirect'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

// POST target for the prefetch-proof confirm page's "Sign in" button. A mail scanner only ever GETs the
// confirm page (plain HTML, no token spent); the single-use token is verified here ONLY on the human's
// explicit POST. Route handler (not a Server Action) so the session cookie provably persists.
//
// Cookie hygiene (Codex review 2026-07-20): stale sb-* cookies (chunk remnants, PKCE code verifiers)
// from failed attempts are expired on EVERY exit that leaves no valid session, and after a successful
// verify. The one exception is the dead-token-with-live-session fallthrough, where the preexisting
// cookies ARE the session and must survive.
export async function POST(request: Request) {
  const { origin } = new URL(request.url)

  // Same-origin gate: a state-changing POST; the confirm page's form is same-origin and every current
  // browser sends Origin on form POSTs. Missing or foreign Origin is rejected outright.
  const originHeader = request.headers.get('origin')
  if (originHeader !== origin) return new NextResponse('Forbidden', { status: 403 })

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
  // Expire every preexisting sb-* cookie the current attempt did not (re)write.
  const purgeStale = () => {
    for (const name of preexisting) {
      if (name.startsWith('sb-') && !written.has(name)) cookieStore.delete(name)
    }
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      purgeStale()
      return seeOther(destination)
    }
  }

  // Dead or missing token. If a live session exists (browser preloader consumed the link, double click,
  // reopened tab), continue into the portal; the preexisting cookies are that session, so no purge.
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (user) return seeOther(destination)

  // No session at all: everything sb-* left over is stale. Purge before the visible failure, and keep
  // an auth-service outage distinguishable from a genuinely dead link.
  purgeStale()
  const code = userError && !isAuthSessionMissingError(userError) ? 'service' : 'expired'
  return seeOther(`${origin}/client/login?error=${code}`)
}

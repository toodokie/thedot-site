import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/auth-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { safeNext } from '@/lib/portal/redirect'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

// POST target for the prefetch-proof confirm page's "Sign in" button. A mail scanner only ever GETs the
// confirm page (plain HTML, no token spent); the single-use token is verified here ONLY on the human's
// explicit POST. This mirrors the /client/auth/callback route handler, whose session-cookie persistence
// across a redirect is proven, rather than a Server Action (which did not persist the session).
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
  const fail = seeOther(`${origin}/client/login?error=auth`)

  if (!tokenHash) return fail
  const supabase = await createSupabaseServer({ writable: true }) // sets the session cookie on success
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return fail
  return seeOther(destination)
}

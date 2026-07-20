import { NextResponse } from 'next/server'
import { isAuthSessionMissingError } from '@supabase/auth-js'
import type { EmailOtpType } from '@supabase/auth-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { safeNext } from '@/lib/portal/redirect'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')            // default template (PKCE, same-device)
  const tokenHash = searchParams.get('token_hash') // token_hash template / admin-minted link
  const rawType = searchParams.get('type')         // Supabase sets this in the link; default to 'email'
  const type: EmailOtpType = OTP_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : 'email'
  const destination = safeNext(searchParams.get('next'), origin) // validated: no off-origin open redirect
  const noStore = { headers: { 'Cache-Control': 'private, no-store' } }
  const supabase = await createSupabaseServer({ writable: true })
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(destination, noStore)
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(destination, noStore)
  }
  // A dead code/token with a LIVE session (browser preloaders consume one-time links before the human
  // presses Enter, double clicks, re-opened tabs) should land in the portal, not at the login form.
  // Keep an auth-service outage distinguishable from a genuinely dead link (Codex review 2026-07-20).
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (user) return NextResponse.redirect(destination, noStore)
  const errCode = userError && !isAuthSessionMissingError(userError) ? 'service' : 'expired'
  return NextResponse.redirect(`${origin}/client/login?error=${errCode}`, noStore)
}

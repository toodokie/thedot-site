import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { safeNext } from '@/lib/portal/redirect'
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')            // default template (PKCE, same-device)
  const tokenHash = searchParams.get('token_hash') // custom token_hash template (cross-device, needs SMTP)
  const destination = safeNext(searchParams.get('next'), origin) // validated: no off-origin open redirect
  const noStore = { headers: { 'Cache-Control': 'private, no-store' } }
  const supabase = await createSupabaseServer({ writable: true })
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(destination, noStore)
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }) // fixed type
    if (!error) return NextResponse.redirect(destination, noStore)
  }
  return NextResponse.redirect(`${origin}/client/login?error=auth`, noStore)
}

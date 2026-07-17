'use server'
import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/auth-js'
import { createSupabaseServer } from '@/lib/supabase/server'

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

// Verifies the token_hash ONLY on an explicit button POST (a mail-scanner GET of the confirm page
// does not reach here, so it cannot consume the single-use link). Writable client: this sets the
// session cookie. `next` is validated to a same-origin /client path; redirect() is relative anyway.
export async function confirmSignIn(formData: FormData) {
  const raw = formData.get('token_hash')
  const tokenHash = typeof raw === 'string' ? raw : ''
  const rawType = String(formData.get('type') || 'email')
  const type: EmailOtpType = OTP_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : 'email'
  const nextRaw = String(formData.get('next') || '')
  const dest = nextRaw.startsWith('/client/') && !nextRaw.includes('\\') ? nextRaw : '/client/kanset'

  if (!tokenHash) redirect('/client/login?error=auth')
  const supabase = await createSupabaseServer({ writable: true })
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) redirect('/client/login?error=auth')
  redirect(dest)
}

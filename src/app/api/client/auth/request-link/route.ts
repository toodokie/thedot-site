import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { transporter } from '@/lib/email'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

// App-native portal sign-in email.
//
// We deliberately do NOT use Supabase's built-in magic-link email. Its default template links straight
// at the one-time /auth/v1/verify endpoint, which mail-provider link scanners (Google, Outlook Safe
// Links, corporate gateways) pre-open server-side and CONSUME before the human ever clicks. By the time
// the real click lands, the single-use token is already spent, the exchange fails, and the app bounces
// back to the email box: the endless "enter your email again" loop, independent of browser or device.
//
// Instead we mint a token_hash via the admin API and email a link to /client/auth/confirm, a
// prefetch-proof page that only spends the token on an explicit human button POST. A scanner GET merely
// renders the page. This also drops the PKCE code flow, so it works in ANY browser (no device-pinned
// verifier). Sent through the site's own SMTP transporter, so there is no Supabase template to maintain.

export const runtime = 'nodejs' // nodemailer + the service-role admin client require Node, not edge

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v)
}

function signinEmailHtml(url: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#faf9f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#35332f;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:20px;font-weight:600;margin:0 0 8px;">Your workspace</p>
    <p style="color:#68665f;margin:0 0 24px;">Click below to sign in. The link works once and expires in about an hour.</p>
    <a href="${url}" style="display:inline-block;background:#35332f;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;">Sign in to your workspace</a>
    <p style="color:#9a978f;font-size:13px;margin:28px 0 0;">If you did not request this, you can safely ignore this email.</p>
  </div>
</body></html>`
}

export async function POST(request: NextRequest) {
  // Always answer identically so the endpoint cannot be used to probe whether an address has an account.
  const generic = NextResponse.json({ ok: true })

  const ip = getClientIP(request)
  const limit = rateLimit(`portal-signin:${ip}`, { limit: 5, window: 15 * 60 * 1000 })
  if (!limit.success) return NextResponse.json({ ok: true }, { status: 200 })

  let email: unknown
  try {
    ;({ email } = await request.json())
  } catch {
    return generic
  }
  if (!isEmail(email)) return generic
  const target = email.toLowerCase()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin

  try {
    const admin = createSupabaseAdmin()

    // Only send to a provisioned portal member. This prevents enumeration AND ensures generateLink is
    // never asked to mint for a non-member (belt-and-suspenders against any auto-provision behavior).
    const { data: members, error: mErr } = await admin.rpc('list_portal_access')
    if (mErr) return generic
    const isMember =
      Array.isArray(members) &&
      members.some((m: { email?: string }) => typeof m?.email === 'string' && m.email.toLowerCase() === target)
    if (!isMember) return generic

    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: target })
    if (error || !data) return generic
    const props = data.properties as { hashed_token?: string; verification_type?: string }
    if (!props?.hashed_token) return generic
    const type = props.verification_type ?? 'magiclink'

    const url =
      `${origin}/client/auth/confirm` +
      `?token_hash=${encodeURIComponent(props.hashed_token)}` +
      `&type=${encodeURIComponent(type)}` +
      `&next=/client/kanset`

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: target,
      subject: 'Your sign-in link',
      text: `Sign in to your workspace:\n\n${url}\n\nThe link works once and expires in about an hour. If you did not request it, you can ignore this email.`,
      html: signinEmailHtml(url),
    })
  } catch {
    // Never surface an internal failure to the caller; the generic response also preserves non-enumeration.
    return generic
  }
  return generic
}

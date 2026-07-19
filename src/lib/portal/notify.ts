import { transporter } from '@/lib/email'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

// Only render a link for a validated https URL. Anything else (non-https, unparseable, an injection
// attempt) is dropped rather than interpolated into the href.
function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

// Durable path: sends one queued notification_outbox email. This THROWS on failure so the fenced
// consumer marks the row failed and retries with backoff. Only the notification consumer calls it.
// In v1 email is agency-only (enforced by the 0015 trigger). Supersedes the former best-effort
// notifyDecision/notifyComment helpers: alerts now flow through the outbox + consumer, not inline.
export async function sendPortalNotificationEmail(opts: {
  to: string
  subject: string
  bodyText: string
  url?: string | null
}): Promise<void> {
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  if (!from) throw new Error('FROM_EMAIL/SMTP_USER not configured')
  const link = safeHttpsUrl(opts.url)
  const html = `
    <div style="font-family: Arial, sans-serif; color: #35332f; max-width: 520px;">
      <p style="font-size: 18px; font-weight: 500; margin: 0 0 12px;">${escapeHtml(opts.subject)}</p>
      ${opts.bodyText ? `<p style="color:#47453f; margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(opts.bodyText)}</p>` : ''}
      ${link ? `<p style="margin: 0;"><a href="${escapeHtml(link)}" style="color:#35332f;">Open in the portal</a></p>` : ''}
    </div>`
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html })
}

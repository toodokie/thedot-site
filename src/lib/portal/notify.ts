import { transporter } from '@/lib/email'
import { renderReportNotificationHtml } from './report-email'

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

function notificationText(bodyText: string, link: string | null): string {
  return [bodyText, link ? `Open in the portal: ${link}` : null].filter(Boolean).join('\n\n')
}

// Durable path: sends one queued notification_outbox email. This THROWS on failure so the fenced
// consumer marks the row failed and retries with backoff. Only the notification consumer calls it.
// Recipient resolution is done in the database: agency rows use AGENCY_EMAIL and client rows carry
// a tenant-resolved primary-decider address. Supersedes the former best-effort
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
    <!doctype html>
    <html lang="en">
      <body style="margin:0; padding:24px; background:#ffffff;">
        <div style="font-family:Arial,sans-serif; color:#35332f; max-width:520px;">
          <p style="font-size:18px; font-weight:500; margin:0 0 12px;">${escapeHtml(opts.subject)}</p>
          ${opts.bodyText ? `<p style="color:#47453f; margin:0 0 16px; white-space:pre-wrap; line-height:1.5;">${escapeHtml(opts.bodyText)}</p>` : ''}
          ${link ? `<p style="margin:0;"><a href="${escapeHtml(link)}" style="display:inline-block; background:#35332f; color:#ffffff; padding:10px 16px; border-radius:6px; text-decoration:none;">Open in the portal</a></p>` : ''}
        </div>
      </body>
    </html>`
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: notificationText(opts.bodyText, link), html })
}

export async function sendPortalAgencyPieceDigestEmail(opts: {
  to: string
  subject: string
  bodyText: string
  url?: string | null
}): Promise<void> {
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  if (!from) throw new Error('FROM_EMAIL/SMTP_USER not configured')
  const link = safeHttpsUrl(opts.url)
  if (!link || !link.startsWith('https://www.thedotcreative.co/admin/portal/pieces/')) {
    throw new Error('agency piece digest requires a valid Ops piece URL')
  }
  const html = `
    <div style="font-family: Arial, sans-serif; color: #35332f; max-width: 560px;">
      <p style="font-size: 18px; font-weight: 600; margin: 0 0 12px;">${escapeHtml(opts.subject)}</p>
      <p style="color:#47453f; line-height:1.5; margin:0 0 20px; white-space:pre-wrap;">${escapeHtml(opts.bodyText)}</p>
      <p style="margin:0;"><a href="${escapeHtml(link)}" style="display:inline-block; background:#35332f; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none;">Review this piece</a></p>
    </div>`
  const text = `${opts.bodyText}\n\nReview this piece: ${link}`
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text, html })
}

export async function sendPortalReportEmail(opts: {
  to: string
  subject: string
  bodyText: string
  url?: string | null
}): Promise<void> {
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  if (!from) throw new Error('FROM_EMAIL/SMTP_USER not configured')
  const html = renderReportNotificationHtml(opts)
  const link = safeHttpsUrl(opts.url)
  const text = [opts.bodyText, link ? `View the full report: ${link}` : null].filter(Boolean).join('\n\n')
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text, html })
}

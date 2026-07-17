import { transporter } from '@/lib/email'

type DecisionNotice = {
  actorName: string
  decision: 'approved' | 'change_requested'
  title: string
  note: string | null
  slug: string
  contentId: string
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

// Best-effort: emails The Dot the moment a client makes a decision in the portal, so no one has to
// watch the workspace. NEVER throws to the caller, the decision is already recorded; mail is a
// courtesy. Silently no-ops if the notify address / SMTP env is not configured.
export async function notifyDecision(n: DecisionNotice): Promise<void> {
  const to = process.env.AGENCY_EMAIL
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  if (!to || !from) return

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = `${base}/client/${encodeURIComponent(n.slug)}/piece/${encodeURIComponent(n.contentId)}`
  const label = n.decision === 'approved' ? 'approved' : 'requested a change on'
  const subject = `${n.actorName} ${label}: ${n.title}`
  const html = `
    <div style="font-family: Arial, sans-serif; color: #35332f; max-width: 520px;">
      <p style="font-size: 15px; margin: 0 0 6px;"><strong>${escapeHtml(n.actorName)}</strong> ${label}:</p>
      <p style="font-size: 18px; font-weight: 500; margin: 0 0 12px;">${escapeHtml(n.title)}</p>
      ${n.note ? `<p style="color:#47453f; margin: 0 0 16px; white-space: pre-wrap;">"${escapeHtml(n.note)}"</p>` : ''}
      <p style="margin: 0;"><a href="${url}" style="color:#35332f;">Open in the portal</a></p>
    </div>`

  try {
    await transporter.sendMail({ from, to, subject, html })
  } catch {
    // Best-effort only. The decision is already saved and visible in the portal's activity feed.
  }
}

type CommentNotice = {
  actorName: string
  title: string
  body: string
  quotedText: string | null
  slug: string
  contentId: string
}

// Best-effort: emails The Dot the moment a client leaves a comment on a piece, so no one has to
// watch the workspace. NEVER throws to the caller, the comment is already recorded; mail is a
// courtesy. Silently no-ops if the notify address / SMTP env is not configured.
export async function notifyComment(n: CommentNotice): Promise<void> {
  const to = process.env.AGENCY_EMAIL
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  if (!to || !from) return

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = `${base}/client/${encodeURIComponent(n.slug)}/piece/${encodeURIComponent(n.contentId)}`
  const subject = `${n.actorName} commented on: ${n.title}`
  const html = `
    <div style="font-family: Arial, sans-serif; color: #35332f; max-width: 520px;">
      <p style="font-size: 15px; margin: 0 0 6px;"><strong>${escapeHtml(n.actorName)}</strong> commented on:</p>
      <p style="font-size: 18px; font-weight: 500; margin: 0 0 12px;">${escapeHtml(n.title)}</p>
      ${n.quotedText ? `<p style="color:#8a8780; border-left: 3px solid #daff00; padding-left: 10px; margin: 0 0 12px; white-space: pre-wrap;">${escapeHtml(n.quotedText)}</p>` : ''}
      <p style="color:#47453f; margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(n.body)}</p>
      <p style="margin: 0;"><a href="${url}" style="color:#35332f;">Open in the portal</a></p>
    </div>`

  try {
    await transporter.sendMail({ from, to, subject, html })
  } catch {
    // Best-effort only. The comment is already saved and visible in the portal's thread.
  }
}

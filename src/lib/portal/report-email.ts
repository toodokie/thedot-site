export type ReportNotificationCopy = {
  subject: string
  bodyText: string
}

export function buildReportNotificationCopy(options: {
  periodLabel: string
  recipientName: string
  headline: string
  highlight: string
}): ReportNotificationCopy {
  const periodLabel = options.periodLabel.trim()
  const recipientName = options.recipientName.trim()
  const headline = options.headline.trim()
  const highlight = options.highlight.trim()
  if (!periodLabel || !recipientName || !headline || !highlight
      || /[\r\n]/.test(periodLabel) || /[\r\n]/.test(recipientName)
      || /[\r\n]/.test(headline) || /[\r\n]/.test(highlight)) {
    throw new Error('Report email labels must be non-empty single-line text')
  }

  return {
    subject: `${headline}: your ${periodLabel} report is ready ✨`,
    bodyText: [
      `Hi ${recipientName},`,
      '',
      'One result worth celebrating:',
      '',
      `• ${highlight}`,
      '• The full report shows what worked on each platform and where we are focusing next.',
      '',
      "Thank you for trusting me with Kanset's social presence.",
      '',
      'Anastasia',
    ].join('\n'),
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string,
  )
}

function safeReportUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'www.thedotcreative.co') return null
    if (url.search || url.hash) return null
    if (!/^\/client\/[a-z0-9][a-z0-9-]*\/reports\/[a-z0-9][a-z0-9-]*\/?$/.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function renderReportNotificationHtml(options: {
  subject: string
  bodyText: string
  url?: string | null
}): string {
  const reportUrl = safeReportUrl(options.url)
  return `
    <div style="background:#f5f3ee; padding:32px 16px; font-family:Arial,sans-serif; color:#35332f;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e8e4dc; border-radius:16px; padding:32px;">
        <p style="font-size:12px; font-weight:700; letter-spacing:0.12em; margin:0 0 14px; color:#777268;">PERFORMANCE REPORT</p>
        <h1 style="font-size:26px; line-height:1.25; font-weight:600; margin:0 0 20px; color:#35332f;">${escapeHtml(options.subject)}</h1>
        <div style="font-size:16px; line-height:1.65; white-space:pre-line; color:#47453f;">${escapeHtml(options.bodyText)}</div>
        ${reportUrl ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(reportUrl)}" style="display:inline-block; background:#35332f; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:13px 20px; border-radius:8px;">View the full report</a></p>` : ''}
      </div>
    </div>`
}

import { describe, expect, it } from 'vitest'
import { buildReportNotificationCopy, renderReportNotificationHtml } from './report-email'

describe('report email', () => {
  it('builds the concise point-form client copy', () => {
    expect(buildReportNotificationCopy({
      periodLabel: 'July 2026',
      recipientName: 'Maria',
      headline: '12,811 social views',
      highlight: 'Social views reached 12,811 in July, 92× the pre-engagement baseline.',
    })).toEqual({
      subject: '12,811 social views: your July 2026 report is ready ✨',
      bodyText: [
        'Hi Maria,',
        '',
        'One result worth celebrating:',
        '',
        '• Social views reached 12,811 in July, 92× the pre-engagement baseline.',
        '• The full report shows what worked on each platform and where we are focusing next.',
        '',
        "Thank you for trusting me with Kanset's social presence.",
        '',
        'Anastasia',
      ].join('\n'),
    })
  })

  it('renders the report action only for the standalone report URL', () => {
    const valid = renderReportNotificationHtml({
      subject: 'Report ready', bodyText: 'Hi Maria,',
      url: 'https://www.thedotcreative.co/client/kanset/reports/july-2026',
    })
    const invalid = renderReportNotificationHtml({
      subject: 'Report ready', bodyText: 'Hi Maria,', url: 'https://example.com/report',
    })

    expect(valid).toContain('View the full report')
    expect(valid).toContain('PERFORMANCE REPORT')
    expect(invalid).not.toContain('View the full report')
  })

  it('rejects multi-line labels before they can enter the template', () => {
    expect(() => buildReportNotificationCopy({
      periodLabel: 'July 2026\nBcc: someone@example.com', recipientName: 'Maria',
      headline: '12,811 social views', highlight: 'A verified result.',
    })).toThrow('single-line')
  })
})

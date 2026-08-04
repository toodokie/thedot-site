import { describe, expect, it } from 'vitest'
import { buildReportNotificationCopy, renderReportNotificationHtml } from './report-email'

describe('report email', () => {
  it('builds the concise point-form client copy', () => {
    expect(buildReportNotificationCopy({ periodLabel: 'July 2026', recipientName: 'Maria' })).toEqual({
      subject: 'Your July 2026 performance report is ready',
      bodyText: [
        'Hi Maria,',
        '',
        '• Your July 2026 social media and website performance report is ready.',
        '• It compares each platform with the pre-engagement baseline and covers the strongest content, key takeaways, and next actions.',
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

    expect(valid).toContain('View the report')
    expect(valid).toContain('PERFORMANCE REPORT')
    expect(invalid).not.toContain('View the report')
  })

  it('rejects multi-line labels before they can enter the template', () => {
    expect(() => buildReportNotificationCopy({
      periodLabel: 'July 2026\nBcc: someone@example.com', recipientName: 'Maria',
    })).toThrow('single-line')
  })
})

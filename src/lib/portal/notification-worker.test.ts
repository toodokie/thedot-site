import { describe, expect, it, vi } from 'vitest'

const { sendMail, sendReport } = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  sendReport: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./notify', () => ({ sendPortalNotificationEmail: sendMail, sendPortalReportEmail: sendReport }))

import { drainPortalNotifications } from './notification-worker'

function adminFor(rows: unknown[]) {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: rows, error: null })
    .mockResolvedValue({ data: null, error: null })
  return { rpc }
}

describe('drainPortalNotifications', () => {
  it('routes client rows to their resolved recipient and agency rows to AGENCY_EMAIL', async () => {
    sendMail.mockClear()
    const admin = adminFor([
      { id: 'client-1', claim_token: 11, recipient_kind: 'client', recipient_email: 'maria@kanset.com', subject: 'Client', body: 'Review', related_url: null, template_key: 'generic' },
      { id: 'agency-1', claim_token: 12, recipient_kind: 'agency', recipient_email: null, subject: 'Agency', body: 'Reply', related_url: null, template_key: 'generic' },
    ])

    const result = await drainPortalNotifications(admin as never, { agencyEmail: 'info@thedotcreative.co' })

    expect(result).toMatchObject({ claimed: 2, delivered: 2, failed: 0, skipped: false })
    expect(sendMail).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: 'maria@kanset.com' }))
    expect(sendMail).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: 'info@thedotcreative.co' }))
  })

  it('fails and fences a client row with no resolved recipient instead of falling back to agency', async () => {
    sendMail.mockClear()
    const admin = adminFor([
      { id: 'client-2', claim_token: 21, recipient_kind: 'client', recipient_email: null, subject: 'Client', body: 'Review', related_url: null, template_key: 'generic' },
    ])

    const result = await drainPortalNotifications(admin as never, { agencyEmail: 'info@thedotcreative.co' })

    expect(result).toMatchObject({ claimed: 1, delivered: 0, failed: 1, skipped: false })
    expect(sendMail).not.toHaveBeenCalled()
    expect(admin.rpc).toHaveBeenLastCalledWith('mark_notification_failed', expect.objectContaining({ p_id: 'client-2', p_claim_token: 21 }))
  })

  it('uses the standalone report template for report notifications', async () => {
    sendMail.mockClear()
    sendReport.mockClear()
    const admin = adminFor([
      { id: 'report-1', claim_token: 31, recipient_kind: 'client', recipient_email: 'maria@kanset.com', subject: 'Your July 2026 performance report is ready', body: 'Hi Maria,', related_url: 'https://www.thedotcreative.co/client/kanset/reports/july-2026', template_key: 'report' },
    ])

    const result = await drainPortalNotifications(admin as never)

    expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 })
    expect(sendReport).toHaveBeenCalledWith(expect.objectContaining({
      to: 'maria@kanset.com',
      url: 'https://www.thedotcreative.co/client/kanset/reports/july-2026',
    }))
    expect(sendMail).not.toHaveBeenCalled()
  })
})

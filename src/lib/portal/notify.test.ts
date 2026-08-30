import { afterEach, describe, expect, it, vi } from 'vitest'

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ transporter: { sendMail } }))

import { sendPortalAgencyPieceDigestEmail, sendPortalNotificationEmail } from './notify'

describe('sendPortalAgencyPieceDigestEmail', () => {
  afterEach(() => {
    sendMail.mockClear()
    delete process.env.FROM_EMAIL
  })

  it('renders a direct piece link in both the text and HTML versions', async () => {
    process.env.FROM_EMAIL = 'portal@example.com'
    const url = 'https://www.thedotcreative.co/admin/portal/pieces/kanset-2026-08-news'

    await sendPortalAgencyPieceDigestEmail({
      to: 'agency@example.com',
      subject: 'Maria updated: August news',
      bodyText: '2 copy edits and 1 comment received.',
      url,
    })

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'portal@example.com',
      to: 'agency@example.com',
      subject: 'Maria updated: August news',
      text: expect.stringContaining(url),
      html: expect.stringContaining(`href="${url}"`),
    }))
  })

  it('refuses to send a digest without an exact Ops piece URL', async () => {
    process.env.FROM_EMAIL = 'portal@example.com'

    await expect(sendPortalAgencyPieceDigestEmail({
      to: 'agency@example.com',
      subject: 'Maria updated: August news',
      bodyText: '1 copy edit received.',
      url: 'https://example.com/not-the-portal',
    })).rejects.toThrow('agency piece digest requires a valid Ops piece URL')

    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe('sendPortalNotificationEmail', () => {
  afterEach(() => {
    sendMail.mockClear()
    delete process.env.FROM_EMAIL
  })

  it('sends a readable text alternative and a portal button', async () => {
    process.env.FROM_EMAIL = 'portal@example.com'
    const url = 'https://www.thedotcreative.co/client/kanset/piece/kanset-2026-08-31-news-roundup'

    await sendPortalNotificationEmail({
      to: 'maria@kanset.com',
      subject: 'The Dot commented',
      bodyText: 'The Monday reel preview is ready to view.',
      url,
    })

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining(`Open in the portal: ${url}`),
      html: expect.stringContaining(`href="${url}"`),
    }))
  })
})

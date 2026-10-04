import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(), getContentItem: vi.fn(), rpc: vi.fn(), userAgent: '' as string | null,
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(mocks.userAgent ? { 'user-agent': mocks.userAgent } : {}),
}))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { reportReviewPlaybackFailure } from './playback-actions'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const input = { slug: 'kanset', contentId: 'piece', contentVersion: 2, previewKey: 'reel', errorCode: 'media_err_network' }

beforeEach(() => {
  mocks.userAgent = IPHONE
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', version: 2 })
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: { outcome: 'notified' }, error: null })
})

describe('reportReviewPlaybackFailure', () => {
  it('records the failure with only a device and browser name', async () => {
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('report_review_playback_failure', {
      p_content_id: 'item-1', p_content_version: 2, p_preview_key: 'reel',
      p_error_code: 'media_err_network', p_device: 'iPhone', p_browser: 'Safari',
    })
  })

  it('counts a rate-limited repeat as handled', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'rate_limited' }, error: null })
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: true })
  })

  it('refuses bad input, no session or a stale version without calling the database', async () => {
    expect(await reportReviewPlaybackFailure({ ...input, errorCode: 'drop table' })).toEqual({ ok: false })
    expect(await reportReviewPlaybackFailure({ ...input, previewKey: 'Not A Key' })).toEqual({ ok: false })
    expect(await reportReviewPlaybackFailure({ ...input, contentVersion: 1 })).toEqual({ ok: false })
    mocks.getClientSession.mockResolvedValue(null)
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reports a database refusal as not handled', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_playback_preview_not_found' } })
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: false })
  })

  it('works without a user agent header', async () => {
    mocks.userAgent = null
    await reportReviewPlaybackFailure(input)
    expect(mocks.rpc).toHaveBeenCalledWith('report_review_playback_failure',
      expect.objectContaining({ p_device: 'Other device', p_browser: 'Other browser' }))
  })
})

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.session }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { mocks.redirect(url); throw new Error('REDIRECT') } }))

import { submitPortalFeedback } from './feedback-actions'
import { PIECE_PAGE_ANNOUNCEMENT_KEY } from '@/lib/portal/piece-page-announcement'

const ITEM = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.session.mockResolvedValue({ clientId: 'client-1', userId: 'u1' })
  mocks.rpc.mockResolvedValue({ data: { outcome: 'submitted' }, error: null })
})

describe('submitPortalFeedback', () => {
  it('sends the rating and trimmed comment through the RPC', async () => {
    expect(await submitPortalFeedback('kanset', { rating: 4, comment: '  Much easier.  ', contentItemId: ITEM }))
      .toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_portal_feedback', {
      p_client_id: 'client-1', p_prompt_key: 'review_page_2026_10', p_rating: 4,
      p_comment: 'Much easier.', p_content_item_id: ITEM,
    })
  })

  it('sends an empty comment as null and drops a malformed piece id', async () => {
    await submitPortalFeedback('kanset', { rating: 5, comment: '   ', contentItemId: 'nope' })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_portal_feedback', expect.objectContaining({
      p_comment: null, p_content_item_id: null,
    }))
  })

  it('treats an earlier answer from another device as done', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'already_submitted' }, error: null })
    expect(await submitPortalFeedback('kanset', { rating: 3, comment: '', contentItemId: null })).toEqual({ ok: true })
  })

  it('refuses a rating outside 1 to 5 or an over-long comment without calling the database', async () => {
    expect((await submitPortalFeedback('kanset', { rating: 0, comment: '', contentItemId: null })).ok).toBe(false)
    expect((await submitPortalFeedback('kanset', { rating: 2.5, comment: '', contentItemId: null })).ok).toBe(false)
    expect((await submitPortalFeedback('kanset', { rating: 4, comment: 'x'.repeat(2001), contentItemId: null })).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('keeps her answer on a database refusal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await submitPortalFeedback('kanset', { rating: 4, comment: 'x', contentItemId: null }))
      .toEqual({ ok: false, error: 'That did not send. Your answer is still here, so you can try again.' })
  })

  it('sends a signed-out visitor to login', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(submitPortalFeedback('kanset', { rating: 4, comment: '', contentItemId: null })).rejects.toThrow('REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/client/login')
  })
})

describe('the rollout note (decision 3: one dialog)', () => {
  it('reuses the live first-visit intro key, so the receipt is the existing acknowledgePiecePageIntro', () => {
    expect(PIECE_PAGE_ANNOUNCEMENT_KEY).toBe('piece_page_2026_10')
  })
})

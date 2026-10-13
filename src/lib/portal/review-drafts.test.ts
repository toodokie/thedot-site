import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ seatQuery: vi.fn(), adminQuery: vi.fn(), adminRpc: vi.fn() }))
function chain(result: () => Promise<unknown>) {
  const query = {
    select: () => query, eq: () => query, order: () => query,
    limit: () => result(),
  }
  return query
}
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({ from: () => chain(mocks.seatQuery) }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => chain(mocks.adminQuery), rpc: mocks.adminRpc }),
}))

import { getAgencyReviewDrafts, getMyReviewDrafts, getUnsentDraftAlerts } from './review-drafts'

beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset() })

describe('review draft readers', () => {
  it('returns the seat drafts read under RLS', async () => {
    mocks.seatQuery.mockResolvedValue({ data: [{ id: 'd1' }], error: null })
    expect(await getMyReviewDrafts('item-1')).toEqual([{ id: 'd1' }])
  })

  it('returns null instead of failing the page when drafts cannot be read', async () => {
    mocks.seatQuery.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } })
    expect(await getMyReviewDrafts('item-1')).toBeNull()
    mocks.seatQuery.mockRejectedValue(new Error('down'))
    expect(await getMyReviewDrafts('item-1')).toBeNull()
  })

  it('reads every seat draft of a piece for the agency', async () => {
    mocks.adminQuery.mockResolvedValue({ data: [{ id: 'd1', auth_user_id: 'u1' }], error: null })
    expect(await getAgencyReviewDrafts('item-1')).toEqual([{ id: 'd1', auth_user_id: 'u1' }])
  })

  it('asks the database for alerts as of the given time', async () => {
    mocks.adminRpc.mockResolvedValue({ data: [{ content_id: 'x' }], error: null })
    const now = new Date('2026-10-03T12:00:00.000Z')
    expect(await getUnsentDraftAlerts(now)).toEqual([{ content_id: 'x' }])
    expect(mocks.adminRpc).toHaveBeenCalledWith('agency_unsent_review_draft_alerts', { p_now: now.toISOString() })
  })

  it('surfaces an agency read failure instead of showing an empty, reassuring list', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getUnsentDraftAlerts()).rejects.toThrow(/boom/)
  })
})

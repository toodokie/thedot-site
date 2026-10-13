import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), getContentItem: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { tickReviewTabs } from './tick-actions'

beforeEach(() => {
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', version: 2 })
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: 1, error: null })
})

describe('tickReviewTabs', () => {
  it('records valid, de-duplicated keys on the current version', async () => {
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption', 'caption', 'Bad Key', 'other:story'] }))
      .toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('tick_review_tabs', {
      p_content_id: 'item-1', p_content_version: 2, p_tab_keys: ['caption', 'other:story'],
    })
  })

  it('refuses a stale version without calling the database', async () => {
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 1, tabKeys: ['caption'] })).toEqual({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses without a session or any valid key', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption'] })).toEqual({ ok: false })
    mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['NOPE'] })).toEqual({ ok: false })
  })

  it('reports a database refusal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_tick_version_not_released' } })
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption'] })).toEqual({ ok: false })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), getContentItem: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { pickReviewOption } from './option-actions'

beforeEach(() => {
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1', canDecide: true })
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', version: 2 })
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: { outcome: 'picked', option_group: 'youtube-test-3', asset_key: 'youtube-cover-test-3-rust' }, error: null })
})

describe('pickReviewOption (0098)', () => {
  it('records her pick on the version on screen and refreshes the page', async () => {
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'youtube-cover-test-3-rust' }))
      .toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('pick_review_asset_option', {
      p_content_id: 'item-1', p_content_version: 2, p_asset_key: 'youtube-cover-test-3-rust',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client/kanset/piece/piece')
  })

  it('refuses a stale version, a bad key, a missing session or a seat that cannot decide, without calling the database', async () => {
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 1, assetKey: 'x' })).toEqual({ ok: false, reason: 'stale' })
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'Bad Key' })).toEqual({ ok: false, reason: 'invalid' })
    mocks.getClientSession.mockResolvedValue({ clientId: 'c1', canDecide: false })
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'x' })).toEqual({ ok: false, reason: 'not_allowed' })
    mocks.getClientSession.mockResolvedValue(null)
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'x' })).toEqual({ ok: false, reason: 'not_allowed' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('says when the piece was decided in the meantime', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_option_piece_decided' } })
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'x' })).toEqual({ ok: false, reason: 'decided' })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await pickReviewOption({ slug: 'kanset', contentId: 'piece', contentVersion: 2, assetKey: 'x' })).toEqual({ ok: false, reason: 'failed' })
  })
})

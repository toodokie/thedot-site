// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serverFrom } = vi.hoisted(() => ({ serverFrom: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: serverFrom }) }))

import { cycleContentRows, getPlanReviewAssetsByItem } from './review-assets'

function query(result: { data: unknown[] | null; error: { message: string } | null }) {
  const calls: Array<[string, unknown]> = []
  const builder = {
    calls,
    select: () => builder,
    eq: (column: string, value: unknown) => { calls.push([column, value]); return builder },
    in: (column: string, value: unknown) => { calls.push([column, value]); return builder },
    order: () => builder,
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  }
  return builder
}

const ASSET = {
  content_item_id: 'i1', id: 'a1', content_version: 2, asset_key: 'reel', label: 'Reel', channel: 'social',
  asset_kind: 'video', url: 'https://drive.example/x', width_px: 1080, height_px: 1920,
  caption_status: 'not_applicable', review_note: null,
}

beforeEach(() => serverFrom.mockReset())

describe('cycleContentRows', () => {
  it('keeps only content rows that sit in a plan cycle, once each', () => {
    const contentById = new Map([
      ['c-1', { id: 'i1', version: 2 }],
      ['c-2', { id: 'i2', version: 1 }],
      ['c-3', { id: 'i3', version: 4 }],
    ])
    const rows = cycleContentRows(
      [{ items: [{ content_id: 'c-1' }, { content_id: 'missing' }] }, { items: [{ content_id: 'c-1' }, { content_id: 'c-3' }] }],
      contentById,
    )
    expect(rows).toEqual([{ id: 'i1', version: 2 }, { id: 'i3', version: 4 }])
  })
})

describe('getPlanReviewAssetsByItem', () => {
  it('queries only the given items and groups current-version assets', async () => {
    const q = query({ data: [ASSET, { ...ASSET, id: 'old', content_version: 1 }], error: null })
    serverFrom.mockReturnValue(q)
    const map = await getPlanReviewAssetsByItem('client-1', [{ id: 'i1', version: 2 }])
    expect(q.calls).toContainEqual(['content_item_id', ['i1']])
    expect(map.get('i1')?.map((a) => a.id)).toEqual(['a1'])
  })

  it('returns an empty map instead of throwing when the query fails', async () => {
    serverFrom.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const map = await getPlanReviewAssetsByItem('client-1', [{ id: 'i1', version: 2 }])
    expect(map.size).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not query at all when no cycle item has content', async () => {
    const map = await getPlanReviewAssetsByItem('client-1', [])
    expect(map.size).toBe(0)
    expect(serverFrom).not.toHaveBeenCalled()
  })
})

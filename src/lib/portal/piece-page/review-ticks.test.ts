// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from }) }))

import { getMyReviewTicks } from './review-ticks'

function query(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = []
  const builder = {
    filters,
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  }
  return builder
}

beforeEach(() => from.mockReset())

describe('getMyReviewTicks', () => {
  it('reads the seat ticks for one version through RLS', async () => {
    const q = query({ data: [{ tab_key: 'caption' }, { tab_key: 'youtube' }], error: null })
    from.mockReturnValue(q)
    expect(await getMyReviewTicks('item-1', 3)).toEqual(['caption', 'youtube'])
    expect(from).toHaveBeenCalledWith('content_review_tab_ticks')
    expect(q.filters).toEqual([['content_item_id', 'item-1'], ['content_version', 3]])
  })

  it('starts at zero when the read fails, so the page still loads', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    expect(await getMyReviewTicks('item-1', 3)).toEqual([])
  })
})

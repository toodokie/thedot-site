// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serverFrom, adminFrom, sign } = vi.hoisted(() => ({
  serverFrom: vi.fn(),
  adminFrom: vi.fn(),
  sign: vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
    error: null,
  })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: serverFrom }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: adminFrom, storage: { from: () => ({ createSignedUrls: sign }) } }),
}))

import {
  getAgencyReviewPreviews, getClientReviewPreviewById, getClientReviewPreviews,
} from './review-previews'

const ROW = {
  id: '6f1c2f8e-0000-4000-8000-000000000001', client_id: 'c1', content_item_id: 'i1', content_version: 1,
  preview_key: 'reel', review_asset_key: null, media_kind: 'video', object_prefix: 'c1/i1/v1/reel/x/',
  video_path: 'c1/i1/v1/reel/x/video.mp4', poster_path: 'c1/i1/v1/reel/x/poster.jpg',
  frames: [], width_px: 1080, height_px: 1920, duration_seconds: '12.00', created_at: '2026-10-03T00:00:00Z',
}

function query(rows: unknown[]) {
  const filters: Array<[string, unknown]> = []
  const builder = {
    filters,
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
    order: () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  }
  return builder
}

beforeEach(() => { serverFrom.mockReset(); adminFrom.mockReset(); sign.mockClear() })

describe('client review preview reader', () => {
  it('reads through the seat session (RLS) and signs with the service role', async () => {
    const q = query([ROW])
    serverFrom.mockReturnValue(q)
    const previews = await getClientReviewPreviews('c1', 'i1', 1)
    expect(serverFrom).toHaveBeenCalledWith('content_review_previews')
    expect(adminFrom).not.toHaveBeenCalled()
    expect(q.filters).toEqual([['client_id', 'c1'], ['content_item_id', 'i1'], ['content_version', 1]])
    expect(previews[0].videoUrl).toContain('video.mp4')
    expect(previews[0].durationSeconds).toBe(12)
  })

  it('signs nothing when RLS returns no row', async () => {
    serverFrom.mockReturnValue(query([]))
    expect(await getClientReviewPreviews('c1', 'i1', 2)).toEqual([])
    expect(sign).not.toHaveBeenCalled()
  })

  it('refuses a malformed preview id without querying', async () => {
    expect(await getClientReviewPreviewById('c1', '../../etc')).toBeNull()
    expect(serverFrom).not.toHaveBeenCalled()
  })
})

describe('agency review preview reader', () => {
  it('reads every version through the service role', async () => {
    const q = query([ROW])
    adminFrom.mockReturnValue(q)
    const previews = await getAgencyReviewPreviews('i1', 1)
    expect(serverFrom).not.toHaveBeenCalled()
    expect(q.filters).toEqual([['content_item_id', 'i1'], ['content_version', 1]])
    expect(previews).toHaveLength(1)
  })
})

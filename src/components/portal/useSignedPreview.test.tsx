import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from './useSignedPreview'

const PREVIEW: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i1', contentVersion: 2, previewKey: 'reel', mediaKind: 'video', width: 1080, height: 1920,
  durationSeconds: 24, videoUrl: 'https://signed.example/v.mp4?t=1', posterUrl: null, frames: [],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('useSignedPreview', () => {
  it('fetches fresh links once per expiry and swaps them in', async () => {
    const fresh = { ...PREVIEW, videoUrl: 'https://signed.example/v.mp4?t=2', expiresAt: '2026-10-03T12:20:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    await act(async () => { await result.current.refresh(); await result.current.refresh() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.preview?.videoUrl).toBe(fresh.videoUrl)
  })

  it('does nothing without a preview or a refresh URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(null, '/x'))
    await act(async () => { await result.current.refresh() })
    const second = renderHook(() => useSignedPreview(PREVIEW, null))
    await act(async () => { await second.result.current.refresh() })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from './useSignedPreview'

const PREVIEW: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i1', contentVersion: 2, previewKey: 'reel', mediaKind: 'video', width: 1080, height: 1920,
  durationSeconds: 24, videoUrl: 'https://signed.example/v.mp4?t=1', posterUrl: null, frames: [],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

// The session clock: 12:00 UTC on the day the fixture links were signed.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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
  it('reports whether new links arrived, and forceRefresh always asks again', async () => {
    const fresh = { ...PREVIEW, videoUrl: 'https://signed.example/v.mp4?t=3', expiresAt: '2026-10-03T12:30:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    let first = false
    let second = true
    // Two automatic refreshes for the same set of links fetch once; Retry fetches again.
    await act(async () => { first = await result.current.refresh(); second = await result.current.refresh() })
    await act(async () => { await result.current.forceRefresh() })
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops after one silent refresh per set of links when a file never loads', async () => {
    let n = 0
    const fetchMock = vi.fn(async () => {
      n += 1
      return { ok: true, json: async () => ({ preview: { ...PREVIEW, videoUrl: `https://signed.example/v.mp4?t=${n + 10}`, expiresAt: `2026-10-03T13:${String(n).padStart(2, '0')}:00.000Z` } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    const answers: boolean[] = []
    for (let i = 0; i < 4; i += 1) {
      // A file that never loads fails again on every new set of links; links still valid mean the file is the problem.
      await act(async () => { answers.push(await result.current.refresh()) })
    }
    expect(answers).toEqual([true, false, false, false])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Retry may ask again, once per click; its links get no extra silent refresh while valid.
    await act(async () => { await result.current.forceRefresh() })
    await act(async () => { await result.current.forceRefresh() })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await act(async () => { answers.push(await result.current.refresh()) })
    expect(answers.at(-1)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('refreshes silently at each expiry through a 25-minute session, even after a broken thumbnail', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: {
      ...PREVIEW, videoUrl: `https://signed.example/v.mp4?at=${Date.now()}`, expiresAt: new Date(Date.now() + 10 * 60_000 + 30_000).toISOString(),
    } }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    const answers: boolean[] = []
    // 12:00 a broken thumbnail takes the first set's refresh.
    await act(async () => { answers.push(await result.current.refresh()) })
    // 12:11 and 12:22 (each set lasts ten minutes from when it was signed) the video's links have expired: each set gets its own refresh.
    vi.setSystemTime(new Date('2026-10-03T12:11:00.000Z'))
    await act(async () => { answers.push(await result.current.refresh()) })
    vi.setSystemTime(new Date('2026-10-03T12:22:00.000Z'))
    await act(async () => { answers.push(await result.current.refresh()) })
    // 12:23 the newest links are still valid, so a failure now is the file, not the link.
    vi.setSystemTime(new Date('2026-10-03T12:23:00.000Z'))
    await act(async () => { answers.push(await result.current.refresh()) })
    expect(answers).toEqual([true, true, true, false])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shares one silent refresh between media that fail at the same moment', async () => {
    const fresh = { ...PREVIEW, expiresAt: '2026-10-03T12:30:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    let answers: boolean[] = []
    await act(async () => { answers = await Promise.all([result.current.refresh(), result.current.refresh(), result.current.refresh()]) })
    expect(answers).toEqual([true, true, true])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

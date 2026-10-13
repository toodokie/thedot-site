import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { STALL_TIMEOUT_MS } from '@/lib/portal/piece-page/playback-failure'
import ReviewVideoPlayer from './ReviewVideoPlayer'

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 24, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [], expiresAt: '2999-01-01T00:00:00.000Z',
}

function setup(overrides: Partial<Parameters<typeof ReviewVideoPlayer>[0]> = {}) {
  const props = {
    preview, label: 'Reel: video', className: 'player',
    refresh: vi.fn(async () => false), forceRefresh: vi.fn(async () => true),
    report: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
  render(<ReviewVideoPlayer {...props} />)
  return props
}

function failVideo(code: number) {
  const video = screen.getByLabelText('Reel: video')
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  fireEvent.error(video)
}

afterEach(() => vi.useRealTimers())

describe('ReviewVideoPlayer', () => {
  it('tries one silent link refresh before calling anything a failure', async () => {
    const props = setup({ refresh: vi.fn(async () => true) })
    failVideo(2)
    await act(async () => {})
    expect(props.refresh).toHaveBeenCalledTimes(1)
    expect(props.report).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Reel: video')).toHaveAttribute('playsinline')
  })

  it('reports a failed load and tells her I have been notified', async () => {
    const props = setup()
    failVideo(2)
    expect(await screen.findByRole('alert')).toHaveTextContent("This video didn't load. I've been notified.")
    expect(props.report).toHaveBeenCalledWith({ contentVersion: 2, previewKey: 'reel', errorCode: 'media_err_network' })
  })

  it('names an expired signed link', async () => {
    const props = setup({ preview: { ...preview, expiresAt: '2000-01-01T00:00:00.000Z' } })
    failVideo(4)
    await screen.findByRole('alert')
    expect(props.report).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'link_expired' }))
  })

  it('treats a long wait after play as a failure, and a resumed play as fine', async () => {
    vi.useFakeTimers()
    const props = setup()
    const video = screen.getByLabelText('Reel: video')
    fireEvent.play(video)
    fireEvent.waiting(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS - 1) })
    fireEvent.playing(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS) })
    expect(props.report).not.toHaveBeenCalled()
    fireEvent.waiting(video)
    await act(async () => { vi.advanceTimersByTime(STALL_TIMEOUT_MS) })
    vi.useRealTimers()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(props.report).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'stalled' }))
  })

  it('does not wait for a stall before she presses play', () => {
    vi.useFakeTimers()
    const props = setup()
    fireEvent.stalled(screen.getByLabelText('Reel: video'))
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2) })
    expect(props.report).not.toHaveBeenCalled()
  })

  it('only says the video did not load when the report failed or there is no report', async () => {
    setup({ report: vi.fn(async () => ({ ok: false })) })
    failVideo(3)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This video didn't load.")
    expect(alert).not.toHaveTextContent('notified')
  })

  it('does not report from the admin preview', async () => {
    setup({ report: null })
    failVideo(3)
    expect(await screen.findByRole('alert')).not.toHaveTextContent('notified')
  })

  it('Retry fetches fresh links and brings the video back, reporting at most once per page load', async () => {
    const props = setup()
    failVideo(2)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Reel: video')).toBeInTheDocument()
    // Retry unmounts itself, so focus moves to the video instead of falling back to the page.
    expect(screen.getByLabelText('Reel: video')).toHaveFocus()
    expect(props.forceRefresh).toHaveBeenCalledTimes(1)
    failVideo(2)
    expect(await screen.findByRole('alert')).toHaveTextContent("I've been notified.")
    expect(props.report).toHaveBeenCalledTimes(1)
  })

  it('reports once when a stall and an error land together, and still says I have been notified', async () => {
    vi.useFakeTimers()
    let resolve: (value: { ok: boolean }) => void = () => {}
    const props = setup({ report: vi.fn(() => new Promise<{ ok: boolean }>((done) => { resolve = done })) })
    const video = screen.getByLabelText('Reel: video')
    fireEvent.play(video)
    fireEvent.waiting(video)
    await act(async () => { vi.advanceTimersByTime(STALL_TIMEOUT_MS) })
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    await act(async () => { fireEvent.error(video) })
    await act(async () => { resolve({ ok: true }) })
    vi.useRealTimers()
    expect(await screen.findByRole('alert')).toHaveTextContent("I've been notified.")
    expect(props.report).toHaveBeenCalledTimes(1)
  })

  it('stops waiting for a stall when she pauses', () => {
    vi.useFakeTimers()
    const props = setup()
    const video = screen.getByLabelText('Reel: video')
    fireEvent.play(video)
    fireEvent.waiting(video)
    fireEvent.pause(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2) })
    fireEvent.waiting(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2) })
    expect(props.report).not.toHaveBeenCalled()
  })

  it('asks for a silent refresh on each load error and fails only when none is given', async () => {
    const refresh = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false)
    const props = setup({ refresh })
    failVideo(2)
    await act(async () => {})
    failVideo(2)
    await act(async () => {})
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    failVideo(2)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(props.report).toHaveBeenCalledTimes(1)
  })
})

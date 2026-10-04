import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReviewPreviewMedia from './ReviewPreviewMedia'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

const VIDEO: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i1', contentVersion: 2, previewKey: 'reel', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 24,
  videoUrl: 'https://signed.example/video.mp4?t=1', posterUrl: 'https://signed.example/poster.jpg?t=1',
  frames: [{ label: 'Hook', url: 'https://signed.example/f1.jpg?t=1' }, { label: 'Answer', url: 'https://signed.example/f2.jpg?t=1' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

afterEach(() => { vi.unstubAllGlobals() })

describe('ReviewPreviewMedia', () => {
  it('plays the video inline with its poster and lists the frames with labels', () => {
    render(<ReviewPreviewMedia preview={VIDEO} title="Work permit reel" />)
    const video = screen.getByLabelText('Work permit reel: preview video')
    expect(video).toHaveAttribute('src', VIDEO.videoUrl)
    expect(video).toHaveAttribute('poster', VIDEO.posterUrl)
    expect(video).toHaveAttribute('playsinline')
    expect(screen.getByRole('list', { name: 'Work permit reel: frames' })).toBeInTheDocument()
    expect(screen.getByAltText('Hook')).toHaveAttribute('src', VIDEO.frames[0].url)
    expect(screen.getByText('Answer')).toBeInTheDocument()
  })

  it('renders a page preview as pages, with no video', () => {
    render(<ReviewPreviewMedia title="Carousel" preview={{
      ...VIDEO, mediaKind: 'pages', videoUrl: null, posterUrl: null, durationSeconds: null,
      frames: [{ label: 'Page 1', url: 'https://signed.example/p1.png' }],
    }} />)
    expect(screen.queryByLabelText('Carousel: preview video')).toBeNull()
    expect(screen.getByRole('list', { name: 'Carousel: pages' })).toBeInTheDocument()
  })

  it('asks for fresh links once when the signed links expire, then uses them', async () => {
    const fresh = { ...VIDEO, videoUrl: 'https://signed.example/video.mp4?t=2', expiresAt: '2026-10-03T12:20:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ReviewPreviewMedia preview={VIDEO} title="Reel" refreshUrl="/api/client/kanset/review-previews/p1" />)
    const video = screen.getByLabelText('Reel: preview video')
    fireEvent.error(video)
    fireEvent.error(screen.getByAltText('Hook'))
    await waitFor(() => expect(video).toHaveAttribute('src', fresh.videoUrl))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/client/kanset/review-previews/p1', { cache: 'no-store' })
  })

  it('does not refresh without a refresh URL', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ReviewPreviewMedia preview={VIDEO} title="Reel" />)
    fireEvent.error(screen.getByLabelText('Reel: preview video'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

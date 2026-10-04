import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import MediaArea from './MediaArea'
import { stubDialogs } from './test-utils'

const frames = Array.from({ length: 8 }, (_, i) => ({ label: `${(i + 4) / 2} s`, url: `https://signed.example/f${i + 1}.jpg` }))
const reel: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: 'https://signed.example/p.jpg',
  frames, expiresAt: '2026-10-03T12:10:00.000Z',
}
const pages: SignedReviewPreview = { ...reel, id: 'p2', mediaKind: 'pages', videoUrl: null, posterUrl: null, width: 1080, height: 1350,
  frames: Array.from({ length: 12 }, (_, i) => ({ label: `Page ${i + 1}`, url: `https://signed.example/page${i + 1}.jpg` })) }

const base = {
  title: 'Foreign worker cost', refreshUrl: null, fallbackMedia: [], episodeDriveUrl: null, mediaPending: false,
  framesCollapsed: false, page: 0, onPageChange: vi.fn(), onSuggestWhole: vi.fn(), onSuggestAt: vi.fn(),
}

beforeEach(() => stubDialogs())

describe('MediaArea', () => {
  it('plays a vertical reel inline with a four-across frame grid', () => {
    const onSuggestAt = vi.fn()
    render(<MediaArea {...base} layout="vertical" preview={reel} onSuggestAt={onSuggestAt} />)
    expect(screen.getByLabelText('Foreign worker cost: video')).toHaveAttribute('src', reel.videoUrl)
    expect(screen.getByLabelText('Foreign worker cost: video')).toHaveAttribute('playsinline')
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 3' }))
    expect(onSuggestAt).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to the whole video' }))
    expect(base.onSuggestWhole).toHaveBeenCalled()
  })

  it('collapses the grid to one line while On-screen text is open', () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} framesCollapsed />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('8 frames')).toBeInTheDocument()
    expect(screen.getByText(/each shown beside its text in On-screen text/)).toBeInTheDocument()
  })

  it('plays an episode trailer full width and links the full episode in Drive', () => {
    render(<MediaArea {...base} layout="horizontal" preview={{ ...reel, width: 1920, height: 1080, frames: [] }}
      episodeDriveUrl="https://drive.google.com/full" />)
    expect(screen.getByLabelText('Foreign worker cost: trailer')).toBeInTheDocument()
    expect(screen.getByText('This is the trailer. The full episode stays on Drive.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the full episode in Drive' })).toHaveAttribute('href', 'https://drive.google.com/full')
  })

  it('pages through a PDF with arrows, thumbnails and the keyboard', () => {
    const onPageChange = vi.fn()
    const { rerender } = render(<MediaArea {...base} layout="pages" preview={pages} page={0} onPageChange={onPageChange} />)
    expect(screen.getByText('1 / 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    rerender(<MediaArea {...base} layout="pages" preview={pages} page={2} onPageChange={onPageChange} />)
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(screen.getByRole('region', { name: 'Foreign worker cost: pages' }), { key: 'ArrowLeft' })
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to page 3' }))
    expect(base.onSuggestAt).toHaveBeenCalledWith(2)
  })

  it('enlarges a page when tapped', () => {
    render(<MediaArea {...base} layout="pages" preview={pages} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge page 1 of 12' }))
    expect(screen.getByRole('dialog', { name: 'Page 1 of 12' })).toBeVisible()
  })

  it('shows a placeholder while the media is not ready', () => {
    render(<MediaArea {...base} layout="vertical" preview={null} mediaPending />)
    expect(screen.getByText('Video coming. You can review the text now.')).toBeInTheDocument()
  })

  it('falls back to the Drive buttons when no preview exists', () => {
    render(<MediaArea {...base} layout="vertical" preview={null} fallbackMedia={[{ label: 'Reel video', url: 'https://drive.google.com/r' }]} />)
    expect(screen.getByRole('link', { name: 'Open Reel video' })).toHaveAttribute('href', 'https://drive.google.com/r')
  })

  it('hides frame suggestions when the visual cannot take a frame note', () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} onSuggestAt={null} />)
    expect(screen.queryByRole('button', { name: /Suggest a change to frame/ })).not.toBeInTheDocument()
  })

  it('labels each frame once: the visible number names it, so the thumbnail alt is empty', () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} />)
    const images = screen.getAllByRole('listitem').map((item) => item.querySelector('img'))
    expect(images.every((img) => img?.getAttribute('alt') === '')).toBe(true)
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('3 · 3 s')
  })

  it('returns focus to the page after closing the enlarged view', () => {
    render(<MediaArea {...base} layout="pages" preview={pages} />)
    const page = screen.getByRole('button', { name: 'Enlarge page 1 of 12' })
    fireEvent.click(page)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(page).toHaveFocus()
  })
})

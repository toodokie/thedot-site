import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
const { tickReviewTabs } = vi.hoisted(() => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs }))
const { reportReviewPlaybackFailure } = vi.hoisted(() => ({ reportReviewPlaybackFailure: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/playback-actions', () => ({ reportReviewPlaybackFailure }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({ default: () => <div data-testid="history" /> }))

import type { ContentRow } from '@/lib/portal/data'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, type DeriveInput } from './derive'
import PieceWorkspace from './PieceWorkspace'
import { stubDialogs } from './test-utils'

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '4.5 s', url: 'https://signed.example/f2.jpg' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

function data(overrides: Partial<ContentRow> = {}, extra: Partial<DeriveInput> = {}) {
  const item = {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook', 'youtube'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: [
      { key: 'reel-script', label: 'Reel, on screen', body: '**1.** FOR EMPLOYERS\n\n**2.** $1,000' },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
      { key: 'youtube-package', label: 'YouTube Short', body: '**Title:** T' },
    ],
    state: 'needs_review', ...overrides,
  } as ContentRow
  return deriveWorkspaceData({
    slug: 'kanset', item, comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: [],
    requestMessages: [], reviewAssets: [{ id: 'a', content_version: 2, asset_key: 'reel-video', label: 'Reel video', channel: 'social',
      asset_kind: 'video', url: 'https://drive.google.com/r', width_px: 1080, height_px: 1920, caption_status: 'not_applicable', review_note: null }],
    previews: [preview], capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar', previewRefreshBase: '/api/client/kanset/review-previews',
    removalKey: 'k', ...extra,
  })
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  tickReviewTabs.mockClear()
})

describe('PieceWorkspace', () => {
  it('ticks the open tab and enables Approve only after every tab was opened', async () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(document.querySelector('[data-piece-page-v2]')).toHaveAttribute('data-layout', 'vertical')
    expect(screen.getByText('1 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    await waitFor(() => expect(tickReviewTabs).toHaveBeenCalledWith(expect.objectContaining({ tabKeys: ['onscreen'] })))
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    fireEvent.click(screen.getByRole('tab', { name: /YouTube/ }))
    expect(screen.getByText('3 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('starts from the seat ticks on this version', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={['caption', 'youtube']} />)
    expect(screen.getByText('3 of 3 reviewed')).toBeInTheDocument()
  })

  it('collapses the frame grid while On-screen text is open and suggests a change on one frame', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(screen.getByText('2 frames')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 2' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 2 · Suggest a change' })).toBeVisible()
  })

  it('opens Questions & sources from the header', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Questions and sources, 0 messages' }))
    expect(screen.getByRole('dialog', { name: 'Questions & sources' })).toBeVisible()
  })

  it('takes no edits on a published piece and points to removal', () => {
    render(<PieceWorkspace data={data({ state: 'live' })} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(screen.queryByRole('button', { name: /Edit text/ })).not.toBeInTheDocument()
    const bar = screen.getByRole('region', { name: 'Your review' })
    expect(within(bar).getByText('Need it taken down? Use Request removal in the menu at the top.')).toBeInTheDocument()
  })

  it('never writes ticks in the read-only preview', async () => {
    render(<PieceWorkspace data={data()} mode="preview" draftScope="read-only-preview:Maria" serverDrafts={null} ticks={[]} />)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(tickReviewTabs).not.toHaveBeenCalled()
  })
})

describe('PieceWorkspace playback reports (amended 2026-10-03)', () => {
  function failTheVideo() {
    const video = screen.getByLabelText('What does hiring cost?: video')
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    fireEvent.error(video)
  }

  it('reports a failed play from the client page', async () => {
    reportReviewPlaybackFailure.mockClear()
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    failTheVideo()
    await waitFor(() => expect(reportReviewPlaybackFailure).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'kanset-2026-10-reel', contentVersion: 2, previewKey: 'reel',
    })))
  })

  it('never reports from the admin preview', async () => {
    reportReviewPlaybackFailure.mockClear()
    render(<PieceWorkspace data={data()} mode="preview" draftScope="read-only-preview:Maria" serverDrafts={null} ticks={[]} />)
    failTheVideo()
    expect(await screen.findByText("This video didn't load.")).toBeInTheDocument()
    expect(reportReviewPlaybackFailure).not.toHaveBeenCalled()
  })
})

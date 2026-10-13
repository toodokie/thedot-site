import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
const { saveReviewDraft, sendReviewDrafts } = vi.hoisted(() => ({ saveReviewDraft: vi.fn(), sendReviewDrafts: vi.fn() }))
vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft, discardReviewDraft: vi.fn(), sendReviewDrafts, reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/playback-actions', () => ({ reportReviewPlaybackFailure: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({ default: () => <div data-testid="history" /> }))

import type { ContentRow } from '@/lib/portal/data'
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, type DeriveInput } from './derive'
import PieceWorkspace from './PieceWorkspace'
import { stubDialogs } from './test-utils'

import type { ReviewAsset } from '@/lib/portal/review-assets'

const SCRIPT = '**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION'
const frames = [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '9 s', url: 'https://signed.example/f2.jpg' }]
const reelPreview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: 'https://signed.example/poster.jpg',
  frames, expiresAt: '2026-10-03T12:10:00.000Z',
}

function asset(key: string, kind: ReviewAsset['asset_kind'], width: number, height: number, channel = 'social'): ReviewAsset {
  return { id: key, content_version: 2, asset_key: key, label: key, channel, asset_kind: kind, url: `https://drive.google.com/${key}`,
    width_px: width, height_px: height, caption_status: 'not_applicable', review_note: null } as ReviewAsset
}
const VIDEO = asset('reel-video', 'video', 1080, 1920)
const REEL_COVER = asset('reel-cover', 'cover', 1080, 1920)

function data(input: { format?: string; blocks?: Array<{ key: string; label: string; body: string }>; previews?: SignedReviewPreview[];
  assets?: ReviewAsset[]; requests?: ContentRequestRow[] }) {
  const item = {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: input.format ?? 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: input.blocks ?? [
      { key: 'reel-script', label: 'Reel, on screen', body: SCRIPT },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
    ],
    state: 'needs_review',
  } as ContentRow
  const extra: Partial<DeriveInput> = {}
  return deriveWorkspaceData({
    slug: 'kanset', item, comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: input.requests ?? [],
    requestMessages: [], reviewAssets: input.assets ?? [VIDEO, REEL_COVER], previews: input.previews ?? [reelPreview],
    capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar', previewRefreshBase: '/api/client/kanset/review-previews',
    removalKey: 'k', seatRequestIds: (input.requests ?? []).map((r) => r.id), ...extra,
  })
}

function show(workspace: ReturnType<typeof data>) {
  return render(<PieceWorkspace data={workspace} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
}

function coverTile(): HTMLElement | null {
  return document.querySelector('[data-cover-tile]')
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  saveReviewDraft.mockReset()
  saveReviewDraft.mockImplementation(async () => ({ outcome: 'saved', draft: undefined }))
})

describe('the cover is reviewable on its own (Task 10b)', () => {
  it('shows a reel cover as its own first tile, ahead of the frames, with its own suggestion on the cover', async () => {
    show(data({}))
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    const grid = screen.getByRole('region', { name: 'What does hiring cost?: frames' })
    const tiles = within(grid).getAllByRole('listitem')
    expect(tiles).toHaveLength(3)
    expect(tiles[0]).toBe(coverTile())
    expect(within(tiles[0]).getByText('Cover')).toBeInTheDocument()
    expect(tiles[0].querySelector('img')).toHaveAttribute('src', 'https://signed.example/poster.jpg')
    // Frame numbering is unchanged: the cover is not frame 1.
    expect(within(tiles[1]).getByText('1 · 4.5 s')).toBeInTheDocument()
    expect(within(grid).getByText('2 frames')).toBeInTheDocument()
    expect(within(tiles[1]).getByRole('button', { name: 'Suggest a change to frame 1' })).toBeInTheDocument()

    fireEvent.click(within(tiles[0]).getByRole('button', { name: 'Suggest a change to the cover' }))
    const dialog = screen.getByRole('dialog', { name: 'Cover · Suggest a change' })
    fireEvent.change(within(dialog).getByLabelText('What should change?'), { target: { value: 'Use the warmer smile.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetKind: 'asset', targetKey: 'reel-cover', anchor: '', anchorLabel: 'Cover', targetLabel: 'Cover',
      urlSnapshot: 'https://drive.google.com/reel-cover', body: 'Use the warmer smile.',
    })))
  })

  it('keeps the cover tile while On-screen text collapses the frames', () => {
    show(data({}))
    expect(screen.getByText('2 frames')).toBeInTheDocument()
    expect(within(coverTile() as HTMLElement).getByRole('button', { name: 'Suggest a change to the cover' })).toBeInTheDocument()
  })

  it('labels a horizontal episode thumbnail "YouTube thumbnail"', () => {
    const trailer = { ...reelPreview, previewKey: 'trailer', reviewAssetKey: 'social-teaser', width: 1920, height: 1080 }
    show(data({ format: 'podcast', blocks: [{ key: 'social-caption', label: 'Caption', body: 'Caption.' }], previews: [trailer],
      assets: [asset('social-teaser', 'video', 1080, 1920), asset('youtube-cover', 'cover', 1280, 720)] }))
    const tile = coverTile() as HTMLElement
    expect(within(tile).getByText('YouTube thumbnail')).toBeInTheDocument()
    expect(within(tile).getByRole('button', { name: 'Suggest a change to the YouTube thumbnail' })).toBeInTheDocument()
  })

  it('shows an episode with two covers by destination, both covers visible (2026-10-06)', () => {
    const trailer = { ...reelPreview, previewKey: 'trailer', reviewAssetKey: 'social-teaser', width: 1920, height: 1080 }
    show(data({ format: 'podcast', blocks: [{ key: 'social-caption', label: 'Caption', body: 'Caption.' }], previews: [trailer],
      assets: [asset('social-teaser', 'video', 1080, 1920), asset('social-cover', 'cover', 1080, 1920), asset('youtube-cover', 'cover', 1280, 720)] }))
    expect(coverTile()).toBeNull()
    expect(screen.getByRole('region', { name: 'social-cover' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'youtube-cover' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'youtube-cover' }))
      .getByRole('button', { name: 'Suggest a change to youtube-cover' })).toBeInTheDocument()
  })

  it('saves a note on a grouped cover against that cover asset (2026-10-06)', async () => {
    const trailer = { ...reelPreview, previewKey: 'trailer', reviewAssetKey: 'social-teaser', width: 1920, height: 1080 }
    show(data({ format: 'podcast', blocks: [{ key: 'social-caption', label: 'Caption', body: 'Caption.' }], previews: [trailer],
      assets: [asset('social-teaser', 'video', 1080, 1920), asset('social-cover', 'cover', 1080, 1920), asset('youtube-cover', 'cover', 1280, 720)] }))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to youtube-cover' }))
    const dialog = screen.getByRole('dialog', { name: 'youtube-cover · Suggest a change' })
    fireEvent.change(within(dialog).getByLabelText('What should change?'), { target: { value: 'Bigger faces.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetKind: 'asset', targetKey: 'youtube-cover', anchor: '', targetLabel: 'youtube-cover',
      urlSnapshot: 'https://drive.google.com/youtube-cover', body: 'Bigger faces.',
    })))
  })

  it('shows no tile without a cover', () => {
    show(data({ previews: [{ ...reelPreview, posterUrl: null }], assets: [VIDEO] }))
    expect(coverTile()).toBeNull()
    expect(screen.queryByText('Cover')).not.toBeInTheDocument()
  })

  it('shows the poster without a suggestion when there is no cover asset to target', () => {
    show(data({ assets: [VIDEO] }))
    const tile = coverTile() as HTMLElement
    expect(within(tile).getByText('Cover')).toBeInTheDocument()
    expect(within(tile).queryByRole('button')).not.toBeInTheDocument()
  })

  it('leaves a website article on its Cover image tab', () => {
    show(data({ format: 'article', blocks: [{ key: 'article-body', label: 'Article', body: '# Title\n\nOpening.' }],
      previews: [], assets: [asset('website-cover', 'cover', 1500, 1000, 'website')] }))
    expect(coverTile()).toBeNull()
    expect(screen.getByRole('tab', { name: /Cover image/ })).toBeInTheDocument()
  })

  it('a sent cover note shows on the cover tile with her exact words', () => {
    show(data({ requests: [{
      id: 'r1', client_id: 'c', content_id: 'item-1', request_type: 'edit', base_version: 2, status: 'pending', requester_name: 'Maria',
      payload: { target_kind: 'asset', target_key: 'reel-cover', target_label: 'Cover', url_snapshot: 'https://drive.google.com/reel-cover',
        proposed_text: 'Use the warmer smile, the one from the second take.' },
      created_at: '2026-10-03T14:00:00.000Z', updated_at: '2026-10-03T14:00:00.000Z', reconciled_at: null, reconciled_by: null,
      canonical_version: null, resolution_note: null, canonical_content_key: null,
    }] }))
    const details = within(coverTile() as HTMLElement).getByText('Sent · being applied').closest('details') as HTMLDetailsElement
    expect(details).toHaveTextContent('Use the warmer smile, the one from the second take.')
    expect(screen.queryByText(/^Sent edits/)).not.toBeInTheDocument()
  })
})

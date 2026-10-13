import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/playback-actions', () => ({ reportReviewPlaybackFailure: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/option-actions', () => ({ pickReviewOption: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({ default: () => <div data-testid="history" /> }))

import type { ContentRow } from '@/lib/portal/data'
import type { OptionPick } from '@/lib/portal/review-asset-options'
import { deriveWorkspaceData } from './derive'
import { EP4_TRAILER, EP4_V2, LINKEDIN_EP4 } from './ep4.fixtures'
import PieceWorkspace from './PieceWorkspace'
import { stubDialogs } from './test-utils'

type Fixture = typeof EP4_V2
function show(format: string, fixture: Fixture, version: number, blocks: ContentRow['copy_blocks'], optionPicks: OptionPick[] = []) {
  const item = {
    id: 'item-1', content_id: `piece-${format}`, title: 'Kanset Talks Ep. 4', format, pillar: 'podcast', platforms: fixture.platforms,
    status: 'draft', planned_date: '2026-10-08', schedule_state: 'unverified', publication_state: 'unverified', canva_url: null,
    drive_url: null, client_body: null, fact_check: 'confirmed', version, current_decision: null, fact_check_scope: 'required',
    fact_check_exemption: null, fact_check_ledger: [], copy_blocks: blocks, state: 'needs_review',
  } as ContentRow
  const data = deriveWorkspaceData({
    slug: 'kanset', item, comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: [], requestMessages: [],
    reviewAssets: fixture.assets, previews: fixture.previews, optionPicks,
    capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back', previewRefreshBase: '/api/client/kanset/review-previews',
    removalKey: 'k', seatRequestIds: [],
  })
  render(<PieceWorkspace data={data} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
  return data
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('the three pieces from Anastasia\'s 2026-10-06 review', () => {
  it('case 1: ep4 v2 shows the cut preview\'s four YouTube covers as 16:9 frames, not 9:16 tiles', () => {
    show('podcast', EP4_V2, 2, [{ key: 'youtube-title', label: 'YouTube title', body: 'Life after PR' }])
    const youtube = screen.getByRole('region', { name: 'YouTube' })
    const strip = within(youtube).getByRole('region', { name: 'Kanset Talks Ep. 4: frames' })
    const list = within(strip).getByRole('list')
    expect(list.style.getPropertyValue('--frame-ar')).toBe('1280 / 720')
    expect(within(strip).getAllByRole('listitem').map((li) => li.textContent?.split('Suggest')[0]))
      .toEqual(['1 · YouTube test cover 1: your usual style', '2 · YouTube test cover 2: both of you up close',
        '3 · YouTube test cover 3, option A: rust', '4 · YouTube test cover 3, option B: teal'])
    // Every asset is on the page, under its destination; the Instagram trailer plays at 9:16.
    for (const asset of EP4_V2.assets) expect(screen.getByRole('region', { name: asset.label })).toBeInTheDocument()
    const ig = screen.getByLabelText('Kanset Talks Ep. 4: Instagram trailer, 24 seconds')
    expect(ig.style.getPropertyValue('--media-ar')).toBe('1080 / 1920')
    const cover1 = screen.getByRole('region', { name: 'Test cover 1: your usual style' })
    expect(cover1.style.getPropertyValue('--media-ar')).toBe('1280 / 720')
    // The cut preview keyed to youtube-cover gives that cover its image (the poster).
    expect(cover1.querySelector('img')).toHaveAttribute('src', 'https://signed.example/ep4-cut-poster.jpg')
  })

  it('case 2: the LinkedIn ep4 video plays at 4:5 on the single-video layout', () => {
    const data = show('linkedin-post', LINKEDIN_EP4 as unknown as Fixture, 1,
      [{ key: 'linkedin-caption', label: 'LinkedIn caption', body: 'Caption.' }])
    expect(data.mediaGroups).toBeNull()
    const video = screen.getByLabelText('Kanset Talks Ep. 4: video')
    expect(video.style.getPropertyValue('--media-ar')).toBe('1080 / 1350')
    expect(video.style.getPropertyValue('--media-wr')).toBe('0.8')
    expect(document.querySelector('[data-cover-tile] img, [data-cover-tile] span')?.getAttribute('style')).toContain('1080 / 1350')
  })

  it('case 3: the ep4 trailer reel shows both reel covers as one option group she can pick from', () => {
    show('reel', EP4_TRAILER as unknown as Fixture, 1, [{ key: 'social-caption', label: 'Instagram + Facebook caption', body: 'Caption.' }],
      [{ option_group: 'social-cover', asset_key: 'social-cover' }])
    const shared = screen.getByRole('region', { name: 'Instagram and Facebook' })
    expect(within(shared).getByRole('region', { name: 'Reel cover, option A: teal' })).toHaveTextContent('Chosen')
    expect(within(shared).getByRole('button', { name: 'Choose Reel cover, option B: rust' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Instagram' })).getByLabelText('Kanset Talks Ep. 4: Instagram trailer, 24 seconds'))
      .toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Facebook' })).getByRole('link', { name: 'Open Facebook trailer, 24 seconds' }))
      .toBeInTheDocument()
  })
})

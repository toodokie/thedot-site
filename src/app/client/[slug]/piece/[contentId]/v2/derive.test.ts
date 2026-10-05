import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))

import type { ContentRow } from '@/lib/portal/data'
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, pieceFormatLabel, type DeriveInput } from './derive'
import { readOnlyWorkspace } from './read-only'

function item(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook', 'youtube'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: [
      { key: 'reel-script', label: 'Reel, on screen', body: '**1.** A\n\n**2.** B' },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
      { key: 'youtube-package', label: 'YouTube Short', body: '**Title:** T' },
    ],
    state: 'needs_review', ...overrides,
  } as ContentRow
}

function asset(asset_key: string, asset_kind: ReviewAsset['asset_kind']): ReviewAsset {
  return { id: asset_key, content_version: 2, asset_key, label: 'Reel video', channel: 'social', asset_kind,
    url: 'https://drive.google.com/reel', width_px: 1080, height_px: 1920, caption_status: 'not_applicable', review_note: null }
}

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '4.5 s', url: 'https://signed.example/f2.jpg' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

function request(overrides: Partial<ContentRequestRow>): ContentRequestRow {
  return {
    id: 'r1', client_id: 'c', content_id: 'item-1', request_type: 'edit', base_version: 2,
    payload: { target_kind: 'copy_block', target_key: 'social-caption', target_label: 'Caption', proposed_text: 'New' },
    status: 'pending', requester_name: 'Maria', created_at: '2026-09-30T17:20:00Z', updated_at: '', reconciled_at: null,
    reconciled_by: null, canonical_version: null, resolution_note: null, canonical_content_key: null, base_copy_text: null,
    ...overrides,
  }
}

function input(overrides: Partial<DeriveInput> = {}): DeriveInput {
  return {
    slug: 'kanset', item: item(), comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: [],
    requestMessages: [], reviewAssets: [asset('reel-video', 'video')], previews: [preview],
    capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar',
    previewRefreshBase: '/api/client/kanset/review-previews', removalKey: 'key-1', seatRequestIds: [], ...overrides,
  }
}

describe('deriveWorkspaceData', () => {
  it('lays out a reel with its preview, tabs and frame-level visual target', () => {
    const data = deriveWorkspaceData(input())
    expect(data.layout).toBe('vertical')
    expect(data.tabs.map((tab) => tab.key)).toEqual(['onscreen', 'caption', 'youtube'])
    expect(data.previewRefreshUrl).toBe('/api/client/kanset/review-previews/p1')
    expect(data.visualTarget).toEqual({ kind: 'asset', key: 'reel-video', label: 'Reel video', url: 'https://drive.google.com/reel', anchors: true })
    expect(data.mediaPending).toBe(false)
    expect(data.fallbackMedia).toEqual([])
    expect(data.packageReady).toBe(true)
    expect(data.formatLabel).toBe('Reel · Instagram, Facebook, YouTube')
    expect(data.canEdit).toBe(true)
    expect(data.removal).toEqual({ slug: 'kanset', contentId: 'kanset-2026-10-reel', idempotencyKey: 'key-1' })
  })

  it('falls back to the design link, which cannot take a frame note', () => {
    const data = deriveWorkspaceData(input({ previews: [], reviewAssets: [], item: item({ canva_url: 'https://www.canva.com/design/x/view' }) }))
    expect(data.fallbackMedia).toEqual([{ label: 'Canva', url: 'https://www.canva.com/design/x/view' }])
    expect(data.visualTarget).toEqual({ kind: 'design_link', key: 'canva', label: 'Canva design', url: 'https://www.canva.com/design/x/view', anchors: false })
    expect(data.mediaPending).toBe(false)
  })

  it('waits for media when there is nothing to show', () => {
    const data = deriveWorkspaceData(input({ previews: [], reviewAssets: [] }))
    expect(data.mediaPending).toBe(true)
    expect(data.visualTarget).toBeNull()
    expect(data.packageReady).toBe(false)
    expect(data.missing).toEqual(['linked design'])
  })

  it('locks editing once the revision has started and summarises what was sent', () => {
    const data = deriveWorkspaceData(input({ requests: [request({ status: 'applying' })] }))
    expect(data.revisionStarted).toBe(true)
    expect(data.canEdit).toBe(false)
    expect(data.sentSummary).toEqual({ count: 1, dateLabel: 'Sep 30' })
  })

  it('closes editing once she has decided or the piece is posted (one review)', () => {
    for (const state of ['approved', 'scheduled', 'partially_scheduled', 'schedule_failed', 'reschedule_pending',
      'cancel_pending', 'publish_failed', 'live', 'partially_live', 'archived'] as const) {
      expect(deriveWorkspaceData(input({ item: item({ state }) })).canEdit, state).toBe(false)
    }
    expect(deriveWorkspaceData(input()).canEdit).toBe(true)
  })

  it('keeps editing open while her sent edits only wait, so she can send additional edits', () => {
    const waiting = deriveWorkspaceData(input({ item: item({ state: 'with_dot' }), requests: [request({ status: 'pending' })] }))
    expect(waiting.canEdit).toBe(true)
    const applying = deriveWorkspaceData(input({ item: item({ state: 'with_dot' }), requests: [request({ status: 'applying' })] }))
    expect(applying.canEdit).toBe(false)
  })

  it('reads an approved, scheduled piece as approved with its date', () => {
    const data = deriveWorkspaceData(input({
      item: item({ state: 'scheduled' }),
      schedule: { targets: [{ id: 't', content_id: 'item-1', content_version: 2, destination: 'instagram', required: true,
        scheduled_at: '2026-10-02T22:00:00Z', status: 'scheduled', verified_at: null, verification_label: '' }], requests: [] },
    }))
    expect(data.approvedLabel).toBe('Scheduled · Fri Oct 2, 6 p.m. Instagram')
    expect(data.canRequestSchedule).toBe(true)
    expect(data.scheduleHasExternalTargets).toBe(true)
  })

  it('names confirmed times per destination, by day when they span several days', () => {
    const target = (destination: string, scheduled_at: string) => ({ id: destination, content_id: 'item-1', content_version: 2,
      destination, required: true, scheduled_at, status: 'scheduled' as const, verified_at: null, verification_label: '' })
    const oneDay = deriveWorkspaceData(input({ item: item({ state: 'scheduled' }), schedule: { targets: [
      target('facebook', '2026-10-05T22:30:00Z'), target('instagram', '2026-10-05T22:30:00Z'), target('youtube', '2026-10-05T23:00:00Z'),
    ], requests: [] } }))
    expect(oneDay.approvedLabel).toBe('Scheduled · Mon Oct 5, 6:30 p.m. Facebook, Instagram · 7 p.m. YouTube')
    const twoDays = deriveWorkspaceData(input({ item: item({ state: 'scheduled' }), schedule: { targets: [
      target('instagram', '2026-10-05T22:30:00Z'), target('youtube', '2026-10-06T13:00:00Z'),
    ], requests: [] } }))
    expect(twoDays.approvedLabel).toBe('Scheduled · Mon Oct 5, 6:30 p.m. Instagram · Tue Oct 6, 9 a.m. YouTube')
  })

  it('keeps "Approved · posts" while any provider time is unconfirmed', () => {
    const data = deriveWorkspaceData(input({ item: item({ state: 'approved' }), schedule: { targets: [
      { id: 't', content_id: 'item-1', content_version: 2, destination: 'instagram', required: true,
        scheduled_at: null, status: 'pending', verified_at: null, verification_label: 'not yet verified' },
    ], requests: [] } }))
    expect(data.approvedLabel).toBe('Approved · posts Fri Oct 2')
  })

  // Mirrors kanset-2026-10-05-news-roundup as read from production on 2026-10-05: her two edits
  // (caption, on-screen) sent on v1 were applied into v2 (status applied, canonical_version 2) and
  // released by courtesy release; v3 is a later agency courtesy release (YouTube description only)
  // and is the version she sees, approved, with provider times not yet confirmed.
  it('shows her applied edits on a decided piece even when a later agency version carries them', () => {
    const roundup = deriveWorkspaceData(input({
      item: item({ version: 3, state: 'approved', current_decision: null, planned_date: '2026-10-05' }),
      requests: [
        request({ id: 'r-caption', base_version: 1, status: 'applied', canonical_version: 2, base_copy_text: 'Old caption.' }),
        request({ id: 'r-script', base_version: 1, status: 'applied', canonical_version: 2, base_copy_text: '**1.** Old',
          payload: { target_kind: 'copy_block', target_key: 'reel-script', block_key: 'reel-script', target_label: 'Reel, on screen', proposed_text: 'New' } }),
      ],
      schedule: { targets: ['facebook', 'instagram', 'youtube'].map((destination) => ({ id: destination, content_id: 'item-1',
        content_version: 3, destination, required: true, scheduled_at: null, status: 'pending' as const, verified_at: null,
        verification_label: 'not yet verified' })), requests: [] },
    }))
    expect(roundup.reReview).toBe(false)
    expect(roundup.editsApplied).toBe(true)
    expect(roundup.decided).toBe(true)
    expect(roundup.updatedTabKeys).toEqual(['onscreen', 'caption'])
    expect(roundup.updatedLine).toBe('on-screen text, caption')
    expect(roundup.beforeByBlock).toEqual({ 'social-caption': 'Old caption.', 'reel-script': '**1.** Old' })
    expect(roundup.approvedLabel).toBe('Approved · posts Mon Oct 5')
  })

  it('shows only the latest round of applied edits, and none before she has decided', () => {
    const rounds = [
      request({ id: 'old', base_version: 1, status: 'applied', canonical_version: 2, base_copy_text: 'First.' }),
      request({ id: 'new', base_version: 3, status: 'superseded', canonical_version: 4, base_copy_text: '**1.** Third',
        payload: { target_kind: 'copy_block', target_key: 'reel-script', target_label: 'Reel, on screen', proposed_text: 'x' } }),
    ]
    const latest = deriveWorkspaceData(input({ item: item({ version: 5, state: 'scheduled' }), requests: rounds }))
    expect(latest.beforeByBlock).toEqual({ 'reel-script': '**1.** Third' })
    expect(latest.updatedLine).toBe('on-screen text')
    const undecided = deriveWorkspaceData(input({ item: item({ version: 3, state: 'with_dot' }), requests: rounds.slice(0, 1) }))
    expect(undecided.editsApplied).toBe(false)
    expect(undecided.decided).toBe(false)
    expect(undecided.updatedLine).toBeNull()
    expect(undecided.beforeByBlock).toEqual({})
  })

  it('counts a posted piece as decided and a plain approval without her edits as not edited', () => {
    expect(deriveWorkspaceData(input({ item: item({ state: 'live' }) })).decided).toBe(true)
    const plain = deriveWorkspaceData(input({ item: item({ state: 'approved' }) }))
    expect(plain.decided).toBe(true)
    expect(plain.editsApplied).toBe(false)
    expect(plain.updatedLine).toBeNull()
  })

  it('names what changed after her feedback and keeps the previous text for highlighting', () => {
    const data = deriveWorkspaceData(input({ requests: [request({
      base_version: 1, status: 'applied', canonical_version: 2, base_copy_text: 'Old caption.',
    })] }))
    expect(data.reReview).toBe(true)
    expect(data.updatedTabKeys).toEqual(['caption'])
    expect(data.updatedLine).toBe('caption')
    expect(data.beforeByBlock).toEqual({ 'social-caption': 'Old caption.' })
  })

  it('hides removal while one is pending and the date request without schedule rights', () => {
    const data = deriveWorkspaceData(input({
      requests: [request({ id: 'a', request_type: 'archive', status: 'pending', payload: {} })],
      capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: false },
      item: item({ state: 'approved' }),
    }))
    expect(data.removal).toBeNull()
    expect(data.canRequestSchedule).toBe(false)
  })

  it('calls a horizontal video a trailer only for a podcast episode with a teaser or trailer preview', () => {
    const wide = { ...preview, width: 1920, height: 1080, frames: [] }
    const drive = 'https://drive.google.com/full'
    const cut = deriveWorkspaceData(input({ item: item({ format: 'video', drive_url: drive }), previews: [{ ...wide, previewKey: 'cut' }] }))
    expect(cut.layout).toBe('horizontal')
    expect(cut.episodeTrailer).toBe(false)
    expect(cut.episodeDriveUrl).toBeNull()
    const episodeCut = deriveWorkspaceData(input({ item: item({ format: 'podcast', drive_url: drive }), previews: [{ ...wide, previewKey: 'cut' }] }))
    expect(episodeCut.episodeTrailer).toBe(false)
    expect(episodeCut.episodeDriveUrl).toBe(drive)
    for (const previewKey of ['teaser', 'trailer']) {
      const trailer = deriveWorkspaceData(input({ item: item({ format: 'podcast', drive_url: drive }), previews: [{ ...wide, previewKey }] }))
      expect(trailer.episodeTrailer).toBe(true)
      expect(trailer.episodeDriveUrl).toBe(drive)
    }
    expect(deriveWorkspaceData(input()).episodeTrailer).toBe(false)
  })

  it('labels formats plainly', () => {
    expect(pieceFormatLabel('podcast_article', ['squarespace'])).toBe('Website article · kanset.com')
    expect(pieceFormatLabel('linkedin-post', ['linkedin'])).toBe('LinkedIn post · LinkedIn')
    expect(pieceFormatLabel(null, [])).toBe('Piece')
  })
})

describe('readOnlyWorkspace (plan 5 agency view)', () => {
  it('turns off every way to act while keeping what Maria sees', () => {
    const full = deriveWorkspaceData(input({ showIntro: true }))
    const view = readOnlyWorkspace(full)
    expect(view).toMatchObject({
      canEdit: false, canDecide: false, canComment: false, canSubmitRequests: false,
      canRequestSchedule: false, removal: null, showIntro: false,
    })
    expect(view.tabs).toEqual(full.tabs)
    expect(view.preview).toEqual(full.preview)
    expect(view.status).toEqual(full.status)
  })
})

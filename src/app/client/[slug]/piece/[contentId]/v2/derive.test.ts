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

  it('reads an approved, scheduled piece as approved with its date', () => {
    const data = deriveWorkspaceData(input({
      item: item({ state: 'scheduled' }),
      schedule: { targets: [{ id: 't', content_id: 'item-1', content_version: 2, destination: 'instagram', required: true,
        scheduled_at: '2026-10-02T22:00:00Z', status: 'scheduled', verified_at: null, verification_label: '' }], requests: [] },
    }))
    expect(data.approvedLabel).toBe('Approved · posts Fri Oct 2')
    expect(data.canRequestSchedule).toBe(true)
    expect(data.scheduleHasExternalTargets).toBe(true)
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

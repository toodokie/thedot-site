import { fireEvent, render, screen, within } from '@testing-library/react'
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
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, type DeriveInput } from './derive'
import PieceWorkspace from './PieceWorkspace'
import { stubDialogs } from './test-utils'

const SCRIPT = '**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION'
const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '9 s', url: 'https://signed.example/f2.jpg' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

let next = 0
function request(payload: Record<string, unknown>, extra: Partial<ContentRequestRow> = {}): ContentRequestRow {
  next += 1
  return {
    id: `r${next}`, client_id: 'c', content_id: 'item-1', request_type: 'edit', base_version: 2, payload, status: 'pending',
    requester_name: 'Maria', created_at: '2026-10-03T14:00:00.000Z', updated_at: '2026-10-03T14:00:00.000Z', reconciled_at: null,
    reconciled_by: null, canonical_version: null, resolution_note: null, canonical_content_key: null, ...extra,
  }
}

function data(requests: ContentRequestRow[], extra: Partial<DeriveInput> = {}) {
  const item = {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: [
      { key: 'reel-script', label: 'Reel, on screen', body: SCRIPT },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
    ],
    state: 'needs_review',
  } as ContentRow
  return deriveWorkspaceData({
    slug: 'kanset', item, comments: [], schedule: { targets: [], requests: [] }, publication: [], requests,
    requestMessages: [], reviewAssets: [{ id: 'a', content_version: 2, asset_key: 'reel-video', label: 'Reel video', channel: 'social',
      asset_kind: 'video', url: 'https://drive.google.com/r', width_px: 1080, height_px: 1920, caption_status: 'not_applicable', review_note: null }],
    previews: [preview], capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar', previewRefreshBase: '/api/client/kanset/review-previews',
    removalKey: 'k', seatRequestIds: requests.map((r) => r.id), ...extra,
  })
}

// What a disclosure shows as her text: removed words and screen-reader labels left out.
function shownText(element: Element): string {
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('del').forEach((node) => node.remove())
  return (copy.textContent ?? '').replaceAll('added: ', '').replace(/\s+/g, ' ')
}

function marker(scope: HTMLElement): HTMLDetailsElement {
  return within(scope).getByText('Sent · being applied').closest('details') as HTMLDetailsElement
}

function show(requests: ContentRequestRow[], mode: 'client' | 'preview' = 'client', options: { drafts?: ServerDraftRow[]; extra?: Partial<DeriveInput> } = {}) {
  return render(<PieceWorkspace data={data(requests, options.extra)} mode={mode} draftScope={mode === 'client' ? 'maria' : 'read-only-preview:Maria'}
    serverDrafts={mode === 'client' ? options.drafts ?? [] : null} ticks={[]} />)
}

// A new unsent draft of the on-screen text, written after the sent edit.
function scriptDraft(body: string): ServerDraftRow {
  return {
    id: 'd1', content_item_id: 'item-1', base_version: 2, target_kind: 'copy_block', target_key: 'reel-script', anchor: '',
    anchor_label: null, target_label: 'Reel, on screen', url_snapshot: null, quoted_text: null, body, status: 'unsent',
    saved_at: '2026-10-04T10:00:00.000Z', updated_at: '2026-10-04T10:00:00.000Z', carried_over_at: null,
    carried_over_to_version: null, send_failed_at: null, last_send_error: null,
  } as ServerDraftRow
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  saveReviewDraft.mockClear()
  sendReviewDrafts.mockClear()
})

describe('sent edits stay where she made them', () => {
  it('a sent caption edit shows her tracked change and the date, collapsed by default', () => {
    show([request({ target_kind: 'copy_block', target_key: 'social-caption', proposed_text: 'Caption, changed for her.' })])
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    const details = marker(screen.getByRole('tabpanel'))
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')).toHaveTextContent('Sent · being applied')
    expect(shownText(details)).toContain('Caption, changed for her.')
    expect(details.querySelector('del')).toHaveTextContent('Caption.')
    expect(details).toHaveTextContent('Sent Sat Oct 3')
    expect(screen.queryByText('Saved · not sent yet')).not.toBeInTheDocument()
  })

  it('a sent frame text edit shows on that frame only', () => {
    show([request({ target_kind: 'copy_block', target_key: 'reel-script', proposed_text: SCRIPT.replace('PER POSITION', 'PER JOB') })])
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    expect(within(rows[0]).queryByText('Sent · being applied')).not.toBeInTheDocument()
    expect(marker(rows[1]).querySelector('ins')).toHaveTextContent('JOB')
  })

  it('a sent frame note shows on that frame with her words', () => {
    show([request({ target_kind: 'asset', target_key: 'reel-video', url_snapshot: 'https://drive.google.com/r',
      proposed_text: 'Frame 2: Make the $1,000 bigger, it gets lost.' })])
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    expect(within(rows[0]).queryByText('Sent · being applied')).not.toBeInTheDocument()
    expect(marker(rows[1])).toHaveTextContent('Make the $1,000 bigger, it gets lost.')
    // The frame grid shows it too when it is open.
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    const grid = screen.getByRole('region', { name: 'What does hiring cost?: frames' })
    expect(marker(within(grid).getAllByRole('listitem')[1])).toHaveTextContent('Make the $1,000 bigger, it gets lost.')
  })

  it('a sent whole-video note shows under the video with her words', () => {
    show([request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'Slow the ending down a little.' })])
    const media = screen.getByRole('complementary', { name: 'Media' })
    expect(marker(media)).toHaveTextContent('Slow the ending down a little.')
    expect(marker(media)).toHaveTextContent('Sent Sat Oct 3')
  })

  it('lists an edit whose spot is gone under one Sent edits disclosure at the top, never dropping it', () => {
    show([
      request({ target_kind: 'asset', target_key: 'reel-video', target_label: 'Reel video', proposed_text: 'Frame 7: Cut this frame.' }),
      request({ target_kind: 'copy_block', target_key: 'old-block', target_label: 'Old caption', proposed_text: 'Old words.' }),
    ])
    const copy = screen.getByRole('region', { name: 'Copy' })
    const top = within(copy).getByText('Sent edits (2)').closest('details') as HTMLDetailsElement
    expect(top.open).toBe(false)
    expect(top).toHaveTextContent('Reel video · Frame 7')
    expect(top).toHaveTextContent('Cut this frame.')
    expect(top).toHaveTextContent('Old caption')
    expect(top).toHaveTextContent('Old words.')
  })

  it('shows nothing for applied or superseded requests, or for an earlier version', () => {
    const payload = { target_kind: 'copy_block', target_key: 'social-caption', proposed_text: 'Changed.' }
    show([request(payload, { status: 'applied' }), request(payload, { status: 'superseded' }), request(payload, { base_version: 1 })])
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    expect(screen.queryByText('Sent · being applied')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Sent edits/)).not.toBeInTheDocument()
  })

  it('renders in the read-only preview without any write', () => {
    show([request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'Slow the ending down a little.' })], 'preview')
    const details = marker(screen.getByRole('complementary', { name: 'Media' }))
    fireEvent.click(details.querySelector('summary') as HTMLElement)
    expect(details).toHaveTextContent('Slow the ending down a little.')
    expect(saveReviewDraft).not.toHaveBeenCalled()
    expect(sendReviewDrafts).not.toHaveBeenCalled()
  })
})

describe('sent markers follow the released frame through a newer draft (review fixes)', () => {
  const sentFrameTwo = () => request({ target_kind: 'copy_block', target_key: 'reel-script', proposed_text: SCRIPT.replace('PER POSITION', 'PER JOB') })

  it('stays on the right frame when her new draft inserts a frame before it', () => {
    show([sentFrameTwo()], 'client', { drafts: [scriptDraft('**1.** FOR EMPLOYERS\n\n**2.** A NEW FRAME\n\n**3.** $1,000 PER POSITION')] })
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).queryByText('Sent · being applied')).not.toBeInTheDocument()
    expect(marker(rows[2]).querySelector('ins')).toHaveTextContent('JOB')
    expect(screen.queryByText(/^Sent edits/)).not.toBeInTheDocument()
  })

  it('moves to the top list when no frame in her draft confidently matches', () => {
    show([sentFrameTwo()], 'client', { drafts: [scriptDraft('**1.** FOR EMPLOYERS\n\n**2.** REWRITTEN\n\n**3.** ALSO NEW')] })
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    rows.forEach((row) => expect(within(row).queryByText('Sent · being applied')).not.toBeInTheDocument())
    const top = screen.getByText('Sent edits (1)').closest('details') as HTMLDetailsElement
    expect(top.querySelector('ins')).toHaveTextContent('JOB')
  })

  it('keeps a video-still note off a text frame that does not correspond to it', () => {
    const three = { ...preview, frames: [...preview.frames, { label: '12 s', url: 'https://signed.example/f3.jpg' }] }
    show([request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'Frame 2: Darker background.' })], 'client',
      { extra: { previews: [three] } })
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('listitem')
    rows.forEach((row) => expect(within(row).queryByText('Sent · being applied')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    const grid = screen.getByRole('region', { name: 'What does hiring cost?: frames' })
    expect(marker(within(grid).getAllByRole('listitem')[1])).toHaveTextContent('Darker background.')
  })
})

describe('sent markers are her own seat\'s (review fix 3)', () => {
  it('shows only the edits this seat sent, and none when the seat read gave nothing', () => {
    const mine = request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'Mine: slower ending.' })
    const theirs = request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'A colleague: faster ending.' })
    const { unmount } = show([mine, theirs], 'client', { extra: { seatRequestIds: [mine.id] } })
    const media = screen.getByRole('complementary', { name: 'Media' })
    expect(marker(media)).toHaveTextContent('Mine: slower ending.')
    expect(media).not.toHaveTextContent('A colleague: faster ending.')
    unmount()
    show([mine, theirs], 'client', { extra: { seatRequestIds: [] } })
    expect(screen.queryByText('Sent · being applied')).not.toBeInTheDocument()
  })
})

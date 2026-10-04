import { describe, expect, it } from 'vitest'
import type { ContentRequestRow } from '@/lib/portal/request-target'
import type { CopyTab } from './copy-tabs'
import { buildSentEditIndex, placeReleasedSegments, splitVisualNote } from './sent-edits'

const SCRIPT = '**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION'
const tabs: CopyTab[] = [
  { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel', body: SCRIPT }] },
  { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: 'Caption.' }] },
]

function request(payload: Record<string, unknown>, extra: Partial<ContentRequestRow> = {}): ContentRequestRow {
  return {
    id: `r-${Math.random()}`, client_id: 'c', content_id: 'i', request_type: 'edit', base_version: 2, payload, status: 'pending',
    requester_name: 'Maria', created_at: '2026-10-03T14:00:00.000Z', updated_at: '2026-10-03T14:00:00.000Z', reconciled_at: null,
    reconciled_by: null, canonical_version: null, resolution_note: null, canonical_content_key: null, ...extra,
  }
}

const base = { version: 2, tabs, visualKey: 'reel-video', coverKey: 'reel-cover', frameCount: 2, visualWord: 'frame' as const }

describe('splitVisualNote', () => {
  it('keeps a single note whole and splits the sent form by its labels', () => {
    expect(splitVisualNote('Slow the ending down.')).toEqual([{ label: null, text: 'Slow the ending down.' }])
    expect(splitVisualNote('General note: Warmer.\n\nFrame 2: Bigger number.\n\nIt should pop.\n\nFrame 3: Fine.')).toEqual([
      { label: 'General note', text: 'Warmer.' },
      { label: 'Frame 2', text: 'Bigger number.\n\nIt should pop.' },
      { label: 'Frame 3', text: 'Fine.' },
    ])
  })
})

describe('buildSentEditIndex', () => {
  it('places a text edit on the frame it changed, against the released text', () => {
    const index = buildSentEditIndex({ ...base, requests: [request({ target_kind: 'copy_block', target_key: 'reel-script',
      proposed_text: SCRIPT.replace('PER POSITION', 'PER JOB') })] })
    expect(Object.keys(index.copy)).toEqual(['reel-script:frame:1'])
    expect(index.copy['reel-script:frame:1'][0].content).toEqual({ kind: 'text', base: '**2.** $1,000 PER POSITION', proposed: '**2.** $1,000 PER JOB' })
  })

  it('places a whole-block edit on the block', () => {
    const index = buildSentEditIndex({ ...base, requests: [request({ block_key: 'social-caption', proposed_text: 'Caption, changed.' })] })
    expect(index.copy['social-caption:whole'][0].content).toEqual({ kind: 'text', base: 'Caption.', proposed: 'Caption, changed.' })
  })

  it('places visual notes on the whole video, a frame and the cover, verbatim', () => {
    const index = buildSentEditIndex({ ...base, requests: [
      request({ target_kind: 'asset', target_key: 'reel-video', proposed_text: 'General note: Warmer.\n\nFrame 2: Bigger number.' }),
      request({ target_kind: 'asset', target_key: 'reel-cover', target_label: 'Cover', proposed_text: 'Brighter face.' }),
    ] })
    expect(index.visual.whole[0].content).toEqual({ kind: 'note', text: 'Warmer.' })
    expect(index.visual['frame:2'][0].content).toEqual({ kind: 'note', text: 'Bigger number.' })
    expect(index.visual.cover[0].content).toEqual({ kind: 'note', text: 'Brighter face.' })
    expect(index.unmatched).toEqual([])
  })

  it('never drops an edit whose spot is gone: it goes to the unmatched list', () => {
    const index = buildSentEditIndex({ ...base, requests: [
      request({ target_kind: 'asset', target_key: 'reel-video', target_label: 'Reel video', proposed_text: 'Frame 9: Too late.' }),
      request({ target_kind: 'copy_block', target_key: 'old-block', target_label: 'Old block', proposed_text: 'Gone.' }),
      request({ target_kind: 'copy_block', target_key: 'reel-script', proposed_text: '**1.** ONE\n\n**2.** TWO\n\n**3.** THREE' }),
    ] })
    expect(index.unmatched.map((entry) => entry.label)).toEqual(['Reel video · Frame 9', 'Old block', 'Reel'])
    expect(index.unmatched[0].content).toEqual({ kind: 'note', text: 'Too late.' })
    expect(index.copy).toEqual({})
    expect(index.visual).toEqual({})
  })

  it('shows nothing for applied, superseded or answered requests, or for another version', () => {
    const payload = { target_kind: 'copy_block', target_key: 'social-caption', proposed_text: 'Changed.' }
    const index = buildSentEditIndex({ ...base, requests: [
      request(payload, { status: 'applied' }), request(payload, { status: 'superseded' }), request(payload, { status: 'answered' }),
      request(payload, { status: 'rejected' }), request(payload, { base_version: 1 }), request(payload, { request_type: 'archive' }),
    ] })
    expect(index).toEqual({ copy: {}, visual: {}, unmatched: [] })
  })
})

describe('only her own seat', () => {
  it('keeps only requests this seat sent when the seat request ids are known', () => {
    const mine = request({ target_kind: 'copy_block', target_key: 'social-caption', proposed_text: 'Mine.' })
    const theirs = request({ target_kind: 'copy_block', target_key: 'social-caption', proposed_text: 'A colleague.' })
    const index = buildSentEditIndex({ ...base, requests: [mine, theirs], seatRequestIds: new Set([mine.id]) })
    expect(index.copy['social-caption:whole'].map((entry) => entry.content)).toEqual([{ kind: 'text', base: 'Caption.', proposed: 'Mine.' }])
  })
})

describe('placeReleasedSegments', () => {
  it('maps each shown segment to its released segment, by position when the shape is unchanged', () => {
    expect(placeReleasedSegments(SCRIPT, SCRIPT.replace('PER POSITION', 'PER JOB'), 'frames'))
      .toEqual({ releasedFor: [0, 1], orphaned: [] })
  })

  it('follows a released frame past an inserted frame, by its words', () => {
    expect(placeReleasedSegments(SCRIPT, '**1.** FOR EMPLOYERS\n\n**2.** NEW\n\n**3.** $1,000 PER POSITION', 'frames'))
      .toEqual({ releasedFor: [0, null, 1], orphaned: [] })
  })

  it('orphans a released frame with no confident match', () => {
    expect(placeReleasedSegments(SCRIPT, '**1.** FOR EMPLOYERS\n\n**2.** NEW\n\n**3.** OTHER', 'frames'))
      .toEqual({ releasedFor: [0, null, null], orphaned: [1] })
  })
})

// Sent edits stay where she made them (plan 4b amendment 2026-10-04, Task 10a). Her own sent,
// not-yet-applied requests for the version on screen, matched to the spot on the page each one
// came from: a frame, page or section of a copy block, a whole block, the whole video, one frame
// or page of the video or document, or the cover. A request whose spot is gone is never dropped:
// it lands in the unmatched list, shown once at the top of the copy area. Pure; read-only.
import { contentRequestTarget, type ContentRequestRow } from '../request-target'
import { isUnresolvedContentRequest } from '../request-status'
import type { CopyTab } from './copy-tabs'
import { segmentBlock, segmentText, type SegmentMode } from './segments'

export type SentContent =
  // A text edit we can compare with the released text: shown as her tracked change.
  | { kind: 'text'; base: string; proposed: string }
  // A text edit with no released text to compare against: shown as her proposed text.
  | { kind: 'proposed'; text: string }
  // A visual or whole-video note: shown verbatim.
  | { kind: 'note'; text: string }

export type SentEntry = { id: string; sentAt: string; label: string; content: SentContent }

export type SentEditIndex = {
  // By the copy spot: '<block key>:whole', '<block key>:frame:<i>', ':page:<i>', ':section:<i>'
  // (i is the segment's position, as in the panels' edit slots).
  copy: Record<string, SentEntry[]>
  // By the visual spot: 'whole', 'frame:<n>', 'page:<n>' (n counts from 1) or 'cover'.
  visual: Record<string, SentEntry[]>
  unmatched: SentEntry[]
}

export const EMPTY_SENT_EDITS: SentEditIndex = { copy: {}, visual: {}, unmatched: [] }

const MODES: Partial<Record<CopyTab['kind'], SegmentMode>> = { onscreen: 'frames', document: 'pages', article: 'sections' }
const SEGMENT_SPOT: Record<SegmentMode, string> = { frames: 'frame', pages: 'page', sections: 'section' }
const PART_LABEL = /(General note|Frame \d+|Page \d+|Cover): /
const STARTS_WITH_LABEL = new RegExp(`^${PART_LABEL.source}`)
const SPLIT_AT_LABEL = /\n\n(?=(?:General note|Frame \d+|Page \d+|Cover): )/

// The send joins several notes on one visual into one request, each as '<label>: <her words>'
// (migration 0093, send_review_drafts). One unanchored note is sent as her words alone.
export function splitVisualNote(text: string): Array<{ label: string | null; text: string }> {
  if (!STARTS_WITH_LABEL.test(text)) return [{ label: null, text }]
  return text.split(SPLIT_AT_LABEL).map((part) => {
    const match = STARTS_WITH_LABEL.exec(part)
    return match ? { label: match[1], text: part.slice(match[0].length) } : { label: null, text: part }
  })
}

function push(map: Record<string, SentEntry[]>, spot: string, entry: SentEntry): void {
  (map[spot] ??= []).push(entry)
}

export function buildSentEditIndex(input: {
  requests: ContentRequestRow[]
  version: number
  tabs: CopyTab[]
  // The visual her frame, page and whole-video notes target, and the cover tile's asset.
  visualKey: string | null
  coverKey: string | null
  frameCount: number
  visualWord: 'frame' | 'page'
}): SentEditIndex {
  const index: SentEditIndex = { copy: {}, visual: {}, unmatched: [] }
  const blocks = new Map<string, { body: string; label: string; mode: SegmentMode | null }>()
  for (const tab of input.tabs) {
    for (const block of tab.blocks) {
      if (block.key) blocks.set(block.key, { body: block.body, label: block.label, mode: MODES[tab.kind] ?? null })
    }
  }
  const sent = input.requests
    .filter((request) => request.request_type === 'edit' && request.base_version === input.version
      && isUnresolvedContentRequest(request.status))
    .map((request, order) => ({ request, order }))
    .sort((a, b) => a.request.created_at.localeCompare(b.request.created_at) || a.order - b.order)

  for (const { request } of sent) {
    const target = contentRequestTarget(request)
    if (!target) continue
    const entry = (label: string, content: SentContent): SentEntry => ({ id: request.id, sentAt: request.created_at, label, content })

    if (target.kind === 'copy_block') {
      const block = blocks.get(target.key)
      if (!block) {
        index.unmatched.push(entry(target.label, request.base_copy_text
          ? { kind: 'text', base: request.base_copy_text, proposed: target.proposedText }
          : { kind: 'proposed', text: target.proposedText }))
        continue
      }
      const whole = entry(block.label, { kind: 'text', base: block.body, proposed: target.proposedText })
      const before = block.mode ? segmentBlock(block.body, block.mode).segments : []
      if (!block.mode || before.length === 0) {
        push(index.copy, `${target.key}:whole`, whole)
        continue
      }
      const after = segmentBlock(target.proposedText, block.mode).segments
      const changed = after.length === before.length
        ? after.map((segment, i) => segment.raw.replace(/\s+$/, '') !== before[i].raw.replace(/\s+$/, ''))
        : null
      if (!changed || !changed.some(Boolean)) {
        // The frames, pages or sections changed shape: no single spot matches any more.
        index.unmatched.push(whole)
        continue
      }
      changed.forEach((isChanged, i) => {
        if (!isChanged) return
        push(index.copy, `${target.key}:${SEGMENT_SPOT[block.mode as SegmentMode]}:${i}`, entry(`${block.label} · ${before[i].label}`,
          { kind: 'text', base: segmentText(before[i]), proposed: segmentText(after[i]) }))
      })
      continue
    }

    const parts = splitVisualNote(target.proposedText)
    if (input.coverKey && target.key === input.coverKey) {
      push(index.visual, 'cover', entry(target.label, { kind: 'note', text: target.proposedText }))
      continue
    }
    for (const part of parts) {
      const label = part.label && part.label !== 'General note' ? `${target.label} · ${part.label}` : target.label
      const note = entry(label, { kind: 'note', text: part.text })
      if (!input.visualKey || target.key !== input.visualKey) {
        index.unmatched.push(note)
        continue
      }
      const anchored = part.label ? /^(Frame|Page) (\d+)$/.exec(part.label) : null
      if (!anchored) {
        push(index.visual, 'whole', note)
        continue
      }
      const word = anchored[1].toLowerCase()
      const number = Number(anchored[2])
      if (word === input.visualWord && number >= 1 && number <= input.frameCount) push(index.visual, `${word}:${number}`, note)
      else index.unmatched.push(note)
    }
  }
  return index
}

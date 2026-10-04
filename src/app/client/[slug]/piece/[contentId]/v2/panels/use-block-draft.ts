'use client'

import { useMemo } from 'react'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import { segmentBlock, type SegmentMode } from '@/lib/portal/piece-page/segments'
import { useReviewDrafts, type ReviewDraft, type ReviewTarget } from '../../ReviewDraftProvider'

// The released block, her current-version draft of it (if any), and a draft carried from an
// earlier version (if any). source is what the panel shows: her draft when she has one.
export function useBlockDraft(block: ReviewCopyBlock): {
  target: ReviewTarget
  draft: ReviewDraft | null
  carried: ReviewDraft | null
  source: string
} {
  const { readDraft, carriedDrafts } = useReviewDrafts()
  const target = useMemo<ReviewTarget>(() => ({
    kind: 'copy_block', key: block.key ?? '', label: block.label, currentText: block.body,
  }), [block])
  const found = block.key ? readDraft(target) : null
  const draft = found && found.carriedFromVersion == null ? found : null
  const carried = carriedDrafts.find((d) => d.kind === 'copy_block' && d.key === block.key && !d.anchor) ?? null
  return { target, draft, carried, source: draft?.proposedText ?? block.body }
}

// Which segments of her draft differ from the released text. When the draft changed the
// structure (a frame added or removed), every segment counts as edited.
export function editedSegments(base: string, source: string, mode: SegmentMode): boolean[] {
  const before = segmentBlock(base, mode).segments
  const after = segmentBlock(source, mode).segments
  if (base === source) return after.map(() => false)
  if (before.length !== after.length) return after.map(() => true)
  return after.map((segment, index) => segment.raw.replace(/\s+$/, '') !== before[index].raw.replace(/\s+$/, ''))
}

'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import TrackedText from '@/components/portal/editor/TrackedText'
import { torontoDateLabel } from '@/lib/portal/piece-page/header-status'
import { EMPTY_SENT_EDITS, placeReleasedSegments, type SentEditIndex, type SentEntry } from '@/lib/portal/piece-page/sent-edits'
import type { SegmentMode } from '@/lib/portal/piece-page/segments'
import styles from './piece-page.module.css'

// Plan 4b amendment 2026-10-04 (Task 10a): after she sends, her edits stay where she made them,
// as a read-only "Sent · being applied" disclosure. Built from her own sent requests for this
// version (the same read the drawer's Past edits tab uses). Never a draft, never a write.

const SentEditsContext = createContext<SentEditIndex>(EMPTY_SENT_EDITS)
// Copy spots whose released segment has no confident place in her current draft. Panels report
// them; the top "Sent edits" list shows their entries, so nothing is dropped.
type OrphanRegistry = { orphans: string[]; report: (id: string, spots: string[]) => void }
const OrphanContext = createContext<OrphanRegistry | null>(null)

export function SentEditsProvider({ index, children }: { index: SentEditIndex; children: ReactNode }) {
  const [byPanel, setByPanel] = useState<ReadonlyMap<string, string[]>>(() => new Map())
  const report = useCallback((id: string, spots: string[]) => setByPanel((current) => {
    const previous = current.get(id) ?? []
    if (previous.length === spots.length && previous.every((spot, i) => spot === spots[i])) return current
    const next = new Map(current)
    if (spots.length > 0) next.set(id, spots)
    else next.delete(id)
    return next
  }), [])
  const orphans = useMemo(() => [...new Set([...byPanel.values()].flat())], [byPanel])
  const registry = useMemo(() => ({ orphans, report }), [orphans, report])
  return <SentEditsContext.Provider value={index}>
    <OrphanContext.Provider value={registry}>{children}</OrphanContext.Provider>
  </SentEditsContext.Provider>
}

// For a segmented block shown from her current draft: the released segment's marker spot for each
// shown segment (or null), with released segments that have no place here reported as orphans.
export function useSentSegmentSpots(blockKey: string | null | undefined, base: string, source: string, mode: SegmentMode): Array<string | null> {
  const index = useContext(SentEditsContext)
  const registry = useContext(OrphanContext)
  const report = registry?.report
  const id = useId()
  const word = mode === 'frames' ? 'frame' : mode === 'pages' ? 'page' : 'section'
  const placed = useMemo(() => placeReleasedSegments(base, source, mode), [base, mode, source])
  const orphanKey = blockKey
    ? placed.orphaned.map((i) => `${blockKey}:${word}:${i}`).filter((spot) => (index.copy[spot] ?? []).length > 0).join('\n')
    : ''
  useEffect(() => {
    if (!report) return
    report(id, orphanKey ? orphanKey.split('\n') : [])
    return () => report(id, [])
  }, [id, orphanKey, report])
  return placed.releasedFor.map((released) => (blockKey && released !== null ? `${blockKey}:${word}:${released}` : null))
}

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

function EntryBody({ entry, showLabel }: { entry: SentEntry; showLabel: boolean }) {
  const { content } = entry
  return <div className={styles.sentEntry}>
    <p className={styles.meta}>
      {showLabel && <><strong className={styles.sentLabel}>{entry.label}</strong> · </>}
      Sent <time dateTime={entry.sentAt}>{torontoDateLabel(entry.sentAt)}</time>
    </p>
    {content.kind === 'text'
      ? <TrackedText base={content.base} current={content.proposed} />
      : content.kind === 'proposed'
        ? <div className={styles.copy}><MarkdownCopy body={content.text} style={INHERIT} /></div>
        : <p className={styles.sentNote}>{content.text}</p>}
  </div>
}

function SentMarker({ entries }: { entries: SentEntry[] }) {
  if (entries.length === 0) return null
  return <details className={styles.sent} data-sent-marker="">
    <summary className={styles.sentSummary}>Sent · being applied</summary>
    <div className={styles.sentBody}>
      {entries.map((entry, index) => <EntryBody key={`${entry.id}:${index}`} entry={entry} showLabel={false} />)}
    </div>
  </details>
}

// A copy spot: '<block key>:whole', or ':frame:<i>', ':page:<i>', ':section:<i>' by segment position.
export function SentCopyMarker({ spot }: { spot: string }) {
  const index = useContext(SentEditsContext)
  return <SentMarker entries={index.copy[spot] ?? []} />
}

// A visual spot: 'whole', 'frame:<n>', 'page:<n>' (from 1) or 'cover'.
export function SentVisualMarker({ spot }: { spot: string }) {
  const index = useContext(SentEditsContext)
  return <SentMarker entries={index.visual[spot] ?? []} />
}

// Edits whose spot is no longer on the page: one disclosure at the top of the copy area.
export function SentEditsElsewhere() {
  const index = useContext(SentEditsContext)
  const orphans = useContext(OrphanContext)?.orphans ?? []
  const unmatched = [...index.unmatched, ...orphans.flatMap((spot) => index.copy[spot] ?? [])]
  if (unmatched.length === 0) return null
  return <details className={`${styles.sent} ${styles.sentTop}`} data-sent-elsewhere="">
    <summary className={styles.sentSummary}>Sent edits ({unmatched.length})</summary>
    <div className={styles.sentBody}>
      <p className={styles.meta}>Being applied. These no longer match a spot on this page, so they are listed here.</p>
      {unmatched.map((entry, index) => <EntryBody key={`${entry.id}:${index}`} entry={entry} showLabel />)}
    </div>
  </details>
}

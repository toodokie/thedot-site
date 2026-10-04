'use client'

import { createContext, useContext, type ReactNode } from 'react'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import TrackedText from '@/components/portal/editor/TrackedText'
import { torontoDateLabel } from '@/lib/portal/piece-page/header-status'
import { EMPTY_SENT_EDITS, type SentEditIndex, type SentEntry } from '@/lib/portal/piece-page/sent-edits'
import styles from './piece-page.module.css'

// Plan 4b amendment 2026-10-04 (Task 10a): after she sends, her edits stay where she made them,
// as a read-only "Sent · being applied" disclosure. Built from her own sent requests for this
// version (the same read the drawer's Past edits tab uses). Never a draft, never a write.

const SentEditsContext = createContext<SentEditIndex>(EMPTY_SENT_EDITS)

export function SentEditsProvider({ index, children }: { index: SentEditIndex; children: ReactNode }) {
  return <SentEditsContext.Provider value={index}>{children}</SentEditsContext.Provider>
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
  const { unmatched } = useContext(SentEditsContext)
  if (unmatched.length === 0) return null
  return <details className={`${styles.sent} ${styles.sentTop}`} data-sent-elsewhere="">
    <summary className={styles.sentSummary}>Sent edits ({unmatched.length})</summary>
    <div className={styles.sentBody}>
      <p className={styles.meta}>Being applied. These no longer match a spot on this page, so they are listed here.</p>
      {unmatched.map((entry, index) => <EntryBody key={`${entry.id}:${index}`} entry={entry} showLabel />)}
    </div>
  </details>
}

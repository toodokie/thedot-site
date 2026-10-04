'use client'

import type { ReactNode } from 'react'
import type { HeaderStatus } from '@/lib/portal/piece-page/header-status'
import { useCollapsingHeader } from './hooks'
import MoreMenu from './MoreMenu'
import styles from './piece-page.module.css'

type Removal = { slug: string; contentId: string; idempotencyKey: string } | null

function Sep() {
  return <span className={styles.sep} aria-hidden="true"> · </span>
}

function StatusLine({ status, scheduleSlot }: { status: HeaderStatus; scheduleSlot: ReactNode }) {
  if (status.kind === 'live') {
    return <p className={styles.status} data-testid="status-line">
      <strong>Live</strong>
      {status.links.map((link) => <span key={link.url}><Sep /><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></span>)}
      {status.postedLabel && <><Sep /><span className={styles.seg}>{status.postedLabel}</span></>}
    </p>
  }
  if (status.kind === 'scheduled') {
    return <p className={styles.status} data-testid="status-line">
      <strong className={styles.seg}>{status.keyFact}</strong>
      {status.groups.map((group) => <span key={group.time}><Sep /><span className={styles.seg}>{group.time} {group.destinations}</span></span>)}
      {scheduleSlot}
    </p>
  }
  if (status.kind === 'unconfirmed') {
    return <p className={styles.status} data-testid="status-line">
      <strong className={styles.seg}>{status.keyFact}</strong><Sep /><span className={styles.seg}>Times not confirmed yet</span>
      {scheduleSlot}
    </p>
  }
  return <p className={styles.status} data-testid="status-line"><strong>{status.keyFact}</strong>{scheduleSlot}</p>
}

function QuestionsButton({ count, onClick, compact = false }: { count: number; onClick: () => void; compact?: boolean }) {
  return <button type="button" className={styles.ghostButton} aria-haspopup="dialog" onClick={onClick}
    aria-label={`Questions and sources, ${count} ${count === 1 ? 'message' : 'messages'}`}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M2 3h14v9H8l-4 3v-3H2z" stroke="currentColor" fill="none" strokeWidth="1.5" />
    </svg>
    {!compact && <span className={styles.qlabel}>Questions &amp; sources</span>}
    <span aria-hidden="true">({count})</span>
  </button>
}

// Spec 4.1 and 10a: the full header scrolls away in the page; a slim fixed bar slides in past 120px
// and hides under 40px (overlay, transform and opacity only). While hidden it is aria-hidden and
// inert, so keyboard and screen-reader users never meet two copies of the controls.
export default function PieceHeader({
  title, formatLabel, backHref, backLabel, status, updatedLine, questionsCount, onOpenQuestions, scheduleSlot, removal,
}: {
  title: string
  formatLabel: string
  backHref: string
  backLabel: string
  status: HeaderStatus
  updatedLine: string | null
  questionsCount: number
  onOpenQuestions: () => void
  scheduleSlot: ReactNode
  removal: Removal
}) {
  const collapsed = useCollapsingHeader()
  return <>
    <header className={styles.phead}>
      <div className={styles.pheadIn}>
        <div className={styles.crumb}>
          <a href={backHref}>{backLabel}</a>
          <span className={styles.crumbMeta}>{formatLabel}</span>
        </div>
        <div className={styles.headMain}>
          <h1 className={styles.title}>{title}</h1>
          <StatusLine status={status} scheduleSlot={scheduleSlot} />
          {updatedLine && <p className={styles.updated}>
            <span className={styles.dotmark} aria-hidden="true" />Updated after your feedback: {updatedLine}
          </p>}
        </div>
        <div className={styles.hactions}>
          <QuestionsButton count={questionsCount} onClick={onOpenQuestions} />
          <MoreMenu idPrefix="piece-header" removal={removal} />
        </div>
      </div>
    </header>
    <div className={styles.cbar} data-testid="condensed-header" data-collapsed={collapsed ? 'true' : 'false'}
      aria-hidden={!collapsed} inert={!collapsed}>
      <div className={styles.cbarIn}>
        <div className={styles.ctitle}>
          <span className={styles.ct}>{title}</span>
          <span className={styles.ck}><strong>{status.keyFact}</strong></span>
        </div>
        <div className={styles.hactions}>
          <QuestionsButton count={questionsCount} onClick={onOpenQuestions} compact />
          <MoreMenu idPrefix="piece-condensed" removal={removal} />
        </div>
      </div>
    </div>
  </>
}

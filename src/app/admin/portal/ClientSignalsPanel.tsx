import { Heading } from '@thedot/design-system'
import {
  releaseMediaAlertDetail, releaseMediaAlertLine, unsentAlertDetail, type ClientSignal, type ReleaseMediaAlert,
} from '@/lib/portal/agency-ops-core'
import { unsentDraftAlertLine, type UnsentDraftAlert } from '@/lib/portal/review-drafts-core'
import ResolveSignalButton from './ResolveSignalButton'
import styles from './portal-admin.module.css'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'

// Spec 8: the client signals the redesign creates. Unsent-edit alerts come first (a forgotten
// Send on a piece that posts soon), then send failures, carried drafts and feedback, newest first.
// Alerts have no Done: they clear when she sends, discards, or the piece posts.
function pieceHref(key: string | null, clientId?: string | null): string | null {
  return key ? adminPieceHref(key, clientId) : null
}

// A send failure closes itself when her retry succeeds. Done would move the inbox cursor past a
// failure that is still unresolved, so it never gets the button.
function hasDone(signal: ClientSignal): boolean {
  return signal.resolvable && signal.kind !== 'review_send_failed'
}

export default function ClientSignalsPanel({ signals, alerts, mediaAlerts = [], error, todayIso, nowIso }: {
  signals: ClientSignal[]
  alerts: UnsentDraftAlert[]
  // Amended 2026-10-03: pieces in front of Maria with nothing to look at. Live, so no Done.
  mediaAlerts?: ReleaseMediaAlert[]
  error: string | null
  todayIso: string
  nowIso: string
}) {
  if (!error && signals.length === 0 && alerts.length === 0 && mediaAlerts.length === 0) return null
  const now = new Date(nowIso)
  return (
    <section className={`${styles.card} ${styles.hero}`}>
      <div className={styles.panelHead}>
        <Heading as="h2" level={4}>From Maria</Heading>
        <span className={styles.panelCount}>{signals.length + alerts.length + mediaAlerts.length}</span>
      </div>
      <p className={styles.panelNote}>Unsent edits, failed sends, videos that did not play, pieces with nothing to look at, and her feedback. Nothing here was sent to her.</p>
      {error && <p className={styles.panelNote} role="alert">Could not load signals from Maria: {error}</p>}
      <ul className={styles.taskList}>
        {alerts.map((alert) => {
          const href = pieceHref(alert.content_id, alert.client_id)
          const line = unsentDraftAlertLine(alert)
          return <li key={`alert:${alert.content_item_id}:${alert.auth_user_id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{line}</a>
                : <span className={styles.taskTitle}>{line}</span>}
              <span className={styles.meta}>{unsentAlertDetail(alert, todayIso, now)}</span>
            </span>
          </li>
        })}
        {mediaAlerts.map((alert) => {
          const href = pieceHref(alert.content_key, alert.client_id)
          const line = releaseMediaAlertLine(alert)
          return <li key={`media:${alert.content_item_id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{line}</a>
                : <span className={styles.taskTitle}>{line}</span>}
              <span className={styles.meta}>{releaseMediaAlertDetail(alert, todayIso)}</span>
            </span>
          </li>
        })}
        {signals.map((signal) => {
          const href = pieceHref(signal.pieceKey, signal.clientId)
          return <li key={`signal:${signal.id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{signal.headline}</a>
                : <span className={styles.taskTitle}>{signal.headline}</span>}
              {signal.detail && <span className={styles.meta}>{signal.detail}</span>}
            </span>
            <span className={styles.taskTrail}>
              {hasDone(signal) && <ResolveSignalButton eventId={signal.id} label={signal.headline} />}
              {signal.kind === 'review_send_failed' && <span className={styles.meta}>Closes when her retry succeeds</span>}
            </span>
          </li>
        })}
      </ul>
    </section>
  )
}

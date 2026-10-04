import { Button } from '@thedot/design-system'
import { feedbackLine } from '@/lib/portal/agency-ops-core'
import type { AgencyPieceData } from './agency-piece-data'
import { unsentAlertSentence } from './agency-piece-data-view'
import styles from './agency-panel.module.css'

export type AgencyPanelModel = Pick<AgencyPieceData,
  'contentId' | 'stageLabel' | 'gates' | 'gatesSummary' | 'versions' | 'requestViews' | 'reviewAssets'
  | 'previews' | 'previewError' | 'design' | 'drafts' | 'feedback' | 'plannedDate' | 'todayIso' | 'nowIso'> & {
  released: boolean
}

function shortDay(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}
const GATE_CLASS = { done: styles.gateDone, na: styles.gateNa, absent: styles.gateAbsent, open: '' } as const

export default function AgencyPanel({ model }: { model: AgencyPanelModel }) {
  const now = new Date(model.nowIso)
  const video = model.previews.find((preview) => preview.mediaKind === 'video')
  const frames = model.previews.reduce((count, preview) => count + preview.frames.length, 0)
  return (
    <aside className={styles.panel} aria-label="Agency panel">
      <section>
        <div className={styles.head}>
          <span className={styles.label} style={{ margin: 0, color: 'var(--dot-black)' }}>Agency</span>
          {model.released && <Button as="a" variant="ghost" size="sm"
            href={`/admin/portal/pieces/${encodeURIComponent(model.contentId)}/maria-preview`}>View as Maria</Button>}
        </div>
        <p className={styles.meta}>{model.released ? `Stage: ${model.stageLabel} · ${model.gatesSummary}` : 'Not shared with Maria yet'}</p>
      </section>

      {model.drafts.length > 0 && <section>
        {model.drafts.map((seat) => <div key={seat.seatName}>
          {seat.failedCount > 0 && <p className={`${styles.alert} ${styles.danger}`} role="alert">
            {seat.seatName.split(' ')[0]} tried to send {seat.failedCount} edit{seat.failedCount === 1 ? '' : 's'} and it failed
            ({(seat.lastError ?? 'unknown').replaceAll('_', ' ')}). Her text is saved and she sees Retry.
          </p>}
          <p className={styles.alert}>
            {unsentAlertSentence(seat, model.plannedDate, model.todayIso, now)}
            {seat.carriedCount > 0 ? ` ${seat.carriedCount} written against an earlier version.` : ''}
          </p>
        </div>)}
      </section>}

      <section>
        <h2 className={styles.label} id="agency-gates">Production gates</h2>
        <ul className={styles.gates} aria-labelledby="agency-gates">
          {model.gates.map((gate) => <li key={gate.key} className={gate.state === 'done' ? '' : styles.gateOpenText}>
            <span className={`${styles.gateDot} ${GATE_CLASS[gate.state]}`} aria-hidden="true" />
            <span>{gate.label}</span>
            <span className={styles.when}>{gate.state === 'done' ? shortDay(gate.date) || 'done'
              : gate.state === 'na' ? 'n/a' : gate.state === 'absent' ? 'not tracked' : 'open'}</span>
          </li>)}
        </ul>
      </section>

      <section>
        <h2 className={styles.label}>Versions</h2>
        <ul className={styles.rows}>
          {model.versions.map((row) => <li key={row.version}>
            <span>{row.label}</span><span className={styles.when}>{shortDay(row.date)}</span>
          </li>)}
        </ul>
      </section>

      <section>
        <h2 className={styles.label} id="agency-requests">Maria&apos;s requests</h2>
        {model.requestViews.length === 0
          ? <p className={styles.meta}>Maria has not sent a request on this piece.</p>
          : <ul className={styles.requests} aria-labelledby="agency-requests">
            {model.requestViews.map((request) => <li key={request.id}>
              {request.thumbs[0]?.url
                ? <img className={styles.thumb} src={request.thumbs[0].url} alt={request.thumbs[0].label} />
                : <span className={styles.thumbBlank}>{request.kind === 'text' ? 'Text' : request.thumbs[0]?.label ?? 'Visual'}</span>}
              <div>
                <p><strong>{request.heading}</strong>{request.kind === 'visual' ? ', visual' : ''}</p>
                <p className={styles.meta}>{request.quote ? `“${request.quote}” ` : ''}{shortDay(request.date)} · {request.state}</p>
              </div>
            </li>)}
          </ul>}
      </section>

      <section>
        <h2 className={styles.label}>Review assets</h2>
        <ul className={styles.rows}>
          {video && <li><span>Video preview, portal storage</span><span className={styles.when}>uploaded</span></li>}
          {frames > 0 && <li><span>{video ? 'Frame strip' : 'Page images'}, {frames} images</span><span className={styles.when}>uploaded</span></li>}
          {model.previews.length === 0 && <li><span>No portal preview. Maria sees the Drive button.</span></li>}
          {model.previewError && <li><span>Preview check failed: {model.previewError}</span></li>}
          {model.reviewAssets.map((asset) => <li key={asset.id}>
            <span>{asset.label}</span>
            <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.label}`}>open</a>
          </li>)}
          {model.design.canva && <li><span>Design source</span>
            <a href={model.design.canva} target="_blank" rel="noreferrer" aria-label="Open design source">open</a></li>}
          {model.design.drive && <li><span>Drive link, from Anastasia</span>
            <a href={model.design.drive} target="_blank" rel="noreferrer" aria-label="Open Drive link">open</a></li>}
        </ul>
      </section>

      <section>
        <h2 className={styles.label}>Feedback</h2>
        <p className={styles.meta} style={{ margin: 0 }}>
          {model.feedback ? feedbackLine(model.feedback.rating, model.feedback.comment) : 'No answer yet.'}
        </p>
      </section>
    </aside>
  )
}

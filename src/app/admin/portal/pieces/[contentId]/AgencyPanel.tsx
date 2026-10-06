import { Button } from '@thedot/design-system'
import { feedbackLine } from '@/lib/portal/agency-ops-core'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'
import type { AgencyPieceData, AgencyReviewAsset } from './agency-piece-data'
import { unsentAlertSentence } from './agency-piece-data-view'
import styles from './agency-panel.module.css'

export type AgencyPanelModel = Pick<AgencyPieceData,
  'contentId' | 'stageLabel' | 'gates' | 'gatesSummary' | 'versions' | 'requestViews' | 'reviewAssets'
  | 'workingAssets' | 'previews' | 'previewError' | 'mediaOverride' | 'design' | 'drafts' | 'feedback' | 'plannedDate' | 'todayIso' | 'nowIso'>
  & Partial<Pick<AgencyPieceData, 'optionChoices'>> & {
  released: boolean
  // The piece's client, so links out of the page reach the same piece. Absent in older callers.
  clientSlug?: string
}

function shortDay(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}
// The caption proof is mandatory on videos, so each asset carries its proof state and review note.
function AssetRow({ asset }: { asset: AgencyReviewAsset }) {
  return <li>
    <span>
      {asset.label}
      {asset.caption_status !== 'not_applicable' && <span className={styles.assetMeta}>Captions: {asset.caption_status.replaceAll('_', ' ')}</span>}
      {asset.review_note && <span className={styles.assetMeta}>{asset.review_note}</span>}
    </span>
    <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.label}`}>open</a>
  </li>
}

const GATE_CLASS = { done: styles.gateDone, na: styles.gateNa, absent: styles.gateAbsent, open: '' } as const

export default function AgencyPanel({ model }: { model: AgencyPanelModel }) {
  const now = new Date(model.nowIso)
  const video = model.previews.find((preview) => preview.mediaKind === 'video')
  const frames = model.previews.reduce((count, preview) => count + preview.frames.length, 0)
  const noMedia = model.previews.length === 0 && model.reviewAssets.length === 0 && !model.design.canva && !model.design.drive
  return (
    <aside className={styles.panel} aria-label="Agency panel">
      <section>
        <div className={styles.head}>
          <span className={styles.label} style={{ margin: 0, color: 'var(--dot-black)' }}>Agency</span>
          {model.released && <Button as="a" variant="ghost" size="sm"
            href={adminPieceHref(model.contentId, model.clientSlug, 'maria-preview')}>View as Maria</Button>}
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
          {model.mediaOverride && <li><span>Released without media. {model.mediaOverride}</span></li>}
          {model.released && noMedia && !model.mediaOverride && <li><span>
            Maria has nothing to look at on this version. Attach a review asset, preview or design link.
          </span></li>}
          {model.reviewAssets.map((asset) => <AssetRow key={asset.id} asset={asset} />)}
          {model.design.canva && <li><span>Design source</span>
            <a href={model.design.canva} target="_blank" rel="noreferrer" aria-label="Open design source">open</a></li>}
          {model.design.drive && <li><span>Drive link, from Anastasia</span>
            <a href={model.design.drive} target="_blank" rel="noreferrer" aria-label="Open Drive link">open</a></li>}
        </ul>
      </section>

      {(model.optionChoices ?? []).length > 0 && <section aria-labelledby="agency-cover-choices">
        <h2 className={styles.label} id="agency-cover-choices">Cover choices</h2>
        <ul className={styles.rows}>
          {(model.optionChoices ?? []).map((choice) => <li key={choice.group}>
            <span>{choice.chosen
              ? <><strong>{choice.chosen.label}</strong><span className={styles.assetMeta}>
                Chosen by {(choice.pickedBy ?? 'Client').split(' ')[0]}{choice.pickedAt ? ` · ${shortDay(choice.pickedAt)}` : ''}</span></>
              : <>{choice.options.map((option) => option.label).join(' or ')}<span className={styles.assetMeta}>Not chosen yet</span></>}
            </span>
            <span className={styles.when}>{choice.group}</span>
          </li>)}
        </ul>
      </section>}

      {model.workingAssets && <section aria-labelledby="agency-working-assets">
        <h2 className={styles.label} id="agency-working-assets">Working copy, v{model.workingAssets.version}, not shared yet</h2>
        {model.workingAssets.assets.length === 0
          ? <p className={styles.meta}>No review assets attached to this version yet.</p>
          : <ul className={styles.rows}>{model.workingAssets.assets.map((asset) => <AssetRow key={asset.id} asset={asset} />)}</ul>}
      </section>}

      <section>
        <h2 className={styles.label}>Feedback</h2>
        <p className={styles.meta} style={{ margin: 0 }}>
          {model.feedback ? feedbackLine(model.feedback.rating, model.feedback.comment) : 'No answer yet.'}
        </p>
      </section>
    </aside>
  )
}

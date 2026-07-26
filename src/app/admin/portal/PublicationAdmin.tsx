'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import StatusPill, { type PillTone } from './StatusPill'
import AdminPageHeader from './AdminPageHeader'
import styles from './portal-admin.module.css'

export type AdminTarget = {
  clientId: string
  clientName: string
  contentId: string
  title: string
  version: number
  plannedDate: string | null
  destination: string
  scheduleTargetId: string | null
  scheduleStatus: string
  scheduledAt: string | null
  scheduleEvidenceId: string | null
  scheduleVerifier: string | null
  publicationTargetId: string
  publicationStatus: string
  publicationLabel: string
  liveUrl: string | null
  publishedAt: string | null
  history: Array<{
    id: string; providerState: string; publishedAt: string | null; observedAt: string
    sourceType: string; reconciliationStatus: string; evidenceId: string; permalink: string | null
    verifier: string
  }>
}

type EvidenceMode = 'upload' | 'reviewed_link'

async function responseJson(response: Response) {
  const body = await response.json() as { error?: string; evidenceId?: string; objectKey?: string; token?: string }
  if (!response.ok) throw new Error(body.error ?? 'Request failed')
  return body
}

// One clear, human status per destination instead of three jargon pills (sched: / pub: /
// label). Display only; the DB status strings are unchanged.
function destStatus(target: AdminTarget): { label: string; tone: PillTone } {
  const pub = target.publicationStatus
  if (pub === 'live') return { label: target.publicationLabel, tone: target.publicationLabel.toLowerCase().includes('verif') && !target.publicationLabel.toLowerCase().includes('not') ? 'verified' : 'muted' }
  if (pub === 'failed') return { label: 'posting failed', tone: 'failed' }
  if (pub === 'removed') return { label: 'removed', tone: 'muted' }
  if (pub === 'unavailable') return { label: 'unavailable', tone: 'muted' }
  if (target.scheduleStatus === 'scheduled') return { label: 'scheduled, not live yet', tone: 'scheduled' }
  if (target.scheduleStatus === 'failed') return { label: 'scheduling failed', tone: 'failed' }
  return { label: 'not posted yet', tone: 'muted' }
}

function localDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function rowDate(target: AdminTarget): string | null {
  return target.publishedAt ?? target.plannedDate
}

function actionLabel(target: AdminTarget): string {
  if (target.publicationStatus !== 'live') return 'Confirm / correct'
  const label = target.publicationLabel.toLowerCase()
  return label.includes('not independently verified') ? 'Verify record' : 'Correct record'
}

export default function PublicationAdmin({ targets }: { targets: AdminTarget[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // which destination's confirm/correct form is expanded (progressive disclosure)
  const [openForm, setOpenForm] = useState<string | null>(null)

  async function submit(target: AdminTarget, formData: FormData) {
    const operation = String(formData.get('operation') ?? '')
    const evidenceMode = String(formData.get('evidenceMode') ?? '') as EvidenceMode
    const providerUrl = String(formData.get('providerUrl') ?? '').trim()
    const actualAtLocal = String(formData.get('actualAt') ?? '')
    const utcOffsetMinutes = Number(formData.get('utcOffsetMinutes'))
    const actualAt = actualAtLocal
      ? new Date(Date.parse(`${actualAtLocal}:00Z`) - utcOffsetMinutes * 60_000).toISOString()
      : null
    const note = String(formData.get('note') ?? '').trim()
    const operationKey = `admin-${crypto.randomUUID()}`
    const evidenceKey = `evidence-${crypto.randomUUID()}`
    const targetKey = `${target.contentId}:${target.version}:${target.destination}`
    setBusy(targetKey)
    setMessage(null)
    try {
      let evidenceId: string | undefined
      if (evidenceMode === 'upload') {
        const file = formData.get('evidenceFile')
        if (!(file instanceof File) || file.size < 1) throw new Error('Choose a screenshot or PDF.')
        const signed = await responseJson(await fetch('/api/admin/portal/evidence/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: target.clientId, fileName: file.name, mimeType: file.type, byteLength: file.size }),
        }))
        if (!signed.objectKey || !signed.token) throw new Error('Signed upload was incomplete.')
        const supabase = createSupabaseBrowser()
        const { error: uploadError } = await supabase.storage.from('portal-publication-evidence')
          .uploadToSignedUrl(signed.objectKey, signed.token, file, { contentType: file.type })
        if (uploadError) throw new Error(uploadError.message)
        const finalized = await responseJson(await fetch('/api/admin/portal/evidence/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: target.clientId, objectKey: signed.objectKey,
            capturedAt: new Date().toISOString(), idempotencyKey: evidenceKey }),
        }))
        evidenceId = finalized.evidenceId
      } else {
        const evidence = await responseJson(await fetch('/api/admin/portal/evidence', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: target.clientId, kind: evidenceMode,
            url: String(formData.get('evidenceUrl') ?? ''),
            capturedAt: new Date().toISOString(), idempotencyKey: evidenceKey }),
        }))
        evidenceId = evidence.evidenceId
      }
      if (!evidenceId) throw new Error('Evidence registration returned no ID.')
      const scheduleOperation = operation === 'confirm_schedule' || operation === 'schedule_failed'
      const targetId = scheduleOperation ? target.scheduleTargetId : target.publicationTargetId
      if (!targetId) throw new Error('This content has no matching schedule target.')
      const result = await fetch('/api/admin/portal/operation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, targetId, evidenceId, idempotencyKey: operationKey,
          providerUrl: providerUrl || null, actualAt, externalId: String(formData.get('externalId') ?? '').trim() || null,
          visibility: String(formData.get('visibility') ?? 'public'),
          observedTitle: String(formData.get('observedTitle') ?? '').trim() || null,
          observedText: String(formData.get('observedText') ?? '').trim() || null, note: note || null }),
      })
      const resultBody = await result.json() as { error?: string }
      if (!result.ok) throw new Error(resultBody.error ?? 'Operation failed')
      setMessage(`${target.title} · ${target.destination}: recorded.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed')
    } finally {
      setBusy(null)
    }
  }

  // group the flat (piece x destination) target list into per-piece cards (display only)
  const pieces = new Map<string, { title: string; version: number; rows: AdminTarget[] }>()
  for (const target of targets) {
    const pieceKey = `${target.clientId}:${target.contentId}:${target.version}`
    const entry = pieces.get(pieceKey) ?? { title: target.title, version: target.version, rows: [] }
    entry.rows.push(target)
    pieces.set(pieceKey, entry)
  }

  const orderedPieces = [...pieces.entries()].sort(([, a], [, b]) => {
    const latest = (rows: AdminTarget[]) => rows
      .map(rowDate).filter((date): date is string => Boolean(date)).sort().at(-1) ?? ''
    return latest(b.rows).localeCompare(latest(a.rows)) || a.title.localeCompare(b.title)
  })

  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Publication"
        intro="Where each piece actually went live, platform by platform. A scheduled time is not proof; confirming a post saves the live link and evidence, and corrections add a new record rather than overwriting."
        count={targets.length} countLabel="platform slots" />
    <section className={styles.card}>
      {message && <p role="status" className={styles.banner}>{message}</p>}
      {targets.length === 0 && <p className={styles.empty}>Nothing to confirm yet. Pieces appear here once approved and scheduled.</p>}

      {orderedPieces.map(([pieceKey, piece]) => (
        <article key={pieceKey} className={styles.pubPiece}>
          <div className={styles.pubPieceHead}>
            <span className={styles.pubDate}>{localDate(piece.rows.map(rowDate).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null) ?? 'No date'}</span>
            <span className={styles.pubPieceTitle}>{piece.title}</span>
            <span className={styles.pubVersion}>v{piece.version}</span>
          </div>

          {piece.rows.map((target) => {
            const key = `${target.contentId}:${target.version}:${target.destination}`
            const expanded = openForm === key
            const publishedLabel = localDate(rowDate(target))
            return (
              <div key={key}>
                <div className={styles.destRow}>
                  <span className={styles.destName}>{target.destination}</span>
                  <span className={styles.destPills}>
                    {(() => { const s = destStatus(target); return <StatusPill tone={s.tone} label={s.label} /> })()}
                  </span>
                  {publishedLabel && <span className={styles.meta}>{publishedLabel}</span>}
                  {target.liveUrl && (
                    <a className={styles.destLink} href={target.liveUrl} target="_blank" rel="noreferrer">live post</a>
                  )}
                  <span className={styles.destSpacer} />
                  <button
                    type="button"
                    className={`${styles.disclose} ${expanded ? styles.discloseOpen : ''}`}
                    aria-expanded={expanded}
                    onClick={() => setOpenForm(expanded ? null : key)}
                  >
                    {expanded ? 'Close' : actionLabel(target)}
                  </button>
                </div>

                {expanded && (
                  <>
                    {target.scheduleEvidenceId && (
                      <p className={styles.hint}>
                        <a href={`/api/admin/portal/evidence/${target.scheduleEvidenceId}`} target="_blank">See the current schedule proof</a>
                        {target.scheduleVerifier ? ` · verified by ${target.scheduleVerifier}` : ''}
                      </p>
                    )}
                    {target.history.length > 0 && (
                      <details className={styles.auditToggle}>
                        <summary>Full history ({target.history.length})</summary>
                        <ol className={styles.auditList}>
                          {target.history.map((observation) => (
                            <li key={observation.id}>
                              {observation.providerState} · {observation.sourceType} · {observation.reconciliationStatus}
                              {' · '}verified by {observation.verifier}
                              {' · '}{new Date(observation.observedAt).toISOString().slice(0, 10)}
                              {observation.publishedAt ? ` · published ${new Date(observation.publishedAt).toISOString().slice(0, 10)}` : ''}
                              {' · '}<a href={`/api/admin/portal/evidence/${observation.evidenceId}`} target="_blank">evidence</a>
                              {observation.permalink && <> · <a href={observation.permalink} target="_blank" rel="noreferrer">provider object</a></>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}

                    <form action={(data) => submit(target, data)} className={styles.form}>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`op-${key}`}>Operation</label>
                        <select id={`op-${key}`} name="operation" defaultValue="confirm_live" className={styles.select}>
                          <option value="confirm_schedule">Confirm it&apos;s scheduled</option>
                          <option value="schedule_failed">Scheduling failed</option>
                          <option value="confirm_live">Confirm it posted (or fix a confirmation)</option>
                          <option value="publication_failed">Posting failed</option>
                          <option value="publication_unavailable">Post unavailable</option>
                          <option value="publication_removed">Post removed or replaced</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`url-${key}`}>Live post URL</label>
                        <input id={`url-${key}`} name="providerUrl" type="url" placeholder="https://" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`at-${key}`}>When it actually posted</label>
                        <input id={`at-${key}`} name="actualAt" type="datetime-local" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`off-${key}`}>Timezone for that date</label>
                        <select id={`off-${key}`} name="utcOffsetMinutes" defaultValue="-240" className={styles.select}>
                          <option value="-240">EDT (UTC-4)</option><option value="-300">EST (UTC-5)</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ext-${key}`}>Platform post ID (optional)</label>
                        <input id={`ext-${key}`} name="externalId" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`vis-${key}`}>Visibility</label>
                        <select id={`vis-${key}`} name="visibility" defaultValue="public" className={styles.select}>
                          <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="other">Other</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ot-${key}`}>Posted title (optional)</label>
                        <input id={`ot-${key}`} name="observedTitle" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`otx-${key}`}>Posted caption, saved for your records (optional)</label>
                        <textarea id={`otx-${key}`} name="observedText" rows={3} className={styles.textarea} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`em-${key}`}>Proof type</label>
                        <select id={`em-${key}`} name="evidenceMode" defaultValue="upload" className={styles.select}>
                          <option value="upload">Screenshot or PDF</option>
                          <option value="reviewed_link">Link to the proof</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ef-${key}`}>Proof file</label>
                        <input id={`ef-${key}`} name="evidenceFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`eu-${key}`}>Proof link</label>
                        <input id={`eu-${key}`} name="evidenceUrl" type="url" placeholder="https://" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`nt-${key}`}>Note (why verified, or what failed)</label>
                        <textarea id={`nt-${key}`} name="note" rows={2} className={styles.textarea} />
                      </div>
                      <p className={styles.hint}>Every confirmation saves its proof first, and corrections add a new record instead of overwriting the old one.</p>
                      <button type="submit" disabled={busy === key} className={styles.submit}>
                        {busy === key ? 'Recording...' : 'Confirm'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )
          })}
        </article>
      ))}
    </section>
    </>
  )
}

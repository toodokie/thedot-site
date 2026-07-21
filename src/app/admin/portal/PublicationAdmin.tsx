'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import StatusPill, { type PillTone } from './StatusPill'
import styles from './portal-admin.module.css'

export type AdminTarget = {
  clientId: string
  clientName: string
  contentId: string
  title: string
  version: number
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

// display-only pill mapping for a target's schedule/publication status (the DB status
// strings are unchanged; this only chooses a semantic tone + word).
function pubTone(status: string): PillTone {
  if (status === 'live') return 'live'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'failed') return 'failed'
  if (status === 'removed' || status === 'unavailable') return 'muted'
  return 'pending'
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
    const targetKey = `${target.contentId}:${target.destination}`
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

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <div className={styles.cardTitle}>Publication coordination</div>
          <div className={styles.cardSub}>Provider truth per destination. A planned time is never proof; every operation records immutable evidence and keeps corrections as new observations.</div>
        </div>
        <span className={styles.count}>{targets.length} targets</span>
      </div>

      {message && <p role="status" className={styles.banner}>{message}</p>}
      {targets.length === 0 && <p className={styles.empty}>No released publication targets exist yet.</p>}

      {[...pieces.entries()].map(([pieceKey, piece]) => (
        <article key={pieceKey} className={styles.pubPiece}>
          <div className={styles.pubPieceHead}>
            <span className={styles.pubPieceTitle}>{piece.title}</span>
            <span className={styles.pubVersion}>v{piece.version}</span>
          </div>

          {piece.rows.map((target) => {
            const key = `${target.contentId}:${target.destination}`
            const expanded = openForm === key
            const publishedLabel = target.publishedAt
              ? new Date(target.publishedAt).toISOString().slice(0, 10) : null
            return (
              <div key={key}>
                <div className={styles.destRow}>
                  <span className={styles.destName}>{target.destination}</span>
                  <span className={styles.destPills}>
                    <StatusPill tone={pubTone(target.scheduleStatus)} label={`sched: ${target.scheduleStatus}`} />
                    <StatusPill tone={pubTone(target.publicationStatus)} label={`pub: ${target.publicationStatus}`} />
                    <StatusPill
                      tone={target.publicationStatus === 'live' ? 'verified' : 'muted'}
                      label={target.publicationLabel} />
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
                    {expanded ? 'Close' : 'Confirm / correct'}
                  </button>
                </div>

                {expanded && (
                  <>
                    {target.scheduleEvidenceId && (
                      <p className={styles.hint}>
                        <a href={`/api/admin/portal/evidence/${target.scheduleEvidenceId}`} target="_blank">Open current schedule evidence</a>
                        {target.scheduleVerifier ? ` · verified by ${target.scheduleVerifier}` : ''}
                      </p>
                    )}
                    {target.history.length > 0 && (
                      <details className={styles.auditToggle}>
                        <summary>Publication audit history ({target.history.length})</summary>
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
                          <option value="confirm_schedule">Confirm scheduled</option>
                          <option value="schedule_failed">Mark schedule failed</option>
                          <option value="confirm_live">Confirm live / correct live confirmation</option>
                          <option value="publication_failed">Mark publication failed</option>
                          <option value="publication_unavailable">Mark publication unavailable</option>
                          <option value="publication_removed">Record removed/superseded post</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`url-${key}`}>Provider URL</label>
                        <input id={`url-${key}`} name="providerUrl" type="url" placeholder="https://" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`at-${key}`}>Actual provider date and time</label>
                        <input id={`at-${key}`} name="actualAt" type="datetime-local" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`off-${key}`}>Toronto offset for that date</label>
                        <select id={`off-${key}`} name="utcOffsetMinutes" defaultValue="-240" className={styles.select}>
                          <option value="-240">EDT (UTC-4)</option><option value="-300">EST (UTC-5)</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ext-${key}`}>Provider object ID (optional)</label>
                        <input id={`ext-${key}`} name="externalId" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`vis-${key}`}>Visibility</label>
                        <select id={`vis-${key}`} name="visibility" defaultValue="public" className={styles.select}>
                          <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="other">Other</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ot-${key}`}>Observed title (optional)</label>
                        <input id={`ot-${key}`} name="observedTitle" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`otx-${key}`}>Observed final caption/description (optional, internal audit snapshot)</label>
                        <textarea id={`otx-${key}`} name="observedText" rows={3} className={styles.textarea} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`em-${key}`}>Evidence type</label>
                        <select id={`em-${key}`} name="evidenceMode" defaultValue="upload" className={styles.select}>
                          <option value="upload">Private screenshot or PDF</option>
                          <option value="reviewed_link">Reviewed evidence link</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`ef-${key}`}>Evidence file</label>
                        <input id={`ef-${key}`} name="evidenceFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`eu-${key}`}>Evidence link</label>
                        <input id={`eu-${key}`} name="evidenceUrl" type="url" placeholder="https://" className={styles.input} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor={`nt-${key}`}>Verification or failure note</label>
                        <textarea id={`nt-${key}`} name="note" rows={2} className={styles.textarea} />
                      </div>
                      <p className={styles.hint}>Every operation registers immutable evidence before it records; corrections never overwrite, they add a new observation.</p>
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
  )
}

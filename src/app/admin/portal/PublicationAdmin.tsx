'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase/client'

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

export default function PublicationAdmin({ targets }: { targets: AdminTarget[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  return (
    <div>
      {message && <p role="status" style={{ padding: 12, background: '#fff7cc' }}>{message}</p>}
      {targets.length === 0 && <p>No released publication targets exist yet.</p>}
      {targets.map((target) => {
        const key = `${target.contentId}:${target.destination}`
        return (
          <article key={key} style={{ borderTop: '1px solid #ddd', padding: '24px 0' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{target.title} · {target.destination}</h2>
            <p style={{ color: '#666' }}>
              v{target.version} · schedule {target.scheduleStatus} · publication {target.publicationStatus}
              {target.publishedAt ? ` · ${new Date(target.publishedAt).toLocaleString()}` : ''}
            </p>
            <p style={{ color: '#666' }}>{target.publicationLabel}</p>
            {target.liveUrl && <p><a href={target.liveUrl} target="_blank" rel="noreferrer">Current live URL</a></p>}
            {target.scheduleEvidenceId && (
              <p>
                <a href={`/api/admin/portal/evidence/${target.scheduleEvidenceId}`} target="_blank">Open current schedule evidence</a>
                {target.scheduleVerifier ? ` · verified by ${target.scheduleVerifier}` : ''}
              </p>
            )}
            {target.history.length > 0 && (
              <details style={{ marginBottom: 18 }}>
                <summary>Publication audit history ({target.history.length})</summary>
                <ol>
                  {target.history.map((observation) => (
                    <li key={observation.id} style={{ margin: '10px 0' }}>
                      {observation.providerState} · {observation.sourceType} · {observation.reconciliationStatus}
                      {' · '}verified by {observation.verifier}
                      {' · '}{new Date(observation.observedAt).toLocaleString()}
                      {observation.publishedAt ? ` · published ${new Date(observation.publishedAt).toLocaleString()}` : ''}
                      {' · '}<a href={`/api/admin/portal/evidence/${observation.evidenceId}`} target="_blank">evidence</a>
                      {observation.permalink && <> · <a href={observation.permalink} target="_blank" rel="noreferrer">provider object</a></>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <form action={(data) => submit(target, data)} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
              <label>Operation
                <select name="operation" defaultValue="confirm_live" style={{ display: 'block', width: '100%', padding: 8 }}>
                  <option value="confirm_schedule">Confirm scheduled</option>
                  <option value="schedule_failed">Mark schedule failed</option>
                  <option value="confirm_live">Confirm live / correct live confirmation</option>
                  <option value="publication_failed">Mark publication failed</option>
                  <option value="publication_unavailable">Mark publication unavailable</option>
                  <option value="publication_removed">Record removed/superseded post</option>
                </select>
              </label>
              <label>Provider URL
                <input name="providerUrl" type="url" placeholder="https://…" style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Actual provider date and time
                <input name="actualAt" type="datetime-local" style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Toronto offset for that date
                <select name="utcOffsetMinutes" defaultValue="-240" style={{ display: 'block', width: '100%', padding: 8 }}>
                  <option value="-240">EDT (UTC−4)</option><option value="-300">EST (UTC−5)</option>
                </select>
              </label>
              <label>Provider object ID (optional)
                <input name="externalId" style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Visibility
                <select name="visibility" defaultValue="public" style={{ display: 'block', width: '100%', padding: 8 }}>
                  <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="other">Other</option>
                </select>
              </label>
              <label>Observed title (optional)
                <input name="observedTitle" style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Observed final caption/description (optional, internal audit snapshot)
                <textarea name="observedText" rows={4} style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Evidence type
                <select name="evidenceMode" defaultValue="upload" style={{ display: 'block', width: '100%', padding: 8 }}>
                  <option value="upload">Private screenshot or PDF</option>
                  <option value="reviewed_link">Reviewed evidence link</option>
                </select>
              </label>
              <label>Evidence file
                <input name="evidenceFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
              </label>
              <label>Evidence link
                <input name="evidenceUrl" type="url" placeholder="https://…" style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <label>Verification or failure note
                <textarea name="note" rows={3} style={{ display: 'block', width: '100%', padding: 8 }} />
              </label>
              <button type="submit" disabled={busy === key} style={{ padding: 10 }}>
                {busy === key ? 'Recording…' : 'Record audited operation'}
              </button>
            </form>
          </article>
        )
      })}
    </div>
  )
}

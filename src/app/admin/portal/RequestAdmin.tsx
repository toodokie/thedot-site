'use client'

import { useState } from 'react'
import styles from './portal-admin.module.css'
import StatusPill, { type PillTone } from './StatusPill'
import AdminPageHeader from './AdminPageHeader'

export type AdminContentRequest = {
  id: string; clientName: string; requestType: string; status: string; requesterName: string
  createdAt: string; title: string; baseVersion: number | null; resolutionNote: string | null
}

// Request status -> pill tone (presentation only; the raw status string is unchanged upstream).
function requestTone(status: string): PillTone {
  if (status === 'applied') return 'verified'
  if (status === 'rejected' || status === 'conflicted') return 'failed'
  if (status === 'pending' || status === 'applying') return 'pending'
  return 'muted'
}

export default function RequestAdmin({ requests }: { requests: AdminContentRequest[] }) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  async function resolve(id: string, status: 'rejected' | 'conflicted') {
    const reason = window.prompt(status === 'rejected' ? 'Client-visible reason for declining:' : 'Client-visible conflict explanation:')?.trim()
    if (!reason) return
    setBusy(id); setMessage(null)
    try {
      const response = await fetch('/api/admin/portal/requests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: id, status, reason, idempotencyKey: crypto.randomUUID() }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Request resolution failed')
      setMessage('Request updated. Refresh to see the reconciled status.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request resolution failed') }
    finally { setBusy(null) }
  }
  return <>
    <AdminPageHeader kicker="Agency ops" title="Change requests"
      intro="Requests Maria sends from her portal. Decline or flag a conflict here; the actual edit happens in the content workflow, not this browser." />
    <section className={styles.card}>
    {message && <p className={styles.statusMsg} role="status">{message}</p>}
    {!requests.length ? <p className={styles.empty}>No change requests from Maria right now.</p> : <div>
      {requests.map((request) => <article key={request.id} className={styles.subCard}>
        <div className={styles.pubPieceHead}>
          <span className={styles.subCardTitle}>{request.title}</span>
          <StatusPill tone={requestTone(request.status)} label={request.status} />
        </div>
        <div className={styles.metaLine}>{request.clientName} · {request.requestType} · {request.requesterName} · {request.createdAt.slice(0, 10)}{request.baseVersion ? ` · v${request.baseVersion}` : ''}</div>
        {request.resolutionNote && <p className={styles.metaLine}>{request.resolutionNote}</p>}
        {['pending', 'applying'].includes(request.status) && <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy === request.id} onClick={() => resolve(request.id, 'rejected')}>Reject</button>
          <button type="button" className={styles.btn} disabled={busy === request.id} onClick={() => resolve(request.id, 'conflicted')}>Mark conflict</button>
        </div>}
        <div className={styles.codeId}>{request.id}</div>
      </article>)}
    </div>}
    </section>
  </>
}

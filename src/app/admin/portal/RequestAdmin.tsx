'use client'

import { useState } from 'react'

export type AdminContentRequest = {
  id: string; clientName: string; requestType: string; status: string; requesterName: string
  createdAt: string; title: string; baseVersion: number | null; resolutionNote: string | null
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
  return <section style={{ marginTop: 42 }}>
    <h2>Client content requests</h2>
    <p>Apply commands run only through the checked local <code>portal-inbox apply-*</code> path. This browser never writes the canonical repository.</p>
    {message && <p role="status">{message}</p>}
    {!requests.length ? <p>No content requests.</p> : <div style={{ display: 'grid', gap: 12 }}>
      {requests.map((request) => <article key={request.id} style={{ border: '1px solid #ddd', padding: 14 }}>
        <strong>{request.title}</strong> · {request.clientName} · {request.requestType} · {request.status}
        <div style={{ color: '#666', fontSize: 13 }}>{request.requesterName} · {request.createdAt.slice(0, 10)}{request.baseVersion ? ` · v${request.baseVersion}` : ''}</div>
        {request.resolutionNote && <p>{request.resolutionNote}</p>}
        {['pending', 'applying'].includes(request.status) && <p style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy === request.id} onClick={() => resolve(request.id, 'rejected')}>Reject</button>
          <button type="button" disabled={busy === request.id} onClick={() => resolve(request.id, 'conflicted')}>Mark conflict</button>
        </p>}
        <code>{request.id}</code>
      </article>)}
    </div>}
  </section>
}

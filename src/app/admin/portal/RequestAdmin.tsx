'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './portal-admin.module.css'
import StatusPill, { type PillTone } from './StatusPill'
import AdminPageHeader from './AdminPageHeader'
import type { AdminClientProposal } from './data'

export type AdminContentRequest = {
  id: string; clientName: string; requestType: string; status: string; requesterName: string
  createdAt: string; title: string; contentUuid: string | null; baseVersion: number | null; resolutionNote: string | null
  edit: {
    blockKey: string | null; blockLabel: string | null; originalText: string | null; proposedText: string
  } | null
  messages: Array<{ id: string; authorType: 'client' | 'anastasia'; authorName: string; body: string; createdAt: string }>
}

// Request status -> pill tone (presentation only; the raw status string is unchanged upstream).
function requestTone(status: string): PillTone {
  if (status === 'applied') return 'verified'
  if (status === 'answered') return 'muted'
  if (status === 'rejected' || status === 'conflicted') return 'failed'
  if (status === 'pending' || status === 'applying') return 'pending'
  return 'muted'
}

function RequestReplyForm({ request }: { request: AdminContentRequest }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [close, setClose] = useState(false)
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setState({ kind: 'sending' })
    try {
      const response = await fetch('/api/admin/portal/requests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reply', requestId: request.id, body: trimmed, close,
          idempotencyKey: crypto.randomUUID() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Could not post the reply.')
      setBody('')
      setState({ kind: 'sent', message: close ? 'Reply posted and request answered.' : 'Reply posted.' })
      router.refresh()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not post the reply.' })
    }
  }
  return <form onSubmit={submit} className={styles.requestReplyForm}>
    <label className={styles.fieldLabel} htmlFor={`request-reply-${request.id}`}>Reply to Maria</label>
    <textarea id={`request-reply-${request.id}`} value={body}
      onChange={(event) => setBody(event.target.value.slice(0, 4000))} rows={2} maxLength={4000}
      className={styles.commentReplyInput} placeholder="Reply in the portal" />
    {request.status === 'pending' && <label className={styles.requestCloseLabel}>
      <input type="checkbox" checked={close} onChange={(event) => setClose(event.target.checked)} />
      Answer and close, no copy change required
    </label>}
    <div className={styles.commentReplyActions}>
      {state.message && <span className={state.kind === 'error' ? styles.commentError : styles.commentSuccess} role="status">{state.message}</span>}
      <button type="submit" className={styles.disclose} disabled={state.kind === 'sending' || !body.trim()}>{state.kind === 'sending' ? 'Posting…' : 'Reply'}</button>
    </div>
  </form>
}

function ProposalReplyForm({ proposal }: { proposal: AdminClientProposal }) {
  const router = useRouter(); const [body, setBody] = useState(''); const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const reply = body.trim(); if (!reply) return; setState({ kind: 'sending' })
    try {
      const response = await fetch('/api/admin/portal/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'proposal-reply', requestId: proposal.id, body: reply, idempotencyKey: crypto.randomUUID() }) })
      const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error ?? 'Could not post the reply.')
      setBody(''); setState({ kind: 'sent', message: 'Reply posted.' }); router.refresh()
    } catch (error) { setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not post the reply.' }) }
  }
  return <form onSubmit={submit} className={styles.requestReplyForm}><label className={styles.fieldLabel} htmlFor={`proposal-reply-${proposal.id}`}>Reply to Maria</label>
    <textarea id={`proposal-reply-${proposal.id}`} value={body} onChange={(event) => setBody(event.target.value.slice(0, 4000))} rows={2} maxLength={4000} className={styles.commentReplyInput} placeholder="Reply in the portal" />
    <div className={styles.commentReplyActions}>{state.message && <span className={state.kind === 'error' ? styles.commentError : styles.commentSuccess} role="status">{state.message}</span>}<button type="submit" className={styles.disclose} disabled={state.kind === 'sending' || !body.trim()}>{state.kind === 'sending' ? 'Posting…' : 'Reply'}</button></div>
  </form>
}

function ProposalList({ proposals }: { proposals: AdminClientProposal[] }) {
  if (!proposals.length) return <p className={styles.empty}>No agency proposals yet.</p>
  return <div>{proposals.map((proposal) => <article key={proposal.id} id={`proposal-${proposal.id}`} className={styles.subCard}>
    <div className={styles.pubPieceHead}><span className={styles.subCardTitle}>{proposal.title}</span><StatusPill tone={proposal.status === 'approved' ? 'verified' : proposal.status === 'change_requested' ? 'failed' : 'pending'} label={proposal.status === 'awaiting_decision' ? 'Waiting on Maria' : proposal.status.replaceAll('_', ' ')} /></div>
    <div className={styles.metaLine}>{proposal.clientName} · proposal · v{proposal.revision}{proposal.submittedAt ? ` · ${proposal.submittedAt.slice(0, 10)}` : ''}</div>
    {proposal.summary && <p>{proposal.summary}</p>}
    {proposal.decisionNote && <p className={styles.metaLine}><strong>{proposal.decidedByName ?? 'Client'}:</strong> {proposal.decisionNote}</p>}
    {proposal.messages.length > 0 && <section className={styles.requestConversation} aria-label="Proposal conversation">{proposal.messages.map((message) => <div key={message.id} className={message.authorType === 'anastasia' ? styles.requestAgencyMessage : styles.requestClientMessage}><span>{message.authorName}</span><p>{message.body}</p></div>)}</section>}
    <ProposalReplyForm proposal={proposal} />
  </article>)}</div>
}

export function RequestList({
  requests,
  showPieceTitle = true,
  emptyLabel = 'No change requests from Maria right now.',
}: {
  requests: AdminContentRequest[]
  showPieceTitle?: boolean
  emptyLabel?: string
}) {
  const router = useRouter()
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
      setMessage('Request updated.')
      router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request resolution failed') }
    finally { setBusy(null) }
  }
  return <>
    {message && <p className={styles.statusMsg} role="status">{message}</p>}
    {!requests.length ? <p className={styles.empty}>{emptyLabel}</p> : <div>
      {requests.map((request) => <article key={request.id} className={styles.subCard}>
        <div className={styles.pubPieceHead}>
          {showPieceTitle && <span className={styles.subCardTitle}>{request.title}</span>}
          <StatusPill tone={requestTone(request.status)} label={request.status} />
        </div>
        <div className={styles.metaLine}>{request.clientName} · {request.requestType} · {request.requesterName} · {request.createdAt.slice(0, 10)}{request.baseVersion ? ` · v${request.baseVersion}` : ''}</div>
        {request.edit && <details className={styles.editReview} open>
          <summary>Review edit to {request.edit.blockLabel ?? request.edit.blockKey ?? 'copy block'}</summary>
          <p className={styles.editReviewHint}>Maria’s proposed replacement is shown beside the text she reviewed.</p>
          <div className={styles.editReviewGrid}>
            <section>
              <h3 className={styles.editReviewLabel}>Current text{request.baseVersion ? `, v${request.baseVersion}` : ''}</h3>
              {request.edit.originalText !== null
                ? <pre className={styles.editReviewText}>{request.edit.originalText}</pre>
                : <p className={styles.editReviewMissing}>The original block is unavailable, so reconcile this request carefully.</p>}
            </section>
            <section>
              <h3 className={styles.editReviewLabel}>Maria’s proposed text</h3>
              <pre className={styles.editReviewText}>{request.edit.proposedText}</pre>
            </section>
          </div>
        </details>}
        {request.messages.length > 0 && <section className={styles.requestConversation} aria-label="Request conversation">
          {request.messages.map((message) => <div key={message.id}
            className={message.authorType === 'anastasia' ? styles.requestAgencyMessage : styles.requestClientMessage}>
            <span>{message.authorName}</span>
            <p>{message.body}</p>
          </div>)}
        </section>}
        {request.resolutionNote && <p className={styles.metaLine}>{request.resolutionNote}</p>}
        {['pending', 'applying', 'prepared'].includes(request.status) && <RequestReplyForm request={request} />}
        {['pending', 'applying'].includes(request.status) && <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy === request.id} onClick={() => resolve(request.id, 'rejected')}>Reject</button>
          <button type="button" className={styles.btn} disabled={busy === request.id} onClick={() => resolve(request.id, 'conflicted')}>Mark conflict</button>
        </div>}
      </article>)}
    </div>}
  </>
}

export default function RequestAdmin({ requests, proposals = [] }: { requests: AdminContentRequest[]; proposals?: AdminClientProposal[] }) {
  return <>
    <AdminPageHeader kicker="Agency ops" title="Messages & requests"
      intro="Proposals are client-facing agency messages that can be discussed and approved in the portal. Content requests remain separate because canonical copy changes still move through the revision workflow." />
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Agency proposals</h2>
      <ProposalList proposals={proposals} />
    </section>
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Content requests</h2>
      <RequestList requests={requests} />
    </section>
  </>
}

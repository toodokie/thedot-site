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
  reviewCandidate: {
    candidateText: string; changeSummary: string; status: 'draft' | 'approved'; revision: number
    approvedAt: string | null; updatedAt: string
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

function SafeMergeReview({ request }: { request: AdminContentRequest }) {
  const router = useRouter()
  const saved = request.reviewCandidate
  const [candidateText, setCandidateText] = useState(saved?.candidateText ?? '')
  const [changeSummary, setChangeSummary] = useState(saved?.changeSummary ?? '')
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'approving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' })
  const dirty = candidateText !== (saved?.candidateText ?? '') || changeSummary !== (saved?.changeSummary ?? '')

  async function mutate(payload: Record<string, unknown>) {
    const response = await fetch('/api/admin/portal/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, idempotencyKey: crypto.randomUUID(), ...payload }),
    })
    const body = await response.json() as { error?: string }
    if (!response.ok) throw new Error(body.error ?? 'Candidate review update failed.')
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ kind: 'saving' })
    try {
      await mutate({ action: 'save-candidate', candidateText: candidateText.trim(), changeSummary: changeSummary.trim() })
      setState({ kind: 'saved', message: saved?.status === 'approved'
        ? 'Candidate saved as a new draft. Its earlier approval was cleared.'
        : 'Candidate draft saved.' })
      router.refresh()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Candidate review update failed.' })
    }
  }

  async function approve() {
    if (!saved || dirty) return
    setState({ kind: 'approving' })
    try {
      await mutate({ action: 'approve-candidate', expectedRevision: saved.revision })
      setState({ kind: 'saved', message: 'Candidate approved internally. Maria’s request and the released copy are unchanged.' })
      router.refresh()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Candidate approval failed.' })
    }
  }

  return <form onSubmit={save} className={styles.safeMergeForm}>
    <div className={styles.safeMergeHead}>
      <div>
        <h3 className={styles.editReviewLabel}>Safe merge candidate</h3>
        <p className={styles.safeMergeIntro}>Agency-only draft. Saving and approving here do not apply copy or notify Maria.</p>
      </div>
      {saved && <StatusPill tone={saved.status === 'approved' && !dirty ? 'verified' : 'pending'}
        label={dirty ? 'Unsaved changes' : saved.status === 'approved' ? 'Approved internally' : 'Draft'} />}
    </div>
    <label className={styles.fieldLabel} htmlFor={`candidate-copy-${request.id}`}>Recommended final copy</label>
    <textarea id={`candidate-copy-${request.id}`} value={candidateText}
      onChange={(event) => setCandidateText(event.target.value.slice(0, 8000))}
      rows={12} maxLength={8000} className={styles.safeMergeInput}
      placeholder="Write the complete recommended replacement, not only the changed sentence." />
    <label className={styles.fieldLabel} htmlFor={`candidate-summary-${request.id}`}>Change map and reasons</label>
    <textarea id={`candidate-summary-${request.id}`} value={changeSummary}
      onChange={(event) => setChangeSummary(event.target.value.slice(0, 4000))}
      rows={7} maxLength={4000} className={styles.safeMergeInput}
      placeholder={'Accepted: …\nRephrased: … and why\nRemoved or retained: … and why'} />
    {state.message && <span className={state.kind === 'error' ? styles.commentError : styles.commentSuccess} role="status">{state.message}</span>}
    <div className={styles.safeMergeActions}>
      <button type="submit" className={styles.btn}
        disabled={state.kind === 'saving' || state.kind === 'approving' || !candidateText.trim() || changeSummary.trim().length < 3 || !dirty}>
        {state.kind === 'saving' ? 'Saving…' : saved ? 'Save new draft' : 'Save candidate'}
      </button>
      <button type="button" className={`${styles.btn} ${styles.safeMergeApprove}`}
        disabled={!saved || dirty || saved.status === 'approved' || state.kind === 'saving' || state.kind === 'approving'}
        onClick={approve}>
        {state.kind === 'approving' ? 'Approving…' : 'Approve candidate'}
      </button>
    </div>
    <p className={styles.safeMergeFoot}>After approval, canonical reconciliation must use this exact candidate. Applying and releasing remain separate actions.</p>
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
    <div className={styles.pubPieceHead}><span className={styles.subCardTitle}>{proposal.title}</span><StatusPill tone={proposal.status === 'approved' ? 'verified' : proposal.status === 'change_requested' ? 'failed' : 'pending'} label={proposal.status === 'awaiting_decision' ? 'Waiting on review' : proposal.status.replaceAll('_', ' ')} /></div>
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
          <p className={styles.editReviewHint}>Compare the exact released text, Maria’s replacement, and the agency recommendation before any canonical change begins.</p>
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
            {request.status === 'pending' && <SafeMergeReview request={request} />}
            {request.status !== 'pending' && request.reviewCandidate && <section>
              <div className={styles.safeMergeHead}>
                <h3 className={styles.editReviewLabel}>Safe merge candidate</h3>
                <StatusPill tone={request.reviewCandidate.status === 'approved' ? 'verified' : 'pending'}
                  label={request.reviewCandidate.status === 'approved' ? 'Approved internally' : 'Draft'} />
              </div>
              <pre className={styles.editReviewText}>{request.reviewCandidate.candidateText}</pre>
              <p className={styles.safeMergeSummary}>{request.reviewCandidate.changeSummary}</p>
            </section>}
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

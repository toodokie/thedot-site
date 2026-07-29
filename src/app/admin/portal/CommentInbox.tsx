'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eyebrow } from '@thedot/design-system'
import type { AdminComment } from './data'
import styles from './portal-admin.module.css'

function ReplyForm({ comment }: { comment: AdminComment }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setState({ kind: 'sending' })
    try {
      const response = await fetch('/api/admin/portal/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment.id,
          body: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not send reply.')
      setBody('')
      setState({ kind: 'sent', message: 'Reply posted.' })
      router.refresh()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not send reply.' })
    }
  }
  return <form onSubmit={submit} className={styles.commentReplyForm}>
    <label className={styles.fieldLabel} htmlFor={`reply-${comment.id}`}>Reply as The Dot</label>
    <textarea id={`reply-${comment.id}`} value={body} onChange={(event) => setBody(event.target.value.slice(0, 4000))}
      rows={2} maxLength={4000} className={styles.commentReplyInput} placeholder="Write a reply for the client" />
    <div className={styles.commentReplyActions}>
      {state.message && <span className={state.kind === 'error' ? styles.commentError : styles.commentSuccess} role="status">{state.message}</span>}
      <button type="submit" className={styles.disclose} disabled={state.kind === 'sending' || !body.trim()}>{state.kind === 'sending' ? 'Posting…' : 'Reply'}</button>
    </div>
  </form>
}

export default function CommentInbox({ comments }: { comments: AdminComment[] }) {
  return <section className={styles.card}>
    <div className={styles.panelHead}><Eyebrow tone="grey">Client comments</Eyebrow></div>
    <p className={styles.panelNote}>Every comment is retained in the audit log and linked back to its piece. Unresolved comments stay here until you handle them.</p>
    {comments.length === 0 ? <p className={styles.empty}>No client comments yet.</p> : <ul className={styles.commentList}>
      {comments.map((comment) => <li key={comment.id} className={styles.commentItem}>
        <div className={styles.commentMeta}>
          <span>{comment.clientName}</span><span>{comment.authorName}</span><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}</time>
          {!comment.resolved && <span className={styles.commentOpen}>needs reply</span>}
        </div>
        <Link href={`/admin/portal/pieces/${encodeURIComponent(comment.contentId)}`} className={styles.commentPiece}>{comment.title}</Link>
        <div className={styles.commentTarget}>{comment.targetKind === 'design' ? 'Design feedback' : `Copy${comment.copyBlockKey ? ` · ${comment.copyBlockKey}` : ''}`}</div>
        {comment.targetUrl && <a href={comment.targetUrl} target="_blank" rel="noreferrer" className={styles.destLink}>Open referenced design</a>}
        {comment.quotedText && <blockquote className={styles.commentQuote}>{comment.quotedText}</blockquote>}
        <p className={styles.commentBody}>{comment.body}</p>
        {comment.replyBody && <div className={styles.commentAgencyReply}>
          <span>{comment.replyAuthorName ?? 'The Dot'} replied</span>
          <p>{comment.replyBody}</p>
        </div>}
        {comment.resolved
          ? <p className={styles.commentSuccess}>Answered in the client thread.</p>
          : <ReplyForm comment={comment} />}
      </li>)}
    </ul>}
  </section>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminIdeaComment } from './mirror-data'
import styles from './portal-admin.module.css'

function time(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto',
  }).format(new Date(value))
}

function AgencyCommentForm({ ideaId, comment }: { ideaId: string; comment?: AdminIdeaComment }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setState({ kind: 'sending' })
    try {
      const response = await fetch('/api/admin/portal/idea-comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: comment ? 'reply' : 'comment',
          commentId: comment?.id,
          ideaId,
          body: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Could not post the reply.')
      setBody('')
      setState({ kind: 'sent', message: comment ? 'Reply posted.' : 'Comment posted.' })
      router.refresh()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not post the reply.' })
    }
  }
  return <form onSubmit={submit} className={styles.commentReplyForm}>
    <label className={styles.fieldLabel} htmlFor={`idea-comment-${comment?.id ?? ideaId}`}>
      {comment ? 'Reply as The Dot' : 'Comment as The Dot'}
    </label>
    <textarea id={`idea-comment-${comment?.id ?? ideaId}`} value={body}
      onChange={(event) => setBody(event.target.value.slice(0, 4000))} rows={2} maxLength={4000}
      className={styles.commentReplyInput} placeholder="Reply in the idea thread" />
    <div className={styles.commentReplyActions}>
      {state.message && <span role="status" className={state.kind === 'error' ? styles.commentError : styles.commentSuccess}>{state.message}</span>}
      <button type="submit" className={styles.disclose} disabled={state.kind === 'sending' || !body.trim()}>
      {state.kind === 'sending' ? 'Posting…' : comment ? 'Reply' : 'Add comment'}
      </button>
    </div>
  </form>
}

export default function IdeaCommentsAdmin({ ideaId, comments }: { ideaId: string; comments: AdminIdeaComment[] }) {
  const roots = comments.filter((comment) => comment.replyToCommentId === null)
  const replies = new Map(comments
    .filter((comment) => comment.authorType !== 'client' && comment.replyToCommentId)
    .map((comment) => [comment.replyToCommentId, comment]))
  return <section className={styles.ideaCommentThread} aria-label="Idea discussion">
    {!comments.length && <p className={styles.metaLine}>No discussion yet.</p>}
    {roots.map((comment) => {
      const reply = replies.get(comment.id)
      return <article key={comment.id} className={styles.ideaCommentItem}>
        <div className={styles.commentMeta}>
          <span>{comment.authorName}</span><time dateTime={comment.createdAt}>{time(comment.createdAt)}</time>
          {comment.authorType === 'client' && !comment.resolved && <span className={styles.commentOpen}>needs reply</span>}
        </div>
        <p className={styles.commentBody}>{comment.body}</p>
        {reply && <div className={styles.commentAgencyReply}>
          <span>{reply.authorName} replied</span><p>{reply.body}</p>
        </div>}
        {comment.authorType === 'client' && (comment.resolved
          ? <p className={styles.commentSuccess}>Answered in the client thread.</p>
          : <AgencyCommentForm ideaId={ideaId} comment={comment} />)}
      </article>
    })}
    <AgencyCommentForm ideaId={ideaId} />
  </section>
}

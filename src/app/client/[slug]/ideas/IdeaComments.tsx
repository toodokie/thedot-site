'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Text, Textarea } from '@thedot/design-system'
import { addIdeaComment, type IdeaCommentActionState } from '../idea-actions'
import type { IdeaCommentRow } from '@/lib/portal/ideas'
import styles from './ideas.module.css'

function SubmitComment() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>
    {pending ? 'Sending…' : 'Add comment'}
  </Button>
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto',
  }).format(new Date(value))
}

export default function IdeaComments({
  slug, ideaId, comments, canComment,
}: {
  slug: string
  ideaId: string
  comments: IdeaCommentRow[]
  canComment: boolean
}) {
  const [open, setOpen] = useState(comments.length > 0)
  const [state, action] = useActionState<IdeaCommentActionState, FormData>(addIdeaComment, {})
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
      setIdempotencyKey(crypto.randomUUID())
      setOpen(true)
    }
  }, [state.success])

  return <section className={styles.commentThread} aria-label="Idea discussion">
    <button type="button" className={styles.commentToggle} onClick={() => setOpen((current) => !current)}
      aria-expanded={open}>
      {comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comment'}
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div className={styles.commentContent}>
      {comments.length > 0 && <div className={styles.commentList}>
        {comments.map((comment) => <article key={comment.id}
          className={comment.author_type === 'client' ? styles.clientComment : styles.agencyComment}>
          <div className={styles.commentMeta}>
            <strong>{comment.author_name}</strong>
            <time dateTime={comment.created_at}>{timestamp(comment.created_at)}</time>
          </div>
          <Text as="p" size="sm">{comment.body}</Text>
        </article>)}
      </div>}
      {canComment ? <form ref={formRef} action={action} className={styles.commentForm}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="ideaId" value={ideaId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Textarea label="Comment for The Dot" id={`idea-comment-${ideaId}`} name="body" rows={2}
          maxLength={4000} placeholder="Add context, a question, or feedback" />
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
        {state.success && <p role="status" className={styles.commentSuccess}>{state.success}</p>}
        <div className={styles.commentActions}><SubmitComment /></div>
      </form> : <Text as="p" size="sm" tone="grey" className={styles.commentReadOnly}>
        Your account can view this discussion but cannot add a comment.
      </Text>}
    </div>}
  </section>
}

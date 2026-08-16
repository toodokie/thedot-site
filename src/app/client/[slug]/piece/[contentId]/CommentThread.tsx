'use client'
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Eyebrow, Text, Button, Textarea } from '@thedot/design-system'
import { addComment } from '../../comment-actions'
import type { CommentRow } from '@/lib/portal/comments'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>{pending ? 'Posting…' : 'Post comment'}</Button>
}

const quoteBox = {
  borderLeft: '3px solid var(--dot-yellow)', paddingLeft: 10, marginBottom: 10,
  color: 'var(--dot-graphite)', whiteSpace: 'pre-wrap' as const,
}

export default function CommentThread({
  slug, contentId, comments, canComment,
}: {
  slug: string
  contentId: string
  comments: CommentRow[]
  canComment: boolean
}) {
  const [state, action] = useActionState(async (_p: { error?: string }, fd: FormData) => addComment(fd), {})
  const formRef = useRef<HTMLFormElement>(null)
  const prevCount = useRef(comments.length)

  // A new comment arriving (after revalidate) means our submit succeeded: clear the form + the quote.
  useEffect(() => {
    if (comments.length > prevCount.current) {
      formRef.current?.reset()
    }
    prevCount.current = comments.length
  }, [comments.length])

  return (
    <div style={{ marginTop: 44 }}>
      <Eyebrow tone="grey">Questions and conversation</Eyebrow>
      <Text size="sm" tone="grey">Notes here do not change the piece. To change copy or a visual, edit its block above.</Text>

      <div style={{ marginTop: 12 }}>
        {comments.length === 0 && <Text tone="graphite">No comments yet.</Text>}
        {comments.map((c) => {
          // A reply from The Dot (anastasia/agent) reads as the agency side of the thread: a yellow
          // accent, an uppercase name label, and a slight indent. A client comment stays plain, with
          // the name inline. That makes a two-way conversation legible at a glance.
          const isAgency = c.author_type !== 'client'
          return (
            <div key={c.id} style={{
              borderTop: '1px solid var(--dot-hairline)', padding: '14px 0',
              ...(isAgency ? { borderLeft: '2px solid var(--dot-yellow)', paddingLeft: 14, marginLeft: 12 } : {}),
            }}>
              {c.target_kind === 'design' && <div style={{ ...quoteBox, borderLeftColor: 'var(--dot-black)' }}>
                <Text size="sm" tone="graphite">Asset feedback</Text>
                {c.target_url && <a href={c.target_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4, color: 'var(--dot-black)' }}>Open the referenced asset</a>}
              </div>}
              {c.target_kind !== 'design' && c.quoted_text && <div style={quoteBox}><Text size="md" tone="graphite">{c.quoted_text}</Text></div>}
              {isAgency ? (
                <>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dot-graphite)', marginBottom: 3 }}>
                    {c.reply_to_comment_id ? `${c.author_name} replied` : c.author_name}
                  </div>
                  <Text as="div" size="md" tone="graphite">{c.body}</Text>
                </>
              ) : (
                <Text as="div" size="md" tone="graphite">
                  <strong>{c.author_name}</strong> {c.body}{c.resolved ? ' (answered)' : ''}
                </Text>
              )}
              <time dateTime={c.created_at} style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--dot-graphite)', fontVariantNumeric: 'tabular-nums' }}>{c.created_at.slice(0, 10)}</time>
            </div>
          )
        })}
      </div>

      {canComment ? <form ref={formRef} action={action} style={{ marginTop: 16, borderTop: '1px solid var(--dot-hairline)', paddingTop: 16 }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="contentId" value={contentId} />
        <input type="hidden" name="quotedText" value="" />
        <input type="hidden" name="copyBlockKey" value="" />
        <input type="hidden" name="targetKind" value="copy" />
        <input type="hidden" name="designUrl" value="" />
        <Textarea label="Ask a question or leave a note" id="comment-body" name="body" rows={3} maxLength={4000}
          placeholder="This will not change the piece" invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? 'comment-error' : undefined} />
        {state?.error && <p id="comment-error" role="alert" style={{ color: '#c0392b', margin: '8px 0 0' }}>{state.error}</p>}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}><SubmitBtn /></div>
      </form> : (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--dot-hairline)', paddingTop: 16 }}>
          <Text size="sm" tone="grey">Comments are read-only for your account.</Text>
        </div>
      )}
    </div>
  )
}

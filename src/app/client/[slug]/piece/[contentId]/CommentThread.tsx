'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
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

export default function CommentThread({ slug, contentId, comments }: { slug: string; contentId: string; comments: CommentRow[] }) {
  const [state, action] = useActionState(async (_p: { error?: string }, fd: FormData) => addComment(fd), {})
  const [quote, setQuote] = useState('')
  const [selection, setSelection] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const prevCount = useRef(comments.length)

  // A new comment arriving (after revalidate) means our submit succeeded: clear the form + the quote.
  useEffect(() => {
    if (comments.length > prevCount.current) {
      formRef.current?.reset()
      setQuote('')
    }
    prevCount.current = comments.length
  }, [comments.length])

  // Offer "comment on the selected text" only when the selection is inside the copy area (#piece-copy).
  useEffect(() => {
    function onSel() {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      const node = sel?.anchorNode
      const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null
      setSelection(text && el?.closest('#piece-copy') ? text : '')
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  return (
    <div style={{ marginTop: 44 }}>
      <Eyebrow tone="grey">Comments</Eyebrow>

      <div style={{ marginTop: 12 }}>
        {comments.length === 0 && <Text tone="graphite">No comments yet.</Text>}
        {comments.map((c) => (
          <div key={c.id} style={{ borderTop: '1px solid var(--dot-hairline)', padding: '14px 0' }}>
            {c.quoted_text && <div style={quoteBox}><Text size="sm" tone="graphite">{c.quoted_text}</Text></div>}
            <Text as="div" size="sm" tone="black"><strong>{c.author_name}</strong> {c.body}</Text>
            <time dateTime={c.created_at} style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--dot-graphite)', fontVariantNumeric: 'tabular-nums' }}>{c.created_at.slice(0, 10)}</time>
          </div>
        ))}
      </div>

      {selection && quote !== selection && (
        <div style={{ marginTop: 16 }}>
          <Button as="button" variant="yellow" size="sm" onClick={() => setQuote(selection)}>Comment on the selected text</Button>
        </div>
      )}

      <form ref={formRef} action={action} style={{ marginTop: 16, borderTop: '1px solid var(--dot-hairline)', paddingTop: 16 }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="contentId" value={contentId} />
        <input type="hidden" name="quotedText" value={quote} />
        {quote && (
          <div style={{ ...quoteBox, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Text size="sm" tone="graphite">{quote}</Text>
            <button type="button" onClick={() => setQuote('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dot-graphite)', fontSize: 12 }}>clear</button>
          </div>
        )}
        <Textarea label="Add a comment" id="comment-body" name="body" rows={3} maxLength={4000}
          placeholder="Leave a note for The Dot" invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? 'comment-error' : undefined} />
        {state?.error && <p id="comment-error" role="alert" style={{ color: '#c0392b', margin: '8px 0 0' }}>{state.error}</p>}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}><SubmitBtn /></div>
      </form>
    </div>
  )
}

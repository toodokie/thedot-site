'use client'
import { useState, useTransition } from 'react'
import { addIdea } from './idea-actions'

// A small "tell me what you think" box for read-only pages (monthly reports, Strategy).
// It reuses the ideas board's add_idea path, so the note lands where Maria already leaves
// feedback, reaches the agency inbox the same way, and needs no new table.
export default function PageFeedback({ slug, topic }: { slug: string; topic: string }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = body.trim()
    if (!text) { setError('Please write a comment first.'); return }
    const data = new FormData()
    data.set('slug', slug)
    data.set('title', topic)
    data.set('body', text)
    setError(null)
    startTransition(async () => {
      const result = await addIdea(data)
      if (result.error) { setError(result.error); return }
      setSent(true)
      setBody('')
    })
  }

  return (
    <section aria-labelledby="page-feedback" style={{ margin: '48px 0 24px', padding: '20px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12 }}>
      <h2 id="page-feedback" style={{ fontSize: '1.15rem', margin: '0 0 6px' }}>Questions or comments?</h2>
      <p style={{ margin: '0 0 12px', opacity: 0.75 }}>Anything unclear, missing or worth changing. It comes straight to me.</p>
      {sent ? (
        <p role="status">Thank you, I have it. I will reply on your ideas board.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="page-feedback-body" style={{ position: 'absolute', left: -9999 }}>Your comment</label>
          <textarea id="page-feedback-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.2)', font: 'inherit' }} />
          {error && <p role="alert" style={{ color: '#a33', margin: '8px 0 0' }}>{error}</p>}
          <button type="submit" disabled={pending} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 0, background: '#1f3b3a', color: '#fff', font: 'inherit', cursor: 'pointer' }}>
            {pending ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}
    </section>
  )
}

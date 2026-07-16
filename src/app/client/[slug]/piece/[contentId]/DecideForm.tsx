'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { decide } from '../../actions'

function Buttons() {
  const { pending } = useFormStatus()
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button type="submit" name="decision" value="change_requested" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>Request a change</button>
      <button type="submit" name="decision" value="approved" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Approve'}</button>
    </div>
  )
}
export default function DecideForm({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decide(fd), {})
  return (
    <form action={action} style={{ borderTop: '1px solid #e8e5db', paddingTop: 20 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contentId" value={contentId} />
      <textarea name="note" rows={3} placeholder="Add a note (required to request a change)…"
        style={{ width: '100%', padding: '12px 14px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc', marginBottom: 12, fontFamily: 'inherit', lineHeight: 1.5 }} />
      {state?.error && <p style={{ color: '#742a2a', marginBottom: 10 }}>{state.error}</p>}
      <Buttons />
    </form>
  )
}

'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { decide } from '../../actions'

const MUTED = '#68665f'

function Buttons() {
  const { pending, data } = useFormStatus()
  const active = pending ? data?.get('decision') : null
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button type="submit" name="decision" value="change_requested" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
        {active === 'change_requested' ? 'Saving…' : 'Request a change'}
      </button>
      <button type="submit" name="decision" value="approved" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
        {active === 'approved' ? 'Saving…' : 'Approve'}
      </button>
    </div>
  )
}
export default function DecideForm({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decide(fd), {})
  return (
    <form action={action} style={{ borderTop: '1px solid #e8e5db', paddingTop: 20 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contentId" value={contentId} />
      <label htmlFor="decision-note" style={{ display: 'block', fontSize: 14, color: MUTED, marginBottom: 6 }}>
        Note <span style={{ fontSize: 13 }}>(required when requesting a change)</span>
      </label>
      <textarea id="decision-note" name="note" rows={3} maxLength={2000}
        aria-describedby={state?.error ? 'decision-error' : undefined} aria-invalid={Boolean(state?.error)}
        placeholder="What would you like changed?"
        style={{ width: '100%', padding: '12px 14px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc', marginBottom: 12, fontFamily: 'inherit', lineHeight: 1.5 }} />
      {state?.error && <p id="decision-error" role="alert" style={{ color: '#742a2a', marginBottom: 10 }}>{state.error}</p>}
      <Buttons />
    </form>
  )
}

'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import { decide } from '../../actions'

function Buttons() {
  const { pending, data } = useFormStatus()
  const active = pending ? data?.get('decision') : null
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button type="submit" name="decision" value="change_requested" variant="ghost" disabled={pending}>
        {active === 'change_requested' ? 'Saving…' : 'Request a change'}
      </Button>
      <Button type="submit" name="decision" value="approved" variant="black" disabled={pending}>
        {active === 'approved' ? 'Saving…' : 'Approve'}
      </Button>
    </div>
  )
}
export default function DecideForm({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decide(fd), {})
  return (
    <form action={action} style={{ borderTop: '1px solid var(--dot-hairline)', paddingTop: 20 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contentId" value={contentId} />
      <Textarea label="Note (required to request a change)" id="decision-note" name="note" rows={3} maxLength={2000}
        invalid={Boolean(state?.error)} aria-describedby={state?.error ? 'decision-error' : undefined}
        placeholder="What would you like changed?" />
      {state?.error && <p id="decision-error" role="alert" style={{ color: '#c0392b', margin: '10px 0 0' }}>{state.error}</p>}
      <div style={{ marginTop: 16 }}>
        <Buttons />
      </div>
    </form>
  )
}

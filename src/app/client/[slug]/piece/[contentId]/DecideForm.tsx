'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import { decide } from '../../actions'

function Submit() {
  const { pending } = useFormStatus()
  return <Button type="submit" name="decision" value="approved" variant="black" disabled={pending}>
    {pending ? 'Approving…' : 'Approve package'}
  </Button>
}

export default function DecideForm({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(async (_previous: { error?: string }, formData: FormData) => decide(formData), {})
  return <form action={action}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentId" value={contentId} />
    <Textarea label="Optional note with your approval" id="decision-note" name="note" rows={3} maxLength={2000}
      invalid={Boolean(state?.error)} aria-describedby={state?.error ? 'decision-error' : undefined} />
    {state?.error && <p id="decision-error" role="alert" style={{ color: '#9f241b' }}>{state.error}</p>}
    <div style={{ marginTop: 16 }}><Submit /></div>
  </form>
}

'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import { decidePlanCycle } from '../plan-actions'

function Buttons() {
  const { pending, data } = useFormStatus()
  const active = pending ? data?.get('decision') : null
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button type="submit" name="decision" value="change_requested" variant="ghost" disabled={pending}>
        {active === 'change_requested' ? 'Saving…' : 'Request changes'}
      </Button>
      <Button type="submit" name="decision" value="approved" variant="black" disabled={pending}>
        {active === 'approved' ? 'Saving…' : 'Approve the plan'}
      </Button>
    </div>
  )
}

export default function PlanDecideForm({ slug, cycleId, revision }: { slug: string; cycleId: string; revision: number }) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decidePlanCycle(fd), {})
  return (
    <form action={action} style={{ borderTop: '1px solid var(--dot-hairline)', paddingTop: 20, marginTop: 20 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <input type="hidden" name="revision" value={revision} />
      <Textarea label="Note (required to request changes)" id="plan-decision-note" name="note" rows={3} maxLength={2000}
        invalid={Boolean(state?.error)} aria-describedby={state?.error ? 'plan-decision-error' : undefined}
        placeholder="What would you like changed about this plan?" />
      {state?.error && (
        <p id="plan-decision-error" role="alert" style={{ color: '#c0392b', margin: '10px 0 0' }}>{state.error}</p>
      )}
      <div style={{ marginTop: 16 }}><Buttons /></div>
    </form>
  )
}

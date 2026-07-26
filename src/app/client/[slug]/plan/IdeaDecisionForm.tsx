'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Textarea, Button } from '@thedot/design-system'
import { decideIdea } from './idea-decision-actions'

function SubmitButton({ decision }: { decision: 'approved' | 'change_requested' }) {
  const { pending } = useFormStatus()
  return <Button type="submit" name="decision" value={decision} variant={decision === 'approved' ? 'yellow' : 'ghost'} size="sm">
    {pending ? 'Saving…' : decision === 'approved' ? 'Approve this idea' : 'Request changes'}
  </Button>
}

export default function IdeaDecisionForm({
  slug, contentItemId, planCycleId, revision,
}: { slug: string; contentItemId: string; planCycleId: string; revision: number }) {
  const [state, action] = useActionState(decideIdea, {})
  return <form action={action} style={{ marginTop: 24 }}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentItemId" value={contentItemId} />
    <input type="hidden" name="planCycleId" value={planCycleId} />
    <input type="hidden" name="revision" value={revision} />
    <Textarea label="Note (required to request changes)" id="idea-decision-note" name="note" rows={3} maxLength={2000}
      invalid={Boolean(state?.error)} aria-describedby={state?.error ? 'idea-decision-error' : undefined}
      placeholder="What would you like changed about this idea?" />
    <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
      <SubmitButton decision="approved" />
      <SubmitButton decision="change_requested" />
    </div>
    {state?.error && <p id="idea-decision-error" role="alert" style={{ color: '#c0392b', margin: '10px 0 0' }}>{state.error}</p>}
  </form>
}

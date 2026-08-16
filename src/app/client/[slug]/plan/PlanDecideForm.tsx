'use client'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import { decidePlanCycle } from '../plan-actions'
import styles from './plan.module.css'

function ApproveButton() {
  const { pending, data } = useFormStatus()
  const active = pending ? data?.get('decision') : null
  return (
    <Button type="submit" name="decision" value="approved" variant="black" disabled={pending}>
      {active === 'approved' ? 'Saving…' : 'Approve this plan'}
    </Button>
  )
}

function ChangeRequestButton() {
  const { pending, data } = useFormStatus()
  const active = pending ? data?.get('decision') : null
  return (
    <Button type="submit" name="decision" value="change_requested" variant="black" disabled={pending}>
      {active === 'change_requested' ? 'Saving…' : 'Send change request'}
    </Button>
  )
}

function HiddenFields({ slug, cycleId, revision }: { slug: string; cycleId: string; revision: number }) {
  return (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <input type="hidden" name="revision" value={revision} />
    </>
  )
}

export default function PlanDecideForm({
  slug, cycleId, revision, mode = 'full',
}: {
  slug: string
  cycleId: string
  revision: number
  mode?: 'approve' | 'full'
}) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decidePlanCycle(fd), {})
  const [showChangeRequest, setShowChangeRequest] = useState(false)
  const noteId = `plan-decision-note-${cycleId}`
  const errorId = `plan-decision-error-${cycleId}-${mode}`

  if (mode === 'approve') {
    return (
      <form action={action} className={styles.topApproveForm}>
        <HiddenFields slug={slug} cycleId={cycleId} revision={revision} />
        <ApproveButton />
        {state?.error && <p id={errorId} role="alert" className={styles.decisionError}>{state.error}</p>}
      </form>
    )
  }

  return (
    <form action={action} className={styles.bottomDecisionForm}>
      <HiddenFields slug={slug} cycleId={cycleId} revision={revision} />
      {!showChangeRequest ? (
        <div className={styles.decisionButtons}>
          <Button type="button" variant="ghost" aria-expanded="false" aria-controls={`${noteId}-panel`}
            onClick={() => setShowChangeRequest(true)}>
            Request changes
          </Button>
          <ApproveButton />
        </div>
      ) : (
        <div id={`${noteId}-panel`} className={styles.changeRequestPanel}>
          <Textarea label="What would you like changed?" id={noteId} name="note" rows={3} maxLength={2000}
            invalid={Boolean(state?.error)} aria-describedby={state?.error ? errorId : undefined}
            placeholder="Add the changes you would like to this week’s direction or available copy." />
          <div className={styles.decisionButtons}>
            <Button type="button" variant="ghost" onClick={() => setShowChangeRequest(false)}>Cancel</Button>
            <ChangeRequestButton />
          </div>
        </div>
      )}
      {state?.error && <p id={errorId} role="alert" className={styles.decisionError}>{state.error}</p>}
    </form>
  )
}

'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@thedot/design-system'
import { requestContentRemoval, type RequestActionState } from '../../request-actions'
import styles from '../../requests/requests.module.css'

function Submit() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="ghost" size="sm" disabled={pending}>
    {pending ? 'Sending…' : 'Request removal'}
  </Button>
}

export default function RemovalRequestForm({ slug, contentId, idempotencyKey }: {
  slug: string; contentId: string; idempotencyKey: string
}) {
  const [state, action] = useActionState(requestContentRemoval, {} as RequestActionState)
  return <form action={action} className={styles.pieceForm}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentId" value={contentId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <label className={styles.label} htmlFor="removal-reason">Why should this piece be removed? (optional)</label>
    <textarea className={styles.textarea} id="removal-reason" name="reason" maxLength={2000} />
    <label className={styles.check}>
      <input type="checkbox" name="confirm" value="yes" required />
      <span>I understand this sends a request; it does not delete the piece immediately.</span>
    </label>
    <div className={styles.actions}><Submit /></div>
    <div className={styles.status} aria-live="polite">
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.success && <p className={styles.success}>{state.success}</p>}
    </div>
  </form>
}

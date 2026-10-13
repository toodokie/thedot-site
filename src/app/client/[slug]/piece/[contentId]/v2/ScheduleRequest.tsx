'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createPortal, useFormStatus } from 'react-dom'
import { Button } from '@thedot/design-system'
import { requestScheduleChange } from '../../../schedule-actions'
import styles from './piece-page.module.css'

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending || !ready}>
    {pending ? 'Sending…' : 'Send request'}
  </Button>
}

// "Request another date" in the header status line (spec 4.1). Same action, same rules as the old
// Schedule panel: who may request is decided by the page (canRequest), the server re-checks.
export default function ScheduleRequest({ slug, contentId, canRequest, hasExternalTargets, active }: {
  slug: string
  contentId: string
  canRequest: boolean
  hasExternalTargets: boolean
  active: { kind: 'reschedule' | 'cancel'; when: string | null } | null
}) {
  if (active) {
    return <>
      <span className={styles.sep} aria-hidden="true"> · </span>
      <span className={styles.seg}>
        {active.kind === 'cancel' ? 'Unschedule requested' : 'New date requested'}{active.when ? ` for ${active.when}` : ''}
      </span>
    </>
  }
  if (!canRequest) return null
  return <ScheduleRequestForm slug={slug} contentId={contentId} hasExternalTargets={hasExternalTargets} />
}

type ScheduleRequestState = { error?: string; done?: boolean }

function ScheduleRequestForm({ slug, contentId, hasExternalTargets }: {
  slug: string; contentId: string; hasExternalTargets: boolean
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [state, action] = useActionState<ScheduleRequestState, FormData>(
    async (_previous, formData) => {
      const result = await requestScheduleChange(formData)
      return result.error ? { error: result.error } : { done: true }
    },
    {},
  )

  useEffect(() => setKey(`schedule-${crypto.randomUUID()}`), [])
  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [open])
  useEffect(() => {
    if (state.done) dialogRef.current?.close()
  }, [state.done])

  return <>
    <span className={styles.sep} aria-hidden="true"> · </span>
    <button ref={triggerRef} type="button" className={styles.statusLink} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      Request another date
    </button>
    {state.done && <span className={styles.srOnly} role="status">Request sent</span>}
    {/* The link sits inside the status line's <p>; the dialog is portalled to <body> so it is never nested in a paragraph. */}
    {open && createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby="schedule-request-title" onClose={() => { setOpen(false); triggerRef.current?.focus() }}>
      <div className={styles.dialogHead}>
        <h2 id="schedule-request-title">Request another date</h2>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="contentId" value={contentId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        {hasExternalTargets
          ? <label className={styles.formRow}>Requested Toronto date and time
            <input name="requestedLocal" type="datetime-local" required /></label>
          : <label className={styles.formRow}>Editorial plan date
            <input name="plannedDate" type="date" required /></label>}
        <p className={styles.meta}>
          {hasExternalTargets
            ? 'Toronto time is applied automatically. Your confirmed times stay in place until I confirm the change.'
            : 'This moves the planned date on your calendar.'}
        </p>
        <Submit ready={Boolean(key)} />
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
      </form>
    </dialog>, document.body)}
  </>
}

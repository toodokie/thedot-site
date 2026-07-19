'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@thedot/design-system'
import { suggestContentEdit, type RequestActionState } from '../../request-actions'
import styles from '../../requests/requests.module.css'

function Submit() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>
    {pending ? 'Sending…' : 'Send suggestion'}
  </Button>
}

export default function SuggestEditForm({ slug, contentId, blockKey, initialKey }: {
  slug: string; contentId: string; blockKey: string; initialKey: string
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(initialKey)
  const [state, action] = useActionState(suggestContentEdit, {} as RequestActionState)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.success) {
      form.current?.reset()
      setKey(crypto.randomUUID())
    }
  }, [state.success])
  if (!open) return <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Suggest edit</Button>
  return <form ref={form} action={action} className={styles.pieceForm}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentId" value={contentId} />
    <input type="hidden" name="blockKey" value={blockKey} />
    <input type="hidden" name="idempotencyKey" value={key} />
    <label className={styles.label} htmlFor={`proposed-${blockKey}`}>Suggested replacement copy</label>
    <textarea className={styles.textarea} id={`proposed-${blockKey}`} name="proposedText" maxLength={8000} required />
    <div className={styles.actions}>
      <Submit />
      <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
    </div>
    <div className={styles.status} aria-live="polite">
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.success && <p className={styles.success}>{state.success}</p>}
    </div>
  </form>
}

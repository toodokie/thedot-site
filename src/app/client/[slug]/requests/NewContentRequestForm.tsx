'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@thedot/design-system'
import { requestNewContent, type RequestActionState } from '../request-actions'
import styles from './requests.module.css'

function Submit() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>
    {pending ? 'Sending…' : 'Request new piece'}
  </Button>
}

export default function NewContentRequestForm({ slug, initialKey }: { slug: string; initialKey: string }) {
  const [state, action] = useActionState(requestNewContent, {} as RequestActionState)
  const [idempotencyKey, setIdempotencyKey] = useState(initialKey)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.success) {
      form.current?.reset()
      setIdempotencyKey(crypto.randomUUID())
    }
  }, [state.success])
  return <form ref={form} action={action}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <div className={styles.field}>
      <label className={styles.label} htmlFor="request-title">Working title</label>
      <input className={styles.input} id="request-title" name="title" maxLength={300} required />
    </div>
    <div className={styles.field}>
      <label className={styles.label} htmlFor="request-brief">What should this piece cover?</label>
      <textarea className={styles.textarea} id="request-brief" name="brief" maxLength={4000} required />
    </div>
    <fieldset className={styles.field}>
      <legend className={styles.label}>Destinations</legend>
      <div className={styles.checks}>
        {['instagram', 'facebook', 'youtube', 'squarespace', 'other'].map((platform) =>
          <label className={styles.check} key={platform}>
            <input type="checkbox" name="platforms" value={platform} />
            <span>{platform === 'squarespace' ? 'Website' : platform[0].toUpperCase() + platform.slice(1)}</span>
          </label>)}
      </div>
    </fieldset>
    <div className={styles.field}>
      <label className={styles.label} htmlFor="request-date">Desired date</label>
      <input className={styles.input} id="request-date" name="desiredDate" type="date" required />
    </div>
    <div className={styles.field}>
      <label className={styles.label} htmlFor="request-notes">Notes (optional)</label>
      <textarea className={styles.textarea} id="request-notes" name="notes" maxLength={2000} />
    </div>
    <Submit />
    <div className={styles.status} aria-live="polite">
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.success && <p className={styles.success}>{state.success}</p>}
    </div>
  </form>
}

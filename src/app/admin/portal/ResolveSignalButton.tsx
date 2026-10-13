'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@thedot/design-system'
import styles from './portal-admin.module.css'

export default function ResolveSignalButton({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function resolve() {
    setPending(true)
    setFailed(false)
    try {
      const response = await fetch('/api/admin/portal/inbox-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, idempotencyKey: crypto.randomUUID() }),
      })
      if (!response.ok) throw new Error(String(response.status))
      router.refresh()
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return <>
    <Button as="button" type="button" variant="ghost" size="sm" disabled={pending}
      aria-label={`Done: ${label}`} onClick={resolve}>
      {pending ? 'Saving' : 'Done'}
    </Button>
    {failed && <span className={styles.meta} role="status">Could not mark it done. Try again.</span>}
  </>
}

'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import { decideProposal, type ProposalActionState } from './proposal-actions'
import styles from './requests.module.css'

function Submit({ decision }: { decision: 'approved' | 'change_requested' }) { const { pending } = useFormStatus(); return <Button as="button" type="submit" name="decision" value={decision} variant={decision === 'approved' ? 'black' : 'ghost'} size="sm" disabled={pending}>{pending ? 'Saving…' : decision === 'approved' ? 'Approve' : 'Request changes'}</Button> }
export default function ProposalDecisionForm({ slug, proposalKey }: { slug: string; proposalKey: string }) {
  const [state, action] = useActionState<ProposalActionState, FormData>(decideProposal, {}); const [key, setKey] = useState(() => crypto.randomUUID()); const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.success) { ref.current?.reset(); setKey(crypto.randomUUID()) } }, [state.success])
  return <form ref={ref} action={action} className={styles.proposalDecision}>
    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="proposalKey" value={proposalKey} /><input type="hidden" name="idempotencyKey" value={key} />
    <Textarea label="A note for The Dot (optional when approving)" id={`proposal-note-${proposalKey}`} name="note" rows={3} maxLength={4000} placeholder="What should we know?" />
    {state.error && <p className={`${styles.status} ${styles.error}`} role="alert">{state.error}</p>}{state.success && <p className={`${styles.status} ${styles.success}`} role="status">{state.success}</p>}
    <div className={styles.actions}><Submit decision="approved" /><Submit decision="change_requested" /></div>
  </form>
}

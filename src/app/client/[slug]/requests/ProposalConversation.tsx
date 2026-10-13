'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Text, Textarea } from '@thedot/design-system'
import type { ClientProposalMessage } from '@/lib/portal/proposals'
import { replyToProposal, type ProposalActionState } from './proposal-actions'
import styles from './requests.module.css'

function Submit() { const { pending } = useFormStatus(); return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>{pending ? 'Sending…' : 'Reply'}</Button> }
export default function ProposalConversation({ slug, proposalKey, messages, canReply }: { slug: string; proposalKey: string; messages: ClientProposalMessage[]; canReply: boolean }) {
  const [state, action] = useActionState<ProposalActionState, FormData>(replyToProposal, {})
  const [key, setKey] = useState(() => crypto.randomUUID()); const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.success) { ref.current?.reset(); setKey(crypto.randomUUID()) } }, [state.success])
  return <section className={styles.conversation} aria-label="Proposal conversation">
    {messages.length > 0 && <div className={styles.messageList}>{messages.map((message) => <div key={message.id} className={message.author_type === 'anastasia' ? styles.agencyMessage : styles.clientMessage}>
      <Text as="div" size="sm" tone="grey"><strong>{message.author_name}</strong></Text><Text as="div" size="sm">{message.body}</Text>
    </div>)}</div>}
    {canReply && <form ref={ref} action={action} className={styles.replyForm}>
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="proposalKey" value={proposalKey} /><input type="hidden" name="idempotencyKey" value={key} />
      <Textarea label="Reply to The Dot" id={`proposal-reply-${proposalKey}`} name="body" rows={3} maxLength={4000} placeholder="Ask a question or add your thoughts" />
      {state.error && <p className={`${styles.status} ${styles.error}`} role="alert">{state.error}</p>}{state.success && <p className={`${styles.status} ${styles.success}`} role="status">{state.success}</p>}<Submit />
    </form>}
  </section>
}

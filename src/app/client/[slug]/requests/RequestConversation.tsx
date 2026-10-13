'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Text, Textarea } from '@thedot/design-system'
import { replyToContentRequest, type RequestActionState } from '../request-actions'
import type { ContentRequestMessage } from '@/lib/portal/requests'
import styles from './requests.module.css'

function SubmitReply() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>
    {pending ? 'Sending…' : 'Reply'}
  </Button>
}

export default function RequestConversation({
  slug, requestId, messages, canReply,
}: {
  slug: string
  requestId: string
  messages: ContentRequestMessage[]
  canReply: boolean
}) {
  const [state, action] = useActionState<RequestActionState, FormData>(replyToContentRequest, {})
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      setIdempotencyKey(crypto.randomUUID())
    }
  }, [state?.success])
  return <section className={styles.conversation} aria-label="Conversation about this request">
    {messages.length > 0 && <div className={styles.messageList}>
      {messages.map((message) => <div key={message.id}
        className={message.author_type === 'anastasia' ? styles.agencyMessage : styles.clientMessage}>
        <Text as="div" size="sm" tone="grey"><strong>{message.author_name}</strong></Text>
        <Text as="div" size="sm">{message.body}</Text>
      </div>)}
    </div>}
    {canReply && <form ref={formRef} action={action} className={styles.replyForm}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Textarea label="Reply to The Dot" id={`request-reply-${requestId}`} name="body" rows={2} maxLength={4000}
        placeholder="Add clarification or a follow-up" />
      {state?.error && <p className={`${styles.status} ${styles.error}`} role="alert">{state.error}</p>}
      {state?.success && <p className={`${styles.status} ${styles.success}`} role="status">{state.success}</p>}
      <SubmitReply />
    </form>}
  </section>
}

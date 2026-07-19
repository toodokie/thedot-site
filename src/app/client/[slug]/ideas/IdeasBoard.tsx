'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Eyebrow, Text, Button, Input, Textarea } from '@thedot/design-system'
import { addIdea, editIdea } from '../idea-actions'
import type { IdeaRow } from '@/lib/portal/ideas'
import styles from './ideas.module.css'

function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

// A "new" idea is one The Dot has not triaged yet, so it carries the one soft yellow accent. The
// other statuses read as quiet chips.
function statusClass(status: string): string {
  if (status === 'new') return `${styles.statusChip} ${styles.statusNew}`
  if (status === 'archived') return `${styles.statusChip} ${styles.statusArchived}`
  return styles.statusChip
}

// One idea card, with an inline Edit toggle. The edit form is bound to editIdea; on success the
// server revalidates and hands this card a fresh `idea` prop, so a changed updated_at is our signal
// the save landed (mirrors how the comment thread watches the server-provided data change). We then
// close the editor.
function IdeaCard({ slug, idea, canSubmit }: { slug: string; idea: IdeaRow; canSubmit: boolean }) {
  const [state, action] = useActionState(async (_p: { error?: string }, fd: FormData) => editIdea(fd), {})
  const [editing, setEditing] = useState(false)
  const prevUpdated = useRef(idea.updated_at)

  useEffect(() => {
    if (idea.updated_at !== prevUpdated.current) setEditing(false)
    prevUpdated.current = idea.updated_at
  }, [idea.updated_at])

  const isClient = idea.author_type === 'client'

  if (editing) {
    return (
      <div className={styles.card}>
        <form action={action}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="ideaId" value={idea.id} />
          <div className={styles.field}>
            <Input label="Title" id={`edit-title-${idea.id}`} name="title" defaultValue={idea.title}
              maxLength={300} invalid={Boolean(state?.error)} />
          </div>
          <div className={styles.field}>
            <Textarea label="Details (optional)" id={`edit-body-${idea.id}`} name="body" rows={4}
              maxLength={4000} defaultValue={idea.body ?? ''} />
          </div>
          {state?.error && <p role="alert" className={styles.error}>{state.error}</p>}
          <div className={styles.formActions}>
            <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <SubmitBtn label="Save changes" pendingLabel="Saving…" />
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <Text as="div" size="md" tone="black"><strong>{idea.title}</strong></Text>
        </div>
        {canSubmit && <div className={styles.cardTools}>
          <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        </div>}
      </div>

      {idea.body && (
        <div className={styles.cardBody}><Text as="div" size="sm" tone="graphite">{idea.body}</Text></div>
      )}

      <div className={styles.cardMeta}>
        <span className={statusClass(idea.status)}>{idea.status}</span>
        <span className={styles.metaName}>{isClient ? idea.author_name : `${idea.author_name} · The Dot`}</span>
        <time className={styles.metaDate} dateTime={idea.created_at}>{idea.created_at.slice(0, 10)}</time>
      </div>
    </div>
  )
}

export default function IdeasBoard({ slug, ideas, canSubmit }: { slug: string; ideas: IdeaRow[]; canSubmit: boolean }) {
  const [state, action] = useActionState(async (_p: { error?: string }, fd: FormData) => addIdea(fd), {})
  const formRef = useRef<HTMLFormElement>(null)
  const prevCount = useRef(ideas.length)

  // A new idea arriving (after revalidate) means our submit succeeded: clear the add form.
  useEffect(() => {
    if (ideas.length > prevCount.current) formRef.current?.reset()
    prevCount.current = ideas.length
  }, [ideas.length])

  return (
    <div>
      {canSubmit ? <section className={styles.panel}>
        <div className={styles.panelHead}><Eyebrow tone="grey">Add an idea</Eyebrow></div>
        <form ref={formRef} action={action}>
          <input type="hidden" name="slug" value={slug} />
          <div className={styles.field}>
            <Input label="Title" id="idea-title" name="title" maxLength={300}
              placeholder="A post idea, a question, a client story…"
              invalid={Boolean(state?.error)}
              aria-describedby={state?.error ? 'idea-error' : undefined} />
          </div>
          <div className={styles.field}>
            <Textarea label="Details (optional)" id="idea-body" name="body" rows={4} maxLength={4000}
              placeholder="Anything that helps us shape it: the angle, who it is for, a link." />
          </div>
          {state?.error && <p id="idea-error" role="alert" className={styles.error}>{state.error}</p>}
          <div className={styles.formActions}>
            <SubmitBtn label="Add idea" pendingLabel="Adding…" />
          </div>
        </form>
      </section> : (
        <section className={styles.panel}>
          <Text size="sm" tone="grey">The idea board is read-only for your account.</Text>
        </section>
      )}

      <div className={styles.cards}>
        {ideas.length === 0 ? (
          <div className={styles.empty}>
            <Text size="md" tone="graphite">No ideas yet. Add the first one.</Text>
          </div>
        ) : (
          ideas.map((idea) => <IdeaCard key={idea.id} slug={slug} idea={idea} canSubmit={canSubmit} />)
        )}
      </div>
    </div>
  )
}

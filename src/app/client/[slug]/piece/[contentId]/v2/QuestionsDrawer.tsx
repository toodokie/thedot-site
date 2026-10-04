'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import { torontoDateLabel, torontoTimeLabel } from '@/lib/portal/piece-page/header-status'
import type { ContentRequestMessage, ContentRequestRow } from '@/lib/portal/requests'
import { addComment } from '../../../comment-actions'
import RequestHistory from '../../../requests/RequestHistory'
import styles from './piece-page.module.css'

export type DrawerTab = 'conversation' | 'sources' | 'past'

function SendButton() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>{pending ? 'Sending…' : 'Send question'}</Button>
}

function when(iso: string): string {
  return `${torontoDateLabel(iso)}, ${torontoTimeLabel(iso)}`
}

function Conversation({ comments }: { comments: CommentRow[] }) {
  if (comments.length === 0) return <p className={styles.meta}>No questions yet. Ask anything about this piece below.</p>
  return <ol className={styles.msgs}>
    {comments.map((c) => {
      const mine = c.author_type === 'client'
      return <li key={c.id} className={`${styles.msg} ${mine ? styles.msgMe : ''}`}>
        <div className={styles.who}>{c.author_name} · <time dateTime={c.created_at}>{when(c.created_at)}</time></div>
        {c.target_kind === 'design' && <p className={styles.quote}>
          Asset feedback{c.target_url && <> · <a href={c.target_url} target="_blank" rel="noreferrer">Open the referenced asset</a></>}
        </p>}
        {c.target_kind !== 'design' && c.quoted_text && <p className={styles.quote}>“{c.quoted_text}”</p>}
        <div className={styles.bub}>{c.body}{mine && c.resolved ? ' (answered)' : ''}</div>
      </li>
    })}
  </ol>
}

type ComposerState = { error?: string; sent?: number }

function Composer({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState<ComposerState, FormData>(
    async (_previous, formData) => {
      const result = await addComment(formData)
      return result?.error ? { error: result.error } : { sent: Date.now() }
    },
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.sent) formRef.current?.reset() }, [state.sent])
  return <form ref={formRef} action={action} className={styles.composer}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentId" value={contentId} />
    <input type="hidden" name="quotedText" value="" />
    <input type="hidden" name="copyBlockKey" value="" />
    <input type="hidden" name="targetKind" value="copy" />
    <input type="hidden" name="designUrl" value="" />
    <Textarea id="question-body" name="body" label="Ask a question or leave a note" rows={3} maxLength={4000}
      invalid={Boolean(state.error)} aria-describedby={state.error ? 'question-error' : undefined} />
    {state.error && <p id="question-error" role="alert" className={styles.error}>{state.error}</p>}
    {/* Decision (plan 4a, approved 2026-10-03): no reply-time promise in the composer. */}
    <div className={styles.composerRow}>
      <SendButton />
    </div>
  </form>
}

function Sources({ ledger, scope, exemption }: {
  ledger: ContentRow['fact_check_ledger']; scope: ContentRow['fact_check_scope']; exemption: string | null
}) {
  if (scope === 'not_applicable') return <p className={styles.meta}>{exemption ?? 'No factual or regulatory claim in this piece.'}</p>
  if (ledger.length === 0) return <p className={styles.meta}>The sources are still being confirmed.</p>
  return <>
    <h3 className={styles.label}>Sources behind the facts</h3>
    <ul className={styles.msgs}>
      {ledger.map((entry) => <li key={entry.claim_key} className={styles.src}>
        <p>{entry.claim}</p>
        {entry.source_url && entry.source_title
          ? <a href={entry.source_url} target="_blank" rel="noreferrer">Checked {entry.checked_at} · {entry.source_title}</a>
          : entry.source_type === 'agency_attested' && entry.source_title
            ? <span className={styles.meta}>{entry.source_title} · checked {entry.checked_at}</span>
            : null}
      </li>)}
    </ul>
  </>
}

// Spec 4.5: side drawer on desktop, full-screen sheet on a phone (CSS). A native modal dialog
// traps focus and closes on Escape.
export default function QuestionsDrawer({
  open, tab, onTabChange, onClose, slug, contentId, comments, canComment, ledger, factCheckScope, factCheckExemption,
  requests, requestMessages, item, canReply,
}: {
  open: boolean
  tab: DrawerTab
  onTabChange: (tab: DrawerTab) => void
  onClose: () => void
  slug: string
  contentId: string
  comments: CommentRow[]
  canComment: boolean
  ledger: ContentRow['fact_check_ledger']
  factCheckScope: ContentRow['fact_check_scope']
  factCheckExemption: string | null
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  item: ContentRow
  canReply: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const tabs: Array<{ key: DrawerTab; label: string }> = [
    { key: 'conversation', label: 'Conversation' },
    { key: 'sources', label: `Sources (${factCheckScope === 'not_applicable' ? 0 : ledger.length})` },
    { key: 'past', label: `Past edits (${requests.length})` },
  ]

  return <dialog ref={ref} className={styles.drawer} aria-labelledby="questions-title" onClose={onClose}>
    <div className={styles.drawerH}>
      <div className={styles.drawerTop}>
        <div>
          <h2 id="questions-title">Questions &amp; sources</h2>
          <p className={styles.notice}>Doesn&apos;t change the piece. To change it, edit the text.</p>
        </div>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => { ref.current?.close(); onClose() }}>×</button>
      </div>
      <div className={styles.drawerTabs} role="tablist" aria-label="Questions and sources">
        {tabs.map((entry) => <button key={entry.key} type="button" role="tab" id={`questions-tab-${entry.key}`}
          aria-selected={tab === entry.key} aria-controls="questions-panel" tabIndex={tab === entry.key ? 0 : -1}
          className={styles.tab} onClick={() => onTabChange(entry.key)}>{entry.label}</button>)}
      </div>
    </div>
    <div className={styles.drawerB} role="tabpanel" id="questions-panel" aria-labelledby={`questions-tab-${tab}`}>
      {tab === 'conversation' && <Conversation comments={comments} />}
      {tab === 'sources' && <Sources ledger={ledger} scope={factCheckScope} exemption={factCheckExemption} />}
      {tab === 'past' && (requests.length > 0
        ? <RequestHistory slug={slug} requests={requests} messages={requestMessages} content={[item]} canReply={canReply} />
        : <p className={styles.meta}>No edits sent yet.</p>)}
    </div>
    {tab === 'conversation' && (canComment
      ? <Composer slug={slug} contentId={contentId} />
      : <div className={styles.composer}><p className={styles.meta}>Questions are read-only for your account.</p></div>)}
  </dialog>
}

'use client'

import { useState, useTransition } from 'react'
import { Button, Heading, Text, Textarea } from '@thedot/design-system'
import { sendReviewBundle } from '../../request-actions'
import { decide } from '../../actions'
import { useReviewDrafts } from './ReviewDraftProvider'
import CopyBlock from './CopyBlock'
import styles from './piece-review.module.css'

export type SentEditSummary = { id: string; label: string; status: string; proposedText: string }

export default function ReviewVerdict({
  slug,
  contentId,
  contentVersion,
  isPublished,
  needsReview,
  packageReady,
  missing,
  sentEdits,
  revisionStarted,
  canDecide,
}: {
  slug: string
  contentId: string
  contentVersion: number
  isPublished: boolean
  needsReview: boolean
  packageReady: boolean
  missing: string[]
  sentEdits: SentEditSummary[]
  revisionStarted: boolean
  canDecide: boolean
}) {
  const { drafts, clearDrafts, ready } = useReviewDrafts()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [bundleKey, setBundleKey] = useState(() => crypto.randomUUID())
  const [pending, startTransition] = useTransition()
  const hasSent = sentEdits.length > 0

  function send() {
    setMessage(null)
    startTransition(async () => {
      const result = await sendReviewBundle({
        slug, contentId, contentVersion, note, idempotencyKey: bundleKey,
        drafts: drafts.map((draft) => ({
          targetKind: draft.kind,
          targetKey: draft.key,
          targetLabel: draft.label,
          proposedText: draft.proposedText,
          urlSnapshot: draft.urlSnapshot,
        })),
      })
      if (result.error) {
        setMessage({ kind: 'error', text: result.error })
        return
      }
      clearDrafts()
      setNote('')
      setBundleKey(crypto.randomUUID())
      setMessage({ kind: 'success', text: result.success ?? 'Your edits were sent to The Dot.' })
    })
  }

  function approve() {
    setMessage(null)
    startTransition(async () => {
      const form = new FormData()
      form.set('slug', slug)
      form.set('contentId', contentId)
      form.set('decision', 'approved')
      form.set('note', note)
      const result = await decide(form)
      if (result?.error) setMessage({ kind: 'error', text: result.error })
    })
  }

  if (isPublished) return null

  return <>
    {ready && drafts.length > 0 && !revisionStarted && <div className={styles.reviewDraftTray} role="status">
      <strong>{drafts.length} unsent {drafts.length === 1 ? 'edit' : 'edits'} saved</strong>
      <Button as="a" href="#review-decision" variant="black" size="sm">Review and send</Button>
    </div>}
    <section id="review-decision" aria-labelledby="review-decision-heading" className={styles.verdict}>
    <div id="review-decision-heading"><Heading level={3}>Finish your review</Heading></div>

    {hasSent && <div className={styles.verdictStatus}>
      <strong>{revisionStarted ? 'Revision in progress' : 'Changes requested'}</strong>
      <p>{revisionStarted
        ? 'The Dot has started applying your edits. We will send back a revised version for review.'
        : 'We will send back a revised version for your review.'}</p>
      <div>
        {sentEdits.map((edit) => <CopyBlock key={edit.id} blockKey={null}
          label={edit.label} body={edit.proposedText} preserveRawCopy />)}
      </div>
    </div>}

    {!packageReady && <div className={styles.verdictStatus}>
      <strong>Package still being assembled</strong>
      <p>The Dot still needs to add:</p>
      <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}

    {!ready && <Text tone="grey">Checking your saved edits…</Text>}

    {ready && drafts.length > 0 && !revisionStarted && <>
      <Text tone="graphite">You changed {drafts.length} {drafts.length === 1 ? 'block' : 'blocks'}, so this version cannot be approved as is.</Text>
      <ul className={styles.draftSummary}>{drafts.map((draft) => <li key={`${draft.kind}:${draft.key}`}>{draft.label}</li>)}</ul>
      <Textarea id="bundle-note" label="Anything else about this version? (optional)" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
      <Button as="button" type="button" variant="black" disabled={pending} onClick={send}>
        {pending ? 'Sending…' : hasSent ? `Send additional edits (${drafts.length})` : `Send my edits (${drafts.length})`}
      </Button>
    </>}

    {ready && drafts.length === 0 && !hasSent && !revisionStarted && packageReady && needsReview && canDecide && <>
      <Textarea id="approval-note" label="Optional note with your approval" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
      <Button as="button" type="button" variant="black" disabled={pending} onClick={approve}>
        {pending ? 'Approving…' : 'Approve package'}
      </Button>
    </>}

    {ready && drafts.length === 0 && !hasSent && !revisionStarted && packageReady && needsReview && !canDecide
      && <Text tone="grey">Only Maria can approve this package. You can still edit any block above.</Text>}

    {message && <p className={message.kind === 'error' ? styles.verdictError : styles.verdictSuccess} role="status">{message.text}</p>}
    </section>
  </>
}

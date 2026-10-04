'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, Heading, Text, Textarea } from '@thedot/design-system'
import { draftIdentity } from '@/lib/portal/review-drafts-core'
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
  const {
    drafts, currentDrafts, carriedDrafts, ready, send, statusText, sendError, keepCarriedDraft, removeDraft,
  } = useReviewDrafts()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const returnFocusRef = useRef<string | null>(null)
  useEffect(() => {
    // Focus the confirm button when the prompt opens, and that edit's Discard again after Cancel (a11y).
    if (confirmingDiscard !== null) {
      document.getElementById(`review-carried-discard-${confirmingDiscard}-confirm`)?.focus()
      return
    }
    if (returnFocusRef.current === null) return
    document.getElementById(`review-carried-discard-${returnFocusRef.current}`)?.focus()
    returnFocusRef.current = null
  }, [confirmingDiscard])
  const hasSent = sentEdits.length > 0
  // contentVersion is still passed by PieceReviewScreen; the provider owns the version since 0093.
  void contentVersion

  function sendEdits() {
    setMessage(null)
    startTransition(async () => {
      const result = await send(note)
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.message })
        return
      }
      setNote('')
      setMessage({ kind: 'success', text: result.message })
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
      {currentDrafts.length > 0 && <ul className={styles.draftSummary}>
        {currentDrafts.map((draft) => <li key={draftIdentity(draft)}>
          {draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label}
        </li>)}
      </ul>}
      {carriedDrafts.length > 0 && <div className={styles.verdictStatus}>
        <strong>Written against the previous version</strong>
        <p>Keep an edit to send it with this version, or discard it.</p>
        <ul>{carriedDrafts.map((draft) => {
          const id = draftIdentity(draft)
          return <li key={id}>
            {draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label} (version {draft.carriedFromVersion}){' '}
            {confirmingDiscard === id
              ? <>
                <span role="alert">Discard this edit? It cannot be recovered.</span>{' '}
                <Button as="button" type="button" variant="black" size="sm" id={`review-carried-discard-${id}-confirm`}
                  onClick={() => { removeDraft(draft); setConfirmingDiscard(null) }}>Yes, discard</Button>{' '}
                <Button as="button" type="button" variant="ghost" size="sm"
                  onClick={() => { returnFocusRef.current = id; setConfirmingDiscard(null) }}>Cancel</Button>
              </>
              : <>
                <Button as="button" type="button" variant="ghost" size="sm" onClick={() => keepCarriedDraft(draft)}>Keep</Button>{' '}
                <Button as="button" type="button" variant="ghost" size="sm" id={`review-carried-discard-${id}`}
                  onClick={() => setConfirmingDiscard(id)}>Discard</Button>
              </>}
          </li>
        })}</ul>
      </div>}
      <Textarea id="bundle-note" label="Anything else about this version? (optional)" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
      {currentDrafts.length > 0 && <Button as="button" type="button" variant="black" disabled={pending} onClick={sendEdits}>
        {pending ? 'Sending…'
          : sendError ? `Retry sending (${currentDrafts.length})`
          : hasSent ? `Send additional edits (${currentDrafts.length})`
          : `Send my edits (${currentDrafts.length})`}
      </Button>}
      {statusText && <Text tone="grey">{statusText}</Text>}
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

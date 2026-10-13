'use client'

import { useState } from 'react'
import { Button } from '@thedot/design-system'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import { draftIdentity } from '@/lib/portal/review-drafts-core'
import { useReviewDrafts, type ReviewDraft } from '../ReviewDraftProvider'
import styles from './piece-page.module.css'

// Spec 6.2 and plan 3 decision 4: a draft written against the previous version is never dropped.
// She keeps it (rebased onto this version), adjusts it, or discards it after a confirm step.
export default function CarriedDraftNotice({ draft, currentText, version, onAdjust }: {
  draft: ReviewDraft
  currentText: string
  version: number
  onAdjust?: () => void
}) {
  const { keepCarriedDraft, removeDraft } = useReviewDrafts()
  const [confirming, setConfirming] = useState(false)
  const where = draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label
  return <section className={styles.carryNotice} id={`carried-${draftIdentity(draft)}`}
    aria-label={`Edit written against version ${draft.carriedFromVersion}`}>
    <strong>Written against the previous version</strong>
    <p>
      You have an edit on {where} written against the previous version. I released version {version} while it
      was unsent. Keep it, adjust it, or discard it.
    </p>
    <div className={styles.carry}>
      <div>
        <span className={styles.label}>New in version {version}</span>
        {draft.kind === 'copy_block'
          ? <MarkdownCopy body={currentText} />
          : <p className={styles.meta}>The updated visual is shown on this page.</p>}
      </div>
      <div>
        <span className={styles.label}>Your unsent edit, on version {draft.carriedFromVersion}</span>
        <MarkdownCopy body={draft.proposedText} />
      </div>
    </div>
    {confirming
      ? <div className={styles.blockActions}>
        <span>Discard this edit? It cannot be recovered.</span>
        <Button as="button" type="button" variant="black" size="sm" onClick={() => removeDraft(draft)}>Yes, discard</Button>
        <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
      </div>
      : <div className={styles.blockActions}>
        <Button as="button" type="button" variant="black" size="sm" onClick={() => keepCarriedDraft(draft)}>Keep my edit</Button>
        {onAdjust && <button type="button" className={styles.link}
          onClick={() => { keepCarriedDraft(draft); onAdjust() }}>Adjust</button>}
        <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>
      </div>}
  </section>
}

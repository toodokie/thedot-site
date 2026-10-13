'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Text, Textarea } from '@thedot/design-system'
import { DRAFT_STATUS_TEXT } from '@/lib/portal/review-drafts-core'
import { useReviewDrafts, type ReviewTarget } from './ReviewDraftProvider'
import styles from './piece-review.module.css'

export default function SuggestEditForm({
  targetKind,
  targetKey,
  targetLabel,
  currentText,
  urlSnapshot,
  selectedText,
  openSignal = 0,
}: {
  targetKind: ReviewTarget['kind']
  targetKey: string
  targetLabel: string
  currentText?: string
  urlSnapshot?: string | null
  selectedText?: string | null
  openSignal?: number
}) {
  const target = useMemo<ReviewTarget>(() => ({
    kind: targetKind,
    key: targetKey,
    label: targetLabel,
    currentText,
    urlSnapshot,
  }), [currentText, targetKey, targetKind, targetLabel, urlSnapshot])
  const {
    readDraft, saveDraft, removeDraft, keepCarriedDraft, flush, storageAvailable, serverSync, statusText, ready,
  } = useReviewDrafts()
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [value, setValue] = useState(currentText ?? '')
  const [quote, setQuote] = useState<string | null>(null)
  const restoredRef = useRef(false)
  const returnFocusRef = useRef(false)
  const discardTriggerId = `review-discard-${targetKind}-${targetKey}`
  const draft = loaded ? readDraft(target) : null

  useEffect(() => {
    if (!ready) return
    const restored = readDraft(target)
    if (restored) {
      setValue((current) => (current === restored.proposedText ? current : restored.proposedText))
      setQuote(restored.quotedText ?? null)
      // Open a restored draft once, on load; never reopen an editor she closed.
      if (!restoredRef.current) setOpen(true)
    }
    restoredRef.current = true
    setLoaded(true)
  }, [readDraft, ready, target])

  useEffect(() => {
    // Focus the confirm button when the prompt opens, and the trigger again after "Keep editing" (a11y).
    if (confirmingDiscard) {
      document.getElementById(`${discardTriggerId}-confirm`)?.focus()
      return
    }
    if (!returnFocusRef.current) return
    returnFocusRef.current = false
    document.getElementById(discardTriggerId)?.focus()
  }, [confirmingDiscard, discardTriggerId])

  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    if (selectedText) setQuote(selectedText)
  }, [openSignal, selectedText])

  function update(next: string) {
    setValue(next)
    saveDraft(target, next, quote)
  }

  function discard() {
    removeDraft(target)
    setValue(currentText ?? '')
    setQuote(null)
    setConfirmingDiscard(false)
    setOpen(false)
  }

  function reviewAndSend() {
    setOpen(false)
    void flush()
    document.getElementById('review-decision')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!open) {
    return <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
      {targetKind === 'copy_block' ? 'Suggest edit' : 'Request a change'}
    </Button>
  }

  const fieldLabel = targetKind === 'copy_block'
    ? `Edit ${targetLabel}`
    : `What should change in ${targetLabel}?`
  const status = serverSync
    ? (draft ? statusText ?? DRAFT_STATUS_TEXT.saved : 'Your edits save automatically and stay unsent until you send them.')
    : (draft
      ? 'Draft saved in this browser. It has not been sent yet.'
      : 'Make a change here. Your draft will stay in this browser until you send all edits.')
  return <div className={styles.editComposer}>
    {quote && <div className={styles.selectionQuote}>
      <span>Selected text</span>
      <blockquote>{quote}</blockquote>
    </div>}
    {draft?.carriedFromVersion != null && <div className={styles.verdictStatus}>
      <Text as="div" size="sm" tone="graphite">
        Written against version {draft.carriedFromVersion}. Compare it with the current text before you send.
      </Text>
      <Button as="button" type="button" variant="ghost" size="sm" onClick={() => keepCarriedDraft(draft)}>
        Keep this edit
      </Button>
    </div>}
    <Textarea id={`review-edit-${targetKind}-${targetKey}`} label={fieldLabel}
      rows={targetKind === 'copy_block' ? 18 : 4} maxLength={50000}
      value={value} onChange={(event) => update(event.target.value)} onBlur={() => { void flush() }}
      placeholder={targetKind === 'copy_block' ? undefined : 'Describe the visual change'} />
    <Text as="div" size="sm" tone="grey">
      {status}
      {!storageAvailable && !serverSync ? ' Browser storage is unavailable, so keep this tab open.' : ''}
    </Text>
    {confirmingDiscard
      ? <div className={styles.editComposerActions}>
        <Text as="span" size="sm" tone="graphite"><span role="alert">Discard this edit? It cannot be recovered.</span></Text>
        <Button as="button" type="button" variant="black" size="sm" id={`${discardTriggerId}-confirm`}
          onClick={discard}>Yes, discard</Button>
        <Button as="button" type="button" variant="ghost" size="sm"
          onClick={() => { returnFocusRef.current = true; setConfirmingDiscard(false) }}>
          Keep editing
        </Button>
      </div>
      : <div className={styles.editComposerActions}>
        {draft && <Button as="button" type="button" variant="ghost" size="sm" id={discardTriggerId}
          onClick={() => setConfirmingDiscard(true)}>Discard edit</Button>}
        <Button as="button" type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); void flush() }}>
          {draft ? 'Save and close' : 'Close editor'}
        </Button>
        {draft && <Button as="button" type="button" variant="black" size="sm" onClick={reviewAndSend}>
          Review and send edits
        </Button>}
      </div>}
  </div>
}

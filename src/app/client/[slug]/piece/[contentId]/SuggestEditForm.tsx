'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Text, Textarea } from '@thedot/design-system'
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
  const { readDraft, saveDraft, removeDraft, storageAvailable } = useReviewDrafts()
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(currentText ?? '')
  const [quote, setQuote] = useState<string | null>(null)
  const draft = loaded ? readDraft(target) : null

  useEffect(() => {
    const restored = readDraft(target)
    if (restored) {
      setValue(restored.proposedText)
      setQuote(restored.quotedText ?? null)
      setOpen(true)
    }
    setLoaded(true)
  }, [readDraft, target])

  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    if (selectedText) setQuote(selectedText)
  }, [openSignal, selectedText])

  function update(next: string) {
    setValue(next)
    saveDraft(target, next, quote)
  }

  function cancel() {
    removeDraft(target)
    setValue(currentText ?? '')
    setQuote(null)
    setOpen(false)
  }

  function reviewAndSend() {
    setOpen(false)
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
  return <div className={styles.editComposer}>
    {quote && <div className={styles.selectionQuote}>
      <span>Selected text</span>
      <blockquote>{quote}</blockquote>
    </div>}
    <Textarea id={`review-edit-${targetKind}-${targetKey}`} label={fieldLabel}
      rows={targetKind === 'copy_block' ? 10 : 4} maxLength={8000}
      value={value} onChange={(event) => update(event.target.value)}
      placeholder={targetKind === 'copy_block' ? undefined : 'Describe the visual change'} />
    <Text as="div" size="sm" tone="grey">
      {draft
        ? 'Draft saved in this browser. It has not been sent yet.'
        : 'Make a change here. Your draft will stay in this browser until you send all edits.'}
      {!storageAvailable ? ' Browser storage is unavailable, so keep this tab open.' : ''}
    </Text>
    <div className={styles.editComposerActions}>
      {draft && <Button as="button" type="button" variant="ghost" size="sm" onClick={cancel}>Discard edit</Button>}
      <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        {draft ? 'Save and close' : 'Close editor'}
      </Button>
      {draft && <Button as="button" type="button" variant="black" size="sm" onClick={reviewAndSend}>
        Review and send edits
      </Button>}
    </div>
  </div>
}

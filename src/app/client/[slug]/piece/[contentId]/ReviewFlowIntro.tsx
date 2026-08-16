'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, Heading, Text } from '@thedot/design-system'
import { acknowledgeReviewFlowAnnouncement } from '../../request-actions'
import styles from './piece-review.module.css'

export default function ReviewFlowIntro({ slug, show }: { slug: string; show: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [visible, setVisible] = useState(show)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!visible || !dialog || dialog.open) return
    dialog.showModal()
  }, [visible])

  function acknowledge() {
    setVisible(false)
    dialogRef.current?.close()
    startTransition(async () => {
      await acknowledgeReviewFlowAnnouncement(slug)
    })
  }

  if (!visible) return null

  return <dialog ref={dialogRef} className={styles.reviewIntro}
    aria-labelledby="review-flow-intro-title"
    onCancel={(event) => { event.preventDefault(); acknowledge() }}>
    <button type="button" className={styles.reviewIntroClose} aria-label="Close" onClick={acknowledge}>×</button>
    <div id="review-flow-intro-title"><Heading level={2}>We simplified the review page</Heading></div>
    <Text>Same review, fewer boxes. What changed:</Text>
    <ul>
      <li>Want a change? Edit it right where it is. Every copy block and every design now has its own &quot;Suggest edit&quot;.</li>
      <li>One button at the bottom. &quot;Send my edits&quot; sends all your changes at once. Nothing to change? You&apos;ll see &quot;Approve package&quot; instead.</li>
      <li>Comments are now for questions and notes only. They don&apos;t change the piece; edits do.</li>
    </ul>
    <Text>Everything else works the way it did.</Text>
    <div className={styles.reviewIntroAction}>
      <Button as="button" type="button" variant="black" onClick={acknowledge}>Got it</Button>
    </div>
  </dialog>
}

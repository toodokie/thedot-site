'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Button, Textarea } from '@thedot/design-system'
import { submitPortalFeedback } from '../../feedback-actions'
import {
  ANNOUNCEMENT_THIS_VISIT_KEY, FEEDBACK_CLOSED_KEY, FEEDBACK_COMMENT_MAX, readVisitFlag,
  shouldShowFeedback, writeVisitFlag,
} from '@/lib/portal/portal-feedback'
import { FEEDBACK_CARD_COPY as COPY } from '@/lib/portal/piece-page-announcement'
import styles from './FeedbackCard.module.css'

// Rendered only on the client seat's own piece page, when the server found no answer from this
// seat and the rollout note is already acknowledged (page.tsx). Visit rules live in
// portal-feedback.ts. Never mounted in the admin preview or the agency view.
export default function FeedbackCard({ slug, contentItemId }: { slug: string; contentItemId: string | null }) {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const commentId = useId()

  useEffect(() => {
    setVisible(shouldShowFeedback({
      submitted: false, announcementPending: false,
      closedThisVisit: readVisitFlag(FEEDBACK_CLOSED_KEY),
      announcementThisVisit: readVisitFlag(ANNOUNCEMENT_THIS_VISIT_KEY),
    }))
  }, [])

  if (!visible) return null

  function close() {
    if (!sent) writeVisitFlag(FEEDBACK_CLOSED_KEY)
    setVisible(false)
  }

  function send() {
    setError(null)
    startTransition(async () => {
      const result = await submitPortalFeedback(slug, { rating, comment, contentItemId })
      if (result.ok) setSent(true)
      else setError(result.error)
    })
  }

  return (
    <aside className={styles.card} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>{COPY.title}</h2>
      {sent ? <p className={styles.thanks} role="status">{COPY.thanks}</p> : <>
        <p className={styles.sub}>{COPY.sub}</p>
        <fieldset className={styles.rating}>
          <legend className={styles.srOnly}>{COPY.ratingLegend}</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={styles.option}>
              <input type="radio" name="portal-feedback-rating" value={value} checked={rating === value}
                aria-label={`${value} of 5`} onChange={() => setRating(value)} />
              <span className={styles.dot} data-filled={value <= rating ? 'true' : 'false'} aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <Textarea id={commentId} label={COPY.commentLabel} className={styles.comment} value={comment}
          maxLength={FEEDBACK_COMMENT_MAX} onChange={(event) => setComment(event.target.value)} />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>}
      <div className={styles.row}>
        <button type="button" className={styles.close} onClick={close}>{COPY.close}</button>
        {!sent && <Button as="button" type="button" variant="black" size="sm"
          disabled={rating === 0 || pending} onClick={send}>{COPY.send}</Button>}
      </div>
    </aside>
  )
}

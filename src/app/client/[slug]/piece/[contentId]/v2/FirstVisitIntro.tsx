'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@thedot/design-system'
import { acknowledgePiecePageIntro } from '../../../request-actions'
import { PIECE_PAGE_ANNOUNCEMENT as COPY } from '@/lib/portal/piece-page-announcement'
import { ANNOUNCEMENT_THIS_VISIT_KEY, writeVisitFlag } from '@/lib/portal/portal-feedback'
import styles from './piece-page.module.css'

// The one dialog on the new page (plan 5 decision 3): plan 4a's first-visit intro (09b) carries the
// rollout note, with one added line about the feedback card. Key piece_page_2026_10, once per seat.
// Client copy: kanset-copywriting and Anastasia approve it before Maria's switch flips. First person
// singular, no em dashes.
export const PIECE_PAGE_INTRO_TITLE = COPY.title
export const PIECE_PAGE_INTRO_LINES = COPY.lines

export default function FirstVisitIntro({ slug, show, persist }: { slug: string; show: boolean; persist: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [visible, setVisible] = useState(show)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (visible && ref.current && !ref.current.open) ref.current.showModal()
  }, [visible])

  function acknowledge() {
    if (!visible) return
    setVisible(false)
    if (ref.current?.open) ref.current.close()
    if (!persist) return
    // The feedback card never shares a visit with this note (decision 4).
    writeVisitFlag(ANNOUNCEMENT_THIS_VISIT_KEY)
    startTransition(async () => {
      try {
        await acknowledgePiecePageIntro(slug)
      } catch {
        // Fail open: she may see the intro once more; it never blocks the page.
      }
    })
  }

  if (!visible) return null
  return <dialog ref={ref} className={styles.intro} aria-labelledby="piece-intro-title"
    onCancel={(event) => { event.preventDefault(); acknowledge() }}>
    <h2 id="piece-intro-title">{PIECE_PAGE_INTRO_TITLE}</h2>
    <ol className={styles.steps}>{PIECE_PAGE_INTRO_LINES.map((line) => <li key={line}>{line}</li>)}</ol>
    <div className={styles.introFoot}>
      <span className={styles.signature}>{COPY.signature}</span>
      <Button as="button" type="button" variant="black" autoFocus onClick={acknowledge}>{COPY.action}</Button>
    </div>
  </dialog>
}

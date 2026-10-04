'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@thedot/design-system'
import { acknowledgePiecePageIntro } from '../../../request-actions'
import styles from './piece-page.module.css'

// Draft wording from the approved mockup (09b). Client copy: kanset-copywriting and Anastasia
// approve it before Maria's switch flips. First person singular, no em dashes.
export const PIECE_PAGE_INTRO_TITLE = 'Your review page, rebuilt'
export const PIECE_PAGE_INTRO_LINES = [
  'Watch the video and page through every frame right here. No Drive needed.',
  'Tap any text to edit it in place, on your phone or computer. I save your edits as you type.',
  'When you are done, send your edits or approve. One button at the bottom does either.',
] as const

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
      <span className={styles.signature}>Anastasia</span>
      <Button as="button" type="button" variant="black" autoFocus onClick={acknowledge}>Got it</Button>
    </div>
  </dialog>
}

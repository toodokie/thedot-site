'use client'

import { useEffect, useRef, useState } from 'react'
import { useSwipe } from './hooks'
import styles from './piece-page.module.css'

// Spec 4.2: carousels, singles and LinkedIn PDFs page through in the media column. Arrows, swipe,
// keyboard, a counter, thumbnails, and tap to enlarge. The page index is lifted so the PDF text tab
// can follow the page she is looking at.
export default function PageViewer({ title, pages, page, onPageChange, onSuggest, onImageError }: {
  title: string
  pages: Array<{ label: string; url: string }>
  page: number
  onPageChange: (page: number) => void
  onSuggest: ((index: number) => void) | null
  onImageError?: () => void
}) {
  const [enlarged, setEnlarged] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pageButtonRef = useRef<HTMLButtonElement>(null)
  const swiped = useRef(false)
  const total = pages.length
  const go = (next: number) => onPageChange(Math.min(total - 1, Math.max(0, next)))
  const swipe = useSwipe(() => { swiped.current = true; go(page + 1) }, () => { swiped.current = true; go(page - 1) })

  useEffect(() => {
    if (enlarged && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [enlarged])

  const current = pages[page]
  if (!current) return null
  return <section aria-label={`${title}: pages`}
    onKeyDown={(event) => {
      if (event.key === 'ArrowRight') go(page + 1)
      if (event.key === 'ArrowLeft') go(page - 1)
    }}>
    <div className={styles.pager}>
      <button ref={pageButtonRef} type="button" className={styles.pagerButton} aria-label={`Enlarge page ${page + 1} of ${total}`} {...swipe}
        onPointerDown={(event) => {
          // A swipe on a touch screen may end without a click; start every gesture clean so the
          // next tap still enlarges.
          swiped.current = false
          swipe.onPointerDown(event)
        }}
        onClick={() => {
          if (swiped.current) { swiped.current = false; return }
          setEnlarged(true)
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.pagerImage} src={current.url} alt={current.label} onError={onImageError} />
      </button>
    </div>
    <div className={styles.pagerNav}>
      <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Previous page"
        disabled={page === 0} onClick={() => go(page - 1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" fill="none" strokeWidth="1.6" /></svg>
      </button>
      <span className={styles.count} aria-live="polite">{page + 1} / {total}</span>
      <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Next page"
        disabled={page === total - 1} onClick={() => go(page + 1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" fill="none" strokeWidth="1.6" /></svg>
      </button>
    </div>
    <div className={styles.underMedia}>
      {onSuggest && <button type="button" className={`${styles.link} ${styles.linkSmall}`} onClick={() => onSuggest(page)}>
        Suggest a change to page {page + 1}
      </button>}
      <span className={styles.meta}>Tap the page to enlarge</span>
    </div>
    <ol className={styles.pthumbs} aria-label="All pages">
      {pages.map((item, index) => <li key={`${index}-${item.url}`}>
        <button type="button" className={styles.pthumb} aria-label={`Page ${index + 1}`}
          aria-current={index === page ? 'true' : undefined} onClick={() => go(index)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" loading="lazy" />
        </button>
      </li>)}
    </ol>
    {enlarged && <dialog ref={dialogRef} className={styles.enlarge} aria-label={`Page ${page + 1} of ${total}`}
      onClose={() => { setEnlarged(false); pageButtonRef.current?.focus() }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.url} alt={current.label} />
      <div className={styles.underMedia}>
        <span className={styles.count}>{page + 1} / {total}</span>
        <button type="button" className={styles.ghostButton} autoFocus onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
    </dialog>}
  </section>
}

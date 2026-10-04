'use client'

import styles from './piece-page.module.css'

// Spec 4.2: the frame strip under a video is a 4-across grid (no horizontal scroll, one-line
// labels). While On-screen text is open it collapses to one line, because that tab shows every
// frame beside its text.
export default function FrameGrid({ title, frames, collapsed, onSuggest, onImageError }: {
  title: string
  frames: Array<{ label: string; url: string }>
  collapsed: boolean
  onSuggest: ((index: number) => void) | null
  onImageError?: () => void
}) {
  if (frames.length === 0) return null
  if (collapsed) {
    return <p className={styles.fcollapsed}>
      <span><strong>{frames.length} frames</strong>, each shown beside its text in On-screen text</span>
    </p>
  }
  return <section aria-label={`${title}: frames`}>
    <div className={styles.stripHead}>
      <span className={styles.label}>Frames</span>
      <span className={styles.meta}>{frames.length} frames</span>
    </div>
    <ol className={styles.fgrid}>
      {frames.map((frame, index) => <li key={`${index}-${frame.url}`} className={styles.fg}>
        {/* Signed, expiring storage links: next/image would cache and re-host them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* The visible number and time below name the frame, so the image itself is decorative. */}
        <img className={styles.thumb} src={frame.url} alt="" loading="lazy" onError={onImageError} />
        <div className={styles.fgN}>{index + 1} · {frame.label}</div>
        {onSuggest && <button type="button" className={styles.link} aria-label={`Suggest a change to frame ${index + 1}`}
          onClick={() => onSuggest(index)}>Suggest a change</button>}
      </li>)}
    </ol>
  </section>
}

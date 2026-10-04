'use client'

import type { CoverTile } from './derive'
import { SentVisualMarker } from './SentEdits'
import styles from './piece-page.module.css'

// Task 10b: the cover as its own first tile, ahead of the frames. Not a frame: frames keep their numbers.
function CoverTileItem({ cover, onSuggest }: { cover: CoverTile; onSuggest: (() => void) | null }) {
  const name = cover.label === 'Cover' ? 'the cover' : 'the YouTube thumbnail'
  return <li className={`${styles.fg} ${styles.fgCover}`} data-cover-tile="">
    {cover.imageUrl
      // The visible label below names the tile, so the image itself is decorative.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={`${styles.thumb} ${cover.wide ? styles.thumbWide : ''}`} src={cover.imageUrl} alt="" loading="lazy" />
      : <span className={`${styles.thumb} ${styles.thumbEmpty} ${cover.wide ? styles.thumbWide : ''}`} aria-hidden="true" />}
    <div className={styles.fgN}>{cover.label}</div>
    {!cover.imageUrl && cover.driveUrl && <a className={styles.link} href={cover.driveUrl} target="_blank" rel="noreferrer"
      aria-label={`Open ${name} in Drive`}>Open in Drive</a>}
    {onSuggest && <button type="button" className={styles.link} aria-label={`Suggest a change to ${name}`}
      onClick={onSuggest}>Suggest a change</button>}
    <SentVisualMarker spot="cover" />
  </li>
}

// Spec 4.2: the frame strip under a video is a 4-across grid (no horizontal scroll, one-line
// labels). While On-screen text is open it collapses to one line, because that tab shows every
// frame beside its text.
export default function FrameGrid({ title, frames, collapsed, onSuggest, onImageError, cover = null, onSuggestCover = null }: {
  title: string
  frames: Array<{ label: string; url: string }>
  collapsed: boolean
  onSuggest: ((index: number) => void) | null
  onImageError?: () => void
  cover?: CoverTile | null
  onSuggestCover?: (() => void) | null
}) {
  if (frames.length === 0 && !cover) return null
  const coverItem = cover && <CoverTileItem cover={cover} onSuggest={onSuggestCover} />
  if (collapsed || frames.length === 0) {
    return <>
      {coverItem && <section aria-label={`${title}: ${cover?.label}`}>
        <ol className={`${styles.fgrid} ${styles.fgridCover}`}>{coverItem}</ol>
      </section>}
      {frames.length > 0 && <p className={styles.fcollapsed}>
        <span><strong>{frames.length} frames</strong>, each shown beside its text in On-screen text</span>
      </p>}
    </>
  }
  return <section aria-label={`${title}: frames`}>
    <div className={styles.stripHead}>
      <span className={styles.label}>Frames</span>
      <span className={styles.meta}>{frames.length} frames</span>
    </div>
    <ol className={styles.fgrid}>
      {coverItem}
      {frames.map((frame, index) => <li key={`${index}-${frame.url}`} className={styles.fg}>
        {/* Signed, expiring storage links: next/image would cache and re-host them. */}
        {/* The visible number and time below name the frame, so the image itself is decorative. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.thumb} src={frame.url} alt="" loading="lazy" onError={onImageError} />
        <div className={styles.fgN}>{index + 1} · {frame.label}</div>
        {onSuggest && <button type="button" className={styles.link} aria-label={`Suggest a change to frame ${index + 1}`}
          onClick={() => onSuggest(index)}>Suggest a change</button>}
        <SentVisualMarker spot={`frame:${index + 1}`} />
      </li>)}
    </ol>
  </section>
}

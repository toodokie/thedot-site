'use client'

import { SentVisualMarker } from '../SentEdits'
import styles from '../piece-page.module.css'

export type CoverInfo = { label: string; url: string; previewUrl: string | null; width: number; height: number }

export default function CoverImagePanel({ cover, onSuggest }: { cover: CoverInfo | null; onSuggest: (() => void) | null }) {
  if (!cover) return <p className={styles.meta}>The cover image is not ready yet.</p>
  return <div className={styles.block}>
    {cover.previewUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={styles.cover} src={cover.previewUrl} alt={cover.label} />
      : <div className={styles.coverPlaceholder}>{cover.label}</div>}
    <p className={styles.meta}>{cover.label} · {cover.width} × {cover.height}</p>
    <div className={styles.blockActions}>
      <a className={styles.link} href={cover.url} target="_blank" rel="noopener noreferrer">Open the cover in Drive</a>
      {onSuggest && <button type="button" className={styles.link} onClick={onSuggest}>Suggest a change</button>}
    </div>
    <SentVisualMarker spot="whole" />
  </div>
}

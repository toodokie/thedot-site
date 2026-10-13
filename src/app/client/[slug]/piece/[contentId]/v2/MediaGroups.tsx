'use client'

import { useState, type ReactNode } from 'react'
import { useSignedPreview } from '@/components/portal/useSignedPreview'
import { pickReviewOption } from '../../../option-actions'
import type { MediaGroup, MediaItem } from './derive'
import { mediaVars } from './media-size'
import ReviewVideoPlayer, { type PlaybackReport } from './ReviewVideoPlayer'
import { SentVisualMarker } from './SentEdits'
import styles from './piece-page.module.css'

// persist false: the read-only "View as Maria" preview, where choosing shows the flow but saves nothing.
export type OptionPicker = { slug: string; contentId: string; version: number; persist: boolean }

// Media by destination (2026-10-06): an episode package shows every review asset under the place
// it posts (YouTube, Instagram and Facebook, Instagram, Facebook, LinkedIn, Website, Other files),
// each at its own size and labelled by its asset label, each with its own "Suggest a change".
// Covers that are alternatives (0098 option groups) carry "Choose this" for the deciding seat and
// "Chosen" once picked. Picking is not an edit and never touches her review.
export default function MediaGroups({ title, groups, visualKey, chosen: initialChosen, picker, onSuggest, report, frames }: {
  title: string
  groups: MediaGroup[]
  // The asset her whole-video and frame notes target: its sent notes sit under the 'whole' spot.
  visualKey: string | null
  chosen: Record<string, string>
  picker: OptionPicker | null
  onSuggest: ((item: MediaItem) => void) | null
  report: PlaybackReport | null
  // The frame strip of the visual target, shown under its group.
  frames: ReactNode
}) {
  const [chosen, setChosen] = useState(initialChosen)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(item: MediaItem) {
    if (!picker || !item.option) return
    setPending(item.key)
    setError(null)
    const result = picker.persist
      ? await pickReviewOption({ slug: picker.slug, contentId: picker.contentId, contentVersion: picker.version, assetKey: item.key })
      : { ok: true as const }
    setPending(null)
    if (result.ok) setChosen((current) => ({ ...current, [item.option!.group]: item.key }))
    else setError(item.key)
  }

  return <div className={styles.mgroups}>
    {groups.map((group) => <section key={group.key} className={styles.mgroup} aria-labelledby={`media-group-${group.key}`}>
      <h2 id={`media-group-${group.key}`} className={`${styles.label} ${styles.mgroupHead}`}>{group.label}</h2>
      <ul className={styles.mitems}>
        {group.items.map((item) => <Item key={item.key} title={title} item={item} visualKey={visualKey}
          chosen={item.option ? chosen[item.option.group] === item.key : false}
          canChoose={Boolean(picker && item.option) && pending === null}
          failed={error === item.key && pending === null}
          onChoose={() => void choose(item)} onSuggest={onSuggest} report={report} />)}
      </ul>
      {group.items.some((item) => item.key === visualKey) && frames}
    </section>)}
  </div>
}

function Item({ title, item, visualKey, chosen, canChoose, failed, onChoose, onSuggest, report }: {
  title: string
  item: MediaItem
  visualKey: string | null
  chosen: boolean
  canChoose: boolean
  failed: boolean
  onChoose: () => void
  onSuggest: ((item: MediaItem) => void) | null
  report: PlaybackReport | null
}) {
  const portrait = item.height >= item.width
  return <li className={`${styles.mitem} ${portrait ? styles.mitemV : styles.mitemH} ${item.preview ? styles.mitemVideo : ''} ${chosen ? styles.mitemChosen : ''}`}
    style={mediaVars(item.width, item.height)} role="region" aria-label={item.label} data-media-item={item.key}>
    {item.preview
      ? <ItemVideo title={title} item={item} report={report} />
      : item.imageUrl
        // The visible label below names the item, so the image itself is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className={styles.mbox} src={item.imageUrl} alt="" loading="lazy" />
        : <span className={`${styles.mbox} ${styles.mboxEmpty}`} aria-hidden="true" />}
    <div className={styles.mlabel}>{item.label}</div>
    {chosen && <div className={styles.chosen}>Chosen</div>}
    {item.note && <p className={styles.mnote}>{item.note}</p>}
    <div className={styles.mactions}>
      {canChoose && !chosen && <button type="button" className={styles.ghostButton} aria-label={`Choose ${item.label}`}
        onClick={onChoose}>Choose this</button>}
      {!item.preview && item.driveUrl && <a className={styles.link} href={item.driveUrl} target="_blank" rel="noreferrer"
        aria-label={`Open ${item.label}`}>Open in Drive</a>}
      {onSuggest && <button type="button" className={styles.link} aria-label={`Suggest a change to ${item.label}`}
        onClick={() => onSuggest(item)}>Suggest a change</button>}
    </div>
    {failed && <p className={styles.error} role="alert">Your choice didn&apos;t save. Try again.</p>}
    <SentVisualMarker spot={item.key === visualKey ? 'whole' : `asset:${item.key}`} />
  </li>
}

// Each video keeps its own signed links and its own one silent refresh.
function ItemVideo({ title, item, report }: { title: string; item: MediaItem; report: PlaybackReport | null }) {
  const { preview, refresh, forceRefresh } = useSignedPreview(item.preview, item.refreshUrl)
  if (!preview) return null
  return <ReviewVideoPlayer preview={preview} className={`${styles.player} ${styles.mbox}`} style={mediaVars(item.width, item.height)}
    label={`${title}: ${item.label}`} refresh={refresh} forceRefresh={forceRefresh} report={report} />
}

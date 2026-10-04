'use client'

import { Button } from '@thedot/design-system'
import type { PieceLayout } from '@/lib/portal/piece-page/copy-tabs'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from '@/components/portal/useSignedPreview'
import FrameGrid from './FrameGrid'
import PageViewer from './PageViewer'
import styles from './piece-page.module.css'

// The format-adaptive media area (spec 4.2). Previews are portal-hosted signed links (plan 2);
// without a preview the Drive buttons stay, exactly as today (spec 7 fallback).
export default function MediaArea(props: {
  layout: PieceLayout
  title: string
  preview: SignedReviewPreview | null
  refreshUrl: string | null
  fallbackMedia: Array<{ label: string; url: string }>
  episodeDriveUrl: string | null
  mediaPending: boolean
  framesCollapsed: boolean
  page: number
  onPageChange: (page: number) => void
  onSuggestWhole: (() => void) | null
  onSuggestAt: ((index: number) => void) | null
}) {
  const { preview, refresh } = useSignedPreview(props.preview, props.refreshUrl)

  if (props.mediaPending) {
    return <div className={styles.phMedia}>
      <p>{props.layout === 'pages' ? 'Pages coming. You can review the text now.' : 'Video coming. You can review the text now.'}</p>
    </div>
  }

  if (preview && preview.mediaKind === 'pages') {
    return <PageViewer title={props.title} pages={preview.frames} page={props.page} onPageChange={props.onPageChange}
      onSuggest={props.onSuggestAt} onImageError={refresh} />
  }

  if (preview && preview.videoUrl) {
    const horizontal = preview.width > preview.height
    return <div>
      <video className={`${styles.player} ${horizontal ? styles.playerH : styles.playerV}`} src={preview.videoUrl}
        poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata"
        aria-label={`${props.title}: ${horizontal ? 'trailer' : 'video'}`} onError={refresh} />
      {horizontal && <p className={styles.mediaNote}>This is the trailer. The full episode stays on Drive.</p>}
      <div className={styles.underMedia}>
        {props.onSuggestWhole && <button type="button" className={`${styles.link} ${styles.linkSmall}`} onClick={props.onSuggestWhole}>
          {horizontal ? 'Suggest a change to the video' : 'Suggest a change to the whole video'}
        </button>}
        {horizontal && props.episodeDriveUrl && <a className={`${styles.link} ${styles.linkSmall}`} href={props.episodeDriveUrl}
          target="_blank" rel="noreferrer">Open the full episode in Drive</a>}
      </div>
      <FrameGrid title={props.title} frames={preview.frames} collapsed={props.framesCollapsed}
        onSuggest={props.onSuggestAt} onImageError={refresh} />
    </div>
  }

  if (props.fallbackMedia.length > 0) {
    return <div className={styles.fallback}>
      <p className={styles.mediaNote}>{props.layout === 'pages' ? 'Open the pages to review them.' : 'Open the video to watch it.'}</p>
      {props.fallbackMedia.map((media) => <Button key={media.url} as="a" href={media.url} target="_blank" rel="noreferrer"
        variant="ghost" size="sm">Open {media.label}</Button>)}
      {props.onSuggestWhole && <button type="button" className={styles.link} onClick={props.onSuggestWhole}>Suggest a change</button>}
    </div>
  }

  return null
}

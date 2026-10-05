'use client'

import { useState } from 'react'
import { Button } from '@thedot/design-system'
import type { PieceLayout } from '@/lib/portal/piece-page/copy-tabs'
import type { CoverTile } from './derive'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from '@/components/portal/useSignedPreview'
import { reportReviewPlaybackFailure } from '../../../playback-actions'
import ReviewVideoPlayer, { type PlaybackReport } from './ReviewVideoPlayer'
import FrameGrid from './FrameGrid'
import PageViewer from './PageViewer'
import { SentVisualMarker } from './SentEdits'
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
  // True only for a podcast episode shown through its teaser or trailer (derive.ts).
  episodeTrailer?: boolean
  mediaPending: boolean
  framesCollapsed: boolean
  page: number
  onPageChange: (page: number) => void
  onSuggestWhole: (() => void) | null
  onSuggestAt: ((index: number) => void) | null
  // Task 10b: the cover's own tile, ahead of the frames, and its own suggestion.
  cover?: CoverTile | null
  onSuggestCover?: (() => void) | null
  // Client mode only (amended 2026-10-03): report a failed play to the agency. Null in the admin preview.
  playbackReport?: { slug: string; contentId: string } | null
}) {
  const { preview, refresh, forceRefresh } = useSignedPreview(props.preview, props.refreshUrl)
  const target = props.playbackReport ?? null
  const report: PlaybackReport | null = target
    ? (input) => reportReviewPlaybackFailure({ slug: target.slug, contentId: target.contentId, ...input })
    : null
  // Frames and pages get the one silent link refresh too. If an image still fails after it, show
  // Retry instead of refreshing again: a file that never loads must not refresh forever.
  const [imagesFailed, setImagesFailed] = useState(false)
  const [imageAttempt, setImageAttempt] = useState(0)
  const onImageError = () => {
    void refresh().then((renewed) => { if (!renewed) setImagesFailed(true) })
  }
  const retryImages = async () => {
    await forceRefresh()
    setImagesFailed(false)
    setImageAttempt((value) => value + 1)
  }
  const imagesNotice = imagesFailed && <div className={styles.notice} role="alert">
    <p>Some images didn&apos;t load.</p>
    <button type="button" className={styles.ghostButton} onClick={() => void retryImages()}>Retry</button>
  </div>

  if (props.mediaPending) {
    return <div className={styles.phMedia}>
      <p>{props.layout === 'pages' ? 'Pages coming. You can review the text now.' : 'Video coming. You can review the text now.'}</p>
      <SentVisualMarker spot="whole" />
    </div>
  }

  if (preview && preview.mediaKind === 'pages') {
    return <div>
      {imagesNotice}
      <PageViewer key={imageAttempt} title={props.title} pages={preview.frames} page={props.page} onPageChange={props.onPageChange}
        onSuggest={props.onSuggestAt} onImageError={onImageError} />
      <SentVisualMarker spot="whole" />
    </div>
  }

  if (preview && preview.videoUrl) {
    const horizontal = preview.width > preview.height
    const trailer = horizontal && props.episodeTrailer === true
    return <div>
      <ReviewVideoPlayer preview={preview} className={`${styles.player} ${horizontal ? styles.playerH : styles.playerV}`}
        label={`${props.title}: ${trailer ? 'trailer' : 'video'}`} refresh={refresh} forceRefresh={forceRefresh}
        report={report} />
      {trailer && <p className={styles.mediaNote}>This is the trailer. The full episode stays on Drive.</p>}
      <div className={styles.underMedia}>
        {props.onSuggestWhole && <button type="button" className={`${styles.link} ${styles.linkSmall}`} onClick={props.onSuggestWhole}>
          {horizontal ? 'Suggest a change to the video' : 'Suggest a change to the whole video'}
        </button>}
        {horizontal && props.episodeDriveUrl && <a className={`${styles.link} ${styles.linkSmall}`} href={props.episodeDriveUrl}
          target="_blank" rel="noreferrer">Open the full episode in Drive</a>}
      </div>
      <SentVisualMarker spot="whole" />
      {imagesNotice}
      <FrameGrid key={imageAttempt} title={props.title} frames={preview.frames} collapsed={props.framesCollapsed}
        onSuggest={props.onSuggestAt} onImageError={onImageError} cover={props.cover ?? null} onSuggestCover={props.onSuggestCover ?? null} />
    </div>
  }

  if (props.fallbackMedia.length > 0) {
    return <div className={styles.fallback}>
      <p className={styles.mediaNote}>{props.layout === 'pages' ? 'Open the pages to review them.' : 'Open the video to watch it.'}</p>
      {props.fallbackMedia.map((media) => <Button key={media.url} as="a" href={media.url} target="_blank" rel="noreferrer"
        variant="ghost" size="sm">Open {media.label}</Button>)}
      {props.onSuggestWhole && <button type="button" className={styles.link} onClick={props.onSuggestWhole}>Suggest a change</button>}
      <SentVisualMarker spot="whole" />
      <FrameGrid title={props.title} frames={[]} collapsed={false} onSuggest={null}
        cover={props.cover ?? null} onSuggestCover={props.onSuggestCover ?? null} />
    </div>
  }

  return null
}

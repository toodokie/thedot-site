'use client'

import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from './useSignedPreview'
import styles from './ReviewPreviewMedia.module.css'

type Props = {
  preview: SignedReviewPreview
  title: string
  // The client or admin refresh route for this preview. Signed links last ten minutes; when one
  // fails, the component asks once per set of links and swaps the new ones in.
  refreshUrl?: string
}

export default function ReviewPreviewMedia({ preview: initial, title, refreshUrl }: Props) {
  const signed = useSignedPreview(initial, refreshUrl)
  const preview = signed.preview ?? initial
  const refresh = signed.refresh

  const ratio = `${preview.width} / ${preview.height}`
  const isVideo = preview.mediaKind === 'video' && preview.videoUrl !== null
  const listName = isVideo ? `${title}: frames` : `${title}: pages`

  return (
    <figure className={styles.media}>
      {isVideo ? (
        <video
          className={styles.video}
          style={{ aspectRatio: ratio }}
          src={preview.videoUrl ?? undefined}
          poster={preview.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={`${title}: preview video`}
          onError={refresh}
        />
      ) : null}
      {preview.frames.length > 0 ? (
        <ol className={isVideo ? styles.frames : styles.pages} aria-label={listName}>
          {preview.frames.map((frame, index) => (
            <li key={`${index}-${frame.label}`} className={styles.frame}>
              {/* Signed, expiring storage links: next/image would cache and re-host them. */}
              {/* Decorative alt: the visible label beside the image already names the frame. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.frameImage}
                style={{ aspectRatio: ratio }}
                src={frame.url}
                alt=""
                loading="lazy"
                onError={refresh}
              />
              <span className={styles.frameLabel}>{frame.label}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </figure>
  )
}

'use client'

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { mediaErrorCode, STALL_TIMEOUT_MS, type PlaybackErrorCode } from '@/lib/portal/piece-page/playback-failure'
import styles from './piece-page.module.css'

export type PlaybackReport = (input: {
  contentVersion: number
  previewKey: string
  errorCode: PlaybackErrorCode
}) => Promise<{ ok: boolean }>

// The inline review video (spec 4.2) with failure reporting (amended 2026-10-03). A load error first
// gets one silent link refresh, because signed links expire after ten minutes. If the video still
// fails, or waits 15 seconds after she pressed play, the player reports it once per page load and
// shows a plain message with Retry, which always fetches fresh links. It never says "notified"
// unless the report was accepted.
export default function ReviewVideoPlayer({ preview, label, className, style, refresh, forceRefresh, report }: {
  preview: SignedReviewPreview
  label: string
  className: string
  // Item 1: the media's own shape (media-size.ts), so a 4:5 video is not letterboxed in 9:16.
  style?: CSSProperties
  refresh: () => Promise<boolean>
  forceRefresh: () => Promise<boolean>
  report: PlaybackReport | null
}) {
  const [failure, setFailure] = useState<{ notified: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // One report per page load. The promise is kept so a stall and an error landing together share
  // it, and both wait for its answer before choosing the message.
  const reportOnce = useRef<Promise<boolean> | null>(null)
  const playRequested = useRef(false)
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearStall() {
    if (stallTimer.current) clearTimeout(stallTimer.current)
    stallTimer.current = null
  }
  useEffect(() => clearStall, [])
  const videoRef = useRef<HTMLVideoElement>(null)
  // After Retry the button is gone; put focus on the fresh video rather than the page body.
  useEffect(() => {
    if (attempt > 0) videoRef.current?.focus()
  }, [attempt])

  async function fail(code: PlaybackErrorCode) {
    clearStall()
    let notified = false
    if (report) {
      reportOnce.current ??= report({
        contentVersion: preview.contentVersion, previewKey: preview.previewKey, errorCode: code,
      }).then((result) => result.ok, () => false)
      notified = await reportOnce.current
    }
    setFailure({ notified })
  }

  async function onError(event: SyntheticEvent<HTMLVideoElement>) {
    // Read the code before awaiting: React clears currentTarget once the handler returns.
    const code = mediaErrorCode(event.currentTarget.error?.code)
    const expired = Date.now() >= Date.parse(preview.expiresAt)
    // The hook decides whether these links may be refreshed silently (once per set of links, and
    // never again for valid links that came from a refresh), so this cannot loop.
    if (await refresh()) return
    await fail(expired ? 'link_expired' : code)
  }

  function armStall() {
    if (!playRequested.current || stallTimer.current) return
    stallTimer.current = setTimeout(() => {
      stallTimer.current = null
      if (!playRequested.current) return // Paused since: a wait she chose is not a failure.
      void fail('stalled')
    }, STALL_TIMEOUT_MS)
  }

  async function retry() {
    await forceRefresh()
    playRequested.current = false
    setFailure(null)
    setAttempt((value) => value + 1)
  }

  if (failure) {
    return <div className={styles.phMedia} role="alert">
      <p>{failure.notified ? "This video didn't load. I've been notified." : "This video didn't load."}</p>
      <button type="button" className={styles.ghostButton} onClick={() => void retry()}>Retry</button>
    </div>
  }
  return <video ref={videoRef} key={attempt} className={className} style={style} src={preview.videoUrl ?? undefined}
    poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata" aria-label={label} tabIndex={0}
    onError={(event) => void onError(event)} onPlay={() => { playRequested.current = true }}
    onPause={() => { playRequested.current = false; clearStall() }}
    onWaiting={armStall} onStalled={armStall} onPlaying={clearStall} onTimeUpdate={clearStall} />
}

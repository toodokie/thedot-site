'use client'

import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
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
export default function ReviewVideoPlayer({ preview, label, className, refresh, forceRefresh, report }: {
  preview: SignedReviewPreview
  label: string
  className: string
  refresh: () => Promise<boolean>
  forceRefresh: () => Promise<boolean>
  report: PlaybackReport | null
}) {
  const [failure, setFailure] = useState<{ notified: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const silentRefreshUsed = useRef(false)
  const reportedOk = useRef<boolean | null>(null)
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
    if (report && reportedOk.current === null) {
      try {
        reportedOk.current = (await report({
          contentVersion: preview.contentVersion, previewKey: preview.previewKey, errorCode: code,
        })).ok
      } catch {
        reportedOk.current = false
      }
    }
    setFailure({ notified: reportedOk.current === true })
  }

  async function onError(event: SyntheticEvent<HTMLVideoElement>) {
    // Read the code before awaiting: React clears currentTarget once the handler returns.
    const code = mediaErrorCode(event.currentTarget.error?.code)
    const expired = Date.now() >= Date.parse(preview.expiresAt)
    if (!silentRefreshUsed.current) {
      silentRefreshUsed.current = true
      if (await refresh()) return
    }
    await fail(expired ? 'link_expired' : code)
  }

  function armStall() {
    if (!playRequested.current || stallTimer.current) return
    stallTimer.current = setTimeout(() => {
      stallTimer.current = null
      void fail('stalled')
    }, STALL_TIMEOUT_MS)
  }

  async function retry() {
    await forceRefresh()
    silentRefreshUsed.current = false
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
  return <video ref={videoRef} key={attempt} className={className} src={preview.videoUrl ?? undefined}
    poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata" aria-label={label} tabIndex={0}
    onError={(event) => void onError(event)} onPlay={() => { playRequested.current = true }}
    onWaiting={armStall} onStalled={armStall} onPlaying={clearStall} onTimeUpdate={clearStall} />
}

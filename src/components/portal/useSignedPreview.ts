'use client'

import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

// Signed preview links last ten minutes. When a media element fails to load, ask the refresh
// route for fresh links and swap them in. A failed refresh keeps the current links; the Drive
// link beside the media stays the fallback.
//
// refresh: automatic and silent, at most once per set of links (per expiresAt), so a broken
// thumbnail never uses up the refresh a later expiry needs. Media that fail at the same moment
// share the one request. A set that came from a refresh and has not expired yet gets no silent
// refresh: if it fails, the file is the problem, and refreshing again would loop forever on a file
// that never loads. The caller shows Retry instead.
// forceRefresh: the Retry button. Every call asks again (once per click). Both say whether new
// links arrived.
export function useSignedPreview(initial: SignedReviewPreview | null, refreshUrl?: string | null) {
  const [preview, setPreview] = useState(initial)
  const inFlight = useRef<{ forSet: string; request: Promise<boolean> } | null>(null)
  const refreshedFor = useRef<string | null>(null)
  // The page loaded with these links; every later set came from a refresh.
  const fromServerRender = useRef(true)

  const fetchFresh = useCallback(async (): Promise<boolean> => {
    if (!refreshUrl) return false
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return false
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (!body.preview) return false
      fromServerRender.current = false
      setPreview(body.preview)
      return true
    } catch {
      return false // Keep the current links.
    }
  }, [refreshUrl])

  const refresh = useCallback((): Promise<boolean> => {
    if (!refreshUrl || !preview) return Promise.resolve(false)
    const set = preview.expiresAt
    if (inFlight.current?.forSet === set) return inFlight.current.request
    if (refreshedFor.current === set) return Promise.resolve(false)
    const expired = Date.now() >= Date.parse(set)
    if (!fromServerRender.current && !expired) return Promise.resolve(false)
    refreshedFor.current = set
    const request = fetchFresh().finally(() => { inFlight.current = null })
    inFlight.current = { forSet: set, request }
    return request
  }, [fetchFresh, preview, refreshUrl])

  const forceRefresh = useCallback((): Promise<boolean> => {
    if (!refreshUrl || !preview) return Promise.resolve(false)
    return fetchFresh()
  }, [fetchFresh, preview, refreshUrl])

  return { preview, refresh, forceRefresh }
}

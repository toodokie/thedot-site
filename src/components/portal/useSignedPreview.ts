'use client'

import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

// Signed preview links last ten minutes. When a media element fails to load, ask the refresh
// route for fresh links and swap them in. A failed refresh keeps the current links; the Drive
// link beside the media stays the fallback.
//
// refresh: automatic and silent, at most once per mount. A file that never loads would otherwise
// refresh forever, because every refresh brings a new set of links that fails again. Media that
// fail at the same moment share the one request. After it, the caller shows Retry.
// forceRefresh: the Retry button. Every call asks again (once per click) and never re-arms the
// silent refresh. Both say whether new links arrived.
export function useSignedPreview(initial: SignedReviewPreview | null, refreshUrl?: string | null) {
  const [preview, setPreview] = useState(initial)
  const silent = useRef<Promise<boolean> | null>(null)
  const silentDone = useRef(false)

  const fetchFresh = useCallback(async (): Promise<boolean> => {
    if (!refreshUrl) return false
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return false
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (!body.preview) return false
      setPreview(body.preview)
      return true
    } catch {
      return false // Keep the current links.
    }
  }, [refreshUrl])

  const refresh = useCallback((): Promise<boolean> => {
    if (!refreshUrl || !preview) return Promise.resolve(false)
    if (silent.current) return silent.current
    if (silentDone.current) return Promise.resolve(false)
    silentDone.current = true
    const request = fetchFresh().finally(() => { silent.current = null })
    silent.current = request
    return request
  }, [fetchFresh, preview, refreshUrl])

  const forceRefresh = useCallback((): Promise<boolean> => {
    if (!refreshUrl || !preview) return Promise.resolve(false)
    return fetchFresh()
  }, [fetchFresh, preview, refreshUrl])

  return { preview, refresh, forceRefresh }
}

'use client'

import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

// Signed preview links last ten minutes. When a media element fails to load, ask the refresh
// route once per set of links and swap the new ones in. A failed refresh keeps the current links;
// the Drive link beside the media stays the fallback.
export function useSignedPreview(initial: SignedReviewPreview | null, refreshUrl?: string | null) {
  const [preview, setPreview] = useState(initial)
  const refreshedFor = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!refreshUrl || !preview || refreshedFor.current === preview.expiresAt) return
    refreshedFor.current = preview.expiresAt
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (body.preview) setPreview(body.preview)
    } catch {
      // Keep the current links.
    }
  }, [preview, refreshUrl])

  return { preview, refresh }
}

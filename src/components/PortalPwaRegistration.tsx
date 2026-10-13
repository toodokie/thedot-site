'use client'

import { useEffect } from 'react'

// The portal PWA caches only immutable Next static chunks. It deliberately does not
// cache HTML, API responses, Supabase requests, auth cookies, comments, approvals, or
// client content. A failed registration is a performance enhancement failure, not an
// authentication or rendering failure.
export default function PortalPwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/portal-sw.js', { scope: '/' }).catch(() => undefined)
  }, [])

  return null
}

'use client'
import { useEffect, useRef } from 'react'
import { markSeen } from './seen-actions'

// Fires once when the overview mounts in the browser (a real visit, not a server prefetch), updating
// the viewer's last_seen so the "new" markers clear on the next visit. Renders nothing.
export default function MarkSeen({ slug }: { slug: string }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void markSeen(slug)
  }, [slug])
  return null
}

'use client'

import { useEffect, useRef } from 'react'
import { markReportViewed } from './report-view-actions'

// Runs only after the report mounts in a real browser visit, so link prefetching cannot
// dismiss the overview card. The receipt is per signed-in seat and survives across devices.
export default function MarkReportViewed({ slug, reportKey }: { slug: string; reportKey: string }) {
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    void markReportViewed(slug, reportKey)
  }, [slug, reportKey])
  return null
}

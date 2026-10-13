'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { nextCollapsed } from '@/lib/portal/piece-page/collapse'

// Collapsed header state with hysteresis (collapse past 120px, expand under 40px). A passive,
// requestAnimationFrame-throttled scroll listener; the bar is an overlay, so toggling it never
// changes the document height and cannot re-trigger itself.
export function useCollapsingHeader(): boolean {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    let current = false
    let ticking = false
    const apply = () => {
      ticking = false
      const next = nextCollapsed(current, window.scrollY)
      if (next !== current) {
        current = next
        setCollapsed(next)
      }
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(apply)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return collapsed
}

// How many pixels of the layout viewport the on-screen keyboard covers (spec 4.6: the decision
// bar sits above the keyboard on a phone). 0 where visualViewport is missing.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

export const PHONE_QUERY = '(max-width: 767px)'

export function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(PHONE_QUERY)
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

// Horizontal swipe for touch and pen; a mouse drag is ignored so text stays selectable.
export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 60) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return
      if (dx < 0) onLeft()
      else onRight()
    },
    onPointerCancel: () => { start.current = null },
  }
}

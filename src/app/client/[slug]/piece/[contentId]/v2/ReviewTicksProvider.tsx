'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { tickReviewTabs } from '../../../tick-actions'

// Copy-tab ticks (spec 2026-10-03 section 4.3): per seat, per version. The server rows
// (migration 0094) are the record; the browser copy keeps a tick when a write fails and sends
// it on the next tick or the next load. persist=false (the admin preview) writes nothing.

type TicksValue = { ticked: ReadonlySet<string>; tick: (tabKey: string) => void }
const TicksContext = createContext<TicksValue | null>(null)
const WRITE_DELAY_MS = 400

function readLocal(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeLocal(key: string, values: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values))
  } catch {
    // Storage blocked: the in-memory and server copies still hold.
  }
}

export default function ReviewTicksProvider({
  slug, contentId, version, scope, initial, persist, children,
}: {
  slug: string
  contentId: string
  version: number
  scope: string
  initial: string[]
  persist: boolean
  children: React.ReactNode
}) {
  const storageKey = `piece-ticks:${scope}:${slug}:${contentId}:v${version}`
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(initial))
  const tickedRef = useRef(ticked)
  const serverKnown = useRef(new Set(initial))
  const unsent = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    timer.current = null
    const keys = [...unsent.current]
    if (keys.length === 0) return
    unsent.current.clear()
    const result = await tickReviewTabs({ slug, contentId, contentVersion: version, tabKeys: keys })
      .catch(() => ({ ok: false }))
    if (result.ok) for (const key of keys) serverKnown.current.add(key)
    else for (const key of keys) unsent.current.add(key)
  }, [contentId, slug, version])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, WRITE_DELAY_MS)
  }, [flush])

  useEffect(() => {
    const local = readLocal(storageKey)
    if (local.length === 0) return
    const merged = new Set([...tickedRef.current, ...local])
    tickedRef.current = merged
    setTicked(merged)
    if (!persist) return
    const missing = local.filter((key) => !serverKnown.current.has(key))
    if (missing.length === 0) return
    for (const key of missing) unsent.current.add(key)
    schedule()
  }, [persist, schedule, storageKey])

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  const tick = useCallback((tabKey: string) => {
    if (tickedRef.current.has(tabKey)) return
    const next = new Set(tickedRef.current)
    next.add(tabKey)
    tickedRef.current = next
    setTicked(next)
    writeLocal(storageKey, [...next])
    if (!persist || serverKnown.current.has(tabKey)) return
    unsent.current.add(tabKey)
    schedule()
  }, [persist, schedule, storageKey])

  const value = useMemo(() => ({ ticked, tick }), [tick, ticked])
  return <TicksContext.Provider value={value}>{children}</TicksContext.Provider>
}

export function useReviewTicks(): TicksValue {
  const value = useContext(TicksContext)
  if (!value) throw new Error('Review ticks must be inside ReviewTicksProvider')
  return value
}

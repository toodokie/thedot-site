'use client'

import { useRef, type KeyboardEvent } from 'react'
import { TickDot } from '@thedot/design-system'
import styles from './piece-page.module.css'

export function tabDomId(idPrefix: string, key: string): string {
  return `${idPrefix}-tab-${key.replace(/[^a-z0-9_-]/gi, '-')}`
}

// One text at a time (spec 4.3). A tab ticks once opened (the workspace records it); Approve
// stays off until every tab is ticked.
export default function CopySwitcher({ idPrefix, tabs, active, onSelect, ticked, draftCounts, updated }: {
  idPrefix: string
  tabs: Array<{ key: string; label: string }>
  active: string
  onSelect: (key: string) => void
  ticked: ReadonlySet<string>
  draftCounts: Record<string, number>
  updated: ReadonlySet<string>
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusAndSelect(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length]
    if (!tab) return
    onSelect(tab.key)
    refs.current[tab.key]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === active)
    if (event.key === 'ArrowRight') { event.preventDefault(); focusAndSelect(index + 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusAndSelect(index - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusAndSelect(0) }
    else if (event.key === 'End') { event.preventDefault(); focusAndSelect(tabs.length - 1) }
  }

  return <div className={styles.tabs} role="tablist" aria-label="Copy" onKeyDown={onKeyDown}>
    {tabs.map((tab) => {
      const selected = tab.key === active
      const count = draftCounts[tab.key] ?? 0
      const isTicked = ticked.has(tab.key)
      const isUpdated = updated.has(tab.key)
      return <button key={tab.key} ref={(element) => { refs.current[tab.key] = element }} type="button" role="tab"
        id={tabDomId(idPrefix, tab.key)} aria-selected={selected} aria-controls={`${idPrefix}-panel`}
        tabIndex={selected ? 0 : -1} className={styles.tab} onClick={() => onSelect(tab.key)}>
        {tab.label}
        {count > 0 && <span className={styles.cnt}>
          <span aria-hidden="true">{count}</span>
          <span className={styles.srOnly}>{count} unsent {count === 1 ? 'edit' : 'edits'}</span>
        </span>}
        {isUpdated && <><span className={styles.dotmark} aria-hidden="true" /><span className={styles.srOnly}>updated</span></>}
        <TickDot checked={isTicked} />
        <span className={styles.srOnly}>{isTicked ? 'reviewed' : 'not reviewed yet'}</span>
      </button>
    })}
  </div>
}

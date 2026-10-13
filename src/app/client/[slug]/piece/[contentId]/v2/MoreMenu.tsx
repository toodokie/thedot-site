'use client'

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import RemovalRequestForm from '../RemovalRequestForm'
import styles from './piece-page.module.css'

// The ⋯ menu holds the rare actions (spec 4.1): Copy link, Request removal. Request removal keeps
// its existing form, action and confirmation; it only moves here.
// On a phone (the portal shell's 767px breakpoint) the menu opens as a bottom sheet portalled to
// <body> with a backdrop, so no header edge can clip it; on a computer it stays a dropdown beside
// the trigger, shifted back inside the viewport (16px clear of each edge) if it would run off.
const PHONE_QUERY = '(max-width: 767px)'
const EDGE = 16

function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}

export default function MoreMenu({ idPrefix, removal }: {
  idPrefix: string
  removal: { slug: string; contentId: string; idempotencyKey: string } | null
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [removing, setRemoving] = useState(false)
  const [sheet, setSheet] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Dropdown only: measure once open and nudge it back inside the viewport.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!open || sheet || !menu) return
    menu.style.transform = ''
    const rect = menu.getBoundingClientRect()
    let shift = 0
    if (rect.left < EDGE) shift = EDGE - rect.left
    else if (rect.right > window.innerWidth - EDGE) shift = window.innerWidth - EDGE - rect.right
    if (shift !== 0) menu.style.transform = `translateX(${Math.round(shift)}px)`
  }, [open, sheet])

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      // A tap on the sheet's backdrop hands focus back to ⋯; a click elsewhere on a computer keeps
      // focus where it lands.
      setOpen(false)
      if (sheet) buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, sheet])

  useEffect(() => {
    if (removing && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [removing])

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus() }
    else if (event.key === 'Tab') {
      // The sheet lives at the end of <body>: Tab out of it would leave the page, so go back to ⋯.
      if (sheet) { event.preventDefault(); close(true) } else setOpen(false)
    }
  }

  function toggle() {
    if (open) { setOpen(false); return }
    setSheet(isPhoneWidth())
    setOpen(true)
  }

  async function copyLink() {
    try {
      // The page itself: no query (open tab) or fragment from this session.
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
    close(true)
  }

  const menuList = <ul ref={menuRef} id={`${idPrefix}-menu`} role="menu" aria-label="More actions"
    data-variant={sheet ? 'sheet' : 'dropdown'} className={sheet ? styles.menuSheet : styles.menu} onKeyDown={onMenuKey}>
    <li role="none"><button type="button" role="menuitem" className={styles.menuItem} onClick={copyLink}>Copy link</button></li>
    {removal && <li role="none">
      <button type="button" role="menuitem" className={styles.menuItem}
        onClick={() => { close(false); setRemoving(true) }}>Request removal</button>
    </li>}
  </ul>

  return <div className={styles.rel}>
    <button ref={buttonRef} type="button" className={`${styles.ghostButton} ${styles.iconOnly}`}
      aria-label="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls={`${idPrefix}-menu`}
      onClick={toggle}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4" cy="10" r="1.6" fill="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" />
        <circle cx="16" cy="10" r="1.6" fill="currentColor" />
      </svg>
    </button>
    {open && !sheet && menuList}
    {open && sheet && createPortal(<>
      <div className={styles.menuBackdrop} data-testid={`${idPrefix}-menu-backdrop`} aria-hidden="true" onClick={() => close(true)} />
      {menuList}
    </>, document.body)}
    <span className={styles.srOnly} role="status">
      {copied === 'copied' ? 'Link copied' : copied === 'failed' ? 'Could not copy the link' : ''}
    </span>
    {/* Portalled to <body>: the condensed bar is inert while hidden, and a dialog inside it would be too. */}
    {removing && removal && createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${idPrefix}-removal-title`}
      onClose={() => { setRemoving(false); buttonRef.current?.focus() }}>
      <div className={styles.dialogHead}>
        <h2 id={`${idPrefix}-removal-title`}>Request removal</h2>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <RemovalRequestForm slug={removal.slug} contentId={removal.contentId} idempotencyKey={removal.idempotencyKey} startOpen />
    </dialog>, document.body)}
  </div>
}

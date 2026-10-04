'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import RemovalRequestForm from '../RemovalRequestForm'
import styles from './piece-page.module.css'

// The ⋯ menu holds the rare actions (spec 4.1): Copy link, Request removal. Request removal keeps
// its existing form, action and confirmation; it only moves here.
export default function MoreMenu({ idPrefix, removal }: {
  idPrefix: string
  removal: { slug: string; contentId: string; idempotencyKey: string } | null
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [removing, setRemoving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

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
    else if (event.key === 'Tab') setOpen(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
    close(true)
  }

  return <div className={styles.rel}>
    <button ref={buttonRef} type="button" className={`${styles.ghostButton} ${styles.iconOnly}`}
      aria-label="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls={`${idPrefix}-menu`}
      onClick={() => setOpen((value) => !value)}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4" cy="10" r="1.6" fill="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" />
        <circle cx="16" cy="10" r="1.6" fill="currentColor" />
      </svg>
    </button>
    {open && <ul ref={menuRef} id={`${idPrefix}-menu`} role="menu" aria-label="More actions" className={styles.menu} onKeyDown={onMenuKey}>
      <li role="none"><button type="button" role="menuitem" className={styles.menuItem} onClick={copyLink}>Copy link</button></li>
      {removal && <li role="none">
        <button type="button" role="menuitem" className={styles.menuItem}
          onClick={() => { close(false); setRemoving(true) }}>Request removal</button>
      </li>}
    </ul>}
    <span className={styles.srOnly} role="status">
      {copied === 'copied' ? 'Link copied' : copied === 'failed' ? 'Could not copy the link' : ''}
    </span>
    {removing && removal && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${idPrefix}-removal-title`}
      onClose={() => { setRemoving(false); buttonRef.current?.focus() }}>
      <div className={styles.dialogHead}>
        <h2 id={`${idPrefix}-removal-title`}>Request removal</h2>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <RemovalRequestForm slug={removal.slug} contentId={removal.contentId} idempotencyKey={removal.idempotencyKey} startOpen />
    </dialog>}
  </div>
}

'use client'

import { useEffect, useState } from 'react'
import { Button } from '@thedot/design-system'
import { STALE_PAGE_EVENT } from '@/lib/portal/stale-page'
import styles from './StalePageNotice.module.css'

const NOTICE = 'The portal was just updated. Reload the page to continue. Anything you typed is kept on this device.'

export default function StalePageNotice({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    window.addEventListener(STALE_PAGE_EVENT, show)
    return () => window.removeEventListener(STALE_PAGE_EVENT, show)
  }, [])

  if (!visible) return null

  return <div className={styles.notice} role="alert">
    <p className={styles.message}>{NOTICE}</p>
    <Button as="button" type="button" variant="yellow" size="sm" onClick={reload}>Reload page</Button>
  </div>
}

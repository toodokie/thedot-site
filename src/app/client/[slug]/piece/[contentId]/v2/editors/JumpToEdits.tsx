'use client'

import { useState } from 'react'
import styles from '../piece-page.module.css'

// Spec 4.4: before sending, every changed article section, one tap away.
export default function JumpToEdits({ sections }: { sections: Array<{ index: number; name: string }> }) {
  const [open, setOpen] = useState(false)
  if (sections.length === 0) return null
  return <div className={styles.rel}>
    <button type="button" className={styles.link} aria-expanded={open} aria-controls="jump-to-edits" onClick={() => setOpen((v) => !v)}>
      Jump to my edits ({sections.length})
    </button>
    {open && <ul id="jump-to-edits" className={styles.menu} aria-label="Your unsent edits in this article">
      {sections.map((section) => <li key={section.index}>
        <a className={styles.menuItem} href={`#article-section-${section.index}`} onClick={() => setOpen(false)}>{section.name}</a>
      </li>)}
    </ul>}
  </div>
}

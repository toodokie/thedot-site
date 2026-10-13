'use client'

import { useState } from 'react'
import { parseTags } from '@/lib/portal/piece-page/youtube-fields'
import styles from '../piece-page.module.css'

// Tags as removable chips (spec 5). Added tags carry the highlighter; removed tags stay struck
// through, with Put back, until she sends.
export default function TagChips({ id, tags, baseTags, onChange }: {
  id: string
  tags: string[]
  baseTags: string[]
  onChange: (tags: string[]) => void
}) {
  const [entry, setEntry] = useState('')
  const removed = baseTags.filter((tag) => !tags.includes(tag))

  function add(raw: string) {
    const fresh = parseTags(raw).filter((tag, index, all) => !tags.includes(tag) && all.indexOf(tag) === index)
    if (fresh.length > 0) onChange([...tags, ...fresh])
    setEntry('')
  }

  // Put back returns a tag to where it was, so putting back everything restores the original.
  function putBack(tag: string) {
    const at = baseTags.indexOf(tag)
    const before = tags.findIndex((t) => baseTags.indexOf(t) > at)
    onChange(before === -1 ? [...tags, tag] : [...tags.slice(0, before), tag, ...tags.slice(before)])
  }

  return <div>
    <ul className={styles.chips} aria-label="Tags">
      {tags.map((tag, index) => {
        const added = !baseTags.includes(tag)
        return <li key={`${tag}-${index}`} className={`${styles.chip} ${added ? styles.chipAdded : ''}`}>
          {tag}{added && <span className={styles.srOnly}> (added)</span>}
          <button type="button" className={styles.chipX} aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((_, i) => i !== index))}>×</button>
        </li>
      })}
      {removed.map((tag) => <li key={`removed-${tag}`} className={`${styles.chip} ${styles.chipRemoved}`}>
        <span className={styles.srOnly}>Removed: </span>{tag}
        <button type="button" className={styles.chipX} aria-label={`Put back tag ${tag}`} onClick={() => putBack(tag)}>↺</button>
      </li>)}
    </ul>
    <label className={styles.srOnly} htmlFor={id}>Add a tag</label>
    <input id={id} className={styles.chipAdd} placeholder="Add a tag" value={entry}
      onChange={(event) => {
        const value = event.target.value
        if (value.includes(',')) add(value)
        else setEntry(value)
      }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(entry) } }}
      onBlur={() => { if (entry.trim()) add(entry) }} />
    <p className={styles.hint}>Tap the cross to remove a tag. Removed tags stay struck through until you send.</p>
  </div>
}

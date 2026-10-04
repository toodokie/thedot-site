'use client'

import { useState } from 'react'
import { characterCount } from '@/lib/portal/piece-page/limits'
import {
  SEARCH_FIELDS, labeledValue, parseLabeledList, serializeLabeledList, setLabeledValue,
} from '@/lib/portal/piece-page/labeled-list'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'

// Spec 4.4: search title, search description, web address, preview text when shared. Each writes
// back into its own "- **Label:** value" line; every other line stays as written.
export default function SearchForm({ target, source }: { target: ReviewTarget; source: string }) {
  const { saveDraft } = useReviewDrafts()
  const [list, setList] = useState(() => parseLabeledList(source))
  // What she typed, shown even when a value cannot be written back (a lone backticked word).
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [refused, setRefused] = useState<string | null>(null)

  function change(label: string, value: string) {
    setTyped((current) => ({ ...current, [label]: value }))
    try {
      const next = setLabeledValue(list, label, value)
      setRefused(null)
      setList(next)
      saveDraft(target, serializeLabeledList(next), null)
    } catch {
      setRefused(label)
    }
  }

  return <div>
    {SEARCH_FIELDS.map((field) => {
      const saved = labeledValue(list, field.label)
      if (saved === null) return null
      const value = typed[field.label] ?? saved
      const id = `search-${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const count = characterCount(value)
      const multiline = field.label === 'Meta description' || field.label === 'Excerpt'
      const describedBy = [field.limit !== null ? `${id}-count` : '', refused === field.label ? `${id}-error` : ''].filter(Boolean).join(' ')
      return <div key={field.label} className={styles.field}>
        <label className={`${styles.label} ${styles.fieldLabel}`} htmlFor={id}>{field.title}</label>
        {multiline
          ? <textarea id={id} className={styles.fieldInput} rows={3} value={value} aria-describedby={describedBy || undefined}
            onChange={(event) => change(field.label, event.target.value)} />
          : <input id={id} className={styles.fieldInput} value={value} aria-describedby={describedBy || undefined}
            onChange={(event) => change(field.label, event.target.value)} />}
        {field.limit !== null && <span id={`${id}-count`} className={count > field.limit ? styles.errText : styles.charcount}>
          {count} of {field.limit} characters
        </span>}
        {refused === field.label && <p id={`${id}-error`} className={styles.errText} role="alert">
          This cannot be a single word in backticks. Remove the backticks to save it.
        </p>}
      </div>
    })}
  </div>
}

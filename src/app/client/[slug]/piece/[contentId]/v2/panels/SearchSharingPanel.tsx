'use client'

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { SEARCH_FIELDS, labeledValue, parseLabeledList, type LabeledField } from '@/lib/portal/piece-page/labeled-list'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { Field } from './YouTubePanel'
import { useBlockDraft } from './use-block-draft'

const SEARCH_LABELS = new Set<string>(SEARCH_FIELDS.map((field) => field.label.toLowerCase()))

// Spec 4.4: Search & sharing (search title, description, web address, preview text when shared).
export default function SearchSharingPanel({ tab, canEdit }: { tab: CopyTab; canEdit: boolean; version: number }) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, source } = useBlockDraft(block)
  const list = parseLabeledList(source)
  const slug = labeledValue(list, 'Slug') ?? ''
  const others = list.items.filter((item): item is LabeledField => item.kind === 'field' && !SEARCH_LABELS.has(item.label.trim().toLowerCase()))

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>Search and sharing</h2>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label="Edit search and sharing"
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:whole`, target, title: 'Search and sharing', initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
    </div>
    <div className={styles.serp} role="group" aria-label="How it looks in Google">
      <div className={styles.serpUrl}>kanset.com{slug}</div>
      <div className={styles.serpTitle}>{labeledValue(list, 'SEO title')}</div>
      <div>{labeledValue(list, 'Meta description')}</div>
    </div>
    <EditSlot slotId={`${block.key}:whole`}>
      {SEARCH_FIELDS.map((field) => {
        const value = labeledValue(list, field.label)
        if (value === null) return null
        return <Field key={field.label} label={field.title}>
          <p className={styles.fieldValue}>{field.label === 'Slug' ? `kanset.com${value}` : value}</p>
          {field.limit !== null && <span className={styles.charcount}>{value.length} of {field.limit} characters</span>}
        </Field>
      })}
    </EditSlot>
    {others.length > 0 && <dl className={styles.details}>
      {others.map((item) => <div key={item.label} style={{ display: 'contents' }}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>}
  </div>
}

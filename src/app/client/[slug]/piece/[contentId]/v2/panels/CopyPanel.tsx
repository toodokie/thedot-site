'use client'

import { useState } from 'react'
import { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import TrackedText from '@/components/portal/editor/TrackedText'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

type Props = { tab: CopyTab; before: Record<string, string>; canEdit: boolean; version: number }

// Captions, LinkedIn post and first comment, and any other block: shown as text, edited whole.
export default function CopyPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <CopyBlockView key={block.key ?? index} block={block} {...props} />)}</>
}

function CopyBlockView({ block, tab, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const label = tab.blocks.length > 1 ? block.label : tab.label
  const slotId = `${block.key}:whole`
  const openEditor = () => open({
    kind: 'copy', slotId, target, title: label, initialText: source, baseText: block.body, compose: (text) => text,
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainTextFromMarkdown(block.body))
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>{label}</h2>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openEditor} />}
    <EditSlot slotId={slotId}>
      {draft
        ? <TrackedText base={block.body} current={source} />
        : <ChangedMarkdown body={source} before={before[block.key ?? ''] ?? null} />}
    </EditSlot>
    <div className={styles.blockActions}>
      {canEdit && block.key && <button type="button" className={styles.link} aria-label={`Edit ${label}`} onClick={openEditor}>Edit</button>}
      <button type="button" className={`${styles.link} ${styles.linkGrey}`} onClick={copy}>Copy text</button>
      <span className={styles.srOnly} role="status">{copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : ''}</span>
    </div>
  </div>
}

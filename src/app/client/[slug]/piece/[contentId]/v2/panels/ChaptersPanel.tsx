'use client'

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { findChapters, parseYouTubePackage, youTubeFieldValue } from '@/lib/portal/piece-page/youtube-fields'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

// Episode chapters, read from the YouTube description (spec 4.3, episode tabs).
export default function ChaptersPanel({ tab, canEdit }: { tab: CopyTab; canEdit: boolean; version: number }) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, source } = useBlockDraft(block)
  const pkg = block.key === 'youtube-description' ? null : parseYouTubePackage(source)
  const description = block.key === 'youtube-description' ? source : pkg ? youTubeFieldValue(pkg, 'description') : null
  const chapters = description ? findChapters(description) : null

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>Chapters</h2>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label="Edit chapters"
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:chapters`, target, title: `${block.label}, chapters`, initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
    </div>
    <p className={styles.hint}>These show under the episode on YouTube. Edit a title or a time and I will match it to the cut.</p>
    <EditSlot slotId={`${block.key}:chapters`}>
      {chapters
        ? <ol className={styles.chapters}>
          {chapters.items.map((item) => <li key={`${item.time}-${item.title}`}><time>{item.time}</time><span>{item.title}</span></li>)}
        </ol>
        : <p className={styles.meta}>No chapters in this version.</p>}
    </EditSlot>
  </div>
}

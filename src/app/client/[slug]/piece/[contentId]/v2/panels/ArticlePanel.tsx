'use client'

import TrackedText from '@/components/portal/editor/TrackedText'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import JumpToEdits from '../editors/JumpToEdits'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import { SentCopyMarker } from '../SentEdits'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

// Spec 4.4: reads like a kanset.com article; edited section by section, composed into the one
// article block. The piece title is the page's h1, so the article headline is an h2 here.
export default function ArticlePanel({ tab, coverUrl, before, canEdit, version }: {
  tab: CopyTab
  coverUrl: string | null
  before: Record<string, string>
  canEdit: boolean
  version: number
}) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'sections')
  const baseSegments = segmentBlock(block.body, 'sections').segments
  const edited = editedSegments(block.body, source, 'sections')
  const previous = draft ? null : before[block.key ?? ''] ?? null
  const editable = canEdit && Boolean(block.key)
  const openWhole = () => open({
    kind: 'copy', slotId: `${block.key}:whole`, target, title: 'Article', initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    {coverUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={styles.cover} src={coverUrl} alt="Cover image" />
      : <div className={styles.coverPlaceholder}>Cover image</div>}
    {draft && <p className={styles.saved}>Saved · not sent yet</p>}
    {draft && <JumpToEdits sections={segmented.segments.filter((_, i) => edited[i])
      .map((segment) => ({ index: segment.index, name: segment.level === 1 ? 'Opening' : segment.label }))} />}
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    <article className={styles.article}>
      {segmented.preamble.trim() && <ChangedMarkdown body={segmented.preamble} before={previous} className={styles.copy} />}
      <SentCopyMarker spot={`${block.key}:whole`} />
      {segmented.segments.map((segment, index) => {
        const body = segment.raw.replace(/^[^\n]*\n?/, '')
        const name = segment.level === 1 ? 'Opening' : segment.label
        const editButton = editable && <button type="button" className={styles.link} aria-label={`Edit section, ${name}`}
          onClick={() => open({
            kind: 'copy', slotId: `${block.key}:section:${index}`, target, title: `${name} · Article`,
            initialText: segmentText(segment),
            baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
            compose: (text) => replaceSegment(source, 'sections', index, text),
            segment: { mode: 'sections', index },
          })}>Edit section</button>
        return <section key={index} className={styles.sec} id={`article-section-${index}`}>
          {segment.level === 1 && <h2 className={styles.articleTitle}>{segment.label}</h2>}
          <div className={styles.secH}>
            {segment.level === 1 ? <span className={styles.label}>Opening</span> : <h3>{segment.label}</h3>}
            {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
            {editButton}
          </div>
          <EditSlot slotId={`${block.key}:section:${index}`}>
            {edited[index] && baseSegments[index]
              ? <div className={styles.copy}>
                <TrackedText base={baseSegments[index].raw.replace(/^[^\n]*\n?/, '')} current={body} />
              </div>
              : <ChangedMarkdown body={body} before={previous} className={styles.copy} />}
          </EditSlot>
          <SentCopyMarker spot={`${block.key}:section:${index}`} />
        </section>
      })}
    </article>
  </div>
}

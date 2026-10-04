'use client'

import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

type Props = {
  tab: CopyTab
  page: number
  onPageChange: (page: number) => void
  pageThumbs: Array<{ label: string; url: string }>
  before: Record<string, string>
  canEdit: boolean
  version: number
}

// PDF and carousel text, page by page, following the page shown in the viewer (spec 4.2, 4.3).
export default function DocumentPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <DocumentBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function DocumentBlock({ block, tab, page, onPageChange, pageThumbs, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'pages')
  const baseSegments = segmentBlock(block.body, 'pages').segments
  const edited = editedSegments(block.body, source, 'pages')
  const editable = canEdit && Boolean(block.key)
  const previous = draft ? null : before[block.key ?? ''] ?? null
  const wholeSlot = `${block.key}:whole`
  const openWhole = () => open({
    kind: 'copy', slotId: wholeSlot, target, title: tab.label, initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>{tab.label}, page by page</h2>
      {draft ? <span className={styles.saved}>Saved · not sent yet</span>
        : pageThumbs.length > 0 && <span className={styles.meta}>Synced to the page you are viewing</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    {segmented.segments.length === 0
      ? <div>
        <EditSlot slotId={wholeSlot}>
          <ChangedMarkdown body={source} before={previous} />
        </EditSlot>
        {editable && <div className={styles.blockActions}><button type="button" className={styles.link} onClick={openWhole}>Edit text</button></div>}
      </div>
      : <>
        {segmented.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={segmented.preamble} style={INHERIT} /></div>}
        <ol className={styles.ptext}>
          {segmented.segments.map((segment, index) => {
            const pageIndex = segment.number - 1
            const thumb = pageThumbs[pageIndex] ?? null
            return <li key={index} aria-current={pageIndex === page ? 'true' : undefined}>
              <button type="button" className={styles.pthumb} aria-label={`Show page ${segment.number}`} onClick={() => onPageChange(pageIndex)}>
                {thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumb.url} alt="" loading="lazy" />
                  : <span className={styles.pn}>{segment.label}</span>}
              </button>
              <div>
                <div className={styles.fnum}>
                  <span>{segment.label}</span>
                  {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
                </div>
                <EditSlot slotId={`${block.key}:page:${index}`}>
                  <ChangedMarkdown body={segmentText(segment)} before={previous} className={styles.frameText} />
                </EditSlot>
              </div>
              <div className={styles.ractions}>
                {editable && <button type="button" className={styles.link} aria-label={`Edit text, ${segment.label}`}
                  onClick={() => open({
                    kind: 'copy', slotId: `${block.key}:page:${index}`, target,
                    title: `${segment.label} of ${segmented.segments.length} · ${tab.label}`,
                    thumbUrl: thumb?.url ?? null, initialText: segmentText(segment),
                    baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
                    compose: (text) => replaceSegment(source, 'pages', index, text),
                    segment: { mode: 'pages', index },
                  })}>Edit text</button>}
              </div>
            </li>
          })}
        </ol>
      </>}
  </div>
}

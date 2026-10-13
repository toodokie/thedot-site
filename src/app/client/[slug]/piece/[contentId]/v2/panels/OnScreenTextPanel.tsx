'use client'

import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import TrackedText from '@/components/portal/editor/TrackedText'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import { SentCopyMarker, SentVisualMarker, useSentSegmentSpots } from '../SentEdits'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

type Props = {
  tab: CopyTab
  frames: Array<{ label: string; url: string }>
  before: Record<string, string>
  canEdit: boolean
  onSuggestFrame: ((index: number) => void) | null
  version: number
}

// Spec 4.3: on-screen text frame by frame, each line beside its frame, with Edit text (binding copy
// edit, composed back into the one block) and Suggest a change (binding visual note on that frame).
export default function OnScreenTextPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <OnScreenBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function OnScreenBlock({ block, frames, before, canEdit, onSuggestFrame, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'frames')
  const baseSegments = segmentBlock(block.body, 'frames').segments
  const edited = editedSegments(block.body, source, 'frames')
  const total = segmented.segments.length
  const sentSpots = useSentSegmentSpots(block.key, block.body, source, 'frames')
  // A note on a video still sits beside a text frame only when the stills and the text frames are
  // the same frames: the same count, and a text frame named as the still is (Frame n).
  const stillsMatchText = frames.length === total
  const previous = draft ? null : before[block.key ?? ''] ?? null
  const editable = canEdit && Boolean(block.key)
  const wholeSlot = `${block.key}:whole`
  const openWhole = () => open({
    kind: 'copy', slotId: wholeSlot, target, title: 'On-screen text', initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>On-screen text, frame by frame</h2>
      {draft ? <span className={styles.saved}>Saved · not sent yet</span>
        : <span className={styles.meta}>What the video shows, word for word</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    {editable
      ? <p className={styles.hint}>Edit a frame to change the words on screen. To change how a frame looks, use Suggest a change beside it.</p>
      : <p className={styles.closed}>Editing is closed</p>}
    {total === 0
      ? <div>
        <EditSlot slotId={wholeSlot}>
          {draft
            ? <TrackedText base={block.body} current={source} />
            : <ChangedMarkdown body={source} before={previous} />}
        </EditSlot>
        <SentCopyMarker spot={wholeSlot} />
        {editable && <div className={styles.blockActions}>
          <button type="button" className={styles.link} onClick={openWhole}>Edit text</button>
        </div>}
      </div>
      : <>
        {segmented.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={segmented.preamble} style={INHERIT} /></div>}
        <ol className={styles.frows}>
          {segmented.segments.map((segment, index) => {
            const frame = frames[segment.number - 1] ?? null
            return <li key={index} className={styles.frow}>
              {frame
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className={styles.ft} src={frame.url} alt="" loading="lazy" />
                : <span className={styles.ft} aria-hidden="true" />}
              <div>
                <div className={styles.fnum}>
                  <span>{segment.label}</span>
                  {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
                </div>
                <EditSlot slotId={`${block.key}:frame:${index}`}>
                  {edited[index] && baseSegments[index]
                    ? <div className={styles.frameText}>
                      <TrackedText base={segmentText(baseSegments[index])} current={segmentText(segment)} />
                    </div>
                    : <ChangedMarkdown body={segmentText(segment)} before={previous} className={styles.frameText} />}
                </EditSlot>
                {sentSpots[index] && <SentCopyMarker spot={sentSpots[index] as string} />}
                {stillsMatchText && segment.label === `Frame ${segment.number}` && <SentVisualMarker spot={`frame:${segment.number}`} />}
              </div>
              <div className={styles.ractions}>
                {editable && <button type="button" className={styles.link} aria-label={`Edit text, ${segment.label}`}
                  onClick={() => open({
                    kind: 'copy', slotId: `${block.key}:frame:${index}`, target,
                    title: `${segment.label} of ${total} · On-screen text`, thumbUrl: frame?.url ?? null,
                    initialText: segmentText(segment),
                    baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
                    compose: (text) => replaceSegment(source, 'frames', index, text),
                    segment: { mode: 'frames', index },
                  })}>Edit text</button>}
                {canEdit && onSuggestFrame && <button type="button" className={`${styles.link} ${styles.linkGrey}`}
                  aria-label={`Suggest a change to ${segment.label.toLowerCase()}`}
                  onClick={() => onSuggestFrame(segment.number - 1)}>Suggest a change</button>}
              </div>
            </li>
          })}
        </ol>
      </>}
  </div>
}

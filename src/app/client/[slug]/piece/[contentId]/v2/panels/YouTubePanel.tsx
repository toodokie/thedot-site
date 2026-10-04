'use client'

import type { ReactNode } from 'react'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { parseTags, parseYouTubePackage, youTubeFieldValue } from '@/lib/portal/piece-page/youtube-fields'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import { TagsBlockForm, TitleBlockForm, YouTubePackageForm } from '../editors/YouTubeForms'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

type Props = { tab: CopyTab; before: Record<string, string>; canEdit: boolean; version: number }

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.field}>
    <span className={`${styles.label} ${styles.fieldLabel}`}>{label}</span>
    {children}
  </div>
}

export function Chips({ tags }: { tags: string[] }) {
  return <ul className={styles.chips} aria-label="Tags">{tags.map((tag) => <li key={tag} className={styles.chip}>{tag}</li>)}</ul>
}

// Spec 5: YouTube as Title, Description, Tags. One package block or three separate blocks.
export default function YouTubePanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <YouTubeBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function YouTubeBlock({ block, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const slotId = `${block.key}:whole`
  const openEditor = () => {
    if (block.key === 'youtube-title') {
      open({ kind: 'form', slotId, targets: [target], title: 'YouTube title', render: () => <TitleBlockForm target={target} source={source} /> })
    } else if (block.key === 'youtube-tags') {
      open({ kind: 'form', slotId, targets: [target], title: 'YouTube tags',
        render: () => <TagsBlockForm target={target} source={source} base={block.body} /> })
    } else if (block.key !== 'youtube-description' && parseYouTubePackage(source) !== null) {
      open({ kind: 'form', slotId, targets: [target], title: block.label,
        render: () => <YouTubePackageForm target={target} source={source} base={block.body} /> })
    } else {
      open({ kind: 'copy', slotId, target, title: block.label, initialText: source, baseText: block.body, compose: (text) => text })
    }
  }
  const previous = draft ? null : before[block.key ?? ''] ?? null
  const previousPackage = previous === null ? null : parseYouTubePackage(previous)
  const previousDescription = previousPackage ? youTubeFieldValue(previousPackage, 'description') : null

  let content: ReactNode
  if (block.key === 'youtube-title') {
    content = <Field label="Title"><p className={`${styles.fieldValue} ${styles.fieldTitle}`}>{source}</p></Field>
  } else if (block.key === 'youtube-tags') {
    content = <Field label="Tags"><Chips tags={parseTags(source)} /></Field>
  } else if (block.key === 'youtube-description') {
    content = <Field label="Description"><ChangedMarkdown body={source} before={previous} className={styles.fieldValue} /></Field>
  } else {
    const pkg = parseYouTubePackage(source)
    content = pkg === null
      ? <ChangedMarkdown body={source} before={previous} />
      : <>
        {pkg.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={pkg.preamble} /></div>}
        {pkg.fields.map((field) => field.name === 'title'
          ? <Field key="title" label="Title"><p className={`${styles.fieldValue} ${styles.fieldTitle}`}>{field.value}</p></Field>
          : field.name === 'tags'
            ? <Field key="tags" label="Tags"><Chips tags={parseTags(field.value)} /></Field>
            : <Field key="description" label="Description"><ChangedMarkdown body={field.value} before={previousDescription} className={styles.fieldValue} /></Field>)}
        {pkg.rest.trim() && <div className={styles.preamble}><MarkdownCopy body={pkg.rest} /></div>}
      </>
  }

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <h2 className={`${styles.label} ${styles.blockTitle}`}>{block.label}</h2>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label={`Edit ${block.label}`} onClick={openEditor}>Edit</button>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openEditor} />}
    <EditSlot slotId={slotId}>{content}</EditSlot>
  </div>
}

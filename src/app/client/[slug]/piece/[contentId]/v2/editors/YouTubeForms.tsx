'use client'

import { useMemo, useRef, useState } from 'react'
import DocumentEditor from '@/components/portal/editor/LazyDocumentEditor'
import { characterCount } from '@/lib/portal/piece-page/limits'
import {
  formatTagsLike, parseTags, parseYouTubePackage, serializeYouTubePackage, setYouTubeField, youTubeFieldValue,
  type YouTubeFieldName,
} from '@/lib/portal/piece-page/youtube-fields'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'
import TagChips from './TagChips'

// YouTube's own limits. Guidance only: going over is shown, never blocked.
export const YOUTUBE_TITLE_LIMIT = 100
export const YOUTUBE_DESCRIPTION_LIMIT = 5_000

const number = new Intl.NumberFormat('en-US')

export function FieldCount({ id, text, limit }: { id: string; text: string; limit: number }) {
  const count = characterCount(text)
  return <span id={id} className={count > limit ? styles.errText : styles.charcount}>
    {number.format(count)} of {number.format(limit)} characters
  </span>
}

export function TitleField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return <div className={styles.field}>
    <label className={`${styles.label} ${styles.fieldLabel}`} htmlFor={id}>Title</label>
    <input id={id} className={styles.fieldInput} value={value} aria-describedby={`${id}-count`}
      onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))} />
    <FieldCount id={`${id}-count`} text={value} limit={YOUTUBE_TITLE_LIMIT} />
  </div>
}

// One package block ("**Title:** ... **Description:** ... **Tags:** ..."): each field is edited on
// its own and the block is re-composed around it, label lines and notes untouched. A field she
// has not changed keeps its exact bytes (setYouTubeField is a no-op on an unchanged value).
export function YouTubePackageForm({ target, source, base }: { target: ReviewTarget; source: string; base: string }) {
  const { saveDraft } = useReviewDrafts()
  const pkg = useMemo(() => parseYouTubePackage(source), [source])
  const basePkg = useMemo(() => parseYouTubePackage(base), [base])
  const originalTags = pkg ? youTubeFieldValue(pkg, 'tags') ?? '' : ''
  const [title, setTitle] = useState(() => (pkg ? youTubeFieldValue(pkg, 'title') ?? '' : ''))
  const [description, setDescription] = useState(() => (pkg ? youTubeFieldValue(pkg, 'description') ?? '' : ''))
  const [tags, setTags] = useState(() => parseTags(originalTags))
  // The latest value of every field, so a save from one field never writes another field's stale value.
  const current = useRef({ title, description, tags })
  if (!pkg) return null
  const has = (name: YouTubeFieldName) => pkg.fields.some((field) => field.name === name)

  function save(next: Partial<{ title: string; description: string; tags: string[] }>) {
    if (!pkg) return
    current.current = { ...current.current, ...next }
    const values = current.current
    let out = pkg
    if (has('title')) out = setYouTubeField(out, 'title', values.title)
    if (has('description')) out = setYouTubeField(out, 'description', values.description)
    if (has('tags')) out = setYouTubeField(out, 'tags', formatTagsLike(originalTags, values.tags))
    saveDraft(target, serializeYouTubePackage(out), null)
  }

  return <div>
    {has('title') && <TitleField id="youtube-title" value={title} onChange={(value) => { setTitle(value); save({ title: value }) }} />}
    {has('description') && <div className={styles.field}>
      <DocumentEditor label="Description" value={description} describedBy="youtube-description-count"
        baseText={basePkg ? youTubeFieldValue(basePkg, 'description') : null}
        onChange={(value) => { setDescription(value); save({ description: value }) }} />
      <FieldCount id="youtube-description-count" text={description} limit={YOUTUBE_DESCRIPTION_LIMIT} />
    </div>}
    {has('tags') && <div className={styles.field}>
      <span className={`${styles.label} ${styles.fieldLabel}`}>Tags</span>
      <TagChips id="youtube-tags-add" tags={tags} baseTags={parseTags(basePkg ? youTubeFieldValue(basePkg, 'tags') ?? '' : '')}
        onChange={(value) => { setTags(value); save({ tags: value }) }} />
    </div>}
  </div>
}

// Episodes keep title, description and tags in separate blocks; each edits its own block.
export function TitleBlockForm({ target, source }: { target: ReviewTarget; source: string }) {
  const { saveDraft } = useReviewDrafts()
  const [value, setValue] = useState(source)
  return <TitleField id="youtube-title-block" value={value} onChange={(next) => { setValue(next); saveDraft(target, next, null) }} />
}

export function TagsBlockForm({ target, source, base }: { target: ReviewTarget; source: string; base: string }) {
  const { saveDraft } = useReviewDrafts()
  const [tags, setTags] = useState(() => parseTags(source))
  return <div className={styles.field}>
    <span className={`${styles.label} ${styles.fieldLabel}`}>Tags</span>
    <TagChips id="youtube-tags-block" tags={tags} baseTags={parseTags(base)}
      onChange={(next) => { setTags(next); saveDraft(target, formatTagsLike(source, next), null) }} />
  </div>
}

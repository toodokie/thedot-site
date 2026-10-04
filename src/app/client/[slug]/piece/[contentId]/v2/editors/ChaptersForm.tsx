'use client'

import { useMemo, useState } from 'react'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import {
  findChapters, parseYouTubePackage, replaceChapters, serializeYouTubePackage, setYouTubeField, youTubeFieldValue,
  type ChapterItem,
} from '@/lib/portal/piece-page/youtube-fields'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'

const TIME = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/

function seconds(time: string): number {
  return time.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

function complete(row: ChapterItem): boolean {
  return TIME.test(row.time.trim()) && row.title.trim() !== ''
}

// YouTube's chapter rules, in plain words. Breaking one never blocks saving: her list is kept as
// she wrote it, and the message says what YouTube needs before it shows chapters.
export function chapterProblems(rows: ChapterItem[]): string[] {
  const problems: string[] = []
  if (rows.length < 3) problems.push('YouTube shows chapters only when there are at least three.')
  if (rows.length > 0 && seconds(rows[0].time) !== 0) problems.push('YouTube shows chapters only when the first one starts at 0:00.')
  if (rows.some((row, index) => index > 0 && seconds(row.time) <= seconds(rows[index - 1].time))) {
    problems.push('YouTube shows chapters only when each one starts later than the one before.')
  }
  return problems
}

function readRows(value: string | null): ChapterItem[] | null {
  if (!value) return null
  try {
    const rows: unknown = JSON.parse(value)
    if (!Array.isArray(rows)) return null
    return rows.filter((row): row is ChapterItem => Boolean(row) && typeof row.time === 'string' && typeof row.title === 'string')
  } catch {
    return null
  }
}

// Chapters are a time and a title per row, written back into the chapter lines of the description
// and nowhere else (replaceChapters). A row goes into the description once it has a time and a
// title; the list needs two complete rows to stay a chapter list. Rows the description cannot hold
// yet are kept as she typed them in the provider's field scratch, so closing never loses them.
export default function ChaptersForm({ target, block, source }: { target: ReviewTarget; block: ReviewCopyBlock; source: string }) {
  const { saveDraft, readFieldScratch, saveFieldScratch } = useReviewDrafts()
  const isDescription = block.key === 'youtube-description'
  const pkg = useMemo(() => (isDescription ? null : parseYouTubePackage(source)), [isDescription, source])
  const description = isDescription ? source : (pkg ? youTubeFieldValue(pkg, 'description') ?? '' : '')
  const chapters = useMemo(() => findChapters(description), [description])
  const [rows, setRows] = useState<ChapterItem[]>(() => readRows(readFieldScratch(target, 'chapters')) ?? chapters?.items ?? [])
  if (!chapters) return <p className={styles.meta}>No chapters in this version.</p>

  function update(next: ChapterItem[]) {
    setRows(next)
    if (!chapters) return
    saveFieldScratch(target, 'chapters', next.every(complete) ? null : JSON.stringify(next))
    const ready = next.filter(complete)
    if (ready.length < 2) return
    const nextDescription = replaceChapters(description, chapters, ready)
    saveDraft(target, isDescription || !pkg
      ? nextDescription
      : serializeYouTubePackage(setYouTubeField(pkg, 'description', nextDescription)), null)
  }

  const ready = rows.filter(complete)
  const waiting = rows.map((row, index) => (complete(row) ? null : index + 1)).filter((n): n is number => n !== null)
  const problems = ready.length >= 2 ? chapterProblems(ready) : []

  return <div>
    <ol className={styles.chapterRows} aria-label="Chapters">
      {rows.map((row, index) => <li key={index} className={styles.chapterRow}>
        <label className={styles.srOnly} htmlFor={`chapter-time-${index}`}>Time, chapter {index + 1}</label>
        <input id={`chapter-time-${index}`} className={styles.fieldInput} value={row.time} inputMode="numeric"
          aria-invalid={!TIME.test(row.time.trim())}
          onChange={(event) => update(rows.map((r, i) => (i === index ? { ...r, time: event.target.value } : r)))} />
        <label className={styles.srOnly} htmlFor={`chapter-title-${index}`}>Title, chapter {index + 1}</label>
        <input id={`chapter-title-${index}`} className={styles.fieldInput} value={row.title}
          onChange={(event) => update(rows.map((r, i) => (i === index ? { ...r, title: event.target.value } : r)))} />
        <button type="button" className={styles.link} aria-label={`Remove chapter ${index + 1}`}
          onClick={() => update(rows.filter((_, i) => i !== index))}>Remove</button>
      </li>)}
    </ol>
    <button type="button" className={styles.link} onClick={() => update([...rows, { time: '', title: '' }])}>Add a chapter</button>
    <div role="status">
      {waiting.map((n) => <p key={n} className={styles.hint}>Chapter {n} saves once it has a time like 12:30 and a title.</p>)}
      {ready.length < 2 && <p className={styles.hint}>Keep at least two chapters with a time and a title. Until then your last saved list stands.</p>}
      {problems.length > 0 && <div className={styles.hint}>
        {problems.map((problem) => <p key={problem} className={styles.errText}>{problem}</p>)}
        <p>Your list is saved as you wrote it.</p>
      </div>}
    </div>
    <p className={styles.hint}>Times are minutes and seconds, like 12:30. I match them to the cut before it posts.</p>
  </div>
}

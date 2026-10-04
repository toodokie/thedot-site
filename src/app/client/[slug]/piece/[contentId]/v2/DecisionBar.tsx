'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Button, ReviewDots, Textarea } from '@thedot/design-system'
import type { PieceAction } from '@/lib/portal/piece-page/piece-action'
import { decide } from '../../../actions'
import { useReviewDrafts } from '../ReviewDraftProvider'
import { useKeyboardInset, usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

function edits(count: number): string {
  return count === 1 ? 'edit' : 'edits'
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

const SUB_ID = 'decision-bar-sub'

// Spec 4.6 and 4.7: progress, the single derived action, or the state line. Client wording is a
// draft for kanset-copywriting (first person singular, no em dashes).
export default function DecisionBar({
  action, ticks, version, reReview, approvedLabel, postedLabel, sentSummary, slug, contentId, mode, canEdit,
  onOpenPastEdits, onShowCarried,
}: {
  action: PieceAction
  ticks: { total: number; done: number }
  version: number
  reReview: boolean
  approvedLabel: string
  postedLabel: string
  sentSummary: { count: number; dateLabel: string | null }
  slug: string
  contentId: string
  mode: 'client' | 'preview'
  canEdit: boolean
  onOpenPastEdits: () => void
  onShowCarried: () => void
}) {
  const { send, sendError, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  const inset = useKeyboardInset()
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (action.kind === 'none') return null

  function blockedInPreview(): boolean {
    if (mode !== 'preview') return false
    setMessage({ kind: 'success', text: 'Read-only preview: nothing was sent.' })
    return true
  }

  function sendEdits() {
    setMessage(null)
    if (blockedInPreview()) return
    startTransition(async () => {
      const outcome = await send(note)
      if (!outcome.ok) {
        setMessage({ kind: 'error', text: outcome.message })
        return
      }
      setNote('')
      setNoteOpen(false)
      setMessage({ kind: 'success', text: outcome.message })
    })
  }

  function approve() {
    setMessage(null)
    if (blockedInPreview()) return
    startTransition(async () => {
      const form = new FormData()
      form.set('slug', slug)
      form.set('contentId', contentId)
      form.set('decision', 'approved')
      form.set('note', note)
      const result = await decide(form)
      if (result?.error) setMessage({ kind: 'error', text: result.error })
    })
  }

  const noteLink = <button type="button" className={styles.link} aria-expanded={noteOpen} onClick={() => setNoteOpen((v) => !v)}>
    {noteOpen ? 'Hide note' : 'Add a note'}
  </button>
  const progress = <>
    <ReviewDots total={ticks.total} filled={ticks.done} />
    <strong className={styles.progStrong}>{ticks.done} of {ticks.total} reviewed</strong>
  </>
  const pastLink = <button type="button" className={styles.link} onClick={onOpenPastEdits}>See what you sent</button>

  let error = false
  let allowsNote = false
  let prog: ReactNode
  let act: ReactNode = null

  switch (action.kind) {
    case 'approve': {
      allowsNote = true
      const sub = action.reason === 'ticks'
        ? (reReview && ticks.done === 0
          ? `New version ${version}. Your earlier ticks are cleared for this version.`
          : `Open ${joinLabels(action.untickedLabels)} to finish your review.`)
        : action.reason === 'media'
          ? 'You can approve once the video is here. I will let you know.'
          : 'Everything looks right? Approve sends it to scheduling.'
      prog = <>{progress}<span className={styles.sub} id={SUB_ID}>{sub}</span></>
      act = <>{noteLink}
        <Button as="button" type="button" variant="yellow" disabled={!action.enabled || pending} aria-describedby={SUB_ID} onClick={approve}>
          {pending ? 'Approving…' : 'Approve'}
        </Button></>
      break
    }
    case 'send': {
      allowsNote = true
      error = action.retry
      const sub = action.blocked === 'over-limit'
        ? 'One edit is over the 50,000 character limit. Shorten it, then send.'
        : syncState === 'offline'
          ? draftStatusLine('offline', isPhone)
          : 'Saved, not sent yet. Nothing reaches me until you send.'
      prog = action.retry
        ? <>
          <span className={styles.errText}>Your {action.count} {edits(action.count)} did not send. They are still saved here.</span>
          <span className={styles.sub} id={SUB_ID}>{sendError ?? 'The connection dropped before the portal confirmed.'}</span>
        </>
        : <><span className={styles.unsent}>{action.count} unsent {edits(action.count)}</span><span className={styles.sub} id={SUB_ID}>{sub}</span></>
      act = <>{noteLink}
        <Button as="button" type="button" variant="yellow" disabled={pending || action.blocked !== null} aria-describedby={SUB_ID} onClick={sendEdits}>
          {pending ? 'Sending…' : action.retry ? 'Retry'
            : action.additional ? `Send additional edits (${action.count})` : `Send my edits (${action.count})`}
        </Button></>
      break
    }
    case 'carried':
      prog = <><span className={styles.unsent}>{action.count} unsent {edits(action.count)}</span>
        <span className={styles.sub}>Written against the previous version. Keep, adjust or discard it in the text above.</span></>
      act = <Button as="button" type="button" variant="ghost" size="sm" onClick={onShowCarried}>Show me</Button>
      break
    case 'sent':
      prog = <><strong className={styles.progStrong}>Your edits are with me</strong>
        <span className={styles.sub}>I'll apply them and move the piece forward. Nothing else needed from you.</span></>
      act = pastLink
      break
    case 'revision':
      prog = <><strong className={styles.progStrong}>I&apos;m applying your edits</strong>
        <span className={styles.sub}>
          {sentSummary.dateLabel
            ? `You sent ${sentSummary.count} ${edits(sentSummary.count)} on ${sentSummary.dateLabel}. You'll see the final version here once it's applied. Editing is paused until then.`
            : 'You'll see the final version here once it's applied. Editing is paused until then.'}
        </span></>
      act = pastLink
      break
    case 'decided':
      prog = <><strong className={styles.progStrong}>{approvedLabel}</strong><span className={styles.sub}>Thank you. Nothing else needed from you.</span></>
      break
    case 'published':
      prog = <><strong className={styles.progStrong}>{postedLabel}</strong>
        <span className={styles.sub}>Need it taken down? Use Request removal in the menu at the top.</span></>
      break
    case 'incomplete':
      prog = <><strong className={styles.progStrong}>Still being put together</strong>
        <span className={styles.sub}>I still need to add: {action.missing.join(', ')}.</span></>
      break
    case 'decider-only':
      prog = <>{progress}<span className={styles.sub}>
        {canEdit ? 'Only Maria can approve this piece. You can still edit the text.' : 'Only Maria can approve this piece.'}
      </span></>
      break
  }

  const lift = inset > 0 ? { transform: `translateY(-${inset}px)` } : undefined
  return <>
    {noteOpen && allowsNote && <div className={styles.noteBox} style={lift}>
      <Textarea id="decision-note" label="Add a note (optional)" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
    </div>}
    <div className={`${styles.bar} ${error ? styles.barErr : ''}`} role="region" aria-label="Your review" style={lift}>
      <div className={styles.barIn}>
        <div className={styles.prog}>{prog}</div>
        {act && <div className={styles.act}>{act}</div>}
        {message && <p className={`${styles.barMessage} ${message.kind === 'error' ? styles.errText : styles.sub}`}
          role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      </div>
    </div>
  </>
}

'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@thedot/design-system'
import { replaceSegment, segmentBlock, segmentText, type SegmentMode } from '@/lib/portal/piece-page/segments'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

// One host opens every editor on the page (spec 2026-10-03 section 5). Plan 4a: a plain sheet.
// Plan 4b swaps the copy editor for the document editor and keeps this interface.

export type CopyEditRequest = {
  kind: 'copy'
  // The place on the page this edit belongs to, e.g. 'reel-script:frame:2'. Plan 4b edits in
  // place there on desktop; plan 4a always uses the sheet.
  slotId: string
  // A copy_block target whose currentText is the released block body.
  target: ReviewTarget
  title: string
  thumbUrl?: string | null
  // What the editor shows: one frame, one page, one section, or the whole block.
  initialText: string
  // The released text for this slot, for track changes (plan 4b).
  baseText: string
  // Turns the edited part back into the whole block body the draft stores. Used for a whole-block
  // edit only: with `segment` the host composes into the current draft body itself, so an edit
  // to one frame never overwrites another frame's unsent edit.
  compose: (text: string) => string
  // The one frame, page or section this edit covers, by its index in segmentBlock(body, mode).
  segment?: { mode: SegmentMode; index: number }
}
export type NoteRequest = { kind: 'note'; target: ReviewTarget; title: string; thumbUrl?: string | null }
export type EditorRequest = CopyEditRequest | NoteRequest

type EditorHostValue = { open: (request: EditorRequest) => void; mode: 'client' | 'preview' }
const EditorHostContext = createContext<EditorHostValue | null>(null)

function requestKey(request: EditorRequest): string {
  return `${request.kind}:${request.target.kind}:${request.target.key}:${request.target.anchor ?? ''}:${request.title}`
}

export default function EditorHost({ mode, children }: { mode: 'client' | 'preview'; children: React.ReactNode }) {
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const open = useCallback((next: EditorRequest) => {
    const active = typeof document === 'undefined' ? null : document.activeElement
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    setRequest(next)
  }, [])
  const close = useCallback(() => {
    setRequest(null)
    // Return focus to the opener explicitly; browsers differ on what a closed dialog restores.
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [])
  const value = useMemo(() => ({ open, mode }), [mode, open])
  return <EditorHostContext.Provider value={value}>
    {children}
    {request && <EditorSheet key={requestKey(request)} request={request} onClose={close} />}
  </EditorHostContext.Provider>
}

// Wraps the read view of one editable place. Plan 4a edits in a sheet, so it renders the read view;
// plan 4b renders the editor here, in place, on desktop.
export function EditSlot({ children }: { slotId: string; children: React.ReactNode }) {
  return <>{children}</>
}

export function useEditorHost(): EditorHostValue {
  const value = useContext(EditorHostContext)
  if (!value) throw new Error('Editors must be opened inside EditorHost')
  return value
}

function EditorSheet({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closedRef = useRef(false)
  const { readDraft, saveDraft, removeDraft, flush, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  // The whole block body as it stands now: the unsent draft when there is one, else the released
  // text. A segment edit opens on, and writes into, this body.
  const bodyRef = useRef<string | null>(null)
  if (bodyRef.current === null && request.kind === 'copy') {
    bodyRef.current = readDraft(request.target)?.proposedText ?? request.target.currentText ?? request.compose(request.initialText)
  }
  const [value, setValue] = useState(() => initialValue(request, readDraft(request.target)?.proposedText ?? null, bodyRef.current ?? ''))
  const [confirming, setConfirming] = useState(false)
  const hasDraft = readDraft(request.target) !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  function finish() {
    if (closedRef.current) return
    closedRef.current = true
    void flush()
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose()
  }

  function change(next: string) {
    setValue(next)
    if (request.kind === 'note') {
      saveDraft(request.target, next, null)
      return
    }
    const body = composeInto(request, bodyRef.current ?? '', next)
    bodyRef.current = body
    saveDraft(request.target, body, null)
  }

  function discard() {
    const released = request.kind === 'copy' ? request.target.currentText : undefined
    const draftBody = readDraft(request.target)?.proposedText
    if (request.kind === 'copy' && request.segment && released !== undefined && draftBody !== undefined) {
      // Discard this frame's change only: put the released segment back, keep every other edit.
      const restored = restoreSegment(draftBody, released, request.segment)
      if (restored !== null && restored.trim() !== released.trim()) {
        bodyRef.current = restored
        saveDraft(request.target, restored, null)
        finish()
        return
      }
    }
    removeDraft(request.target)
    finish()
  }

  const status = hasDraft
    ? draftStatusLine(syncState === 'idle' ? 'saved' : syncState, isPhone)
    : 'Your edits save as you type and stay unsent until you send them.'

  return <dialog ref={dialogRef} className={styles.editorSheet} aria-labelledby="editor-sheet-title"
    onCancel={(event) => { event.preventDefault(); finish() }} onClose={finish}>
    <div className={styles.sheetH}>
      {/* Signed, expiring storage links: next/image would cache and re-host them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {request.thumbUrl ? <img src={request.thumbUrl} alt="" /> : null}
      <h2 id="editor-sheet-title" className={styles.sheetTitle}>{request.title}</h2>
    </div>
    <div className={styles.sheetB}>
      <label className={styles.label} htmlFor="editor-sheet-text">
        {request.kind === 'copy' ? 'Text' : 'What should change?'}
      </label>
      <textarea id="editor-sheet-text" className={styles.plainEditor} value={value} autoFocus
        onChange={(event) => change(event.target.value)} onBlur={() => { void flush() }}
        placeholder={request.kind === 'note' ? 'Describe the change, for example: make the headline bigger' : undefined} />
    </div>
    <div className={styles.sheetT}>
      <span className={hasDraft ? styles.saved : styles.meta} role="status">{status}</span>
      {confirming
        ? <div className={styles.sheetActions}>
          <span>Discard this edit? It cannot be recovered.</span>
          <Button as="button" type="button" variant="black" size="sm" onClick={discard}>Yes, discard</Button>
          <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep editing</Button>
        </div>
        : <div className={styles.sheetActions}>
          {hasDraft && <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>}
          <Button as="button" type="button" variant="black" size="sm" onClick={finish}>Done</Button>
        </div>}
    </div>
  </dialog>
}

function segmentOf(body: string, segment: { mode: SegmentMode; index: number }): string | null {
  const found = segmentBlock(body, segment.mode).segments[segment.index]
  return found ? segmentText(found) : null
}

function initialValue(request: EditorRequest, draftText: string | null, body: string): string {
  if (request.kind === 'note') return draftText ?? ''
  if (draftText === null) return request.initialText
  if (!request.segment) return draftText
  // The draft no longer has this segment (its markers were edited): show the whole draft.
  return segmentOf(body, request.segment) ?? draftText
}

function composeInto(request: CopyEditRequest, body: string, text: string): string {
  if (!request.segment) return request.compose(text)
  if (segmentOf(body, request.segment) === null) return text
  return replaceSegment(body, request.segment.mode, request.segment.index, text)
}

function restoreSegment(draftBody: string, released: string, segment: { mode: SegmentMode; index: number }): string | null {
  const releasedSegment = segmentOf(released, segment)
  if (releasedSegment === null || segmentOf(draftBody, segment) === null) return null
  return replaceSegment(draftBody, segment.mode, segment.index, releasedSegment)
}

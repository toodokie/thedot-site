'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@thedot/design-system'
import DocumentEditor from '@/components/portal/editor/DocumentEditor'
import LengthCounter from '@/components/portal/editor/LengthCounter'
import { replaceSegment, segmentBlock, segmentText, type SegmentMode } from '@/lib/portal/piece-page/segments'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { useKeyboardInset, usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

// One host opens every editor on the page (spec 2026-10-03 section 5). Copy and structured-field
// editors open in place on a computer and full screen on a phone; visual notes open a small sheet.
// Every editor saves the whole block through plan 3's provider (autosave, never sent until Send).

export type CopyEditRequest = {
  kind: 'copy'
  // The place on the page this edit belongs to, e.g. 'reel-script:frame:2'. On a computer the
  // editor replaces the EditSlot with this id; with no such slot on the page it opens a sheet.
  slotId: string
  // A copy_block target whose currentText is the released block body.
  target: ReviewTarget
  title: string
  thumbUrl?: string | null
  // What the editor shows: one frame, one page, one section, or the whole block.
  initialText: string
  // The released text for this slot, for track changes.
  baseText: string
  // Turns the edited part back into the whole block body the draft stores. Used for a whole-block
  // edit only: with `segment` the host composes into the current draft body itself, so an edit
  // to one frame never overwrites another frame's unsent edit.
  compose: (text: string) => string
  // The one frame, page or section this edit covers, by its index in segmentBlock(body, mode).
  segment?: { mode: SegmentMode; index: number }
}
export type NoteRequest = { kind: 'note'; target: ReviewTarget; title: string; thumbUrl?: string | null }
// Structured fields (YouTube, chapters, search and sharing). The rendered form saves its own drafts.
export type FormRequest = {
  kind: 'form'
  slotId: string
  targets: ReviewTarget[]
  title: string
  thumbUrl?: string | null
  render: () => ReactNode
}
export type EditorRequest = CopyEditRequest | NoteRequest | FormRequest

type EditorHostValue = {
  open: (request: EditorRequest) => void
  close: () => void
  active: EditorRequest | null
  inline: boolean
  mode: 'client' | 'preview'
}
const EditorHostContext = createContext<EditorHostValue | null>(null)
// The EditSlots mounted on the page, so an edit with no place to open in falls back to a sheet.
const SlotRegistryContext = createContext<((slotId: string) => () => void) | null>(null)

function requestKey(request: EditorRequest): string {
  const place = request.kind === 'note'
    ? `${request.target.kind}:${request.target.key}:${request.target.anchor ?? ''}`
    : request.slotId
  return `${request.kind}:${place}:${request.title}`
}

export default function EditorHost({ mode, children }: { mode: 'client' | 'preview'; children: ReactNode }) {
  const isPhone = usePhone()
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const [slots, setSlots] = useState<ReadonlyMap<string, number>>(() => new Map())
  const openerRef = useRef<HTMLElement | null>(null)
  const open = useCallback((next: EditorRequest) => {
    const active = typeof document === 'undefined' ? null : document.activeElement
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    setRequest(next)
  }, [])
  const close = useCallback(() => {
    setRequest(null)
    // Return focus to the opener explicitly; browsers differ on what a closed dialog restores,
    // and an in-place editor leaves focus nowhere when it unmounts.
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [])
  const register = useCallback((slotId: string) => {
    setSlots((current) => new Map(current).set(slotId, (current.get(slotId) ?? 0) + 1))
    return () => setSlots((current) => {
      const next = new Map(current)
      const count = (next.get(slotId) ?? 0) - 1
      if (count > 0) next.set(slotId, count)
      else next.delete(slotId)
      return next
    })
  }, [])
  const placed = request !== null && request.kind !== 'note' && slots.has(request.slotId)
  const inline = !isPhone && placed
  const value = useMemo(() => ({ open, close, active: request, inline, mode }), [close, inline, mode, open, request])
  const inSheet = request !== null && !inline
  return <EditorHostContext.Provider value={value}>
    <SlotRegistryContext.Provider value={register}>
      {children}
      {inSheet && request && <EditorSheet key={requestKey(request)} request={request} onClose={close} />}
    </SlotRegistryContext.Provider>
  </EditorHostContext.Provider>
}

export function useEditorHost(): EditorHostValue {
  const value = useContext(EditorHostContext)
  if (!value) throw new Error('Editors must be opened inside EditorHost')
  return value
}

// On a computer, the editor replaces the read view of the slot being edited: same place, same size.
export function EditSlot({ slotId, children }: { slotId: string; children: ReactNode }) {
  const { active, inline, close } = useEditorHost()
  const register = useContext(SlotRegistryContext)
  useEffect(() => register?.(slotId), [register, slotId])
  if (!inline || active === null || active.kind === 'note' || active.slotId !== slotId) return <>{children}</>
  return <div className={styles.inlineEditor} data-editing-slot={slotId}
    onKeyDown={(event) => {
      // Escape is Done in place too, as it is in the sheet. Edits are already saved.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      close()
    }}>
    <EditorBody key={requestKey(active)} request={active} onDone={close} />
  </div>
}

function EditorBody({ request, onDone }: { request: CopyEditRequest | FormRequest; onDone: () => void }) {
  if (request.kind === 'form') return <EditorFrame targets={request.targets} onDone={onDone}>{request.render()}</EditorFrame>
  return <CopyEditor request={request} onDone={onDone} />
}

function CopyEditor({ request, onDone }: { request: CopyEditRequest; onDone: () => void }) {
  const { readDraft, saveDraft, removeDraft, flush } = useReviewDrafts()
  // The whole block body as it stands now: the unsent draft when there is one, else the released
  // text. A segment edit opens on, and writes into, this body. Opening never writes anything, so
  // released text is never stored over a draft; only her keystrokes save.
  const bodyRef = useRef<string | null>(null)
  if (bodyRef.current === null) {
    bodyRef.current = readDraft(request.target)?.proposedText ?? request.target.currentText ?? request.compose(request.initialText)
  }
  const [initial] = useState(() => initialValue(request, readDraft(request.target)?.proposedText ?? null, bodyRef.current ?? ''))
  const [composed, setComposed] = useState(bodyRef.current)

  // Leaving the page or the editor unmounting (navigation) flushes what she typed.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => { void flushRef.current() }, [])

  function change(text: string) {
    const body = composeInto(request, bodyRef.current ?? '', text)
    bodyRef.current = body
    setComposed(body)
    saveDraft(request.target, body, null)
  }

  function discard(): boolean {
    const released = request.target.currentText
    const draftBody = readDraft(request.target)?.proposedText
    if (request.segment && released !== undefined && draftBody !== undefined) {
      // Discard this frame's change only: put the released segment back, keep every other edit.
      const restored = restoreSegment(draftBody, released, request.segment)
      if (restored !== null && restored.trim() !== released.trim()) {
        bodyRef.current = restored
        saveDraft(request.target, restored, null)
        return true
      }
    }
    removeDraft(request.target)
    return true
  }

  return <EditorFrame targets={[request.target]} onDone={onDone} onDiscard={discard} extra={<LengthCounter text={composed} />}>
    <DocumentEditor label={request.title} value={initial} baseText={request.baseText} autoFocus
      onChange={change} onBlur={() => { void flush() }} />
  </EditorFrame>
}

function NoteEditor({ request, onDone }: { request: NoteRequest; onDone: () => void }) {
  const { readDraft, saveDraft, flush } = useReviewDrafts()
  const [value, setValue] = useState(() => readDraft(request.target)?.proposedText ?? '')
  return <EditorFrame targets={[request.target]} onDone={onDone}>
    <label className={styles.label} htmlFor="editor-note-text">What should change?</label>
    <textarea id="editor-note-text" className={styles.plainEditor} value={value} autoFocus
      placeholder="Describe the change, for example: make the headline bigger"
      onChange={(event) => { setValue(event.target.value); saveDraft(request.target, event.target.value, null) }}
      onBlur={() => { void flush() }} />
  </EditorFrame>
}

// Status, Discard (asks first) and Done, the same for every editor. Done only closes: edits are
// already saved, and nothing is sent until Send.
function EditorFrame({ targets, onDone, onDiscard, extra, children }: {
  targets: ReviewTarget[]
  onDone: () => void
  // Discards this editor's change; defaults to removing every target's draft.
  onDiscard?: () => boolean
  extra?: ReactNode
  children: ReactNode
}) {
  const { readDraft, removeDraft, flush, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  const [confirming, setConfirming] = useState(false)
  const hasDraft = targets.some((target) => readDraft(target) !== null)
  const status = hasDraft
    ? draftStatusLine(syncState === 'idle' ? 'saved' : syncState, isPhone)
    : 'Your edits save as you type and stay unsent until you send them.'
  function discard() {
    if (onDiscard) onDiscard()
    else for (const target of targets) removeDraft(target)
    void flush()
    onDone()
  }
  return <div className={styles.editorFrame}>
    <div className={styles.editorBody}>{children}</div>
    <div className={styles.sheetT}>
      <span className={hasDraft ? styles.saved : styles.meta} role="status">{status}</span>
      {extra}
      {confirming
        ? <div className={styles.sheetActions}>
          <span>Discard this edit? It cannot be recovered.</span>
          <Button as="button" type="button" variant="black" size="sm" onClick={discard}>Yes, discard</Button>
          <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep editing</Button>
        </div>
        : <div className={styles.sheetActions}>
          {hasDraft && <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>}
          <Button as="button" type="button" variant="black" size="sm" onClick={() => { void flush(); onDone() }}>Done</Button>
        </div>}
    </div>
  </div>
}

function EditorSheet({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closed = useRef(false)
  // The on-screen keyboard covers this much of the full-screen sheet; the toolbar sits above it.
  const inset = useKeyboardInset()
  const { flush } = useReviewDrafts()

  useEffect(() => {
    const dialog = dialogRef.current
    // showModal makes the rest of the page inert: focus stays inside the sheet until it closes.
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  function finish() {
    if (closed.current) return
    closed.current = true
    void flush()
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose()
  }

  return <dialog ref={dialogRef} className={`${styles.editorSheet} ${request.kind === 'note' ? styles.noteSheet : ''}`}
    aria-labelledby="editor-sheet-title"
    style={inset > 0 ? { paddingBottom: inset } : undefined}
    onCancel={(event) => { event.preventDefault(); finish() }} onClose={finish}>
    <div className={styles.sheetH}>
      {/* Signed, expiring storage links: next/image would cache and re-host them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {request.thumbUrl ? <img src={request.thumbUrl} alt="" /> : null}
      <h2 id="editor-sheet-title" className={styles.sheetTitle}>{request.title}</h2>
    </div>
    <div className={styles.sheetB}>
      {request.kind === 'note'
        ? <NoteEditor request={request} onDone={finish} />
        : <EditorBody request={request} onDone={finish} />}
    </div>
  </dialog>
}

function segmentOf(body: string, segment: { mode: SegmentMode; index: number }): string | null {
  const found = segmentBlock(body, segment.mode).segments[segment.index]
  return found ? segmentText(found) : null
}

function initialValue(request: CopyEditRequest, draftText: string | null, body: string): string {
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

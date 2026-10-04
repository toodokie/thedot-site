'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@thedot/design-system'
import DocumentEditor, { loadDocumentEditor } from '@/components/portal/editor/LazyDocumentEditor'
import LengthCounter from '@/components/portal/editor/LengthCounter'
import { segmentBlock, segmentText, type SegmentMode } from '@/lib/portal/piece-page/segments'
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
// While a copy editor is open, the block body as it stood when it opened. Panels lay the block out
// from this, so deleting a frame marker mid-edit never moves or unmounts the slot being edited.
type EditingLayout = { key: string; body: string }
const EditingLayoutContext = createContext<EditingLayout | null>(null)

export function useEditingLayout(): EditingLayout | null {
  return useContext(EditingLayoutContext)
}
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
  const { readDraft } = useReviewDrafts()
  // Fetch the document editor once the new piece page is up, so it is ready before she edits.
  useEffect(() => { void loadDocumentEditor().catch(() => { /* the plain box stands in */ }) }, [])
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const [layout, setLayout] = useState<EditingLayout | null>(null)
  const [slots, setSlots] = useState<ReadonlyMap<string, number>>(() => new Map())
  const openerRef = useRef<HTMLElement | null>(null)
  const open = useCallback((next: EditorRequest) => {
    const active = typeof document === 'undefined' ? null : document.activeElement
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    setLayout(next.kind === 'copy'
      ? { key: next.target.key, body: openingBody(next, readDraft(next.target)?.proposedText ?? null) }
      : null)
    setRequest(next)
  }, [readDraft])
  const close = useCallback(() => {
    setRequest(null)
    setLayout(null)
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
      <EditingLayoutContext.Provider value={layout}>
        {children}
        {inSheet && request && <EditorSheet key={requestKey(request)} request={request} onClose={close} />}
      </EditingLayoutContext.Provider>
    </SlotRegistryContext.Provider>
  </EditorHostContext.Provider>
}

const noop = () => {}

// Closes whatever editor is open; a no-op outside the host.
export function useCloseEditor(): () => void {
  return useContext(EditorHostContext)?.close ?? noop
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
  const layout = useEditingLayout()
  // Captured once, when the editor opens: the exact text before and after the part she edits, in
  // the current draft (or the released text when there is none). Every change is before + her
  // text + after; nothing is looked up by segment index again while the editor is open, so
  // deleting a frame marker can never move her text onto another frame. Opening writes nothing,
  // so released text is never stored over a draft; only her keystrokes save.
  const anchorRef = useRef<SegmentAnchor | null>(null)
  if (anchorRef.current === null) {
    const body = layout?.key === request.target.key ? layout.body : openingBody(request, readDraft(request.target)?.proposedText ?? null)
    anchorRef.current = anchorFor(request, body, readDraft(request.target) !== null)
  }
  const anchor = anchorRef.current
  const [initial] = useState(() => anchor.initial)
  const [composed, setComposed] = useState(anchor.before + anchor.piece + anchor.after)
  const [conflict, setConflict] = useState(false)
  // The newer draft as it arrived, and the text her part follows, once both versions are kept.
  const conflictRef = useRef<{ body: string; before: string } | null>(null)
  // The bodies this editor wrote last; a draft equal to one of them is still ours.
  const writtenRef = useRef<string[]>([anchor.before + anchor.piece + anchor.after])

  // The body as it stands in the provider now. When it is not one this editor wrote (another
  // device's draft arrived), find her part in it again; when it cannot be found, keep both texts:
  // the newer draft stays whole and her part follows it.
  function settle(): void {
    const draft = readDraft(request.target)
    const current = draft?.proposedText ?? request.target.currentText ?? ''
    if (writtenRef.current.some((body) => body === current || body.trim() === current.trim())) return
    if (draft === null && request.target.currentText !== undefined) {
      // Her draft is gone (sent, or discarded on another device): start again from the released
      // text, never "both versions kept", which would duplicate the block.
      restart(request.target.currentText)
      return
    }
    const found = locate(current, anchor)
    if (found) {
      anchor.before = found.before
      anchor.after = found.after
      return
    }
    // Both versions are kept: the newer draft exactly as it is, then her part.
    anchor.before = current.trim() === '' ? '' : `${current.replace(/\s+$/, '')}\n\n`
    anchor.after = ''
    conflictRef.current = { body: current, before: anchor.before }
    setConflict(true)
  }

  function restart(released: string) {
    const fresh = anchorFor(request, released, false)
    conflictRef.current = null
    setConflict(false)
    writtenRef.current = [released]
    if (anchor.mode !== 'segment') {
      // A whole-block or whole-draft edit: her text is the whole block.
      anchor.before = ''
      anchor.after = ''
      return
    }
    if (fresh.mode === 'segment') {
      Object.assign(anchor, { before: fresh.before, after: fresh.after, original: fresh.original,
        trailing: fresh.trailing, crlf: fresh.crlf, restore: fresh.restore })
      return
    }
    // The released text has no such part: keep it whole and put her part after it.
    anchor.before = released.trim() === '' ? '' : `${released.replace(/\s+$/, '')}\n\n`
    anchor.after = ''
  }

  function write(body: string) {
    writtenRef.current = [...writtenRef.current.slice(-4), body]
    setComposed(body)
    saveDraft(request.target, body, null)
  }

  function change(text: string) {
    settle()
    anchor.piece = pieceFor(anchor, text)
    write(anchor.before + anchor.piece + anchor.after)
  }

  function discard(): boolean {
    const released = request.target.currentText
    if (anchor.mode !== 'segment' || anchor.restore === null) {
      removeDraft(request.target)
      return true
    }
    settle()
    const kept = conflictRef.current
    if (kept) {
      // Both versions were kept: drop her part only and leave the newer draft exactly as it was.
      // Never put the released part back; the other device may have changed or removed it.
      write(anchor.before === kept.before && anchor.after === '' ? kept.body : anchor.before + anchor.after)
      return true
    }
    // Put back the released text of the part she opened; every other edit stays.
    const restored = anchor.before + anchor.restore + anchor.after
    if (released !== undefined && restored.trim() === released.trim()) removeDraft(request.target)
    else write(restored)
    return true
  }

  return <EditorFrame targets={[request.target]} onDone={onDone} onDiscard={discard} extra={<LengthCounter text={composed} />}>
    {conflict && <p className={styles.hint} role="status">
      This text also changed on another device. Both versions are kept in your draft. Remove the one you do not want.
    </p>}
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
  // Closing without Done (another editor opening, navigating away) still saves at once.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => { void flushRef.current() }, [])
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

// The whole block body when an editor opens: her unsent draft, else the released text.
function openingBody(request: CopyEditRequest, draftText: string | null): string {
  return draftText ?? request.target.currentText ?? request.compose(request.initialText)
}

type SegmentAnchor = {
  // 'segment': one frame, page or section, composed as before + her text + after. 'free': the
  // draft lost that segment's marker before the editor opened, so she edits the whole draft.
  // 'whole': a whole-block edit, composed through the caller.
  mode: 'segment' | 'free' | 'whole'
  // How the block is split into parts, for finding her part again; null unless mode is 'segment'.
  split: SegmentMode | null
  // Text before and after her part. Mutable while open: re-found when a newer draft arrives.
  before: string
  after: string
  // Her part as it stands in the body now, trailing blank lines included.
  piece: string
  // Her part as it was when the editor opened; writing it back is a no-op.
  original: string
  trailing: string
  crlf: boolean
  // What the editor shows first.
  initial: string
  // The released text of the part, for Discard; null when Discard removes the whole draft.
  restore: string | null
  compose: (text: string) => string
}

function anchorFor(request: CopyEditRequest, body: string, hasDraft: boolean): SegmentAnchor {
  const plain = { split: null, before: '', after: '', piece: body, original: body, trailing: '', crlf: false, restore: null, compose: request.compose }
  if (!request.segment) return { ...plain, mode: 'whole', initial: hasDraft ? body : request.initialText }
  const segmented = segmentBlock(body, request.segment.mode)
  const found = segmented.segments[request.segment.index]
  if (!found) return { ...plain, mode: 'free', initial: body }
  const start = segmented.preamble.length + segmented.segments.slice(0, found.index).reduce((sum, part) => sum + part.raw.length, 0)
  const released = request.target.currentText
  const releasedParts = released === undefined ? [] : segmentBlock(released, request.segment.mode).segments
  const releasedPart = releasedParts.length === segmented.segments.length ? releasedParts[found.index]?.raw ?? null : null
  return {
    mode: 'segment', split: request.segment.mode, before: body.slice(0, start), after: body.slice(start + found.raw.length), piece: found.raw,
    original: found.raw, trailing: /\s*$/.exec(found.raw)?.[0] ?? '', crlf: found.raw.includes('\r\n'),
    initial: segmentText(found), restore: releasedPart ?? found.raw, compose: request.compose,
  }
}

function pieceFor(anchor: SegmentAnchor, text: string): string {
  if (anchor.mode === 'whole') return anchor.compose(text)
  if (anchor.mode === 'free') return text
  const trimmed = text.replace(/\s+$/, '')
  // Writing the part's own text back is a no-op, whatever its line endings.
  if (trimmed === anchor.original.replace(/\s+$/, '')) return anchor.original
  let replacement = trimmed.replace(/\r\n?/g, '\n')
  // Editors hand back LF; a part written with CRLF keeps CRLF.
  if (anchor.crlf) replacement = replacement.replace(/\n/g, '\r\n')
  return replacement + anchor.trailing
}

// Finds her part in a body that changed underneath: the only place it appears as a whole part (from
// a part start to a part end, or the end of the body), or the one such place that keeps the text
// before or after it as captured. Null when it cannot be told apart.
function locate(body: string, anchor: SegmentAnchor): { before: string; after: string } | null {
  if (anchor.mode !== 'segment' || anchor.split === null) return null
  const segmented = segmentBlock(body, anchor.split)
  const starts = new Set<number>()
  const ends = new Set<number>([body.length])
  let offset = segmented.preamble.length
  for (const part of segmented.segments) {
    starts.add(offset)
    offset += part.raw.length
    ends.add(offset)
  }
  const whole = (index: number) => starts.has(index) && ends.has(index + anchor.piece.length)
  const at: number[] = []
  for (let index = body.indexOf(anchor.piece); index >= 0 && at.length < 50; index = body.indexOf(anchor.piece, index + 1)) {
    if (whole(index)) at.push(index)
    if (anchor.piece === '') break
  }
  const split = (index: number) => ({ before: body.slice(0, index), after: body.slice(index + anchor.piece.length) })
  if (at.length === 1 && anchor.piece !== '') return split(at[0])
  const matching = at.filter((index) => body.slice(0, index) === anchor.before || body.slice(index + anchor.piece.length) === anchor.after)
  return matching.length === 1 ? split(matching[0]) : null
}

'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react'
import { editDraftPiecePrefix } from '@/lib/portal/edit-drafts'
import { readLocalDrafts, removeLocalDraft, writeLocalDraft, type LocalScope } from '@/lib/portal/review-drafts-local'
import {
  DRAFT_AUTOSAVE_DELAY_MS, DRAFT_STATUS_TEXT, deriveSyncState, draftIdentity, localEntryToDraft,
  reconcileDrafts, serverRowToDraft, type DraftDiscardReason, type DraftIdentityParts,
  type DraftSyncState, type DraftTargetKind, type DurableDraft, type LocalDraftEntry, type ServerDraftRow,
} from '@/lib/portal/review-drafts-core'
import { discardReviewDraft, reportReviewSendFailure, saveReviewDraft, sendReviewDrafts } from '../../draft-actions'
import { sendReviewBundle } from '../../request-actions'

// Unsent review drafts (spec 2026-10-03 section 6). With serverSync on, every edit autosaves to the
// server a few seconds after typing stops and on blur, hide and reconnect; the browser copy is the
// offline buffer; the two are reconciled once per page load (newest wins, nothing silently lost).
// With serverSync off (the admin "View as Maria" preview), drafts stay in this browser as before.

export type ReviewTargetKind = DraftTargetKind
export type ReviewTarget = {
  kind: ReviewTargetKind
  key: string
  label: string
  currentText?: string
  urlSnapshot?: string | null
  // 'frame:3' or 'page:2' for a note on one frame or page of a visual; '' or absent otherwise.
  anchor?: string
  anchorLabel?: string | null
}
export type ReviewDraft = DurableDraft & { currentText?: string }
export type SendOutcome = { ok: boolean; message: string }

type PendingOp =
  | { op: 'save' }
  | { op: 'discard'; reason: DraftDiscardReason; savedAt: string; draft: DurableDraft }
type FailureReport = Parameters<typeof reportReviewSendFailure>[0]

type ReviewDraftContextValue = {
  drafts: ReviewDraft[]
  currentDrafts: ReviewDraft[]
  carriedDrafts: ReviewDraft[]
  readDraft: (target: ReviewTarget) => ReviewDraft | null
  saveDraft: (target: ReviewTarget, proposedText: string, quotedText?: string | null) => void
  removeDraft: (target: ReviewTarget) => void
  keepCarriedDraft: (draft: ReviewDraft) => void
  clearDrafts: () => void
  flush: () => Promise<boolean>
  send: (note: string) => Promise<SendOutcome>
  syncState: DraftSyncState
  statusText: string | null
  sendError: string | null
  serverSync: boolean
  storageAvailable: boolean
  ready: boolean
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null)

function nextSavedAt(previous?: string | null): string {
  const before = previous ? Date.parse(previous) : 0
  return new Date(Math.max(Date.now(), (Number.isNaN(before) ? 0 : before) + 1)).toISOString()
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// A failed autosave is retried on the next edit, on reconnect, on hide, and on its own after this
// pause, doubling each time, at most SAVE_RETRY_LIMIT times so a dead page cannot retry forever.
const SAVE_RETRY_DELAY_MS = 15000
const SAVE_RETRY_LIMIT = 5

function stamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

// Decision 6 as approved 2026-10-03: "this phone" on a touch device, "this device" on a desktop.
function isMobileDevice(): boolean {
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

function offlineLine(mobile: boolean): string {
  return mobile ? DRAFT_STATUS_TEXT.offline : DRAFT_STATUS_TEXT.offline.replace('this phone', 'this device')
}

// The portal refused the edit for good. Fixed wording: the server's own error text is never shown.
function rejectedLine(mobile: boolean): string {
  return `Couldn't save this edit to the portal. It is still on ${mobile ? 'this phone' : 'this device'}.`
}

export default function ReviewDraftProvider({
  children,
  draftScope,
  slug,
  contentId,
  version,
  serverSync = false,
  initialServerDrafts = null,
}: {
  children: React.ReactNode
  draftScope: string
  slug: string
  contentId: string
  version: number
  serverSync?: boolean
  initialServerDrafts?: ServerDraftRow[] | null
}) {
  const storeRef = useRef<Record<string, ReviewDraft>>({})
  const targetsRef = useRef<Record<string, ReviewTarget>>({})
  const pendingRef = useRef<Map<string, PendingOp>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const sendKeyRef = useRef<string | null>(null)
  const failureReportRef = useRef<FailureReport | null>(null)
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => Promise<boolean>>(async () => true)
  const mountedRef = useRef(true)
  const retryAttemptRef = useRef(0)
  // Targets whose last save the portal refused for good. Kept here, not retried on a timer.
  const rejectedRef = useRef<Set<string>>(new Set())
  const [revision, bump] = useReducer((count: number) => count + 1, 0)
  const [pendingCount, setPendingCount] = useState(0)
  const [inFlight, setInFlight] = useState(false)
  const [online, setOnline] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [ready, setReady] = useState(false)

  const scope = useMemo<LocalScope>(() => ({ scope: draftScope, slug, contentId }), [contentId, draftScope, slug])
  const piecePrefix = useMemo(() => editDraftPiecePrefix(draftScope, slug, contentId), [contentId, draftScope, slug])

  const withStorage = useCallback((write: (storage: Storage) => void) => {
    try { write(window.localStorage) } catch { setStorageAvailable(false) }
  }, [])

  const putDraft = useCallback((draft: ReviewDraft) => {
    storeRef.current = { ...storeRef.current, [draftIdentity(draft)]: draft }
    withStorage((storage) => writeLocalDraft(storage, scope, draft))
    bump()
  }, [scope, withStorage])

  const dropDraft = useCallback((draft: DraftIdentityParts) => {
    const next = { ...storeRef.current }
    delete next[draftIdentity(draft)]
    storeRef.current = next
    withStorage((storage) => removeLocalDraft(storage, piecePrefix, draft))
    bump()
  }, [piecePrefix, withStorage])

  const pushOne = useCallback(async (id: string, op: PendingOp): Promise<'ok' | 'retry' | 'give_up'> => {
    try {
      if (op.op === 'discard') {
        const result = await discardReviewDraft({
          slug, contentId, targetKind: op.draft.kind, targetKey: op.draft.key, anchor: op.draft.anchor,
          reason: op.reason, savedAt: op.savedAt,
        })
        if ('error' in result) return result.retryable ? 'retry' : 'give_up'
        if (result.outcome === 'stale' && result.draft) {
          const local = storeRef.current[id]
          // Another device saved newer text after this one was discarded: newest wins, it comes back.
          // Text she typed here since the discard is newer still: keep it and make sure it is saved.
          if (!local || stamp(result.draft.saved_at) > stamp(local.savedAt)) {
            putDraft(serverRowToDraft(result.draft, version))
          } else if (!pendingRef.current.has(id)) {
            pendingRef.current.set(id, { op: 'save' })
          }
        }
        return 'ok'
      }
      const draft = storeRef.current[id]
      if (!draft) return 'ok'
      const result = await saveReviewDraft({
        slug, contentId, baseVersion: draft.baseVersion, targetKind: draft.kind, targetKey: draft.key,
        anchor: draft.anchor, anchorLabel: draft.anchorLabel, targetLabel: draft.label,
        urlSnapshot: draft.urlSnapshot, quotedText: draft.quotedText, body: draft.proposedText,
        savedAt: draft.savedAt,
      })
      if ('error' in result) return result.retryable ? 'retry' : 'give_up'
      if (!result.draft) return 'retry'
      const latest = storeRef.current[id]
      // Discarded while this save was in flight: the queued discard settles it. Never write it back.
      if (!latest) return 'ok'
      if (result.outcome === 'stale') {
        if (latest.savedAt !== draft.savedAt && stamp(result.draft.saved_at) <= stamp(latest.savedAt)) {
          // She typed again while this save was in flight and her text is newer than the server's.
          if (!pendingRef.current.has(id)) pendingRef.current.set(id, { op: 'save' })
          return 'ok'
        }
        putDraft(serverRowToDraft(result.draft, version))
        return 'ok'
      }
      if (latest.savedAt !== draft.savedAt) {
        // She typed again while this save was in flight. Her newer text is already queued.
        storeRef.current = { ...storeRef.current, [id]: { ...latest, serverId: result.draft.id } }
        return 'ok'
      }
      putDraft({
        ...latest,
        serverId: result.draft.id,
        syncedAt: draft.savedAt,
        baseVersion: result.draft.base_version,
        carriedFromVersion: result.draft.base_version < version ? result.draft.base_version : null,
        sendFailedAt: result.draft.send_failed_at,
      })
      return 'ok'
    } catch {
      return 'retry'
    }
  }, [contentId, putDraft, slug, version])

  const flush = useCallback(async (): Promise<boolean> => {
    if (!serverSync) return true
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    // Wait out every run, including one a concurrent flush starts meanwhile, so true means settled.
    while (inFlightRef.current) await inFlightRef.current
    if (!pendingRef.current.size) return true
    if (!isOnline()) { setOnline(false); return false }
    const run = (async () => {
      let ok = true
      while (ok && pendingRef.current.size) {
        const batch = [...pendingRef.current.entries()]
        pendingRef.current.clear()
        setPendingCount(0)
        for (const [id, op] of batch) {
          const outcome = await pushOne(id, op)
          if (outcome === 'retry' && !pendingRef.current.has(id)) pendingRef.current.set(id, op)
          if (op.op === 'save') {
            if (outcome === 'give_up') rejectedRef.current.add(id)
            else if (outcome === 'ok') rejectedRef.current.delete(id)
          }
          if (outcome !== 'ok') ok = false
        }
        setPendingCount(pendingRef.current.size)
      }
      return ok
    })()
    inFlightRef.current = run
    setInFlight(true)
    let ok = false
    try {
      ok = await run
      return ok
    } finally {
      inFlightRef.current = null
      setInFlight(false)
      // A failed server save keeps the draft in memory and in the browser buffer, and says so.
      setSaveFailed(!ok)
      bump()
      if (ok) retryAttemptRef.current = 0
      else if (mountedRef.current && pendingRef.current.size && !timerRef.current
          && retryAttemptRef.current < SAVE_RETRY_LIMIT) {
        const delay = SAVE_RETRY_DELAY_MS * 2 ** retryAttemptRef.current
        retryAttemptRef.current += 1
        timerRef.current = setTimeout(() => { timerRef.current = null; void flushRef.current() }, delay)
      }
    }
  }, [pushOne, serverSync])
  useEffect(() => { flushRef.current = flush }, [flush])

  const schedule = useCallback(() => {
    if (!serverSync) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; void flush() }, DRAFT_AUTOSAVE_DELAY_MS)
  }, [flush, serverSync])

  const markPending = useCallback((id: string, op: PendingOp) => {
    // Any change to the drafts makes a new send: a retry may reuse its key only if nothing changed.
    sendKeyRef.current = null
    if (!serverSync) return
    retryAttemptRef.current = 0
    pendingRef.current.set(id, op)
    setPendingCount(pendingRef.current.size)
    schedule()
  }, [schedule, serverSync])

  const discardInternal = useCallback((target: DraftIdentityParts, reason: DraftDiscardReason) => {
    const id = draftIdentity(target)
    const existing = storeRef.current[id]
    if (!existing) return
    dropDraft(existing)
    markPending(id, { op: 'discard', reason, savedAt: existing.savedAt, draft: existing })
  }, [dropDraft, markPending])

  const saveDraft = useCallback((target: ReviewTarget, proposedText: string, quotedText?: string | null) => {
    const anchor = target.anchor ?? ''
    const id = draftIdentity({ kind: target.kind, key: target.key, anchor })
    targetsRef.current[id] = target
    const trimmed = proposedText.trim()
    if (!trimmed || (target.kind === 'copy_block' && anchor === '' && trimmed === target.currentText?.trim())) {
      discardInternal({ kind: target.kind, key: target.key, anchor }, trimmed ? 'reverted' : 'emptied')
      return
    }
    const existing = storeRef.current[id]
    putDraft({
      kind: target.kind,
      key: target.key,
      anchor,
      anchorLabel: target.anchorLabel ?? existing?.anchorLabel ?? null,
      label: target.label,
      urlSnapshot: target.urlSnapshot ?? null,
      currentText: target.currentText,
      proposedText,
      quotedText: quotedText ?? null,
      // Editing a carried draft is the "adjust" in spec 6.2: it now belongs to this version.
      baseVersion: version,
      carriedFromVersion: null,
      savedAt: nextSavedAt(existing?.savedAt),
      serverId: existing?.serverId ?? null,
      syncedAt: existing?.syncedAt ?? null,
      sendFailedAt: existing?.sendFailedAt ?? null,
    })
    markPending(id, { op: 'save' })
  }, [discardInternal, markPending, putDraft, version])

  const removeDraft = useCallback((target: ReviewTarget) => {
    // The caller has already asked Maria to confirm (spec 6.1).
    discardInternal({ kind: target.kind, key: target.key, anchor: target.anchor ?? '' }, 'client_discarded')
  }, [discardInternal])

  const keepCarriedDraft = useCallback((draft: ReviewDraft) => {
    const target = targetsRef.current[draftIdentity(draft)]
    saveDraft({
      kind: draft.kind, key: draft.key, label: target?.label ?? draft.label, currentText: target?.currentText,
      urlSnapshot: target?.urlSnapshot ?? draft.urlSnapshot, anchor: draft.anchor, anchorLabel: draft.anchorLabel,
    }, draft.proposedText, draft.quotedText)
  }, [saveDraft])

  const clearDrafts = useCallback(() => {
    for (const draft of Object.values(storeRef.current)) dropDraft(draft)
  }, [dropDraft])

  const readDraft = useCallback((target: ReviewTarget): ReviewDraft | null => {
    const id = draftIdentity({ kind: target.kind, key: target.key, anchor: target.anchor ?? '' })
    targetsRef.current[id] = target
    const draft = storeRef.current[id]
    return draft ? { ...draft, label: target.label, currentText: target.currentText } : null
    // `revision` gives readers a new function whenever the store changes, so restore effects rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  const deliverFailureReport = useCallback(async () => {
    const report = failureReportRef.current
    if (!report) return
    if (reportTimerRef.current) { clearTimeout(reportTimerRef.current); reportTimerRef.current = null }
    let retry = true
    try {
      const result = await reportReviewSendFailure(report)
      // Written down, or refused for good (the seat cannot submit edits): stop either way.
      if (!result || result.recorded || !result.retryable) retry = false
    } catch {
      // The report itself did not arrive: keep it and try again.
    }
    if (failureReportRef.current !== report) return
    if (!retry) { failureReportRef.current = null; return }
    // Same schedule as a failed save. Offline, it also goes again when the connection returns.
    reportTimerRef.current = setTimeout(() => {
      reportTimerRef.current = null
      if (isOnline()) void deliverFailureReportRef.current()
    }, SAVE_RETRY_DELAY_MS)
  }, [])
  const deliverFailureReportRef = useRef(deliverFailureReport)
  useEffect(() => { deliverFailureReportRef.current = deliverFailureReport }, [deliverFailureReport])

  const send = useCallback(async (note: string): Promise<SendOutcome> => {
    const isCurrent = (draft: ReviewDraft) => draft.baseVersion === version
    if (!Object.values(storeRef.current).some(isCurrent)) {
      return { ok: false, message: 'Add at least one edit before sending.' }
    }
    if (!serverSync) {
      const current = Object.values(storeRef.current).filter(isCurrent)
      const key = sendKeyRef.current ?? (sendKeyRef.current = crypto.randomUUID())
      const result = await sendReviewBundle({
        slug, contentId, contentVersion: version, note, idempotencyKey: key,
        drafts: current.map((draft) => ({
          targetKind: draft.kind, targetKey: draft.key, targetLabel: draft.label,
          proposedText: draft.proposedText, urlSnapshot: draft.urlSnapshot,
        })),
      })
      if (result.error) {
        setSendError(result.error)
        return { ok: false, message: result.error }
      }
      for (const draft of current) dropDraft(draft)
      sendKeyRef.current = null
      setSendError(null)
      return { ok: true, message: result.success ?? 'Your edits were sent to The Dot.' }
    }

    const flushed = await flush()
    const current = Object.values(storeRef.current).filter(isCurrent)
    const fail = (message: string, report: boolean): SendOutcome => {
      const stamp = new Date().toISOString()
      const next = { ...storeRef.current }
      for (const draft of current) next[draftIdentity(draft)] = { ...draft, sendFailedAt: stamp }
      storeRef.current = next
      bump()
      setSendError(message)
      if (report) {
        failureReportRef.current = {
          slug, contentId, contentVersion: version,
          draftIds: current.flatMap((draft) => (draft.serverId ? [draft.serverId] : [])),
          drafts: current.map((draft) => ({
            targetKind: draft.kind, targetKey: draft.key, targetLabel: draft.label, proposedText: draft.proposedText,
          })),
        }
        if (isOnline()) void deliverFailureReport()
      }
      return { ok: false, message }
    }
    if (!flushed || current.some((draft) => !draft.serverId || draft.syncedAt !== draft.savedAt)) {
      return fail(isOnline() ? DRAFT_STATUS_TEXT.send_failed : offlineLine(mobile), true)
    }
    const key = sendKeyRef.current ?? (sendKeyRef.current = crypto.randomUUID())
    let result: Awaited<ReturnType<typeof sendReviewDrafts>>
    try {
      result = await sendReviewDrafts({
        slug, contentId, contentVersion: version, note, idempotencyKey: key,
        draftIds: current.map((draft) => draft.serverId as string),
      })
    } catch {
      return fail(DRAFT_STATUS_TEXT.send_failed, true)
    }
    // The server action has already written a refusal down; the browser does not report it again.
    if (result.error) return fail(result.error, false)
    for (const draft of current) {
      const id = draftIdentity(draft)
      const latest = storeRef.current[id]
      if (!latest) continue
      if (latest.savedAt === draft.savedAt) { dropDraft(draft); continue }
      // She typed again while the send was in flight: that newer text is a new unsent draft.
      putDraft({ ...latest, serverId: null, syncedAt: null, sendFailedAt: null })
      if (!pendingRef.current.has(id)) markPending(id, { op: 'save' })
    }
    sendKeyRef.current = null
    setSendError(null)
    return { ok: true, message: result.success ?? 'Your edits were sent to The Dot.' }
  }, [contentId, deliverFailureReport, dropDraft, flush, markPending, mobile, putDraft, serverSync, slug, version])

  // Reconcile the browser buffer with the server once per page load.
  useEffect(() => {
    let entries: LocalDraftEntry[] = []
    try { entries = readLocalDrafts(window.localStorage, piecePrefix) } catch { setStorageAvailable(false) }
    if (!serverSync) {
      storeRef.current = Object.fromEntries(entries.filter((entry) => entry.version === version).map((entry) => {
        const draft = localEntryToDraft(entry, version)
        return [draftIdentity(draft), draft]
      }))
    } else {
      const result = reconcileDrafts(entries, initialServerDrafts ?? [], version)
      storeRef.current = result.drafts
      withStorage((storage) => {
        for (const gone of result.dropLocal) removeLocalDraft(storage, piecePrefix, gone)
        for (const draft of Object.values(result.drafts)) writeLocalDraft(storage, scope, draft)
      })
      for (const id of result.push) pendingRef.current.set(id, { op: 'save' })
      setPendingCount(pendingRef.current.size)
      if (pendingRef.current.size) schedule()
    }
    bump()
    setReady(true)
    // Mount only: the server snapshot and the browser buffer are reconciled once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!serverSync) return
    setOnline(isOnline())
    setMobile(isMobileDevice())
    const goOnline = () => { retryAttemptRef.current = 0; setOnline(true); void flush(); void deliverFailureReport() }
    const goOffline = () => setOnline(false)
    const hide = () => { if (document.visibilityState === 'hidden') void flush() }
    const leave = () => { void flush() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leave)
    }
  }, [deliverFailureReport, flush, serverSync])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      if (reportTimerRef.current) { clearTimeout(reportTimerRef.current); reportTimerRef.current = null }
      // Best effort: the browser copy already holds every edit; this tries to get them to the server too.
      void flushRef.current()
    }
  }, [])

  const drafts = useMemo(() => Object.values(storeRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision])
  const rejected = useMemo(() => [...rejectedRef.current].some((id) => storeRef.current[id] !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision])
  const currentDrafts = useMemo(() => drafts.filter((draft) => draft.baseVersion === version), [drafts, version])
  const carriedDrafts = useMemo(() => drafts.filter((draft) => draft.baseVersion < version), [drafts, version])
  const derived = deriveSyncState({
    draftCount: drafts.length, pending: pendingCount, inFlight, online, sendFailed: sendError !== null,
  })
  // The server refused or never answered an autosave: the text is safe here, not yet there.
  const syncState: DraftSyncState = (rejected || saveFailed) && !inFlight && drafts.length > 0
    && derived !== 'send_failed' ? 'offline' : derived
  const statusText = !serverSync || syncState === 'idle' ? null
    : syncState === 'offline' ? (rejected ? rejectedLine(mobile) : offlineLine(mobile))
      : DRAFT_STATUS_TEXT[syncState]

  const value = useMemo<ReviewDraftContextValue>(() => ({
    drafts, currentDrafts, carriedDrafts, readDraft, saveDraft, removeDraft, keepCarriedDraft, clearDrafts,
    flush, send, syncState, statusText, sendError, serverSync, storageAvailable, ready,
  }), [carriedDrafts, clearDrafts, currentDrafts, drafts, flush, keepCarriedDraft, readDraft, ready, removeDraft,
    saveDraft, send, sendError, serverSync, statusText, storageAvailable, syncState])

  return <ReviewDraftContext.Provider value={value}>{children}</ReviewDraftContext.Provider>
}

export function useReviewDrafts(): ReviewDraftContextValue {
  const value = useContext(ReviewDraftContext)
  if (!value) throw new Error('Review edit controls must be inside ReviewDraftProvider')
  return value
}

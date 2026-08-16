'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { editDraftKey } from '@/lib/portal/edit-drafts'

export type ReviewTargetKind = 'copy_block' | 'asset' | 'design_link'
export type ReviewTarget = {
  kind: ReviewTargetKind
  key: string
  label: string
  currentText?: string
  urlSnapshot?: string | null
}
export type ReviewDraft = ReviewTarget & { proposedText: string; quotedText?: string | null }

type ReviewDraftContextValue = {
  drafts: ReviewDraft[]
  readDraft: (target: ReviewTarget) => ReviewDraft | null
  saveDraft: (target: ReviewTarget, proposedText: string, quotedText?: string | null) => void
  removeDraft: (target: ReviewTarget) => void
  clearDrafts: () => void
  storageAvailable: boolean
  ready: boolean
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null)

function identity(target: Pick<ReviewTarget, 'kind' | 'key'>): string {
  return `${target.kind}:${target.key}`
}

export default function ReviewDraftProvider({
  children,
  draftScope,
  slug,
  contentId,
  version,
}: {
  children: React.ReactNode
  draftScope: string
  slug: string
  contentId: string
  version: number
}) {
  const [draftsByTarget, setDraftsByTarget] = useState<Record<string, ReviewDraft>>({})
  const [loadedTargets, setLoadedTargets] = useState<Set<string>>(() => new Set())
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [ready, setReady] = useState(false)

  // Child edit controls restore their target-specific drafts in the same effect
  // pass. The verdict waits for this parent effect so approval never flashes
  // before saved browser edits are known.
  useEffect(() => setReady(true), [])

  const storageKey = useCallback((target: ReviewTarget) => editDraftKey(
    draftScope, slug, contentId, version, target.kind, target.key,
  ), [contentId, draftScope, slug, version])

  const loadTarget = useCallback((target: ReviewTarget) => {
    const id = identity(target)
    if (loadedTargets.has(id)) return
    setLoadedTargets((current) => new Set(current).add(id))
    try {
      const raw = window.localStorage.getItem(storageKey(target))
      if (!raw) return
      const stored = JSON.parse(raw) as { proposedText?: unknown; quotedText?: unknown }
      if (typeof stored.proposedText !== 'string' || !stored.proposedText.trim()) return
      const proposedText = stored.proposedText
      setDraftsByTarget((current) => ({
        ...current,
        [id]: {
          ...target,
          proposedText,
          quotedText: typeof stored.quotedText === 'string' ? stored.quotedText : null,
        },
      }))
    } catch {
      setStorageAvailable(false)
    }
  }, [loadedTargets, storageKey])

  const readDraft = useCallback((target: ReviewTarget) => {
    loadTarget(target)
    return draftsByTarget[identity(target)] ?? null
  }, [draftsByTarget, loadTarget])

  const removeDraft = useCallback((target: ReviewTarget) => {
    const id = identity(target)
    setDraftsByTarget((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    try { window.localStorage.removeItem(storageKey(target)) } catch { setStorageAvailable(false) }
  }, [storageKey])

  const saveDraft = useCallback((target: ReviewTarget, proposedText: string, quotedText?: string | null) => {
    const normalized = proposedText
    if (!normalized.trim() || (target.kind === 'copy_block' && normalized.trim() === target.currentText?.trim())) {
      removeDraft(target)
      return
    }
    const draft: ReviewDraft = { ...target, proposedText: normalized, quotedText: quotedText ?? null }
    setDraftsByTarget((current) => ({ ...current, [identity(target)]: draft }))
    try {
      window.localStorage.setItem(storageKey(target), JSON.stringify({
        proposedText: normalized,
        quotedText: quotedText ?? null,
      }))
    } catch {
      setStorageAvailable(false)
    }
  }, [removeDraft, storageKey])

  const clearDrafts = useCallback(() => {
    const drafts = Object.values(draftsByTarget)
    setDraftsByTarget({})
    for (const draft of drafts) {
      try { window.localStorage.removeItem(storageKey(draft)) } catch { setStorageAvailable(false) }
    }
  }, [draftsByTarget, storageKey])

  const value = useMemo<ReviewDraftContextValue>(() => ({
    drafts: Object.values(draftsByTarget), readDraft, saveDraft, removeDraft, clearDrafts,
    storageAvailable, ready,
  }), [clearDrafts, draftsByTarget, readDraft, ready, removeDraft, saveDraft, storageAvailable])

  return <ReviewDraftContext.Provider value={value}>{children}</ReviewDraftContext.Provider>
}

export function useReviewDrafts(): ReviewDraftContextValue {
  const value = useContext(ReviewDraftContext)
  if (!value) throw new Error('Review edit controls must be inside ReviewDraftProvider')
  return value
}

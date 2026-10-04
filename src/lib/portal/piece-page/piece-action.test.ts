import { describe, expect, it } from 'vitest'
import { resolvePieceAction, type PieceActionInput } from './piece-action'

const clean: PieceActionInput = {
  isPublished: false, state: 'needs_review', revisionStarted: false, currentDraftCount: 0, carriedDraftCount: 0,
  sentUnresolvedCount: 0, packageReady: true, missing: [], canDecide: true, tabsTotal: 3, tabsTicked: 3,
  untickedLabels: [], mediaPending: false, sendFailed: false, overLimit: false,
}

describe('resolvePieceAction keeps the contract order', () => {
  it('approves a clean, complete, fully reviewed package', () => {
    expect(resolvePieceAction(clean)).toEqual({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] })
  })

  it('1. published beats everything', () => {
    expect(resolvePieceAction({ ...clean, isPublished: true, currentDraftCount: 2, revisionStarted: true }).kind).toBe('published')
  })

  it('2. revision started hides send and approve', () => {
    expect(resolvePieceAction({ ...clean, revisionStarted: true, currentDraftCount: 2 }).kind).toBe('revision')
  })

  it('3. unsent drafts mean Send, additional when sent edits exist, retry after a failure', () => {
    expect(resolvePieceAction({ ...clean, currentDraftCount: 2 })).toEqual({ kind: 'send', count: 2, additional: false, retry: false, blocked: null })
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, sentUnresolvedCount: 1, sendFailed: true }))
      .toEqual({ kind: 'send', count: 1, additional: true, retry: true, blocked: null })
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, overLimit: true })).toMatchObject({ blocked: 'over-limit' })
  })

  it('3. drafts can be sent while the package is incomplete', () => {
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, packageReady: false }).kind).toBe('send')
  })

  it('carried drafts block approve until kept or discarded', () => {
    expect(resolvePieceAction({ ...clean, carriedDraftCount: 1 })).toEqual({ kind: 'carried', count: 1 })
    expect(resolvePieceAction({ ...clean, carriedDraftCount: 1, currentDraftCount: 1 }).kind).toBe('send')
  })

  it('4. sent edits without new drafts show status only', () => {
    expect(resolvePieceAction({ ...clean, sentUnresolvedCount: 2 })).toEqual({ kind: 'sent', count: 2 })
  })

  it('a decided piece never reads as awaiting review', () => {
    for (const state of ['approved', 'scheduled', 'partially_scheduled', 'schedule_failed', 'reschedule_pending', 'cancel_pending', 'publish_failed'] as const) {
      expect(resolvePieceAction({ ...clean, state }).kind).toBe('decided')
    }
    expect(resolvePieceAction({ ...clean, state: 'with_dot' }).kind).toBe('none')
  })

  it('5. an incomplete package has no action', () => {
    expect(resolvePieceAction({ ...clean, packageReady: false, missing: ['website cover'] }))
      .toEqual({ kind: 'incomplete', missing: ['website cover'] })
  })

  it('only a deciding seat sees Approve', () => {
    expect(resolvePieceAction({ ...clean, canDecide: false }).kind).toBe('decider-only')
  })

  it('6. approve waits for every tab, then for the media', () => {
    expect(resolvePieceAction({ ...clean, tabsTicked: 2, untickedLabels: ['YouTube'] }))
      .toEqual({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['YouTube'] })
    expect(resolvePieceAction({ ...clean, mediaPending: true }))
      .toEqual({ kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] })
  })
})

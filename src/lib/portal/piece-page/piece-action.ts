// The single derived action for the decision bar (2026-08-14 contract section 4.1, spec
// 2026-10-03 sections 4.3, 4.6, 4.7). At most one action. Order:
//   published > revision started > unsent drafts (Send) > carried drafts > sent edits (status)
//   > decided (one-review rule) > package incomplete > non-decider > Approve.
// Ticks and media only ever make Approve stricter; they never add an action.
import type { ClientState } from '@/lib/portal/state'

export type PieceActionInput = {
  isPublished: boolean
  state: ClientState
  revisionStarted: boolean
  currentDraftCount: number
  carriedDraftCount: number
  sentUnresolvedCount: number
  packageReady: boolean
  missing: string[]
  canDecide: boolean
  tabsTotal: number
  tabsTicked: number
  untickedLabels: string[]
  mediaPending: boolean
  sendFailed: boolean
  overLimit: boolean
}

export type PieceAction =
  | { kind: 'published' }
  | { kind: 'revision' }
  | { kind: 'send'; count: number; additional: boolean; retry: boolean; blocked: 'over-limit' | null }
  | { kind: 'carried'; count: number }
  | { kind: 'sent'; count: number }
  | { kind: 'decided' }
  | { kind: 'none' }
  | { kind: 'incomplete'; missing: string[] }
  | { kind: 'decider-only' }
  | { kind: 'approve'; enabled: boolean; reason: 'ticks' | 'media' | null; untickedLabels: string[] }

export const DECIDED_STATES: ReadonlySet<ClientState> = new Set<ClientState>([
  'approved', 'partially_scheduled', 'schedule_failed', 'scheduled', 'reschedule_pending', 'cancel_pending',
  'publish_failed',
])

export function resolvePieceAction(input: PieceActionInput): PieceAction {
  if (input.isPublished) return { kind: 'published' }
  if (input.revisionStarted) return { kind: 'revision' }
  if (input.currentDraftCount > 0) {
    return {
      kind: 'send',
      count: input.currentDraftCount,
      additional: input.sentUnresolvedCount > 0,
      retry: input.sendFailed,
      blocked: input.overLimit ? 'over-limit' : null,
    }
  }
  if (input.carriedDraftCount > 0) return { kind: 'carried', count: input.carriedDraftCount }
  if (input.sentUnresolvedCount > 0) return { kind: 'sent', count: input.sentUnresolvedCount }
  if (input.state !== 'needs_review') return DECIDED_STATES.has(input.state) ? { kind: 'decided' } : { kind: 'none' }
  if (!input.packageReady) return { kind: 'incomplete', missing: input.missing }
  if (!input.canDecide) return { kind: 'decider-only' }
  if (input.tabsTicked < input.tabsTotal) {
    return { kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: input.untickedLabels }
  }
  if (input.mediaPending) return { kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] }
  return { kind: 'approve', enabled: true, reason: null, untickedLabels: [] }
}

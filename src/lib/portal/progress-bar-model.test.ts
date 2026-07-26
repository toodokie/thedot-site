import { describe, expect, it } from 'vitest'
import { agencyProgress, clientProgress, type ClientProgressInput } from './progress-bar-model'
import type { StagePiece, ProductionGateRow } from './gates'

const gate = (
  key: ProductionGateRow['gate_key'],
  state: ProductionGateRow['state'],
  overrides: Partial<ProductionGateRow> = {},
): ProductionGateRow => ({
  gate_key: key, state, owner_label: 'anastasia',
  occurred_at: state === 'done' ? '2026-07-20T12:00:00Z' : null,
  note: null, na_reason: state === 'na' ? 'not applicable' : null, ...overrides,
})

const piece = (overrides: Partial<StagePiece> = {}): StagePiece => ({
  clientId: 'client-kanset', clientName: 'Kanset',
  contentId: 'kanset-2026-07-test-piece', title: 'Test piece', status: 'draft',
  factCheck: 'confirmed', factCheckExempt: false, currentDecision: null,
  ideaDecision: null, ideaDecisionSource: null, ideaDecisionNote: null,
  approvalSentAt: null, ideaApprovalSentAt: null, platforms: ['instagram', 'facebook'], archived: false,
  gates: [], dests: [], workingVersion: 1, ...overrides,
})

const dest = (destination: string, overrides: Partial<StagePiece['dests'][number]> = {}) => ({
  destination, scheduleStatus: null, publicationStatus: null, verified: false,
  scheduledAt: null, liveUrl: null, ...overrides,
})

const node = (model: ReturnType<typeof agencyProgress>, key: string) =>
  model.nodes.find((n) => n.key === key)!

describe('agencyProgress', () => {
  it('starts a versionless selected piece at Copy drafted before its first approval cycle', () => {
    const model = agencyProgress(piece({ workingVersion: null, status: 'idea' }))
    expect(node(model, 'idea-created').state).toBe('done')
    expect(node(model, 'copy-drafted').state).toBe('current')
    expect(node(model, 'idea-approval-sent').state).toBe('upcoming')
    expect(node(model, 'idea-approved').state).toBe('upcoming')
    expect(node(model, 'fact-check').state).toBe('upcoming')
  })
  it('moves an approved versionless idea to copy drafting', () => {
    const model = agencyProgress(piece({
      workingVersion: null, status: 'idea', ideaDecision: 'approved', ideaDecisionSource: 'piece',
    }))
    expect(node(model, 'idea-approved').state).toBe('done')
    expect(node(model, 'copy-drafted').state).toBe('current')
  })
  it('marks the first genuine open gate as current, earlier gates done, later gates upcoming', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true,
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'open')],
    }))
    expect(node(model, 'fact-check').state).toBe('done')
    expect(node(model, 'source-in-hand').state).toBe('done')
    expect(node(model, 'design-built').state).toBe('current')
    // only ONE current node
    expect(model.nodes.filter((n) => n.state === 'current')).toHaveLength(1)
    expect(node(model, 'copy-approved').state).toBe('upcoming')
  })

  it('holds production and final approval behind an unresolved idea approval', () => {
    const model = agencyProgress(piece({
      ideaApprovalSentAt: '2026-07-26T12:00:00Z', factCheckValid: true,
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'), gate('proofed', 'done')],
    }))
    expect(node(model, 'idea-approval-sent').state).toBe('done')
    expect(node(model, 'idea-approved').state).toBe('current')
    expect(node(model, 'copy-approved').state).toBe('upcoming')
    expect(model.nodes.filter((n) => n.state === 'current')).toHaveLength(1)
  })

  it('shows final copy and design approval separately after idea approval', () => {
    const model = agencyProgress(piece({
      ideaDecision: 'approved', ideaDecisionSource: 'piece',
      ideaApprovalSentAt: '2026-07-26T12:00:00Z', factCheckValid: true,
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'done')],
    }))
    expect(node(model, 'idea-approved').state).toBe('done')
    expect(node(model, 'approval-sent').label).toBe('Final copy + design sent')
    expect(node(model, 'copy-approved').label).toBe('Final copy + design approved')
    expect(node(model, 'copy-approved').state).toBe('current')
  })

  it('renders an absent production gate as na (untracked), never as current or blocked', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true, currentDecision: 'approved',
      // source_in_hand omitted -> absent -> na; the rest present + done
      gates: [gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'done')],
    }))
    expect(node(model, 'source-in-hand').state).toBe('na')
  })

  it('splits a per-destination gate: scheduled on IG but not FB is current with per-platform detail', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true, currentDecision: 'approved',
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
      dests: [dest('instagram', { scheduleStatus: 'scheduled' }), dest('facebook')],
    }))
    const scheduled = node(model, 'scheduled')
    expect(scheduled.state).toBe('current')
    expect(scheduled.perPlatform).toEqual([
      { destination: 'instagram', state: 'done' },
      { destination: 'facebook', state: 'upcoming' },
    ])
  })

  it('is fully done when every gate is satisfied and every destination is link-confirmed', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true, currentDecision: 'approved',
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
      dests: [dest('instagram', { scheduleStatus: 'scheduled', publicationStatus: 'live', verified: true }),
        dest('facebook', { scheduleStatus: 'scheduled', publicationStatus: 'live', verified: true })],
    }))
    expect(model.nodes.every((n) => n.state === 'done')).toBe(true)
    expect(model.nodes.some((n) => n.state === 'current')).toBe(false)
  })

  it('overlays a changes_requested exception on the Approved node without inventing a stage', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true, currentDecision: 'change_requested',
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
    }))
    expect(node(model, 'copy-approved').exception?.kind).toBe('changes_requested')
    // 2 lifecycle entry nodes + 9 operational gates. Per-platform detail is nested.
    expect(model.nodes).toHaveLength(11)
  })

  it('overlays a failed exception on the Scheduled node when a destination reports failed', () => {
    const model = agencyProgress(piece({
      factCheck: 'confirmed', factCheckValid: true, currentDecision: 'approved',
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
      dests: [dest('instagram', { scheduleStatus: 'failed' }), dest('facebook', { scheduleStatus: 'scheduled' })],
    }))
    expect(node(model, 'scheduled').exception?.kind).toBe('failed')
  })

  it('returns a terminal state for archived pieces that overrides progression', () => {
    expect(agencyProgress(piece({ archived: true })).terminal).toEqual({ kind: 'archived', label: 'Archived' })
  })

  it('distinguishes legacy_verified from legacy_unverified in the terminal label', () => {
    expect(agencyProgress(piece({ legacy: { classification: 'legacy_verified' } })).terminal?.kind)
      .toBe('legacy_verified')
    expect(agencyProgress(piece({ legacy: { classification: 'legacy_unverified' } })).terminal?.label)
      .toContain('not portal-verified')
  })
})

const cInput = (clientState: string, overrides: Partial<ClientProgressInput> = {}): ClientProgressInput =>
  ({ clientState, scheduleTargets: [], publicationTargets: [], ...overrides })
const nodeC = (model: ReturnType<typeof clientProgress>, key: string) => model.nodes.find((n) => n.key === key)!

describe('clientProgress', () => {
  it('collapses the five production steps into one "In production" node and never leaks a gate', () => {
    const m = clientProgress(cInput('with_dot'))
    expect(m.nodes).toHaveLength(5)
    expect(nodeC(m, 'in-production').state).toBe('current')
    expect(m.nodes.some((n) => ['fact-check', 'source-in-hand', 'design-built', 'proofed', 'approval-sent'].includes(n.key))).toBe(false)
  })

  it('needs_review makes "Your review" the current step', () => {
    const m = clientProgress(cInput('needs_review'))
    expect(nodeC(m, 'in-production').state).toBe('done')
    expect(nodeC(m, 'your-review').state).toBe('current')
  })

  it('approved marks approval done and scheduling current', () => {
    const m = clientProgress(cInput('approved'))
    expect(nodeC(m, 'approved').state).toBe('done')
    expect(nodeC(m, 'scheduled').state).toBe('current')
  })

  it('live shows every stage done', () => {
    expect(clientProgress(cInput('live')).nodes.every((n) => n.state === 'done')).toBe(true)
  })

  it('splits Scheduled per platform on a partial schedule', () => {
    const m = clientProgress(cInput('partially_scheduled', {
      scheduleTargets: [{ destination: 'instagram', status: 'scheduled' }, { destination: 'youtube', status: 'pending' }],
    }))
    expect(nodeC(m, 'scheduled').state).toBe('current')
    expect(nodeC(m, 'scheduled').perPlatform).toEqual([
      { destination: 'instagram', state: 'done' }, { destination: 'youtube', state: 'upcoming' },
    ])
  })

  it('overlays a failed exception on the current node', () => {
    expect(nodeC(clientProgress(cInput('schedule_failed')), 'scheduled').exception?.kind).toBe('failed')
  })

  it('archived is terminal', () => {
    expect(clientProgress(cInput('archived')).terminal?.kind).toBe('archived')
  })
})

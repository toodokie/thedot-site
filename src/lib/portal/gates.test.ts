import { describe, expect, it } from 'vitest'
import {
  deriveContentStage, deriveMyTasks, renderStatusGatesBlock, resolveNineGates,
  businessDaysBetween, type StagePiece, type ProductionGateRow,
} from './gates'

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
  contentId: 'kanset-2026-07-test-piece', title: 'Test piece', status: 'draft',
  factCheck: 'confirmed', factCheckExempt: false, currentDecision: null,
  approvalSentAt: null, platforms: ['instagram', 'facebook'], archived: false,
  gates: [], dests: [], ...overrides,
})

const dest = (destination: string, overrides: Partial<StagePiece['dests'][number]> = {}) => ({
  destination, scheduleStatus: null, publicationStatus: null, verified: false,
  scheduledAt: null, liveUrl: null, ...overrides,
})

// Every branch of the spec 4.1 priority derivation.
describe('deriveContentStage', () => {
  it('1: done when every required destination is link-confirmed', () => {
    const result = deriveContentStage(piece({
      dests: [dest('instagram', { publicationStatus: 'live', verified: true }),
        dest('facebook', { publicationStatus: 'live', verified: true })],
    }))
    expect(result.stage).toBe('done')
  })

  it('2: posted_unverified when any destination is live without confirmation', () => {
    const result = deriveContentStage(piece({
      dests: [dest('instagram', { publicationStatus: 'live', verified: true }),
        dest('facebook', { publicationStatus: 'live', verified: false })],
    }))
    expect(result.stage).toBe('posted_unverified')
    expect(result.label).toContain('facebook')
  })

  it('3: scheduled vs scheduled_partial, with divergent destinations in the label', () => {
    const full = deriveContentStage(piece({
      dests: [dest('instagram', { scheduleStatus: 'scheduled' }),
        dest('facebook', { scheduleStatus: 'scheduled' })],
    }))
    expect(full.stage).toBe('scheduled')
    const partial = deriveContentStage(piece({
      platforms: ['instagram', 'facebook', 'youtube'],
      dests: [dest('instagram', { scheduleStatus: 'scheduled' }),
        dest('facebook', { scheduleStatus: 'scheduled' })],
    }))
    expect(partial.stage).toBe('scheduled_partial')
    expect(partial.label).toContain('instagram, facebook')
    expect(partial.label).toContain('youtube pending')
  })

  it('4: approved requires the decision AND design_built + proofed satisfied', () => {
    const result = deriveContentStage(piece({
      currentDecision: 'approved',
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
    }))
    expect(result.stage).toBe('approved')
  })

  it('5: the H&C shape: a decision with open production gates is direction_approved', () => {
    const result = deriveContentStage(piece({
      currentDecision: 'approved',
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'open'),
        gate('proofed', 'open'), gate('approval_sent', 'open')],
    }))
    expect(result.stage).toBe('direction_approved')
  })

  it('5b: a piece with NO gate rows derives approved from the decision alone (podcast lane)', () => {
    const result = deriveContentStage(piece({ currentDecision: 'approved' }))
    expect(result.stage).toBe('approved')
  })

  it('6: awaiting_decision when the ask is out and no decision exists', () => {
    const result = deriveContentStage(piece({
      gates: [gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'done')],
    }))
    expect(result.stage).toBe('awaiting_decision')
  })

  it('7: in_production subdivides by the first open gate, incl. waiting on studio', () => {
    const studio = deriveContentStage(piece({
      gates: [gate('source_in_hand', 'open', { owner_label: 'studio' })],
    }))
    expect(studio.stage).toBe('in_production')
    expect(studio.label).toBe('waiting on studio')
    const design = deriveContentStage(piece({
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'open')],
    }))
    expect(design.label).toBe('needs design')
    const proof = deriveContentStage(piece({
      gates: [gate('design_built', 'done'), gate('proofed', 'open')],
    }))
    expect(proof.label).toBe('needs proof')
  })

  it('8: draft when nothing else applies', () => {
    expect(deriveContentStage(piece()).stage).toBe('draft')
  })
})

describe('deriveMyTasks', () => {
  it('surfaces the first open gate in canonical order with the open-gate count', () => {
    // platforms empty so gates 7-9 add no lines: open = design/proofed/approval + copy
    const tasks = deriveMyTasks([piece({
      platforms: [],
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'open'),
        gate('proofed', 'open'), gate('approval_sent', 'open')],
    })], [], '2026-07-21')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'action', gate: 'design-built', moreOpen: 3 })
  })

  it('routes an out-for-approval piece to Waiting-on-Maria and flags nudge at 2 business days', () => {
    const base = piece({
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'done'),
        gate('proofed', 'done'),
        gate('approval_sent', 'done', { occurred_at: '2026-07-16T12:00:00Z' })],
    })
    // Thu Jul 16 -> Tue Jul 21 = 3 business days
    const stale = deriveMyTasks([base], [], '2026-07-21')
    expect(stale[0]).toMatchObject({ kind: 'waiting_maria', daysWaiting: 3, nudge: true })
    // Thu Jul 16 -> Fri Jul 17 = 1 business day: no nudge yet
    const fresh = deriveMyTasks([base], [], '2026-07-17')
    expect(fresh[0]).toMatchObject({ kind: 'waiting_maria', daysWaiting: 1, nudge: false })
  })

  it('routes an open studio source gate to Waiting-on-studio', () => {
    const tasks = deriveMyTasks([piece({
      gates: [gate('source_in_hand', 'open', { owner_label: 'studio', note: 'ep3 cut' })],
    })], [], '2026-07-21')
    expect(tasks[0]).toMatchObject({ kind: 'waiting_studio', note: 'ep3 cut' })
  })

  it('skips archived pieces and pieces with no tracked open gates', () => {
    const archived = piece({ archived: true, gates: [gate('design_built', 'open')] })
    const untracked = piece({ currentDecision: 'approved', factCheckExempt: true,
      platforms: [], gates: [] })
    expect(deriveMyTasks([archived, untracked], [], '2026-07-21')).toHaveLength(0)
  })

  it('buckets ops tasks: overdue, today, this week, upcoming, watch', () => {
    const tasks = deriveMyTasks([], [
      { id: '1', title: 'Chase invoice', category: 'invoice', due_date: '2026-07-20', trigger_note: null, status: 'open' },
      { id: '2', title: 'Send plan', category: 'plan', due_date: '2026-07-21', trigger_note: null, status: 'open' },
      { id: '3', title: 'Podcast revisit', category: 'revisit', due_date: '2026-07-24', trigger_note: null, status: 'open' },
      { id: '4', title: 'Next month kickoff', category: 'plan', due_date: '2026-09-01', trigger_note: null, status: 'open' },
      { id: '5', title: '500 reviews watch', category: 'watch', due_date: null, trigger_note: 'fires at 500', status: 'open' },
      { id: '6', title: 'Done thing', category: 'admin', due_date: null, trigger_note: null, status: 'done' },
    ], '2026-07-21')
    const buckets = tasks.map((task) => (task.kind === 'ops' ? task.bucket : null))
    expect(buckets).toEqual(['overdue', 'today', 'this_week', 'upcoming', 'watch'])
  })
})

describe('businessDaysBetween', () => {
  it('counts weekdays only', () => {
    expect(businessDaysBetween('2026-07-16', '2026-07-21')).toBe(3) // Thu->Tue skips the weekend
    expect(businessDaysBetween('2026-07-20', '2026-07-21')).toBe(1)
    expect(businessDaysBetween('2026-07-21', '2026-07-21')).toBe(0)
  })
})

describe('renderStatusGatesBlock (my-tasks spec section 5 grammar)', () => {
  const sample = piece({
    contentId: 'kanset-2026-07-askkanset-ep3-move-provinces',
    platforms: ['instagram', 'facebook', 'youtube'],
    gates: [
      gate('source_in_hand', 'done', { owner_label: 'studio', occurred_at: '2026-07-15T12:00:00Z', note: 'Set 1 Clip 3 + brief (Drive)' }),
      gate('design_built', 'open', { note: 'Canva cover from cover-brief-askkanset-ep3.md' }),
      gate('proofed', 'open'),
      gate('approval_sent', 'open'),
    ],
    dests: [dest('instagram'), dest('facebook'), dest('youtube')],
  })

  it('renders the exact line grammar with per-destination 7-9 lines', () => {
    const block = renderStatusGatesBlock(sample, '2026-07-21T10:00:00Z')
    const lines = block.split('\n')
    expect(lines[0]).toBe('## STATUS GATES')
    expect(lines[1]).toBe('<!-- gates: id=kanset-2026-07-askkanset-ep3-move-provinces date=2026-07-21 -->')
    expect(lines[2]).toBe('- [x] fact-check @anastasia | confirmed')
    expect(lines[3]).toBe('- [x] source-in-hand @studio 2026-07-15 | Set 1 Clip 3 + brief (Drive)')
    expect(lines[4]).toBe('- [ ] design-built @anastasia | Canva cover from cover-brief-askkanset-ep3.md')
    expect(block).toContain('- [ ] scheduled:instagram @anastasia')
    expect(block).toContain('- [ ] scheduled:facebook @anastasia')
    expect(block).toContain('- [ ] link-confirmed:youtube @anastasia')
  })

  it('renders [~] with the reason as the note', () => {
    const naPiece = piece({ platforms: [], gates: [
      gate('source_in_hand', 'na', { na_reason: 'not studio-sourced' }),
    ] })
    expect(renderStatusGatesBlock(naPiece, '2026-07-21'))
      .toContain('- [~] source-in-hand @anastasia | not studio-sourced')
  })

  it('splits diverged destinations rather than letting one line vouch for all', () => {
    const diverged = piece({
      dests: [dest('instagram', { scheduleStatus: 'scheduled', scheduledAt: '2026-07-22T23:00:00Z' }),
        dest('facebook')],
    })
    const block = renderStatusGatesBlock(diverged, '2026-07-21')
    expect(block).toContain('- [x] scheduled:instagram @anastasia 2026-07-22')
    expect(block).toContain('- [ ] scheduled:facebook @anastasia')
  })
})

describe('resolveNineGates', () => {
  it('marks untracked production gates absent instead of inventing obligations', () => {
    const resolved = resolveNineGates(piece({ platforms: [] }))
    const source = resolved.find((row) => row.key === 'source-in-hand')
    expect(source?.present).toBe(false)
    expect(source?.state).toBe('open')
  })
})

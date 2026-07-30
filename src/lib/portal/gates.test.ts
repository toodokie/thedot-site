import { describe, expect, it } from 'vitest'
import {
  deriveContentStage, deriveMyTasks, renderStatusGatesBlock, resolveNineGates,
  businessDaysBetween, canonicalScheduleDestination, canonicalDestinations,
  selectCurrentDecision, type StagePiece, type ProductionGateRow,
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

// Every branch of the spec 4.1 priority derivation.
describe('deriveContentStage', () => {
  it('keeps a hydrated submitted idea in the idea-approval stage', () => {
    expect(deriveContentStage(piece({
      ideaApprovalSentAt: '2026-07-26T12:00:00Z', factCheckValid: true,
      currentDecision: null,
    }))).toEqual({ stage: 'awaiting_idea_approval', label: 'awaiting idea approval' })
  })
  it('0: a durable identity without version 1 is an idea', () => {
    expect(deriveContentStage(piece({ workingVersion: null, status: 'idea' }))).toEqual({
      stage: 'idea',
      label: 'idea',
    })
  })
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

  it('treats a courtesy release as an agency policy, never as a client approval or a Maria task', () => {
    const courtesy = piece({
      reviewMode: 'courtesy',
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
    })
    expect(deriveContentStage(courtesy)).toEqual({
      stage: 'courtesy_released', label: 'courtesy release (no client approval required)',
    })
    const approvalGate = resolveNineGates(courtesy).find((row) => row.key === 'copy-approved')
    expect(approvalGate).toMatchObject({ state: 'na', owner: 'agency' })
    expect(deriveMyTasks([courtesy], [], '2026-07-30')).not.toContainEqual(
      expect.objectContaining({ kind: 'waiting_maria' }),
    )
  })

  // Codex round-2 fix A: absent gate rows must NOT force direction_approved; only a
  // PRESENT-and-open design_built/proofed/approval_sent does.
  it('5c: approved decision + only a PARTIAL gate set (proofed done, no design row) -> approved', () => {
    const result = deriveContentStage(piece({
      currentDecision: 'approved',
      gates: [gate('source_in_hand', 'na'), gate('proofed', 'done')],
    }))
    expect(result.stage).toBe('approved') // design_built absent is non-blocking, not unsatisfied
  })

  it('5d: approved decision + a present-open proofed row -> direction_approved', () => {
    const result = deriveContentStage(piece({
      currentDecision: 'approved',
      gates: [gate('design_built', 'done'), gate('proofed', 'open')],
    }))
    expect(result.stage).toBe('direction_approved')
  })

  it('5e: approved decision + an open approval_sent row -> direction_approved (old check missed this)', () => {
    const result = deriveContentStage(piece({
      currentDecision: 'approved',
      gates: [gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'open')],
    }))
    expect(result.stage).toBe('direction_approved')
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

  it('uses explicit terminal states instead of presenting archived or legacy pieces as done', () => {
    expect(deriveContentStage(piece({ archived: true })).stage).toBe('archived')
    expect(deriveContentStage(piece({ legacy: { classification: 'legacy_unverified' } })).stage).toBe('legacy')
    expect(deriveContentStage(piece({ legacy: { classification: 'legacy_verified' } })).label)
      .toBe('posted (legacy, verified)')
  })

  it('surfaces unsupported platform mappings instead of silently stalling', () => {
    expect(deriveContentStage(piece({ platforms: [], exceptions: [{ kind: 'unsupported_destination', note: 'tiktok' }] })).stage)
      .toBe('needs_platform_mapping')
  })
})

describe('deriveMyTasks', () => {
  it('does not manufacture production tasks for a versionless idea', () => {
    expect(deriveMyTasks([piece({ workingVersion: null, status: 'idea' })], [], '2026-07-21')).toEqual([])
  })
  it('routes a hydrated submitted idea to idea approval, not final copy approval', () => {
    const tasks = deriveMyTasks([piece({
      ideaApprovalSentAt: '2026-07-26T12:00:00Z',
      gates: [gate('source_in_hand', 'done'), gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'done')],
    })], [], '2026-07-26')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'action', gate: 'idea-approved' })
  })
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
    const ops = (over: Partial<import('./gates').OpsTaskRow>): import('./gates').OpsTaskRow => ({
      id: 'x', clientId: 'client-kanset', clientName: 'Kanset', title: 't', category: 'admin',
      due_date: null, trigger_note: null, status: 'open', ...over,
    })
    const tasks = deriveMyTasks([], [
      ops({ id: '1', title: 'Chase invoice', category: 'invoice', due_date: '2026-07-20' }),
      ops({ id: '2', title: 'Send plan', category: 'plan', due_date: '2026-07-21' }),
      ops({ id: '3', title: 'Podcast revisit', category: 'revisit', due_date: '2026-07-24' }),
      ops({ id: '4', title: 'Next month kickoff', category: 'plan', due_date: '2026-09-01' }),
      ops({ id: '5', title: '500 reviews watch', category: 'watch', trigger_note: 'fires at 500' }),
      ops({ id: '6', title: 'Done thing', status: 'done' }),
    ], '2026-07-21')
    const buckets = tasks.map((task) => (task.kind === 'ops' ? task.bucket : null))
    expect(buckets).toEqual(['overdue', 'today', 'this_week', 'upcoming', 'watch'])
  })

  it("an agency-global ops task (null client) is labelled 'Agency' in its derived row", () => {
    // the admin resolves clientName='Agency' for a null client_id before deriveMyTasks;
    // this asserts the label rides through the derivation to the render
    const tasks = deriveMyTasks([], [
      { id: 'g', clientId: null, clientName: 'Agency', title: 'Renew domain',
        category: 'admin', due_date: '2026-07-21', trigger_note: null, status: 'open' },
    ], '2026-07-21')
    expect(tasks[0]).toMatchObject({ kind: 'ops', clientName: 'Agency' })
  })

  it('a fully-posted but unverified piece is link-confirm bookkeeping, not an action', () => {
    // posted on every platform, none verified -> only link-confirmed is open; it must NOT
    // read as an action (that flooded My Tasks with posted history) but as link_pending.
    const posted = piece({
      currentDecision: 'approved', factCheckExempt: true,
      gates: [gate('source_in_hand', 'na'), gate('design_built', 'done'),
        gate('proofed', 'done'), gate('approval_sent', 'done')],
      platforms: ['instagram', 'facebook'],
      dests: [dest('instagram', { publicationStatus: 'live', verified: false }),
        dest('facebook', { publicationStatus: 'live', verified: false })],
    })
    const tasks = deriveMyTasks([posted], [], '2026-07-21')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'link_pending', dest: 'instagram' })
  })

  it('a live destination never surfaces a stale scheduled action (posting supersedes scheduling)', () => {
    const live = piece({ platforms: ['instagram'],
      dests: [dest('instagram', { publicationStatus: 'live', verified: false })] })
    const scheduled = resolveNineGates(live).find((g) => g.key === 'scheduled' && g.dest === 'instagram')
    expect(scheduled?.state).toBe('done')
    // and My Tasks never emits a scheduled:instagram action for it
    const tasks = deriveMyTasks([live], [], '2026-07-21')
    expect(tasks.some((t) => t.kind === 'action' && t.gate === 'scheduled')).toBe(false)
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

// Contract test for the admin loader input shape (Codex ruling 2): a StagePiece with
// exactly the fields loadAgencyStagePieces produces (working-version title/platforms,
// latest decision, gate rows, dest states) flows through all three derivations without
// throwing. Guards against a loader/engine drift where the admin feeds a shape the
// derivations do not accept.
describe('admin input-shape contract', () => {
  const loaderShaped: StagePiece = {
    clientId: 'client-kanset', clientName: 'Kanset',
    contentId: 'kanset-2026-07-askkanset-ep3-move-provinces',
    title: 'Ask Kanset: moving provinces',
    status: 'draft', // unreleased piece: the loader still stages it (BLOCKER 1)
    factCheck: 'confirmed', factCheckExempt: false,
    currentDecision: null, ideaDecision: null, ideaDecisionSource: null,
    ideaDecisionNote: null, ideaApprovalSentAt: null, approvalSentAt: null,
    platforms: ['instagram', 'facebook', 'youtube'], archived: false,
    gates: [
      gate('source_in_hand', 'done', { owner_label: 'studio', occurred_at: '2026-07-15T16:00:00Z', note: 'Set 1 Clip 3' }),
      gate('design_built', 'open', { note: 'cover to build' }),
      gate('proofed', 'open'),
      gate('approval_sent', 'open'),
    ],
    dests: [dest('instagram'), dest('facebook'), dest('youtube')],
  }

  it('an unreleased loader-shaped piece derives, stages, tasks, and renders without throwing', () => {
    expect(() => deriveContentStage(loaderShaped)).not.toThrow()
    expect(deriveContentStage(loaderShaped).stage).toBe('in_production')
    const tasks = deriveMyTasks([loaderShaped], [], '2026-07-21')
    expect(tasks[0]).toMatchObject({ kind: 'action', gate: 'design-built' })
    expect(renderStatusGatesBlock(loaderShaped, '2026-07-21')).toContain('## STATUS GATES')
  })
})

// Codex round-3 blocker: the loader must canonicalize raw frontmatter platforms to the
// SAME destination vocabulary the schedule/publication targets are stored under
// (portal_schedule_destination in 0008), or a complete youtube_shorts / website / blog
// destination reads as unscheduled.
describe('canonicalScheduleDestination (mirror of the SQL mapping)', () => {
  it('maps every alias Codex named, and passes instagram/facebook through', () => {
    const cases: Array<[string, string]> = [
      ['instagram', 'instagram'],
      ['facebook', 'facebook'],
      ['youtube', 'youtube'],
      ['youtube_shorts', 'youtube'],
      ['youtube-shorts', 'youtube'],
      ['youtube shorts', 'youtube'],
      ['YouTube Shorts', 'youtube'], // case + trim insensitive, like lower(btrim())
      ['  facebook  ', 'facebook'],
      ['website', 'squarespace'],
      ['blog', 'squarespace'],
      ['squarespace', 'squarespace'],
      ['other', 'other'],
    ]
    for (const [raw, expected] of cases) {
      expect(canonicalScheduleDestination(raw)).toBe(expected)
    }
  })

  it('collapses aliases that map to the same destination, preserving order', () => {
    expect(canonicalDestinations(['instagram', 'facebook', 'youtube_shorts']))
      .toEqual(['instagram', 'facebook', 'youtube'])
    // youtube + youtube_shorts collapse to a single youtube destination (SQL DISTINCT)
    expect(canonicalDestinations(['youtube', 'youtube-shorts'])).toEqual(['youtube'])
    expect(canonicalDestinations(['website', 'blog'])).toEqual(['squarespace'])
  })

  it('a youtube_shorts piece matches a stored youtube target (the blocker, end to end)', () => {
    // BEFORE the fix this piece read as scheduled-partial: platforms=[youtube_shorts]
    // never matched the youtube schedule target. Now platforms canonicalize to youtube.
    const p = piece({
      platforms: canonicalDestinations(['instagram', 'youtube_shorts']),
      dests: [dest('instagram', { scheduleStatus: 'scheduled' }),
        dest('youtube', { scheduleStatus: 'scheduled' })],
    })
    expect(p.platforms).toEqual(['instagram', 'youtube'])
    expect(deriveContentStage(p).stage).toBe('scheduled')
  })

  // Codex round-4 blocker: an UNKNOWN platform returns null (like the SQL), never a
  // passthrough, so it can never invent a phantom destination the SQL would not schedule.
  it('an unsupported platform canonicalizes to null, not a passthrough', () => {
    expect(canonicalScheduleDestination('tiktok')).toBeNull()
    expect(canonicalScheduleDestination('linkedin')).toBeNull()
    expect(canonicalScheduleDestination('!!garbage!!')).toBeNull()
    expect(canonicalScheduleDestination('')).toBeNull()
  })

  it('canonicalDestinations drops unknown platforms (zero phantom destinations)', () => {
    expect(canonicalDestinations(['tiktok'])).toEqual([])
    expect(canonicalDestinations(['!!garbage!!', 'nowhere'])).toEqual([])
    // supported survive, unsupported drop, order + distinctness preserved
    expect(canonicalDestinations(['instagram', 'tiktok', 'youtube_shorts', 'linkedin']))
      .toEqual(['instagram', 'youtube'])
  })

  it('a piece whose platforms canonicalize to an empty set derives + tasks without crashing', () => {
    // tiktok-only piece: no supported destinations, so no per-destination gates 7-9. The
    // stage derives from decision/production gates alone; My Tasks surfaces the open
    // production gate, never a phantom "scheduled:tiktok".
    const p = piece({
      platforms: canonicalDestinations(['tiktok']),
      gates: [gate('design_built', 'open')],
    })
    expect(p.platforms).toEqual([])
    expect(() => deriveContentStage(p)).not.toThrow()
    expect(deriveContentStage(p).stage).toBe('in_production')
    const tasks = deriveMyTasks([p], [], '2026-07-21')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'action', gate: 'design-built' })
    // no scheduled/posted/link-confirmed lines exist for a destinationless piece
    const nine = resolveNineGates(p)
    expect(nine.some((g) => g.dest !== null)).toBe(false)
  })
})

// Codex round-3 fix 2: piece-derived tasks carry the tenant so composite keys never
// collide across clients that share a content_id.
describe('my_tasks carry tenant identity', () => {
  it('action / waiting_maria / waiting_studio all carry clientId + clientName', () => {
    const action = deriveMyTasks([piece({ platforms: [],
      gates: [gate('design_built', 'open')] })], [], '2026-07-21')[0]
    expect(action).toMatchObject({ kind: 'action', clientId: 'client-kanset', clientName: 'Kanset' })

    const maria = deriveMyTasks([piece({ platforms: [],
      gates: [gate('design_built', 'done'), gate('proofed', 'done'),
        gate('approval_sent', 'done', { occurred_at: '2026-07-16T12:00:00Z' })] })], [], '2026-07-21')[0]
    expect(maria).toMatchObject({ kind: 'waiting_maria', clientId: 'client-kanset', clientName: 'Kanset' })

    const studio = deriveMyTasks([piece({
      gates: [gate('source_in_hand', 'open', { owner_label: 'studio' })] })], [], '2026-07-21')[0]
    expect(studio).toMatchObject({ kind: 'waiting_studio', clientId: 'client-kanset', clientName: 'Kanset' })
  })

  it('two tenants sharing a content_id produce distinct composite keys', () => {
    const a = piece({ clientId: 'client-a', clientName: 'A', contentId: 'shared-id',
      platforms: [], gates: [gate('design_built', 'open')] })
    const b = piece({ clientId: 'client-b', clientName: 'B', contentId: 'shared-id',
      platforms: [], gates: [gate('design_built', 'open')] })
    const tasks = deriveMyTasks([a, b], [], '2026-07-21')
    const keys = tasks.map((t) => t.kind === 'ops' ? t.id : `${t.clientId}:${t.contentId}:${t.kind}`)
    expect(new Set(keys).size).toBe(keys.length) // no collision
  })
})

// Codex round-3 fix 1: the loader selects the current decision with the SAME tie-break
// as the canonical content_with_state view (created_at DESC, id DESC), so on equal
// timestamps the admin stage cannot disagree with client-facing portal state.
describe('selectCurrentDecision tie-break', () => {
  it('picks the latest created_at', () => {
    expect(selectCurrentDecision([
      { id: 'a', state: 'change_requested', created_at: '2026-07-20T10:00:00Z' },
      { id: 'b', state: 'approved', created_at: '2026-07-21T10:00:00Z' },
    ])).toBe('approved')
  })

  it('on equal created_at, the larger id wins (matches created_at DESC, id DESC)', () => {
    const rows = [
      { id: 'id-0001', state: 'change_requested', created_at: '2026-07-21T10:00:00Z' },
      { id: 'id-0002', state: 'approved', created_at: '2026-07-21T10:00:00Z' },
    ]
    expect(selectCurrentDecision(rows)).toBe('approved') // id-0002 > id-0001
    // order-independent: the tie-break, not array order, decides
    expect(selectCurrentDecision([...rows].reverse())).toBe('approved')
  })

  it('no decisions -> null', () => {
    expect(selectCurrentDecision([])).toBeNull()
  })
})

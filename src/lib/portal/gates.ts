// Agency-side gate engine (gate-system spec phase 1, 2026-07-21).
// Pure derivations over live rows: the nine-gate resolver, the per-piece stage
// (spec section 4.1), the my_tasks union (section 4.2), and the STATUS GATES block
// renderer (the my-tasks spec section 5 grammar). No stored state, no client surface:
// everything here renders on the ADMIN side only. The client shell never imports this.

export type ProductionGateKey = 'source_in_hand' | 'design_built' | 'proofed' | 'approval_sent'
export type GateState = 'open' | 'done' | 'na'

export type ProductionGateRow = {
  gate_key: ProductionGateKey
  state: GateState
  owner_label: 'anastasia' | 'studio' | 'agent'
  occurred_at: string | null
  note: string | null
  na_reason: string | null
}

export type DestState = {
  destination: string
  scheduleStatus: string | null // content_schedule_targets vocabulary
  publicationStatus: string | null // pending | live | removed | unavailable | failed
  verified: boolean // link-confirmed: first_verified_at present
  scheduledAt: string | null
  liveUrl: string | null
}

export type StagePiece = {
  contentId: string
  title: string
  status: string // idea | draft | approved | scheduled | posted
  factCheck: string | null // confirmed | needs-confirm | flagged
  factCheckExempt: boolean
  currentDecision: 'approved' | 'change_requested' | null
  approvalSentAt: string | null // derived from the approval_sent gate row when done
  platforms: string[]
  archived: boolean
  gates: ProductionGateRow[]
  dests: DestState[]
}

// Canonical order (my-tasks spec section 4, locked vocabulary).
export const GATE_ORDER = [
  'fact-check', 'source-in-hand', 'design-built', 'proofed', 'approval-sent',
  'copy-approved', 'scheduled', 'posted', 'link-confirmed',
] as const
export type GateKey = (typeof GATE_ORDER)[number]

const PRODUCTION_KEY_MAP: Record<ProductionGateKey, GateKey> = {
  source_in_hand: 'source-in-hand',
  design_built: 'design-built',
  proofed: 'proofed',
  approval_sent: 'approval-sent',
}

export type ResolvedGate = {
  key: GateKey
  dest: string | null
  state: GateState
  owner: string
  date: string | null
  note: string | null
  // present = the portal actually stores this gate for this piece; production gates
  // with no row (podcast lane, pre-backfill pieces) resolve absent and never generate
  // tasks or block the stage (spec 12.7)
  present: boolean
}

const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null)

function productionGate(piece: StagePiece, key: ProductionGateKey): ProductionGateRow | null {
  return piece.gates.find((gate) => gate.gate_key === key) ?? null
}

// The full nine-gate resolution for one piece, canonical order, per-destination lines
// for gates 7-9 (split the moment destinations diverge; a bare line never vouches for
// all platforms). Gates 1 and 6-9 resolve from their REAL storage (fact-check ledger,
// approvals, schedule/publication targets); 2-5 from content_production_gates.
export function resolveNineGates(piece: StagePiece): ResolvedGate[] {
  const rows: ResolvedGate[] = []

  rows.push({
    key: 'fact-check', dest: null, present: true,
    state: piece.factCheckExempt ? 'na' : piece.factCheck === 'confirmed' ? 'done' : 'open',
    owner: 'anastasia', date: null,
    note: piece.factCheckExempt ? 'exempt (no regulated claim)' : piece.factCheck,
  })

  for (const key of ['source_in_hand', 'design_built', 'proofed', 'approval_sent'] as const) {
    const row = productionGate(piece, key)
    rows.push(row
      ? { key: PRODUCTION_KEY_MAP[key], dest: null, present: true, state: row.state,
          owner: row.owner_label, date: day(row.occurred_at),
          note: row.state === 'na' ? row.na_reason : row.note }
      : { key: PRODUCTION_KEY_MAP[key], dest: null, present: false, state: 'open',
          owner: key === 'source_in_hand' ? 'studio' : 'anastasia', date: null, note: null })
  }

  rows.push({
    key: 'copy-approved', dest: null, present: true,
    state: piece.currentDecision === 'approved' ? 'done' : 'open',
    owner: 'maria', date: null,
    note: piece.currentDecision === 'change_requested' ? 'change requested; re-arms on the new version' : null,
  })

  for (const platform of piece.platforms) {
    const dest = piece.dests.find((d) => d.destination === platform)
    rows.push({
      key: 'scheduled', dest: platform, present: true,
      state: dest?.scheduleStatus === 'scheduled' ? 'done' : 'open',
      owner: 'anastasia', date: day(dest?.scheduledAt), note: null,
    })
  }
  for (const platform of piece.platforms) {
    const dest = piece.dests.find((d) => d.destination === platform)
    rows.push({
      key: 'posted', dest: platform, present: true,
      state: dest?.publicationStatus === 'live' ? 'done' : 'open',
      owner: 'anastasia', date: null, note: null,
    })
  }
  for (const platform of piece.platforms) {
    const dest = piece.dests.find((d) => d.destination === platform)
    rows.push({
      key: 'link-confirmed', dest: platform, present: true,
      state: dest?.publicationStatus === 'live' && dest.verified ? 'done' : 'open',
      owner: 'anastasia', date: null, note: dest?.liveUrl ?? null,
    })
  }
  return rows
}

// ---- per-piece stage (spec 4.1, priority-ordered, 8 branches) ----------------

export type ContentStage =
  | 'done' | 'posted_unverified' | 'scheduled' | 'scheduled_partial'
  | 'approved' | 'direction_approved' | 'awaiting_decision' | 'in_production' | 'draft'

export type StageResult = { stage: ContentStage; label: string }

const listDests = (dests: string[]) => dests.join(', ')

// An ABSENT gate row (podcast lane, partial backfill) is NOT a blocker: it is an
// unknown, not an unmet obligation (Codex round-2 fix A). Only a PRESENT gate that is
// still open blocks. na (with its mandatory reason) is a satisfied, non-blocking state.
function gateBlocks(row: ProductionGateRow | null): boolean {
  return row !== null && row.state === 'open'
}

export function deriveContentStage(piece: StagePiece): StageResult {
  const required = piece.platforms
  const destOf = (p: string) => piece.dests.find((d) => d.destination === p)

  const liveVerified = required.filter((p) => {
    const d = destOf(p); return d?.publicationStatus === 'live' && d.verified
  })
  const liveAny = required.filter((p) => destOf(p)?.publicationStatus === 'live')
  const scheduled = required.filter((p) => destOf(p)?.scheduleStatus === 'scheduled')

  // 1. done: every required destination link-confirmed
  if (required.length > 0 && liveVerified.length === required.length) {
    return { stage: 'done', label: 'done (all destinations link-confirmed)' }
  }
  // 2. posted without link confirmation anywhere
  if (liveAny.length > 0) {
    const unverified = liveAny.filter((p) => !liveVerified.includes(p))
    return {
      stage: 'posted_unverified',
      label: unverified.length > 0
        ? `posted, link-confirm pending (${listDests(unverified)})`
        : `posted (${listDests(liveAny)}); ${listDests(required.filter((p) => !liveAny.includes(p)))} pending`,
    }
  }
  // 3. scheduled for all / some destinations
  if (required.length > 0 && scheduled.length === required.length) {
    return { stage: 'scheduled', label: `scheduled (${listDests(scheduled)})` }
  }
  if (scheduled.length > 0) {
    const pending = required.filter((p) => !scheduled.includes(p))
    return { stage: 'scheduled_partial', label: `scheduled (${listDests(scheduled)}); ${listDests(pending)} pending` }
  }

  const design = productionGate(piece, 'design_built')
  const proofed = productionGate(piece, 'proofed')
  const approvalSent = productionGate(piece, 'approval_sent')
  const hasGateRows = piece.gates.length > 0

  if (piece.currentDecision === 'approved') {
    // 4/5. approved vs direction_approved (the H&C shape): a decision recorded while any
    // PRESENT production gate is still open claims less than "approved". Codex round-2
    // fix A: an ABSENT design_built/proofed/approval_sent row never forces
    // direction_approved (that was the bug: a partial gate set with a done proofed but
    // no design row wrongly derived direction_approved), and an open approval_sent row
    // (present and open) DOES, which the old design/proofed-only check missed. Pieces
    // with no gate rows at all derive approved from the decision alone (spec 12.7).
    if (gateBlocks(design) || gateBlocks(proofed) || gateBlocks(approvalSent)) {
      return { stage: 'direction_approved', label: 'direction approved (production gates open)' }
    }
    return { stage: 'approved', label: 'approved' }
  }
  // 6. the ask is out, no decision yet
  if (approvalSent?.state === 'done') {
    return { stage: 'awaiting_decision', label: 'awaiting decision' }
  }
  // 7. in production, subdivided by the first open production gate
  if (hasGateRows && piece.gates.some((gate) => gate.state === 'open')) {
    const source = productionGate(piece, 'source_in_hand')
    if (source?.state === 'open' && source.owner_label === 'studio') {
      return { stage: 'in_production', label: 'waiting on studio' }
    }
    if (source?.state === 'open') return { stage: 'in_production', label: 'needs source' }
    if (design?.state === 'open') return { stage: 'in_production', label: 'needs design' }
    if (proofed?.state === 'open') return { stage: 'in_production', label: 'needs proof' }
    return { stage: 'in_production', label: 'needs the ask sent' }
  }
  // 8. nothing above
  return { stage: 'draft', label: 'draft' }
}

// ---- my_tasks (spec 4.2, agency-only) ----------------------------------------

export type MyTask =
  | { kind: 'action'; contentId: string; title: string; gate: GateKey; dest: string | null; moreOpen: number }
  | { kind: 'waiting_maria'; contentId: string; title: string; daysWaiting: number; nudge: boolean }
  | { kind: 'waiting_studio'; contentId: string; title: string; note: string | null }
  | { kind: 'ops'; id: string; title: string; category: string; bucket: 'overdue' | 'today' | 'this_week' | 'upcoming' | 'watch'; dueDate: string | null; triggerNote: string | null }

// A recently-completed ops task, for the admin's "Recently completed" reader: it shows
// BOTH the original trigger_note (immutable) and the completion_note (fix B), proving a
// completion never overwrites the trigger provenance.
export type CompletedOpsTask = {
  id: string
  title: string
  category: string
  status: string
  triggerNote: string | null
  completionNote: string | null
  completedAt: string | null
}

export type OpsTaskRow = {
  id: string
  title: string
  category: string
  due_date: string | null
  trigger_note: string | null
  status: string
}

export function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z')
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z')
  let days = 0
  const cursor = new Date(from)
  while (cursor < to) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const dow = cursor.getUTCDay()
    if (dow !== 0 && dow !== 6) days += 1
  }
  return days
}

export function deriveMyTasks(
  pieces: StagePiece[],
  opsTasks: OpsTaskRow[],
  todayIso: string,
): MyTask[] {
  const tasks: MyTask[] = []

  for (const piece of pieces) {
    if (piece.archived) continue
    const resolved = resolveNineGates(piece)
    // only gates the portal actually stores generate tasks (absent rows are unknowns,
    // not obligations: a podcast episode must not show "needs source" forever)
    const open = resolved.filter((gate) => gate.present && gate.state === 'open')
    if (open.length === 0) continue
    const first = open[0]
    if (first.key === 'copy-approved') {
      const approvalSent = productionGate(piece, 'approval_sent')
      if (approvalSent?.state === 'done' && approvalSent.occurred_at) {
        const days = businessDaysBetween(approvalSent.occurred_at, todayIso)
        // call 4: at 2 business days the row flags nudge?; a draft is OFFERED, nothing
        // ever auto-sends
        tasks.push({ kind: 'waiting_maria', contentId: piece.contentId, title: piece.title,
          daysWaiting: days, nudge: days >= 2 })
        continue
      }
    }
    if (first.key === 'source-in-hand' && first.owner === 'studio') {
      tasks.push({ kind: 'waiting_studio', contentId: piece.contentId, title: piece.title,
        note: first.note })
      continue
    }
    tasks.push({ kind: 'action', contentId: piece.contentId, title: piece.title,
      gate: first.key, dest: first.dest, moreOpen: open.length - 1 })
  }

  const weekAhead = new Date(todayIso.slice(0, 10) + 'T00:00:00Z')
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7)
  const weekIso = weekAhead.toISOString().slice(0, 10)
  for (const task of opsTasks) {
    if (task.status !== 'open') continue
    const bucket = task.trigger_note && !task.due_date ? 'watch'
      : !task.due_date ? 'upcoming'
      : task.due_date < todayIso ? 'overdue'
      : task.due_date === todayIso ? 'today'
      : task.due_date <= weekIso ? 'this_week'
      : 'upcoming'
    tasks.push({ kind: 'ops', id: task.id, title: task.title, category: task.category,
      bucket, dueDate: task.due_date, triggerNote: task.trigger_note })
  }
  return tasks
}

// ---- STATUS GATES block renderer (my-tasks spec section 5 grammar) -----------
// `- [state] gate-key[:dest] @owner [date] | note`. States: [ ] open, [x] done,
// [~] na (reason mandatory, rendered as the note). The block merges TWO sources
// (production gates from 0022; fact-check/decision/schedule/publication from their
// real homes); a hand-edited 7-9 line in a pack is NOT an emission (spec 12.9).

const stateMark: Record<GateState, string> = { open: ' ', done: 'x', na: '~' }

export function renderStatusGatesBlock(piece: StagePiece, dateIso: string): string {
  const lines = [
    '## STATUS GATES',
    `<!-- gates: id=${piece.contentId} date=${dateIso.slice(0, 10)} -->`,
  ]
  for (const gate of resolveNineGates(piece)) {
    const key = gate.dest ? `${gate.key}:${gate.dest}` : gate.key
    const date = gate.date ? ` ${gate.date}` : ''
    const note = gate.note ? ` | ${gate.note}` : ''
    lines.push(`- [${stateMark[gate.state]}] ${key} @${gate.owner}${date}${note}`)
  }
  return lines.join('\n')
}

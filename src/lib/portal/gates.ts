// Agency-side gate engine (gate-system spec phase 1, 2026-07-21).
// Pure derivations over live rows: the nine-gate resolver, the per-piece stage
// (spec section 4.1), the my_tasks union (section 4.2), and the STATUS GATES block
// renderer (the my-tasks spec section 5 grammar). No stored state, no client surface:
// everything here renders on the ADMIN side only. The client shell never imports this.

export type ProductionGateKey = 'source_in_hand' | 'design_built' | 'proofed' | 'approval_sent'
export type GateState = 'open' | 'done' | 'na'

export type ProductionGateRow = {
  content_version?: number
  gate_key: ProductionGateKey
  state: GateState
  owner_label: 'anastasia' | 'studio' | 'agent'
  occurred_at: string | null
  note: string | null
  na_reason: string | null
}

export type DestState = {
  destination: string
  required?: boolean
  scheduleStatus: string | null // content_schedule_targets vocabulary
  publicationStatus: string | null // pending | live | removed | unavailable | failed
  verified: boolean // link-confirmed: first_verified_at present
  scheduledAt: string | null
  liveUrl: string | null
}

export type StagePiece = {
  // content_id is unique only PER TENANT, so the tenant identity rides every piece
  // (Codex round-3 fix 2): composite keys downstream stop cross-tenant collisions when a
  // second client exists.
  clientId: string
  clientName: string
  contentId: string
  title: string
  format?: string | null
  pillar?: string | null
  producer?: 'the_dot' | 'studio' | null
  calendarNote?: string | null
  // Calendar date for drafts/ideas, and the latest confirmed publication date for
  // pieces that have gone live. These are display-only ordering fields.
  plannedDate?: string | null
  latestPublishedAt?: string | null
  // NULL is a selected idea with a durable content_id but no authored snapshot yet.
  workingVersion?: number | null
  visibleVersion?: number | null
  released?: boolean
  status: string // idea | draft | approved | scheduled | posted
  factCheck: string | null // confirmed | needs-confirm | flagged
  factCheckExempt: boolean
  factCheckValid?: boolean
  currentDecision: 'approved' | 'change_requested' | null
  // This is an agency-only, version-bound workflow policy. It is never a fabricated
  // client decision: `courtesy` means the agency has explicitly made client approval
  // non-blocking for this released snapshot (for example a studio-owned live cut).
  reviewMode?: 'required' | 'courtesy'
  // Versionless ideas have a separate decision plane. A plan-cycle approval is the
  // batch decision; a piece decision overrides it for that cycle revision.
  ideaDecision: 'approved' | 'change_requested' | null
  ideaDecisionSource: 'batch' | 'piece' | null
  ideaDecisionNote: string | null
  // The current plan-cycle submission timestamp. This is separate from the
  // version-bound approval_sent gate: it is the first approval cycle for the
  // idea + initial copy direction.
  ideaApprovalSentAt: string | null
  approvalSentAt: string | null // derived from the approval_sent gate row when done
  // platforms are CANONICAL schedule destinations (portal_schedule_destination mapping),
  // not raw frontmatter, so they match content_schedule_targets / content_publication_
  // targets which store the canonicalized destination (Codex round-3 blocker).
  platforms: string[]
  archived: boolean
  exceptions?: Array<{ kind: string; destination?: string; stage?: string; note?: string }>
  legacy?: { classification: 'legacy_verified' | 'legacy_unverified' } | null
  gates: ProductionGateRow[]
  dests: DestState[]
}

// TypeScript mirror of the SQL portal_schedule_destination() (0008): the loader must
// canonicalize a piece's raw frontmatter platforms to the SAME destination vocabulary
// the schedule/publication targets are stored under, or a complete youtube_shorts /
// website / blog destination reads as unscheduled. An UNKNOWN platform returns NULL
// exactly as the SQL does (Codex round-4 blocker): a passthrough would invent a phantom
// destination (e.g. tiktok) with perpetual gate tasks that the SQL never schedules. A
// released piece can never carry an unmapped platform (portal_ensure_schedule_targets
// raises on one); a draft's unmapped platform simply has no target lane and is dropped.
// Keep this in lockstep with 0008.
const SCHEDULE_DESTINATION_MAP: Record<string, string> = {
  instagram: 'instagram',
  facebook: 'facebook',
  youtube: 'youtube',
  'youtube shorts': 'youtube',
  youtube_shorts: 'youtube',
  'youtube-shorts': 'youtube',
  squarespace: 'squarespace',
  website: 'squarespace',
  blog: 'squarespace',
  other: 'other',
}

export function canonicalScheduleDestination(platform: string): string | null {
  const normalized = platform.trim().toLowerCase()
  return SCHEDULE_DESTINATION_MAP[normalized] ?? null
}

// The current decision on a version, selected with the SAME tie-break the canonical
// content_with_state view uses: created_at DESC, then id DESC (Codex round-3 fix 1). On
// equal timestamps the loader and the view therefore pick the same row, so the admin
// stage can never disagree with client-facing portal state.
export type DecisionRow = { id: string; state: string; created_at: string }
export function selectCurrentDecision(rows: DecisionRow[]): 'approved' | 'change_requested' | null {
  const top = [...rows].sort((a, b) =>
    a.created_at !== b.created_at
      ? (a.created_at < b.created_at ? 1 : -1)
      : (a.id < b.id ? 1 : -1))[0]?.state
  return top === 'approved' ? 'approved' : top === 'change_requested' ? 'change_requested' : null
}

// Canonicalize a raw platform list to distinct SUPPORTED destinations, preserving
// first-seen order (matches the SQL DISTINCT collapse: two platforms mapping to the same
// destination become one). Unknown platforms canonicalize to null and are DROPPED (Codex
// round-4 blocker): they have no schedule/publication target lane, so they must not
// become phantom per-destination gates.
export function canonicalDestinations(platforms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const platform of platforms) {
    const dest = canonicalScheduleDestination(platform)
    if (dest !== null && !seen.has(dest)) { seen.add(dest); out.push(dest) }
  }
  return out
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
    state: piece.factCheckExempt ? 'na' : (piece.factCheckValid ?? piece.factCheck === 'confirmed') ? 'done' : 'open',
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
    state: piece.reviewMode === 'courtesy' ? 'na' : piece.currentDecision === 'approved' ? 'done' : 'open',
    owner: piece.reviewMode === 'courtesy' ? 'agency' : 'maria', date: null,
    note: piece.reviewMode === 'courtesy'
      ? 'courtesy release, no client approval required'
      : piece.currentDecision === 'change_requested' ? 'change requested; re-arms on the new version' : null,
  })

  for (const platform of piece.platforms) {
    const dest = piece.dests.find((d) => d.destination === platform)
    // A LIVE destination was necessarily scheduled: posting supersedes scheduling, so a
    // published piece never shows an open "scheduled" gate (which surfaced as a false
    // "schedule this" action on already-posted pieces in My Tasks). scheduled is done when
    // the platform is confirmed scheduled OR already live.
    rows.push({
      key: 'scheduled', dest: platform, present: true,
      state: dest?.scheduleStatus === 'scheduled' || dest?.publicationStatus === 'live' ? 'done' : 'open',
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
  | 'approved' | 'courtesy_released' | 'direction_approved' | 'awaiting_decision' | 'awaiting_idea_approval' | 'in_production' | 'draft'
  | 'idea' | 'archived' | 'legacy' | 'needs_platform_mapping'

export type StageResult = { stage: ContentStage; label: string }

const listDests = (dests: string[]) => dests.join(', ')

// An ABSENT gate row (podcast lane, partial backfill) is NOT a blocker: it is an
// unknown, not an unmet obligation (Codex round-2 fix A). Only a PRESENT gate that is
// still open blocks. na (with its mandatory reason) is a satisfied, non-blocking state.
function gateBlocks(row: ProductionGateRow | null): boolean {
  return row !== null && row.state === 'open'
}

export function deriveContentStage(piece: StagePiece): StageResult {
  if (piece.archived) return { stage: 'archived', label: 'archived' }
  if (piece.legacy?.classification === 'legacy_verified') {
    return { stage: 'legacy', label: 'posted (legacy, verified)' }
  }
  if (piece.legacy?.classification === 'legacy_unverified') {
    return { stage: 'legacy', label: 'posted (legacy, not portal-verified)' }
  }
  if (piece.exceptions?.some((exception) =>
    exception.kind === 'unsupported_destination' || exception.kind === 'needs_platform_mapping')) {
    return { stage: 'needs_platform_mapping', label: 'needs platform mapping' }
  }
  if (piece.workingVersion === null) return { stage: 'idea', label: 'idea' }
  const required = piece.platforms.filter((platform) =>
    piece.dests.find((dest) => dest.destination === platform)?.required !== false)
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

  // A submitted plan cycle is a separate client decision. It must be resolved
  // before the version-bound final approval can describe the piece as approved.
  if (piece.ideaApprovalSentAt !== null && piece.ideaDecision !== 'approved') {
    return { stage: 'awaiting_idea_approval', label: 'awaiting idea approval' }
  }

  const design = productionGate(piece, 'design_built')
  const proofed = productionGate(piece, 'proofed')
  const approvalSent = productionGate(piece, 'approval_sent')
  const hasGateRows = piece.gates.length > 0

  if (piece.currentDecision === 'approved' || piece.reviewMode === 'courtesy') {
    // 4/5. approved vs direction_approved (the H&C shape): a decision recorded while any
    // PRESENT production gate is still open claims less than "approved". Codex round-2
    // fix A: an ABSENT design_built/proofed/approval_sent row never forces
    // direction_approved (that was the bug: a partial gate set with a done proofed but
    // no design row wrongly derived direction_approved), and an open approval_sent row
    // (present and open) DOES, which the old design/proofed-only check missed. Pieces
    // with no gate rows at all derive approved from the decision alone (spec 12.7).
    if (gateBlocks(design) || gateBlocks(proofed) || gateBlocks(approvalSent)) {
      return piece.reviewMode === 'courtesy'
        ? { stage: 'courtesy_released', label: 'courtesy release (production gates open)' }
        : { stage: 'direction_approved', label: 'direction approved (production gates open)' }
    }
    if (piece.reviewMode === 'courtesy') {
      return { stage: 'courtesy_released', label: 'courtesy release (no client approval required)' }
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

// Piece-derived tasks carry the tenant (clientId + clientName) so the admin can key +
// label them across tenants (Codex round-3 fix 2); ops tasks are keyed by their own uuid.
// Every task carries a resolved clientName so the admin can label it across tenants
// (Codex round-4 fix 2). An ops task with a null client_id is agency-global: its
// clientName is 'Agency'. Piece-derived tasks also carry clientId for composite keys.
export type MyTask =
  | { kind: 'action'; clientId: string; clientName: string; contentId: string; title: string; gate: GateKey | 'idea-approved'; dest: string | null; moreOpen: number }
  // posted everywhere required, only link-confirmation outstanding: bookkeeping, not
  // production work, so it renders in a quiet "link-confirm pending" group instead of
  // flooding Actions (many imported/legacy pieces sit here honestly unverified).
  | { kind: 'link_pending'; clientId: string; clientName: string; contentId: string; title: string; dest: string | null; moreOpen: number }
  | { kind: 'waiting_maria'; clientId: string; clientName: string; contentId: string; title: string; daysWaiting: number; nudge: boolean }
  | { kind: 'waiting_studio'; clientId: string; clientName: string; contentId: string; title: string; note: string | null }
  | { kind: 'ops'; id: string; clientName: string; title: string; category: string; bucket: 'overdue' | 'today' | 'this_week' | 'upcoming' | 'watch'; dueDate: string | null; triggerNote: string | null }

// A recently-completed ops task, for the admin's "Recently completed" reader: it shows
// BOTH the original trigger_note (immutable) and the completion_note (fix B), proving a
// completion never overwrites the trigger provenance.
export type CompletedOpsTask = {
  id: string
  clientName: string // 'Agency' for a null-client global task
  title: string
  category: string
  status: string
  triggerNote: string | null
  completionNote: string | null
  completedAt: string | null
}

// clientId is nullable: an ops task may be agency-global (Codex round-4 fix 2 threads it
// through so the admin can resolve + display the client name). clientName is the resolved
// label ('Agency' when clientId is null).
export type OpsTaskRow = {
  id: string
  clientId: string | null
  clientName: string
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
    if (piece.archived || piece.legacy) continue
    // A selected idea is visible in the calendar and Pieces table, but authoring has
    // not started. It must not manufacture a fact-check or production task before v1.
    if (piece.workingVersion === null) continue
    const tenant = { clientId: piece.clientId, clientName: piece.clientName }
    // A submitted plan cycle is a distinct approval surface. It must win over the
    // later version-bound copy approval, even when the pack has already been synced.
    if (piece.ideaApprovalSentAt !== null && piece.ideaDecision !== 'approved') {
      tasks.push({ kind: 'action', ...tenant, contentId: piece.contentId, title: piece.title,
        gate: 'idea-approved', dest: null, moreOpen: 0 })
      continue
    }
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
        tasks.push({ kind: 'waiting_maria', ...tenant, contentId: piece.contentId,
          title: piece.title, daysWaiting: days, nudge: days >= 2 })
        continue
      }
    }
    if (first.key === 'source-in-hand' && first.owner === 'studio') {
      tasks.push({ kind: 'waiting_studio', ...tenant, contentId: piece.contentId,
        title: piece.title, note: first.note })
      continue
    }
    // Only link-confirmation left (the piece is posted): quiet bookkeeping, not an action.
    if (first.key === 'link-confirmed') {
      tasks.push({ kind: 'link_pending', ...tenant, contentId: piece.contentId,
        title: piece.title, dest: first.dest, moreOpen: open.length - 1 })
      continue
    }
    tasks.push({ kind: 'action', ...tenant, contentId: piece.contentId, title: piece.title,
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
    tasks.push({ kind: 'ops', id: task.id, clientName: task.clientName, title: task.title,
      category: task.category, bucket, dueDate: task.due_date, triggerNote: task.trigger_note })
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

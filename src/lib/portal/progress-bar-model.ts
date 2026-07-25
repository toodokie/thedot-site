// Progress-bar model (spec 2026-07-23 v2.1, section 5).
//
// Turns a loaded piece into the normalized node sequence the ProgressBar component
// renders. PURE: it takes already-loaded data (a StagePiece for the agency variant),
// never a DB client, so it is safe to import from a server OR a client component and
// does not cross the item-8 runtime boundary. Both variants (agency here; the client
// variant lands with the client-bar swap) produce the SAME ProgressModel shape and feed
// ONE component, so the two ends can never render divergent bars.
//
// The nine stages are DERIVED here from resolveNineGates(piece) every call, never a
// stored status, which is what makes the bar "verifiably correct every render".

import { resolveNineGates, GATE_ORDER, type StagePiece, type GateKey, type ResolvedGate } from './gates'

export type StageNodeState = 'done' | 'current' | 'upcoming' | 'na'

export type PlatformState = { destination: string; state: 'done' | 'upcoming' }

export type StageExceptionKind =
  | 'failed' | 'changes_requested' | 'needs_platform_mapping'

// An amber/red overlay on a node (spec 5.2). Colour is never the only signal: the
// component also renders a glyph + this note, so it reads without relying on hue.
export type StageException = { kind: StageExceptionKind; note?: string }

export type StageNode = {
  key: string
  label: string
  state: StageNodeState
  note?: string | null
  // set only on the three per-destination gates (scheduled/posted/link-confirmed)
  perPlatform?: PlatformState[]
  exception?: StageException
}

// A terminal state OVERRIDES normal progression (spec 5.2/5.5): archived and the two
// legacy classes are separate model fields, NOT exceptions, and the component renders
// them as a distinct terminal treatment rather than a "current" node.
export type BarTerminal = {
  kind: 'archived' | 'legacy_verified' | 'legacy_unverified'
  label: string
}

export type ProgressModel = {
  variant: 'agency' | 'client'
  nodes: StageNode[]
  terminal: BarTerminal | null
}

// Plain-English stage names (spec 5, STEP_NAMES), never the raw gate keys.
export const AGENCY_LABELS: Record<GateKey, string> = {
  'fact-check': 'Fact-check',
  'source-in-hand': 'Studio cut',
  'design-built': 'Design',
  'proofed': 'Proof',
  'approval-sent': 'Sent to Maria',
  'copy-approved': 'Approved',
  'scheduled': 'Scheduled',
  'posted': 'Posted',
  'link-confirmed': 'Link confirmed',
}

const PER_DEST_GATES = new Set<string>(['scheduled', 'posted', 'link-confirmed'])
const FAILED_PUBLICATION = new Set(['failed', 'removed', 'unavailable'])

// A gate's satisfaction BEFORE it is placed on the timeline. 'open' is a genuine unmet
// obligation; 'na' covers both an explicit not-applicable gate AND an absent production
// gate (no row = untracked = unknown, never a blocker, per gates.ts). Only 'open' gates
// compete to become the single "current" node.
type RawGate = { key: GateKey; label: string; raw: 'done' | 'na' | 'open'; note: string | null; perPlatform?: PlatformState[] }

function rawGate(key: GateKey, rows: ResolvedGate[]): RawGate {
  const label = AGENCY_LABELS[key]
  if (PER_DEST_GATES.has(key)) {
    const perPlatform: PlatformState[] = rows.map((r) => ({
      destination: r.dest ?? 'unknown',
      state: r.state === 'done' ? 'done' : 'upcoming',
    }))
    const allDone = rows.length > 0 && rows.every((r) => r.state === 'done')
    return { key, label, raw: allDone ? 'done' : 'open', note: null, perPlatform }
  }
  const row = rows[0]
  if (!row) return { key, label, raw: 'na', note: null }
  if (row.present === false) return { key, label, raw: 'na', note: 'not tracked yet' }
  const raw = row.state === 'done' ? 'done' : row.state === 'na' ? 'na' : 'open'
  return { key, label, raw, note: row.note }
}

// Overlay exceptions derived from the live target rows + decision, so the bar can show
// "stuck/failed/changes-requested" without inventing a tenth stage (spec 5.2).
function agencyExceptions(piece: StagePiece, nodes: StageNode[]): void {
  const nodeOf = (key: GateKey) => nodes.find((n) => n.key === key)

  if (piece.currentDecision === 'change_requested') {
    const n = nodeOf('copy-approved')
    if (n) n.exception = { kind: 'changes_requested', note: 'change requested; re-arms on the new version' }
  }
  if (piece.dests.some((d) => d.scheduleStatus === 'failed')) {
    const n = nodeOf('scheduled')
    if (n) n.exception = { kind: 'failed', note: 'a scheduled destination reported failed' }
  }
  if (piece.dests.some((d) => d.publicationStatus != null && FAILED_PUBLICATION.has(d.publicationStatus))) {
    const n = nodeOf('posted')
    if (n) n.exception = { kind: 'failed', note: 'a destination failed, was removed, or is unavailable' }
  }
  const mapping = (piece.exceptions ?? []).find((e) =>
    e.kind === 'unsupported_destination' || e.kind === 'needs_platform_mapping')
  if (mapping) {
    const n = nodes.find((node) => PER_DEST_GATES.has(node.key))
    if (n) n.exception = { kind: 'needs_platform_mapping', note: mapping.note ?? 'an unsupported destination needs mapping' }
  }
}

// The agency variant: all nine stages, granular, from resolveNineGates.
export function agencyProgress(piece: StagePiece): ProgressModel {
  const terminal: BarTerminal | null =
    piece.archived ? { kind: 'archived', label: 'Archived' }
      : piece.legacy?.classification === 'legacy_verified' ? { kind: 'legacy_verified', label: 'Posted (legacy, verified)' }
        : piece.legacy?.classification === 'legacy_unverified' ? { kind: 'legacy_unverified', label: 'Posted (legacy, not portal-verified)' }
          : null

  if (!terminal && piece.workingVersion === null) {
    return {
      variant: 'agency',
      terminal: null,
      nodes: [
        { key: 'idea-created', label: 'Idea created', state: 'done' },
        { key: 'copy-drafted', label: 'Copy drafted', state: 'current' },
        ...GATE_ORDER.map((key) => ({
          key,
          label: AGENCY_LABELS[key],
          state: 'upcoming' as const,
        })),
      ],
    }
  }

  const byKey = new Map<GateKey, ResolvedGate[]>()
  for (const key of GATE_ORDER) byKey.set(key, [])
  for (const row of resolveNineGates(piece)) byKey.get(row.key)?.push(row)

  const raws = GATE_ORDER.map((key) => rawGate(key, byKey.get(key) ?? []))

  // Timeline placement: the first 'open' gate is CURRENT ("you are here"); later 'open'
  // gates are UPCOMING; 'done' and 'na' are skipped when finding the current node.
  let currentTaken = false
  const authoredPrefix: StageNode[] = [
    { key: 'idea-created', label: 'Idea created', state: 'done' },
    { key: 'copy-drafted', label: 'Copy drafted', state: 'done' },
  ]
  const nodes: StageNode[] = raws.map((r) => {
    let state: StageNodeState
    if (r.raw === 'done') state = 'done'
    else if (r.raw === 'na') state = 'na'
    else if (!currentTaken) { state = 'current'; currentTaken = true }
    else state = 'upcoming'
    return { key: r.key, label: r.label, state, note: r.note, perPlatform: r.perPlatform }
  })

  agencyExceptions(piece, nodes)
  return { variant: 'agency', nodes: [...authoredPrefix, ...nodes], terminal }
}

// ---- client variant -------------------------------------------------------
// Maria's bar. She cannot see the production gates (fact-check..sent-to-Maria are
// agency-only, zero grants), so stages 1-5 collapse into ONE "In production" segment,
// then the stages she CAN see: her review, her approval, scheduling, and going live.
// Derived from client_state + the schedule/publication targets she is allowed to read,
// NEVER from the agency gate rows. Same ProgressModel shape, so it feeds the same bar.

const CLIENT_STAGES: Array<{ key: string; label: string }> = [
  { key: 'in-production', label: 'In production' },
  { key: 'your-review', label: 'Your review' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'live', label: 'Live' },
]

export type ClientProgressInput = {
  clientState: string
  scheduleTargets: Array<{ destination: string; status: string }>
  publicationTargets: Array<{ destination: string; status: string }>
}

// client_state → the index of the CURRENT (active) client stage, + any exception overlay.
// level === CLIENT_STAGES.length means everything is done.
function clientLevel(cs: string): { level: number; exception?: StageException } {
  switch (cs) {
    case 'with_dot': return { level: 0 }
    case 'needs_review': return { level: 1 }
    case 'approved': return { level: 3 }
    case 'partially_scheduled': return { level: 3 }
    case 'scheduled': return { level: 4 }
    case 'schedule_failed': return { level: 3, exception: { kind: 'failed', note: 'a scheduled destination reported a problem' } }
    case 'reschedule_pending': return { level: 3, exception: { kind: 'changes_requested', note: 'a reschedule is pending' } }
    case 'cancel_pending': return { level: 3, exception: { kind: 'changes_requested', note: 'a change was requested; unscheduling' } }
    case 'partially_live': return { level: 4 }
    case 'publish_failed': return { level: 4, exception: { kind: 'failed', note: 'a destination reported a problem' } }
    case 'live': return { level: CLIENT_STAGES.length }
    default: return { level: 0 }
  }
}

export function clientProgress(input: ClientProgressInput): ProgressModel {
  if (input.clientState === 'archived') {
    return { variant: 'client', nodes: [], terminal: { kind: 'archived', label: 'Archived' } }
  }
  const { level, exception } = clientLevel(input.clientState)
  const scheduledDone = new Set(input.scheduleTargets.filter((t) => t.status === 'scheduled').map((t) => t.destination))
  const liveDone = new Set(input.publicationTargets.filter((t) => t.status === 'live').map((t) => t.destination))
  for (const d of liveDone) scheduledDone.add(d) // a live destination was necessarily scheduled
  const scheduleDests = [...new Set([
    ...input.scheduleTargets.map((t) => t.destination),
    ...input.publicationTargets.map((t) => t.destination),
  ])]

  const nodes: StageNode[] = CLIENT_STAGES.map((stage, i) => {
    const state: StageNodeState = i < level ? 'done' : i === level ? 'current' : 'upcoming'
    const node: StageNode = { key: stage.key, label: stage.label, state }
    if (stage.key === 'scheduled' && scheduleDests.length > 0) {
      node.perPlatform = scheduleDests.map((d) => ({ destination: d, state: scheduledDone.has(d) ? 'done' : 'upcoming' }))
    }
    if (stage.key === 'live' && input.publicationTargets.length > 0) {
      node.perPlatform = input.publicationTargets.map((t) => ({ destination: t.destination, state: t.status === 'live' ? 'done' : 'upcoming' }))
    }
    if (exception && i === level) node.exception = exception
    return node
  })
  return { variant: 'client', nodes, terminal: null }
}

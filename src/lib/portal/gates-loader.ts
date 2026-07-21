// Agency-only loader for the gate system (Codex round-2 BLOCKER 1). Builds StagePiece
// rows over content_items + the WORKING content_item_versions row (NOT the released
// content_with_state view), so gates written on a still-unreleased draft/idea piece are
// visible in My Tasks + the Pieces table and its STATUS GATES block regenerates.
// set_production_gate never requires release; this loader is why an unreleased piece is
// no longer invisible.
//
// Takes any service-role Supabase client (the Next admin client OR the script's
// createClient), so the admin page and portal-write share one code path. Service-role
// only by construction: production gates have zero client grants.
import type { StagePiece, ProductionGateRow, DestState } from './gates'

// The two supabase-js clients differ in generics but share the from().select().eq()/in()
// query-builder shape; typing it precisely here buys nothing, so accept a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

type ItemRow = {
  id: string; client_id: string; content_id: string; status: string
  working_version: number | null; archived_at: string | null
}
type VersionRow = {
  content_item_id: string; version: number; title: string; platforms: string[] | null
  fact_check: string | null; fact_check_exemption: string | null
}
type ApprovalRow = { content_id: string; content_version: number; state: string; created_at: string }
type GateRow = ProductionGateRow & { content_item_id: string }
type ScheduleRow = { content_id: string; content_version: number; destination: string; status: string; scheduled_at: string | null }
type PublicationRow = { content_id: string; content_version: number; destination: string; status: string; live_url: string | null; first_verified_at: string | null }

async function run<T>(query: { data: unknown; error: { message: string } | null } | PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<T[]> {
  const result = await query
  if (result.error) throw new Error(`gate loader (${label}): ${result.error.message}`)
  return (result.data ?? []) as T[]
}

function buildPieces(
  items: ItemRow[], versions: VersionRow[], approvals: ApprovalRow[],
  gates: GateRow[], schedules: ScheduleRow[], publications: PublicationRow[],
): StagePiece[] {
  const versionByItem = new Map<string, VersionRow>()
  for (const version of versions) {
    const item = items.find((i) => i.id === version.content_item_id)
    if (item && version.version === (item.working_version ?? 1)) versionByItem.set(item.id, version)
  }
  return items.flatMap((item) => {
    const workingVersion = item.working_version ?? 1
    const version = versionByItem.get(item.id)
    if (!version) return [] // no working snapshot yet; nothing to stage
    const platforms = Array.isArray(version.platforms) ? version.platforms : []

    // latest decision on the WORKING version (never the released one)
    const decisions = approvals
      .filter((a) => a.content_id === item.id && a.content_version === workingVersion)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const currentDecision: StagePiece['currentDecision'] =
      decisions[0]?.state === 'approved' ? 'approved'
      : decisions[0]?.state === 'change_requested' ? 'change_requested' : null

    const pieceGates: ProductionGateRow[] = gates
      .filter((g) => g.content_item_id === item.id)
      .map((g) => ({ gate_key: g.gate_key, state: g.state, owner_label: g.owner_label,
        occurred_at: g.occurred_at, note: g.note, na_reason: g.na_reason }))

    const dests: DestState[] = platforms.map((platform) => {
      const schedule = schedules.find((s) => s.content_id === item.id
        && s.content_version === workingVersion && s.destination === platform)
      const publication = publications.find((p) => p.content_id === item.id
        && p.content_version === workingVersion && p.destination === platform)
      return { destination: platform, scheduleStatus: schedule?.status ?? null,
        publicationStatus: publication?.status ?? null,
        verified: Boolean(publication?.first_verified_at),
        scheduledAt: schedule?.scheduled_at ?? null, liveUrl: publication?.live_url ?? null }
    })

    const approvalSent = pieceGates.find((g) => g.gate_key === 'approval_sent')
    return [{
      contentId: item.content_id, title: version.title, status: item.status,
      factCheck: version.fact_check, factCheckExempt: Boolean(version.fact_check_exemption),
      currentDecision,
      approvalSentAt: approvalSent?.state === 'done' ? approvalSent.occurred_at : null,
      platforms, archived: Boolean(item.archived_at), gates: pieceGates, dests,
    }]
  })
}

const ITEM_COLS = 'id, client_id, content_id, status, working_version, archived_at'
const VERSION_COLS = 'content_item_id, version, title, platforms, fact_check, fact_check_exemption'
const APPROVAL_COLS = 'content_id, content_version, state, created_at'
const GATE_COLS = 'content_item_id, gate_key, state, owner_label, occurred_at, note, na_reason'
const SCHEDULE_COLS = 'content_id, content_version, destination, status, scheduled_at'
const PUBLICATION_COLS = 'content_id, content_version, destination, status, live_url, first_verified_at'

async function loadDependents(admin: Client, itemIds: string[]) {
  return Promise.all([
    run<VersionRow>(admin.from('content_item_versions').select(VERSION_COLS).in('content_item_id', itemIds), 'content_item_versions'),
    run<ApprovalRow>(admin.from('approvals').select(APPROVAL_COLS).in('content_id', itemIds), 'approvals'),
    run<GateRow>(admin.from('content_production_gates').select(GATE_COLS).in('content_item_id', itemIds), 'content_production_gates'),
    run<ScheduleRow>(admin.from('content_schedule_targets').select(SCHEDULE_COLS).in('content_id', itemIds), 'content_schedule_targets'),
    run<PublicationRow>(admin.from('content_publication_targets').select(PUBLICATION_COLS).in('content_id', itemIds), 'content_publication_targets'),
  ])
}

// All pieces for a client (or every client when clientId is omitted), unreleased included.
export async function loadAgencyStagePieces(admin: Client, clientId?: string): Promise<StagePiece[]> {
  let query = admin.from('content_items').select(ITEM_COLS)
  if (clientId) query = query.eq('client_id', clientId)
  const items = await run<ItemRow>(query, 'content_items')
  if (items.length === 0) return []
  const [versions, approvals, gates, schedules, publications] = await loadDependents(admin, items.map((i) => i.id))
  return buildPieces(items, versions, approvals, gates, schedules, publications)
}

// One piece by content_id (for STATUS GATES block regeneration), unreleased included;
// null when the piece has no working snapshot.
export async function loadAgencyStagePiece(admin: Client, clientId: string, contentId: string): Promise<StagePiece | null> {
  const items = await run<ItemRow>(
    admin.from('content_items').select(ITEM_COLS).eq('client_id', clientId).eq('content_id', contentId),
    'content_items')
  if (items.length === 0) return null
  const [versions, approvals, gates, schedules, publications] = await loadDependents(admin, [items[0].id])
  return buildPieces([items[0]], versions, approvals, gates, schedules, publications)[0] ?? null
}

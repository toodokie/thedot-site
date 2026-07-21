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
import { canonicalDestinations, canonicalScheduleDestination, selectCurrentDecision } from './gates'

// Server-only guard (Codex round-3 fix 3): this loader runs service-role queries and
// must never reach a client bundle. A browser-context check is used instead of the
// `server-only` package because the loader is ALSO imported by the node CLI tooling
// (portal-write, the backfill driver, test-rls), where a bare `server-only` import
// throws under plain node. This guard is inert in every server/node context and trips
// only if the module is ever bundled into and executed in the browser.
if (typeof window !== 'undefined') {
  throw new Error('gates-loader is server-only: it issues service-role queries and must not be imported into a client component')
}

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
type ApprovalRow = { id: string; content_id: string; content_version: number; state: string; created_at: string }
type ClientRow = { id: string; name: string }
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
  clientNames: Map<string, string>,
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
    // CANONICALIZE to the schedule/publication destination vocabulary (Codex round-3
    // blocker): raw frontmatter youtube_shorts/website/blog must match the youtube/
    // squarespace targets or a complete destination reads as unscheduled.
    const platforms = canonicalDestinations(Array.isArray(version.platforms) ? version.platforms : [])

    // latest decision on the WORKING version (never the released one); tie-break matches
    // the canonical view (created_at DESC, id DESC) so the admin can't disagree on equal
    // timestamps (Codex round-3 fix 1).
    const currentDecision = selectCurrentDecision(
      approvals.filter((a) => a.content_id === item.id && a.content_version === workingVersion))

    const pieceGates: ProductionGateRow[] = gates
      .filter((g) => g.content_item_id === item.id)
      .map((g) => ({ gate_key: g.gate_key, state: g.state, owner_label: g.owner_label,
        occurred_at: g.occurred_at, note: g.note, na_reason: g.na_reason }))

    // targets are keyed by canonical destination; canonicalize the target's own
    // destination too (defensive: it is already canonical from the SQL, but this makes
    // the match total).
    const dests: DestState[] = platforms.map((destination) => {
      const schedule = schedules.find((s) => s.content_id === item.id
        && s.content_version === workingVersion
        && canonicalScheduleDestination(s.destination) === destination)
      const publication = publications.find((p) => p.content_id === item.id
        && p.content_version === workingVersion
        && canonicalScheduleDestination(p.destination) === destination)
      return { destination, scheduleStatus: schedule?.status ?? null,
        publicationStatus: publication?.status ?? null,
        verified: Boolean(publication?.first_verified_at),
        scheduledAt: schedule?.scheduled_at ?? null, liveUrl: publication?.live_url ?? null }
    })

    const approvalSent = pieceGates.find((g) => g.gate_key === 'approval_sent')
    return [{
      clientId: item.client_id, clientName: clientNames.get(item.client_id) ?? item.client_id,
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
const APPROVAL_COLS = 'id, content_id, content_version, state, created_at'
const GATE_COLS = 'content_item_id, gate_key, state, owner_label, occurred_at, note, na_reason'
const SCHEDULE_COLS = 'content_id, content_version, destination, status, scheduled_at'
const PUBLICATION_COLS = 'content_id, content_version, destination, status, live_url, first_verified_at'

async function loadDependents(admin: Client, itemIds: string[], clientIds: string[]) {
  return Promise.all([
    run<VersionRow>(admin.from('content_item_versions').select(VERSION_COLS).in('content_item_id', itemIds), 'content_item_versions'),
    run<ApprovalRow>(admin.from('approvals').select(APPROVAL_COLS).in('content_id', itemIds), 'approvals'),
    run<GateRow>(admin.from('content_production_gates').select(GATE_COLS).in('content_item_id', itemIds), 'content_production_gates'),
    run<ScheduleRow>(admin.from('content_schedule_targets').select(SCHEDULE_COLS).in('content_id', itemIds), 'content_schedule_targets'),
    run<PublicationRow>(admin.from('content_publication_targets').select(PUBLICATION_COLS).in('content_id', itemIds), 'content_publication_targets'),
    run<ClientRow>(admin.from('clients').select('id, name').in('id', clientIds), 'clients'),
  ])
}

// All pieces for a client (or every client when clientId is omitted), unreleased included.
export async function loadAgencyStagePieces(admin: Client, clientId?: string): Promise<StagePiece[]> {
  let query = admin.from('content_items').select(ITEM_COLS)
  if (clientId) query = query.eq('client_id', clientId)
  const items = await run<ItemRow>(query, 'content_items')
  if (items.length === 0) return []
  const clientIds = [...new Set(items.map((i) => i.client_id))]
  const [versions, approvals, gates, schedules, publications, clients] =
    await loadDependents(admin, items.map((i) => i.id), clientIds)
  const clientNames = new Map(clients.map((c) => [c.id, c.name]))
  return buildPieces(items, versions, approvals, gates, schedules, publications, clientNames)
}

// One piece by content_id (for STATUS GATES block regeneration), unreleased included;
// null when the piece has no working snapshot.
export async function loadAgencyStagePiece(admin: Client, clientId: string, contentId: string): Promise<StagePiece | null> {
  const items = await run<ItemRow>(
    admin.from('content_items').select(ITEM_COLS).eq('client_id', clientId).eq('content_id', contentId),
    'content_items')
  if (items.length === 0) return null
  const [versions, approvals, gates, schedules, publications, clients] =
    await loadDependents(admin, [items[0].id], [items[0].client_id])
  const clientNames = new Map(clients.map((c) => [c.id, c.name]))
  return buildPieces([items[0]], versions, approvals, gates, schedules, publications, clientNames)[0] ?? null
}

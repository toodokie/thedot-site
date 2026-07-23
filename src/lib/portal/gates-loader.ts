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
  working_version: number | null; client_visible_version: number | null; archived_at: string | null
  planned_date?: string | null
}
type VersionRow = {
  content_item_id: string; version: number; title: string; format?: string | null; pillar?: string | null; platforms: string[] | null
  fact_check: string | null; fact_check_scope?: string | null; fact_check_ledger?: unknown
  fact_check_exemption: string | null; producer?: 'the_dot' | 'studio' | null
  calendar_note?: string | null
}
type ApprovalRow = { id: string; content_id: string; content_version: number; state: string; created_at: string }
type ClientRow = { id: string; name: string }
type GateRow = ProductionGateRow & { content_item_id: string }
type ScheduleRow = { content_id: string; content_version: number; destination: string; required: boolean; status: string; scheduled_at: string | null }
type PublicationRow = { id: string; content_id: string; content_version: number; destination: string; required: boolean; status: string; live_url: string | null; first_verified_at: string | null }
type HistoricalRow = { client_id: string; publication_target_id: string; provenance: string }

async function run<T>(query: { data: unknown; error: { message: string } | null } | PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<T[]> {
  const result = await query
  if (result.error) throw new Error(`gate loader (${label}): ${result.error.message}`)
  return (result.data ?? []) as T[]
}

function buildPieces(
  items: ItemRow[], versions: VersionRow[], approvals: ApprovalRow[],
  gates: GateRow[], schedules: ScheduleRow[], publications: PublicationRow[],
  clientNames: Map<string, string>, factCheckValid: Map<string, boolean>, legacyItems: Set<string>,
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
    const rawPlatforms = Array.isArray(version.platforms) ? version.platforms : []
    const platforms = canonicalDestinations(rawPlatforms)
    const exceptions = rawPlatforms
      .filter((raw) => canonicalScheduleDestination(raw) === null)
      .map((raw) => ({ kind: 'unsupported_destination', note: raw }))

    // latest decision on the WORKING version (never the released one); tie-break matches
    // the canonical view (created_at DESC, id DESC) so the admin can't disagree on equal
    // timestamps (Codex round-3 fix 1).
    const currentDecision = selectCurrentDecision(
      approvals.filter((a) => a.content_id === item.id && a.content_version === workingVersion))

    const pieceGates: ProductionGateRow[] = gates
      .filter((g) => g.content_item_id === item.id
        && (g.content_version == null || g.content_version === workingVersion))
      .map((g) => ({ gate_key: g.gate_key, state: g.state, owner_label: g.owner_label,
        occurred_at: g.occurred_at, note: g.note, na_reason: g.na_reason,
        content_version: g.content_version }))

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
      return { destination, required: schedule?.required ?? publication?.required ?? true,
        scheduleStatus: schedule?.status ?? null,
        publicationStatus: publication?.status ?? null,
        verified: Boolean(publication?.first_verified_at),
        scheduledAt: schedule?.scheduled_at ?? null, liveUrl: publication?.live_url ?? null }
    })

    const approvalSent = pieceGates.find((g) => g.gate_key === 'approval_sent')
    return [{
      clientId: item.client_id, clientName: clientNames.get(item.client_id) ?? item.client_id,
      contentId: item.content_id, title: version.title, format: version.format ?? null,
      pillar: version.pillar ?? null, status: item.status,
      factCheck: version.fact_check, factCheckExempt: version.fact_check_scope === 'not_applicable',
      factCheckValid: factCheckValid.get(item.id) ?? false,
      currentDecision,
      approvalSentAt: approvalSent?.state === 'done' ? approvalSent.occurred_at : null,
      platforms, archived: Boolean(item.archived_at), gates: pieceGates, dests,
      producer: version.producer ?? null, calendarNote: version.calendar_note ?? null,
      workingVersion, visibleVersion: item.client_visible_version, released: item.client_visible_version != null,
      exceptions, legacy: legacyItems.has(item.id) ? { classification: 'legacy_unverified' } : null,
    }]
  })
}

const ITEM_COLS = 'id, client_id, content_id, status, working_version, client_visible_version, archived_at'
const VERSION_COLS = 'content_item_id, version, title, format, pillar, platforms, fact_check, fact_check_scope, fact_check_ledger, fact_check_exemption, producer, calendar_note'
const APPROVAL_COLS = 'id, content_id, content_version, state, created_at'
const GATE_COLS = 'content_item_id, content_version, gate_key, state, owner_label, occurred_at, note, na_reason'
const SCHEDULE_COLS = 'content_id, content_version, destination, required, status, scheduled_at'
const PUBLICATION_COLS = 'id, content_id, content_version, destination, required, status, live_url, first_verified_at'

async function loadDependents(admin: Client, itemIds: string[], clientIds: string[], workingVersions: Map<string, number | null>) {
  const [versions, approvals, gates, schedules, publications, clients, historical] = await Promise.all([
    run<VersionRow>(admin.from('content_item_versions').select(VERSION_COLS).in('content_item_id', itemIds), 'content_item_versions'),
    run<ApprovalRow>(admin.from('approvals').select(APPROVAL_COLS).in('content_id', itemIds), 'approvals'),
    run<GateRow>(admin.from('content_production_gates').select(GATE_COLS).in('content_item_id', itemIds), 'content_production_gates'),
    run<ScheduleRow>(admin.from('content_schedule_targets').select(SCHEDULE_COLS).in('content_id', itemIds), 'content_schedule_targets'),
    run<PublicationRow>(admin.from('content_publication_targets').select(PUBLICATION_COLS).in('content_id', itemIds), 'content_publication_targets'),
    run<ClientRow>(admin.from('clients').select('id, name').in('id', clientIds), 'clients'),
    run<HistoricalRow>(admin.from('historical_publication_import_entries')
      .select('client_id, publication_target_id, provenance').in('client_id', clientIds),
      'historical_publication_import_entries'),
  ])
  const factCheckValid = new Map<string, boolean>()
  await Promise.all(versions.filter((version) =>
    workingVersions.get(version.content_item_id) === version.version).map(async (version) => {
    const result = await admin.rpc('portal_piece_fact_check_release_valid', {
      p_fact_check: version.fact_check,
      p_fact_check_scope: version.fact_check_scope,
      p_fact_check_exemption: version.fact_check_exemption,
      p_fact_check_ledger: version.fact_check_ledger ?? [],
    })
    if (result.error) throw new Error(`gate loader (fact-check): ${result.error.message}`)
    factCheckValid.set(version.content_item_id, result.data === true)
  }))
  const publicationItemById = new Map(publications.map((publication) => [publication.id, publication.content_id]))
  const legacyItems = new Set(historical
    .filter((entry) => ['yt_check', 'public_url', 'legacy_unverified'].includes(entry.provenance))
    .map((entry) => publicationItemById.get(entry.publication_target_id))
    .filter((itemId): itemId is string => Boolean(itemId)))
  return [versions, approvals, gates, schedules, publications, clients, factCheckValid, legacyItems] as const
}

// All pieces for a client (or every client when clientId is omitted), unreleased included.
export async function loadAgencyStagePieces(admin: Client, clientId?: string): Promise<StagePiece[]> {
  let query = admin.from('content_items').select(ITEM_COLS)
  if (clientId) query = query.eq('client_id', clientId)
  const items = await run<ItemRow>(query, 'content_items')
  if (items.length === 0) return []
  const clientIds = [...new Set(items.map((i) => i.client_id))]
  const [versions, approvals, gates, schedules, publications, clients, factCheckValid, legacyItems] =
    await loadDependents(admin, items.map((i) => i.id), clientIds,
      new Map(items.map((item) => [item.id, item.working_version])))
  const clientNames = new Map(clients.map((c) => [c.id, c.name]))
  return buildPieces(items, versions, approvals, gates, schedules, publications, clientNames, factCheckValid, legacyItems)
}

// One piece by content_id (for STATUS GATES block regeneration), unreleased included;
// null when the piece has no working snapshot.
export async function loadAgencyStagePiece(admin: Client, clientId: string, contentId: string): Promise<StagePiece | null> {
  const items = await run<ItemRow>(
    admin.from('content_items').select(ITEM_COLS).eq('client_id', clientId).eq('content_id', contentId),
    'content_items')
  if (items.length === 0) return null
  const [versions, approvals, gates, schedules, publications, clients, factCheckValid, legacyItems] =
    await loadDependents(admin, [items[0].id], [items[0].client_id],
      new Map([[items[0].id, items[0].working_version]]))
  const clientNames = new Map(clients.map((c) => [c.id, c.name]))
  return buildPieces([items[0]], versions, approvals, gates, schedules, publications, clientNames, factCheckValid, legacyItems)[0] ?? null
}

export type AgencyPieceCalendarRow = StagePiece & {
  clientSlug: string
  plannedDate: string | null
  notShared: boolean
}

// Broader agency calendar read. This deliberately starts from content_items and
// the working snapshot, never from content_with_state, so ideas/drafts remain
// visible to The Dot while unreleased content stays outside every client path.
export async function loadAgencyPieceCalendar(admin: Client, clientId?: string): Promise<AgencyPieceCalendarRow[]> {
  let query = admin.from('content_items').select(`${ITEM_COLS}, planned_date`)
  if (clientId) query = query.eq('client_id', clientId)
  const items = await run<ItemRow>(query, 'content_items calendar')
  if (items.length === 0) return []
  const stages = await loadAgencyStagePieces(admin, clientId)
  const clients = await run<{ id: string; slug: string }>(
    admin.from('clients').select('id, slug').in('id', [...new Set(items.map((item) => item.client_id))]),
    'clients calendar')
  const clientSlugs = new Map(clients.map((client) => [client.id, client.slug]))
  const itemByKey = new Map(items.map((item) => [`${item.client_id}:${item.content_id}`, item]))
  return stages.flatMap((stage) => {
    const item = itemByKey.get(`${stage.clientId}:${stage.contentId}`)
    const clientSlug = clientSlugs.get(stage.clientId)
    if (!item || !clientSlug) return []
    return [{ ...stage, clientSlug, plannedDate: item.planned_date ?? null, notShared: !stage.released }]
  })
}

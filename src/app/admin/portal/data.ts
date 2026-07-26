import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyStagePieces } from '@/lib/portal/gates-loader'
import type { StagePiece, OpsTaskRow, CompletedOpsTask } from '@/lib/portal/gates'
import type { AdminTarget } from './PublicationAdmin'
import type { CalendarConflictAdmin, CalendarIntegrationAdmin, UnmappedCalendarEventAdmin,
  CalendarContentOption } from './CalendarAdmin'
import type { AdminInvoice } from './BillingAdmin'
import type { AdminContentRequest } from './RequestAdmin'

// Per-surface data loaders for the admin ops portal. Each routed page calls only the loader
// it needs, so no page pays for another surface's queries. The transforms here are lifted
// verbatim from the old single-page fetch (behaviour-preserving); only the split is new.

// Toronto business day, matching the client-facing schedule reasoning.
function torontoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// A null client_id is an agency-global row labelled 'Agency'.
function opsClientNamer(clientMap: Map<string, { name: string }>) {
  return (clientId: string | null) =>
    clientId === null ? 'Agency' : clientMap.get(clientId)?.name ?? 'Unknown client'
}

// ---- My tasks (hero): stage pieces + ops tasks + recently-completed ops ----
export async function loadMyTasksData(): Promise<{
  pieces: StagePiece[]; opsTasks: OpsTaskRow[]; completedOps: CompletedOpsTask[]; todayIso: string
}> {
  const admin = createSupabaseAdmin()
  const [clients, opsTasks, completedOpsRows] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('ops_tasks').select('id,client_id,title,category,due_date,trigger_note,status').eq('status', 'open'),
    admin.from('ops_tasks').select('id,client_id,title,category,status,trigger_note,completion_note,completed_at')
      .in('status', ['done', 'dropped']).order('completed_at', { ascending: false }).limit(10),
  ])
  const failure = clients.error ?? opsTasks.error ?? completedOpsRows.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const opsClientName = opsClientNamer(clientMap)
  const pieces = await loadAgencyStagePieces(admin)
  const adminOpsTasks: OpsTaskRow[] = (opsTasks.data ?? []).map((task) => ({
    id: task.id, clientId: task.client_id, clientName: opsClientName(task.client_id),
    title: task.title, category: task.category, due_date: task.due_date,
    trigger_note: task.trigger_note, status: task.status,
  }))
  const completedOps: CompletedOpsTask[] = (completedOpsRows.data ?? []).map((task) => ({
    id: task.id, clientName: opsClientName(task.client_id),
    title: task.title, category: task.category, status: task.status,
    triggerNote: task.trigger_note, completionNote: task.completion_note, completedAt: task.completed_at,
  }))
  return { pieces, opsTasks: adminOpsTasks, completedOps, todayIso: torontoToday() }
}

// ---- Pieces: the per-piece gate strip. loadAgencyStagePieces runs its own service-role
// queries over content_items + the working version (Codex round-2), so pieces on unreleased
// drafts/ideas surface here too. ----
export async function loadPieces(): Promise<StagePiece[]> {
  const admin = createSupabaseAdmin()
  return loadAgencyStagePieces(admin)
}

// ---- Publication: the (piece x destination) target list with schedule + observation history ----
export async function loadPublicationTargets(): Promise<AdminTarget[]> {
  const admin = createSupabaseAdmin()
  const [clients, items, versions, schedules, publications, observations, actors] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    // Do not use content_with_state here. It intentionally exposes only the current
    // released version, while publication history can contain an older version after a
    // revision. The agency publication ledger must retain every target.
    admin.from('content_items').select('id,client_id,content_id,planned_date'),
    admin.from('content_item_versions').select('content_item_id,client_id,version,title'),
    admin.from('content_schedule_targets').select('id,client_id,content_id,content_version,destination,status,scheduled_at,evidence_id,verifier_actor_id'),
    admin.from('content_publication_targets_client').select('id,client_id,content_id,content_version,destination,status,live_url,published_at,verification_label'),
    admin.from('content_publication_observations').select('id,client_id,publication_target_id,provider_state,published_at,observed_at,source_type,reconciliation_status,evidence_id,permalink,verifier_actor_id').order('created_at', { ascending: false }),
    admin.from('agency_actors').select('id,display_name'),
  ])
  const failure = clients.error ?? items.error ?? versions.error ?? schedules.error ?? publications.error
    ?? observations.error ?? actors.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const itemMap = new Map((items.data ?? []).map((item) => [item.id, item]))
  const contentMap = new Map((versions.data ?? []).map((version) => {
    const item = itemMap.get(version.content_item_id)
    return [`${version.client_id}:${version.content_item_id}:${version.version}`, {
      id: version.content_item_id, client_id: version.client_id, content_id: item?.content_id ?? version.content_item_id,
      title: version.title, version: version.version, planned_date: item?.planned_date ?? null,
    }]
  }))
  const scheduleMap = new Map((schedules.data ?? []).map((target) => [
    `${target.client_id}:${target.content_id}:${target.content_version}:${target.destination}`, target,
  ]))
  const actorMap = new Map((actors.data ?? []).map((actor) => [actor.id, actor.display_name]))
  const targets: AdminTarget[] = (publications.data ?? []).flatMap((publication) => {
    const item = contentMap.get(`${publication.client_id}:${publication.content_id}:${publication.content_version}`)
    const client = clientMap.get(publication.client_id)
    if (!item || !client) return []
    const schedule = scheduleMap.get(`${publication.client_id}:${publication.content_id}:${publication.content_version}:${publication.destination}`)
    return [{
      clientId: publication.client_id, clientName: client.name, contentId: item.content_id,
      title: item.title, version: publication.content_version, destination: publication.destination,
      plannedDate: item.planned_date,
      scheduleTargetId: schedule?.id ?? null, scheduleStatus: schedule?.status ?? 'not created',
      scheduledAt: schedule?.scheduled_at ?? null, scheduleEvidenceId: schedule?.evidence_id ?? null,
      scheduleVerifier: schedule?.verifier_actor_id ? actorMap.get(schedule.verifier_actor_id) ?? 'Unknown' : null,
      publicationTargetId: publication.id,
      publicationStatus: publication.status, publicationLabel: publication.verification_label,
      liveUrl: publication.live_url, publishedAt: publication.published_at,
      history: (observations.data ?? []).filter((observation) =>
        observation.client_id === publication.client_id
          && observation.publication_target_id === publication.id,
      ).map((observation) => ({
        id: observation.id, providerState: observation.provider_state,
        publishedAt: observation.published_at, observedAt: observation.observed_at,
        sourceType: observation.source_type, reconciliationStatus: observation.reconciliation_status,
        evidenceId: observation.evidence_id, permalink: observation.permalink,
        verifier: actorMap.get(observation.verifier_actor_id) ?? 'Unknown',
      })),
    }]
  })
  return targets
}

// ---- Calendar: integrations + sync health, open conflicts / unmapped events, content options ----
export async function loadCalendarData(): Promise<{
  clients: Array<{ id: string; name: string }>
  integrations: CalendarIntegrationAdmin[]
  conflicts: CalendarConflictAdmin[]
  unmapped: UnmappedCalendarEventAdmin[]
  contentOptions: CalendarContentOption[]
}> {
  const admin = createSupabaseAdmin()
  const [clients, content, integrations, syncStates, conflicts, unmapped, jobs] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('content_with_state').select('id,client_id,content_id,title,version').order('planned_date'),
    admin.from('calendar_integrations').select('id,client_id,display_name,owner_email,access_role,status').order('display_name'),
    admin.from('calendar_sync_state').select('integration_id,health,last_full_sync_at,last_incremental_sync_at,next_reconcile_at,last_error'),
    admin.from('calendar_sync_conflicts').select('id,integration_id,kind,safe_summary,created_at').eq('status', 'open').order('created_at'),
    admin.from('calendar_unmapped_events').select('id,integration_id,client_id,event_summary,event_start_date,event_start_at,reason').eq('status', 'open').order('first_seen_at'),
    admin.from('calendar_sync_jobs').select('integration_id').in('status', ['failed', 'abandoned']),
  ])
  const failure = clients.error ?? content.error ?? integrations.error ?? syncStates.error
    ?? conflicts.error ?? unmapped.error ?? jobs.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const syncMap = new Map((syncStates.data ?? []).map((state) => [state.integration_id, state]))
  const count = (rows: Array<{ integration_id: string }> | null, id: string) =>
    (rows ?? []).filter((row) => row.integration_id === id).length
  const calendarIntegrations: CalendarIntegrationAdmin[] = (integrations.data ?? []).map((integration) => {
    const state = syncMap.get(integration.id)
    return { id: integration.id, clientId: integration.client_id,
      clientName: clientMap.get(integration.client_id)?.name ?? 'Unknown client',
      displayName: integration.display_name, ownerEmail: integration.owner_email,
      accessRole: integration.access_role, status: integration.status,
      health: state?.health ?? 'setup_required', lastFullSync: state?.last_full_sync_at ?? null,
      lastIncrementalSync: state?.last_incremental_sync_at ?? null,
      nextReconcile: state?.next_reconcile_at ?? null, lastError: state?.last_error ?? null,
      openConflicts: count(conflicts.data, integration.id), unmappedEvents: count(unmapped.data, integration.id),
      failedJobs: count(jobs.data, integration.id) }
  })
  const calendarConflicts: CalendarConflictAdmin[] = (conflicts.data ?? []).map((conflict) => ({
    id: conflict.id, integrationId: conflict.integration_id, kind: conflict.kind,
    summary: conflict.safe_summary, createdAt: conflict.created_at,
  }))
  const unmappedEvents: UnmappedCalendarEventAdmin[] = (unmapped.data ?? []).map((event) => ({
    id: event.id, clientId: event.client_id, summary: event.event_summary,
    start: event.event_start_date ?? event.event_start_at, reason: event.reason,
  }))
  const contentOptions: CalendarContentOption[] = (content.data ?? []).map((item) => ({
    id: item.id, clientId: item.client_id, version: item.version, title: item.title,
  }))
  return {
    clients: (clients.data ?? []).map((client) => ({ id: client.id, name: client.name })),
    integrations: calendarIntegrations, conflicts: calendarConflicts,
    unmapped: unmappedEvents, contentOptions,
  }
}

// ---- Billing: invoices with client name attached ----
export async function loadInvoices(): Promise<AdminInvoice[]> {
  const admin = createSupabaseAdmin()
  const [clients, invoices] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('invoices').select('id,client_id,number,issued_at,amount,currency,status,document_url').order('issued_at', { ascending: false }),
  ])
  const failure = clients.error ?? invoices.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  return (invoices.data ?? []).map((inv) => ({
    id: inv.id, clientId: inv.client_id,
    clientName: clientMap.get(inv.client_id)?.name ?? 'Unknown client',
    number: inv.number, issuedAt: inv.issued_at, amount: String(inv.amount),
    currency: inv.currency, status: inv.status, documentUrl: inv.document_url,
  }))
}

// ---- Requests: Maria's change requests, with the referenced piece title resolved ----
export async function loadRequests(): Promise<AdminContentRequest[]> {
  const admin = createSupabaseAdmin()
  const [clients, content, contentRequests] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('content_with_state').select('id,client_id,content_id,title,version').order('planned_date'),
    admin.rpc('list_content_change_requests', { p_client_id: null }),
  ])
  const failure = clients.error ?? content.error ?? contentRequests.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const contentMap = new Map((content.data ?? []).map((item) => [`${item.client_id}:${item.id}:${item.version}`, item]))
  const requestRows = (contentRequests.data ?? []) as Array<{
    id: string; client_id: string; content_id: string | null; request_type: string; status: string
    requester_name: string; created_at: string; base_version: number | null
    payload: Record<string, unknown>; resolution_note: string | null
  }>
  return requestRows.map((request) => {
    const item = request.content_id
      ? [...contentMap.entries()].find(([key]) => key.startsWith(`${request.client_id}:${request.content_id}:`))?.[1]
      : null
    return { id: request.id, clientName: clientMap.get(request.client_id)?.name ?? 'Unknown client',
      requestType: request.request_type, status: request.status, requesterName: request.requester_name,
      createdAt: request.created_at, baseVersion: request.base_version,
      title: item?.title ?? (typeof request.payload.title === 'string' ? request.payload.title : 'Content request'),
      resolutionNote: request.resolution_note }
  })
}

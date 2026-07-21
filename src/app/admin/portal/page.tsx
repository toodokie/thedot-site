import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import PublicationAdmin, { type AdminTarget } from './PublicationAdmin'
import CalendarAdmin, { type CalendarConflictAdmin, type CalendarIntegrationAdmin,
  type UnmappedCalendarEventAdmin } from './CalendarAdmin'
import BillingAdmin, { type AdminInvoice } from './BillingAdmin'
import RequestAdmin, { type AdminContentRequest } from './RequestAdmin'
import GatesAdmin from './GatesAdmin'
import type { StagePiece, OpsTaskRow, ProductionGateRow } from '@/lib/portal/gates'

export const dynamic = 'force-dynamic'

export default async function PortalAdminPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const admin = createSupabaseAdmin()
  const [clients, content, schedules, publications, observations, actors, integrations,
    syncStates, conflicts, unmapped, jobs, invoices, contentRequests, productionGates,
    opsTasks, publicationBase] = await Promise.all([
    admin.from('clients').select('id,name,slug').order('name'),
    admin.from('content_with_state').select('id,client_id,content_id,title,version,status,fact_check,fact_check_exemption,platforms,current_decision,archived_at').order('planned_date'),
    admin.from('content_schedule_targets').select('id,client_id,content_id,content_version,destination,status,scheduled_at,evidence_id,verifier_actor_id'),
    admin.from('content_publication_targets_client').select('id,client_id,content_id,content_version,destination,status,live_url,published_at,verification_label'),
    admin.from('content_publication_observations').select('id,client_id,publication_target_id,provider_state,published_at,observed_at,source_type,reconciliation_status,evidence_id,permalink,verifier_actor_id').order('created_at', { ascending: false }),
    admin.from('agency_actors').select('id,display_name'),
    admin.from('calendar_integrations').select('id,client_id,display_name,owner_email,access_role,status').order('display_name'),
    admin.from('calendar_sync_state').select('integration_id,health,last_full_sync_at,last_incremental_sync_at,next_reconcile_at,last_error'),
    admin.from('calendar_sync_conflicts').select('id,integration_id,kind,safe_summary,created_at').eq('status','open').order('created_at'),
    admin.from('calendar_unmapped_events').select('id,integration_id,client_id,event_summary,event_start_date,event_start_at,reason').eq('status','open').order('first_seen_at'),
    admin.from('calendar_sync_jobs').select('integration_id').in('status',['failed','abandoned']),
    admin.from('invoices').select('id,client_id,number,issued_at,amount,currency,status,document_url').order('issued_at', { ascending: false }),
    admin.rpc('list_content_change_requests', { p_client_id: null }),
    admin.from('content_production_gates')
      .select('client_id,content_item_id,gate_key,state,owner_label,occurred_at,note,na_reason'),
    admin.from('ops_tasks').select('id,title,category,due_date,trigger_note,status').eq('status', 'open'),
    admin.from('content_publication_targets')
      .select('client_id,content_id,content_version,destination,status,live_url,first_verified_at'),
  ])
  const failure = clients.error ?? content.error ?? schedules.error ?? publications.error ?? observations.error
    ?? actors.error ?? integrations.error ?? syncStates.error ?? conflicts.error ?? unmapped.error ?? jobs.error ?? invoices.error
    ?? contentRequests.error ?? productionGates.error ?? opsTasks.error ?? publicationBase.error
  if (failure) throw new Error(`Portal admin data unavailable: ${failure.message}`)
  const clientMap = new Map((clients.data ?? []).map((client) => [client.id, client]))
  const contentMap = new Map((content.data ?? []).map((item) => [`${item.client_id}:${item.id}:${item.version}`, item]))
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
  const syncMap = new Map((syncStates.data ?? []).map((state) => [state.integration_id,state]))
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
      openConflicts: count(conflicts.data,integration.id), unmappedEvents: count(unmapped.data,integration.id),
      failedJobs: count(jobs.data,integration.id) }
  })
  const calendarConflicts: CalendarConflictAdmin[] = (conflicts.data ?? []).map((conflict) => ({
    id: conflict.id, integrationId: conflict.integration_id, kind: conflict.kind,
    summary: conflict.safe_summary, createdAt: conflict.created_at,
  }))
  const unmappedEvents: UnmappedCalendarEventAdmin[] = (unmapped.data ?? []).map((event) => ({
    id: event.id, clientId: event.client_id, summary: event.event_summary,
    start: event.event_start_date ?? event.event_start_at, reason: event.reason,
  }))
  const adminInvoices: AdminInvoice[] = (invoices.data ?? []).map((inv) => ({
    id: inv.id, clientId: inv.client_id,
    clientName: clientMap.get(inv.client_id)?.name ?? 'Unknown client',
    number: inv.number, issuedAt: inv.issued_at, amount: String(inv.amount),
    currency: inv.currency, status: inv.status, documentUrl: inv.document_url,
  }))
  const requestRows = (contentRequests.data ?? []) as Array<{
    id: string; client_id: string; content_id: string | null; request_type: string; status: string
    requester_name: string; created_at: string; base_version: number | null
    payload: Record<string, unknown>; resolution_note: string | null
  }>
  const adminRequests: AdminContentRequest[] = requestRows.map((request) => {
    const item = request.content_id
      ? [...contentMap.entries()].find(([key]) => key.startsWith(`${request.client_id}:${request.content_id}:`))?.[1]
      : null
    return { id: request.id, clientName: clientMap.get(request.client_id)?.name ?? 'Unknown client',
      requestType: request.request_type, status: request.status, requesterName: request.requester_name,
      createdAt: request.created_at, baseVersion: request.base_version,
      title: item?.title ?? (typeof request.payload.title === 'string' ? request.payload.title : 'Content request'),
      resolutionNote: request.resolution_note }
  })
  // Gate-system surface (agency-only, spec section 6.8): per-piece stage + my_tasks.
  const stagePieces: StagePiece[] = (content.data ?? []).map((item) => {
    const gates = (productionGates.data ?? [])
      .filter((gate) => gate.client_id === item.client_id && gate.content_item_id === item.id)
      .map((gate): ProductionGateRow => ({
        gate_key: gate.gate_key as ProductionGateRow['gate_key'],
        state: gate.state as ProductionGateRow['state'],
        owner_label: gate.owner_label as ProductionGateRow['owner_label'],
        occurred_at: gate.occurred_at, note: gate.note, na_reason: gate.na_reason }))
    const platforms: string[] = Array.isArray(item.platforms) ? item.platforms : []
    const dests = platforms.map((platform) => {
      const schedule = (schedules.data ?? []).find((row) => row.client_id === item.client_id
        && row.content_id === item.id && row.content_version === item.version && row.destination === platform)
      const publication = (publicationBase.data ?? []).find((row) => row.client_id === item.client_id
        && row.content_id === item.id && row.content_version === item.version && row.destination === platform)
      return { destination: platform, scheduleStatus: schedule?.status ?? null,
        publicationStatus: publication?.status ?? null,
        verified: Boolean(publication?.first_verified_at),
        scheduledAt: schedule?.scheduled_at ?? null, liveUrl: publication?.live_url ?? null }
    })
    const approvalSent = gates.find((gate) => gate.gate_key === 'approval_sent')
    return { contentId: item.content_id, title: item.title, status: item.status,
      factCheck: item.fact_check, factCheckExempt: Boolean(item.fact_check_exemption),
      currentDecision: item.current_decision as StagePiece['currentDecision'],
      approvalSentAt: approvalSent?.state === 'done' ? approvalSent.occurred_at : null,
      platforms, archived: Boolean(item.archived_at), gates, dests }
  })
  const adminOpsTasks: OpsTaskRow[] = (opsTasks.data ?? [])
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px' }}>
      <p><Link href="/admin/dashboard">Back to dashboard</Link></p>
      <h1>Portal publication coordination</h1>
      <p style={{ maxWidth: 760, color: '#555' }}>
        Provider truth is recorded per destination. A planned time is never proof of scheduling or publication.
        Every operation below requires immutable evidence and preserves corrections as new observations.
      </p>
      <PublicationAdmin targets={targets} />
      <CalendarAdmin clients={(clients.data ?? []).map((client) => ({ id: client.id, name: client.name }))}
        integrations={calendarIntegrations} conflicts={calendarConflicts} unmapped={unmappedEvents}
        contentOptions={(content.data ?? []).map((item) => ({ id: item.id, clientId: item.client_id,
          version: item.version, title: item.title }))} />
      <BillingAdmin invoices={adminInvoices} />
      <RequestAdmin requests={adminRequests} />
      <GatesAdmin pieces={stagePieces} opsTasks={adminOpsTasks} todayIso={todayIso} />
    </main>
  )
}

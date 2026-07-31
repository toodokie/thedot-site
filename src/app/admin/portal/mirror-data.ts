import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { selectCurrentPlanCycle } from '@/lib/portal/plan-cycle-selection'
import { loadAgencyPieceCalendar } from '@/lib/portal/gates-loader'

// Admin read-loaders for the surfaces that MIRROR Maria's side (Ideas / Plan / Reports / Strategy
// / Library / the Calendar content view). These query with the service-role client (scoped to the
// Kanset tenant) so the agency view shows exactly what the client's own getX(clientId) getters show,
// without touching those RLS getters. Read-only; management (add idea, edit plan) is layered later.

export type IdeaRow = { id: string; author_type: string; author_name: string; title: string; body: string | null; status: string; became_content_id: string | null; created_at: string; updated_at: string }
export type AdminIdeaComment = {
  id: string; clientId: string; ideaId: string; replyToCommentId: string | null
  authorType: 'client' | 'anastasia' | 'agent'; authorName: string; body: string
  resolved: boolean; createdAt: string
}
export type PlanRow = { id: string; content_id: string; title: string; format: string | null; pillar: string | null; platforms: string[]; status: string; planned_date: string | null; client_slug?: string; not_shared?: boolean; producer?: string | null; calendar_note?: string | null; released: boolean; fact_check_valid: boolean }
export type ReportRow = { id: string; period: string; period_start: string; period_end: string; platform: string; schema_version: number; metrics: Record<string, unknown>; summary: string | null }
export type RecRow = { id: string; title: string; body: string; category: string; platform: string | null; status: string; created_at: string }
export type LinkRow = { id: string; category: string; label: string; url: string; description: string | null; sort: number | null }

async function kansetId(admin: ReturnType<typeof createSupabaseAdmin>): Promise<string> {
  const c = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  if (c.error || !c.data) throw new Error(`kanset client not found: ${c.error?.message ?? ''}`)
  return c.data.id
}

export async function loadIdeas(): Promise<IdeaRow[]> {
  const admin = createSupabaseAdmin()
  const r = await admin.from('content_ideas')
    .select('id,author_type,author_name,title,body,status,became_content_id,created_at,updated_at')
    .eq('client_id', await kansetId(admin)).neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as IdeaRow[]
}

// Ideas and their discussions are agency-readable through the service client, but this loader is
// deliberately still pinned to Kanset. Other tenants never bleed into an operator's idea inbox.
export async function loadIdeaComments(): Promise<AdminIdeaComment[]> {
  const admin = createSupabaseAdmin()
  const r = await admin.from('idea_comments')
    .select('id,client_id,idea_id,reply_to_comment_id,author_type,author_name,body,resolved,created_at')
    .eq('client_id', await kansetId(admin))
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []).map((row) => ({
    id: row.id,
    clientId: row.client_id,
    ideaId: row.idea_id,
    replyToCommentId: row.reply_to_comment_id,
    authorType: row.author_type as AdminIdeaComment['authorType'],
    authorName: row.author_name,
    body: row.body,
    resolved: row.resolved,
    createdAt: row.created_at,
  }))
}

export async function loadPlan(): Promise<PlanRow[]> {
  const admin = createSupabaseAdmin()
  const rows = await loadAgencyPieceCalendar(admin, await kansetId(admin))
  return rows.map((row) => ({
    id: row.contentId,
    content_id: row.contentId,
    title: row.title,
    format: row.format ?? null,
    pillar: row.pillar ?? null,
    platforms: row.platforms,
    status: row.status,
    planned_date: row.plannedDate,
    client_slug: row.clientSlug,
    not_shared: row.notShared,
    producer: row.producer ?? null,
    calendar_note: row.calendarNote ?? null,
    released: Boolean(row.released),
    fact_check_valid: Boolean(row.factCheckValid),
  })).sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? '') || a.content_id.localeCompare(b.content_id))
}

export type PlanCycleRow = {
  id: string; cycle_key: string; week_start: string; week_end: string; title: string
  direction_summary: string; revision: number; status: string; submitted_at: string
  decided_at: string | null; approved_revision: number | null
}
export type PlanCycleItemRow = {
  id: string; position: number; planned_date: string | null; title: string; format: string | null
  platforms: string[]; producer: string | null; direction_note: string | null; content_id: string
}
export type PlanCycleDecisionRow = { revision: number; decision: string; note: string | null; created_at: string }
export type AdminPlanCycle = {
  cycle: PlanCycleRow | null; items: PlanCycleItemRow[]; latestDecision: PlanCycleDecisionRow | null
}

// The current weekly plan cycle (status + items + latest client decision) for the agency Plan view.
// Service-role read scoped to the Kanset tenant; mirrors what the client sees on their Plan tab.
export async function loadPlanCycle(): Promise<AdminPlanCycle> {
  const admin = createSupabaseAdmin()
  const clientId = await kansetId(admin)
  const c = await admin.from('plan_cycles')
    .select('id,cycle_key,week_start,week_end,title,direction_summary,revision,status,submitted_at,decided_at,approved_revision')
    .eq('client_id', clientId)
  if (c.error) throw new Error(c.error.message)
  const cycle = selectCurrentPlanCycle((c.data ?? []) as PlanCycleRow[])
  if (!cycle) return { cycle: null, items: [], latestDecision: null }
  const it = await admin.from('plan_cycle_items')
    .select('id,position,planned_date,title,format,platforms,producer,direction_note,content_id')
    .eq('client_id', clientId).eq('plan_cycle_id', cycle.id).order('position', { ascending: true })
  if (it.error) throw new Error(it.error.message)
  const d = await admin.from('plan_cycle_decisions')
    .select('revision,decision,note,created_at')
    .eq('client_id', clientId).eq('plan_cycle_id', cycle.id).order('created_at', { ascending: false }).limit(1)
  if (d.error) throw new Error(d.error.message)
  return {
    cycle,
    items: (it.data ?? []) as PlanCycleItemRow[],
    latestDecision: ((d.data ?? [])[0] as PlanCycleDecisionRow | undefined) ?? null,
  }
}

export async function loadReports(): Promise<ReportRow[]> {
  const admin = createSupabaseAdmin()
  const r = await admin.from('report_snapshots')
    .select('id,period,period_start,period_end,platform,schema_version,metrics,summary')
    .eq('client_id', await kansetId(admin)).order('period_end', { ascending: false })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as ReportRow[]
}

export async function loadRecommendations(): Promise<RecRow[]> {
  const admin = createSupabaseAdmin()
  const r = await admin.from('recommendations')
    .select('id,title,body,category,platform,status,created_at')
    .eq('client_id', await kansetId(admin)).order('created_at', { ascending: false })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as RecRow[]
}

export async function loadLinks(): Promise<LinkRow[]> {
  const admin = createSupabaseAdmin()
  const r = await admin.from('links')
    .select('id,category,label,url,description,sort')
    .eq('client_id', await kansetId(admin))
    .order('category', { ascending: true }).order('sort', { ascending: true, nullsFirst: true })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as LinkRow[]
}

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyPieceCalendar } from '@/lib/portal/gates-loader'

// Admin read-loaders for the surfaces that MIRROR Maria's side (Ideas / Plan / Reports / Strategy
// / Library / the Calendar content view). These query with the service-role client (scoped to the
// Kanset tenant) so the agency view shows exactly what the client's own getX(clientId) getters show,
// without touching those RLS getters. Read-only; management (add idea, edit plan) is layered later.

export type IdeaRow = { id: string; author_type: string; author_name: string; title: string; body: string | null; status: string; created_at: string; updated_at: string }
export type PlanRow = { id: string; content_id: string; title: string; format: string | null; pillar: string | null; platforms: string[]; status: string; planned_date: string | null; client_slug?: string; not_shared?: boolean; producer?: string | null; calendar_note?: string | null }
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
    .select('id,author_type,author_name,title,body,status,created_at,updated_at')
    .eq('client_id', await kansetId(admin)).neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as IdeaRow[]
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
  })).sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? '') || a.content_id.localeCompare(b.content_id))
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

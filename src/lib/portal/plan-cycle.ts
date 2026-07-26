import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export type PlanCycle = {
  id: string
  client_id: string
  cycle_key: string
  week_start: string
  week_end: string
  title: string
  direction_summary: string
  revision: number
  status: 'submitted' | 'approved' | 'change_requested' | 'closed'
  submitted_at: string
  decided_at: string | null
  approved_revision: number | null
  created_at: string
  updated_at: string
}

export type PlanCycleItem = {
  id: string
  plan_cycle_id: string
  client_id: string
  content_item_id: string
  content_id: string
  position: number
  planned_date: string | null
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  direction_note: string | null
  created_at: string
  updated_at: string
}

export type PlanCycleDecision = {
  id: string
  plan_cycle_id: string
  client_id: string
  revision: number
  decision: 'approved' | 'change_requested'
  note: string | null
  created_at: string
}

export type IdeaDecision = {
  id: string
  client_id: string
  content_item_id: string
  plan_cycle_id: string
  plan_cycle_revision: number
  decision: 'approved' | 'change_requested'
  note: string | null
  created_at: string
}

const cycleColumns = 'id,client_id,cycle_key,week_start,week_end,title,direction_summary,revision,status,submitted_at,decided_at,approved_revision,created_at,updated_at'
const itemColumns = 'id,plan_cycle_id,client_id,content_item_id,content_id,position,planned_date,title,format,pillar,platforms,direction_note,created_at,updated_at'
const decisionColumns = 'id,plan_cycle_id,client_id,revision,decision,note,created_at'
const ideaDecisionColumns = 'id,client_id,content_item_id,plan_cycle_id,plan_cycle_revision,decision,note,created_at'

/**
 * Reads the client-safe plan projection under the caller's RLS session.
 * This deliberately does not fall back to Markdown or the agency loader: an outage or
 * missing projection must be visible as an error, not presented as an empty approved plan.
 */
export async function getPlanCycles(clientId: string): Promise<PlanCycle[]> {
  const supabase = await createSupabaseServer()
  const result = await supabase.from('plan_cycles_client').select(cycleColumns)
    .eq('client_id', clientId).order('week_start', { ascending: false }).order('revision', { ascending: false })
  if (result.error) throw new PortalDataError(`plan cycles unavailable: ${result.error.message}`)
  return (result.data ?? []) as PlanCycle[]
}

export async function getPlanCycleItems(clientId: string, cycleId: string): Promise<PlanCycleItem[]> {
  const supabase = await createSupabaseServer()
  const result = await supabase.from('plan_cycle_items_client').select(itemColumns)
    .eq('client_id', clientId).eq('plan_cycle_id', cycleId).order('position', { ascending: true })
  if (result.error) throw new PortalDataError(`plan cycle items unavailable: ${result.error.message}`)
  return (result.data ?? []) as PlanCycleItem[]
}

export async function getPlanCycleItemByContentId(
  clientId: string,
  contentId: string,
): Promise<PlanCycleItem | null> {
  const cycles = await getPlanCycles(clientId)
  const supabase = await createSupabaseServer()
  for (const cycle of cycles) {
    const result = await supabase.from('plan_cycle_items_client').select(itemColumns)
      .eq('client_id', clientId).eq('plan_cycle_id', cycle.id)
      .eq('content_id', contentId).maybeSingle()
    if (result.error) throw new PortalDataError(`plan cycle item unavailable: ${result.error.message}`)
    if (result.data) return result.data as PlanCycleItem
  }
  return null
}

export async function getPlanCycleDecisions(clientId: string, cycleId: string): Promise<PlanCycleDecision[]> {
  const supabase = await createSupabaseServer()
  const result = await supabase.from('plan_cycle_decisions').select(decisionColumns)
    .eq('client_id', clientId).eq('plan_cycle_id', cycleId).order('created_at', { ascending: false })
  if (result.error) throw new PortalDataError(`plan cycle decisions unavailable: ${result.error.message}`)
  return (result.data ?? []) as PlanCycleDecision[]
}

export async function getIdeaDecision(
  clientId: string,
  contentItemId: string,
  cycleId: string,
  revision: number,
): Promise<IdeaDecision | null> {
  const supabase = await createSupabaseServer()
  const result = await supabase.from('content_idea_decisions').select(ideaDecisionColumns)
    .eq('client_id', clientId).eq('content_item_id', contentItemId)
    .eq('plan_cycle_id', cycleId).eq('plan_cycle_revision', revision)
    .maybeSingle()
  if (result.error) throw new PortalDataError(`idea decision unavailable: ${result.error.message}`)
  return result.data as IdeaDecision | null
}

export async function getCurrentPlanCycle(clientId: string): Promise<{ cycle: PlanCycle | null; items: PlanCycleItem[] }> {
  const cycles = await getPlanCycles(clientId)
  const cycle = cycles[0] ?? null
  if (!cycle) return { cycle: null, items: [] }
  return { cycle, items: await getPlanCycleItems(clientId, cycle.id) }
}

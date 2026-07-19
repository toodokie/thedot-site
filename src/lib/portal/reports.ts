import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

// Reports: the twice-monthly SM performance review, one snapshot PER PLATFORM per period.
// Data is AGENT-FED and free-form (no live API), so the metrics blob is intentionally loose;
// the page renders it defensively (see reports/page.tsx). This reader stays thin: fetch + order.

export type ReportPlatform = 'instagram' | 'facebook' | 'youtube' | 'website'

// A single metric value is EITHER a plain number, OR an object carrying the previous period's
// value alongside the current one (so the page can show a delta). Anything else is skipped.
export type MetricValue = number | { value: number; prev?: number }

export type TopPost = { title?: string; url?: string; metric?: string | number }
export type TopPage = { page?: string; views?: number | string }

export type ReportRow = {
  id: string
  period: string // e.g. '2026-07-H1' (first half of July)
  period_start: string
  period_end: string
  platform: ReportPlatform
  schema_version: number
  metrics: Record<string, unknown> // free-form, agent-fed; render defensively
  summary: string | null
  collected_at: string
  created_at: string
  updated_at: string
}

// A period groups its per-platform snapshots (newest period first; platforms alphabetical).
export type ReportPeriod = { period: string; rows: ReportRow[] }

const SELECT = 'id, period, period_start, period_end, platform, schema_version, metrics, summary, collected_at, created_at, updated_at'

export async function getReports(clientId: string): Promise<ReportRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('report_snapshots')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('period_start', { ascending: false })
    .order('platform', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as ReportRow[]
}

// Group an already-sorted (period desc, platform asc) list into periods, preserving order.
export function groupByPeriod(rows: ReportRow[]): ReportPeriod[] {
  const out: ReportPeriod[] = []
  for (const row of rows) {
    const last = out[out.length - 1]
    if (last && last.period === row.period) last.rows.push(row)
    else out.push({ period: row.period, rows: [row] })
  }
  return out
}

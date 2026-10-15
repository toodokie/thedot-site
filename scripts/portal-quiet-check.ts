import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { decidePortalQuiet, type PortalActivitySignal } from './portal-quiet-check-core'

const DEFAULT_MINUTES = 45

type SignalDefinition = {
  table: string
  timestamp: string
  label: string
  actorType?: string
}

const SIGNALS: SignalDefinition[] = [
  { table: 'content_review_drafts', timestamp: 'updated_at', label: 'Review draft updates' },
  { table: 'activity_log', timestamp: 'created_at', label: 'Client activity events', actorType: 'client' },
  { table: 'portal_seen', timestamp: 'last_seen_at', label: 'Portal page visits' },
  { table: 'portal_report_views', timestamp: 'viewed_at', label: 'Report views' },
  { table: 'content_review_tab_ticks', timestamp: 'ticked_at', label: 'Review tab ticks' },
  { table: 'content_review_option_picks', timestamp: 'picked_at', label: 'Review option picks' },
  { table: 'portal_feedback_responses', timestamp: 'created_at', label: 'Portal feedback responses' },
  { table: 'content_review_playback_failures', timestamp: 'occurred_at', label: 'Playback failure reports' },
]

export function parseMinutes(args: string[]): number {
  const equals = args.find((arg) => arg.startsWith('--minutes='))
  const flag = args.indexOf('--minutes')
  const raw = equals?.slice('--minutes='.length) ?? (flag >= 0 ? args[flag + 1] : undefined)
  if (raw === undefined) return DEFAULT_MINUTES
  const minutes = Number(raw)
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('--minutes must be a positive whole number')
  }
  return minutes
}

async function readSignal(
  supabase: SupabaseClient,
  definition: SignalDefinition,
  since: string,
): Promise<PortalActivitySignal> {
  let query = supabase
    .from(definition.table)
    .select(definition.timestamp, { count: 'exact' })
    .gte(definition.timestamp, since)
  if (definition.actorType) query = query.eq('actor_type', definition.actorType)
  const { data, count, error } = await query
    .order(definition.timestamp, { ascending: false })
    .limit(1)
  if (error) throw new Error(`${definition.table}: ${error.message}`)
  const row = data?.[0] as unknown as Record<string, unknown> | undefined
  const latest = row?.[definition.timestamp]
  return {
    label: definition.label,
    count: count ?? 0,
    latestAt: typeof latest === 'string' ? latest : null,
  }
}

async function main(): Promise<void> {
  const minutes = parseMinutes(process.argv.slice(2))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signals = await Promise.all(SIGNALS.map((definition) => readSignal(supabase, definition, since)))
  const decision = decidePortalQuiet(signals)

  if (!decision.active) {
    console.log(`QUIET: no client portal writes since ${since} (${minutes} minutes).`)
    process.exitCode = 0
    return
  }

  console.log(`ACTIVE: client portal writes since ${since} (${minutes} minutes):`)
  for (const signal of decision.signals) {
    console.log(`- ${signal.label}: ${signal.count}, latest ${signal.latestAt}`)
  }
  process.exitCode = decision.exitCode
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error: unknown) => {
    console.error(`Portal quiet check failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

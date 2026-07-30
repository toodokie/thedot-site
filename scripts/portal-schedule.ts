// Read-only operational schedule report. The portal owns workflow truth:
//   planned_date        = editorial plan date, not provider proof
//   schedule target     = manually confirmed provider schedule
//   publication target  = manually verified live permalink
// A weekly Markdown plan is only a projection. With --check-plan this script checks
// explicit hidden projection markers and exits non-zero on drift, never writes either side.
//
// Usage:
//   npx tsx scripts/portal-schedule.ts kanset [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//     [--check-plan /absolute/or/relative/content-plan.md]
//
// Plan marker grammar (one line per planned piece):
//   <!-- portal-schedule: content_id=kanset-2026-07-example planned_date=2026-07-30 -->

import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Missing Supabase server environment')
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

type Item = {
  id: string; content_id: string; planned_date: string | null; working_version: number | null
  status: string; client_visible_version: number | null
}
type Version = { content_item_id: string; version: number; title: string }
type ScheduleTarget = {
  content_id: string; content_version: number; destination: string; required: boolean
  status: string; scheduled_at: string | null
}
type PublicationTarget = {
  content_id: string; content_version: number; destination: string; required: boolean
  status: string; published_at: string | null; live_url: string | null; reconciliation_status: string | null
}

function parseDate(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${flag} must be YYYY-MM-DD`)
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${flag} must be a real calendar date`)
  }
  return value
}

function torontoDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function torontoTime(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short', hour12: true,
  }).format(new Date(value))
}

function inRange(value: string | null, from: string | null, to: string | null): boolean {
  return value !== null && (from === null || value >= from) && (to === null || value <= to)
}

function summarizeTargets<T extends { destination: string; required: boolean; status: string }>(
  targets: T[], time: (target: T) => string | null,
): string {
  if (targets.length === 0) return 'none'
  return targets
    .sort((a, b) => a.destination.localeCompare(b.destination))
    .map((target) => `${target.destination}${target.required ? '' : ' (optional)'}: ${target.status}${time(target) ? ` · ${time(target)}` : ''}`)
    .join('; ')
}

function parsePlanMarkers(markdown: string): Map<string, string> {
  const markers = new Map<string, string>()
  const marker = /<!--\s*portal-schedule:\s*content_id=([a-z0-9][a-z0-9_-]{0,127})\s+planned_date=(\d{4}-\d{2}-\d{2})\s*-->/g
  for (const match of markdown.matchAll(marker)) {
    const contentId = match[1]
    const plannedDate = parseDate(match[2], `plan marker for ${contentId}`)
    if (markers.has(contentId)) throw new Error(`duplicate portal-schedule marker for ${contentId}`)
    markers.set(contentId, plannedDate)
  }
  return markers
}

async function main() {
  const [slug, ...args] = process.argv.slice(2)
  if (!slug || slug.startsWith('-')) {
    throw new Error('usage: portal-schedule <client-slug> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--check-plan path]')
  }
  let from: string | null = null
  let to: string | null = null
  let checkPlan: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    if (flag === '--from') from = parseDate(value, flag)
    else if (flag === '--to') to = parseDate(value, flag)
    else if (flag === '--check-plan') checkPlan = value
    else throw new Error(`unknown argument ${flag}`)
    index += 1
  }
  if (from && to && to < from) throw new Error('--to precedes --from')

  const { data: client, error: clientError } = await admin
    .from('clients').select('id,name,slug').eq('slug', slug).single()
  if (clientError || !client) throw new Error(`client unavailable: ${clientError?.message ?? 'missing'}`)

  const { data: rawItems, error: itemsError } = await admin
    .from('content_items')
    .select('id,content_id,planned_date,working_version,status,client_visible_version')
    .eq('client_id', client.id)
  if (itemsError) throw new Error(`content items: ${itemsError.message}`)
  const items = (rawItems ?? []) as Item[]
  const itemIds = items.map((item) => item.id)
  const [versionsResult, schedulesResult, publicationsResult] = itemIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
    : await Promise.all([
      admin.from('content_item_versions').select('content_item_id,version,title').in('content_item_id', itemIds),
      admin.from('content_schedule_targets').select('content_id,content_version,destination,required,status,scheduled_at').in('content_id', itemIds),
      admin.from('content_publication_targets').select('content_id,content_version,destination,required,status,published_at,live_url,reconciliation_status').in('content_id', itemIds),
    ])
  if (versionsResult.error || schedulesResult.error || publicationsResult.error) {
    throw new Error(`schedule read failed: ${versionsResult.error?.message ?? schedulesResult.error?.message ?? publicationsResult.error?.message}`)
  }
  const versions = (versionsResult.data ?? []) as Version[]
  const schedules = (schedulesResult.data ?? []) as ScheduleTarget[]
  const publications = (publicationsResult.data ?? []) as PublicationTarget[]
  const titleFor = (item: Item) => versions.find((version) =>
    version.content_item_id === item.id && version.version === item.working_version)?.title ?? item.content_id

  console.log(`PORTAL SCHEDULE · ${client.name} · America/Toronto`)
  console.log('planned date is editorial intent; provider schedule and live URL are separate audited facts.\n')

  const planned = items.filter((item) => inRange(item.planned_date, from, to))
    .sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? ''))
  console.log(`PLANNED (${planned.length})`)
  for (const item of planned) {
    const version = item.working_version
    const itemSchedules = schedules.filter((target) => target.content_id === item.id && target.content_version === version)
    const itemPublications = publications.filter((target) => target.content_id === item.id && target.content_version === version)
    console.log(`${item.planned_date} | ${item.content_id} | ${titleFor(item)}`)
    console.log(`  provider schedule: ${summarizeTargets(itemSchedules, (target) => target.scheduled_at ? torontoTime(target.scheduled_at) : null)}`)
    console.log(`  publication: ${summarizeTargets(itemPublications, (target) => target.published_at ? `${torontoTime(target.published_at)}${target.live_url ? ` · ${target.live_url}` : ''}` : target.live_url)}`)
  }

  const providerScheduled = schedules
    .filter((target) => target.status === 'scheduled' && inRange(torontoDate(target.scheduled_at), from, to))
    .sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
  console.log(`\nCONFIRMED PROVIDER SCHEDULES (${providerScheduled.length})`)
  for (const target of providerScheduled) {
    const item = items.find((candidate) => candidate.id === target.content_id)
    if (item) console.log(`${torontoTime(target.scheduled_at!)} | ${target.destination} | ${item.content_id} | ${titleFor(item)}`)
  }

  const live = publications
    .filter((target) => target.status === 'live' && inRange(torontoDate(target.published_at), from, to))
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
  console.log(`\nVERIFIED LIVE PUBLICATIONS (${live.length})`)
  for (const target of live) {
    const item = items.find((candidate) => candidate.id === target.content_id)
    if (item) console.log(`${torontoTime(target.published_at!)} | ${target.destination} | ${item.content_id} | ${target.live_url ?? 'NO URL'}`)
  }

  if (checkPlan) {
    const planPath = await realpath(path.resolve(checkPlan))
    const markers = parsePlanMarkers(await readFile(planPath, 'utf8'))
    const drift: string[] = []
    for (const item of items) {
      if (!inRange(item.planned_date, from, to)) continue
      const planDate = markers.get(item.content_id)
      if (!planDate) drift.push(`portal planned piece absent from projection: ${item.content_id} (${item.planned_date})`)
      else if (planDate !== item.planned_date) drift.push(`planned-date mismatch: ${item.content_id} portal=${item.planned_date} plan=${planDate}`)
    }
    for (const [contentId, planDate] of markers) {
      const item = items.find((candidate) => candidate.content_id === contentId)
      if (!item) drift.push(`plan marker has no portal identity: ${contentId} (${planDate})`)
    }
    console.log(`\nPLAN PROJECTION CHECK (${path.basename(planPath)})`)
    if (markers.size === 0) drift.push('plan has no portal-schedule markers')
    if (drift.length === 0) console.log('IN SYNC')
    else {
      for (const line of drift) console.log(`DRIFT: ${line}`)
      process.exitCode = 1
    }
  }
}

main().catch((error) => {
  console.error(`portal-schedule: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

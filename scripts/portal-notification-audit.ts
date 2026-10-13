// Read-only notification trace. Shows client policy health plus agency digest delivery without
// claiming or sending any notification rows.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const QUIET_ACTIVITY_EMAIL_EVENTS = new Set([
  'needs_review', 'plan_cycle_submitted', 'proposal_submitted', 'proposal_revised',
  'invoice_issued', 'request_replied', 'proposal_message', 'monthly_report_ready',
])
const VOLUME_REVIEW_THRESHOLD = 3

type NotificationRow = {
  notification_id: string
  recipient_kind: 'agency' | 'client'
  channel: 'email' | 'in_app'
  event_key: string
  source_kind: 'activity' | 'comment'
  source_activity_id: string | null
  activity_event_type: string | null
  subject: string
  related_url: string | null
  template_key: 'generic' | 'report' | 'agency_piece_digest'
  status: string
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  bundle_event_count: number
  bundle_edit_count: number
  bundle_comment_count: number
  bundle_last_event_at: string | null
  created_at: string
  completed_at: string | null
}

function optionNumber(name: string, fallback: number, min: number, max: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const parsed = Number(process.argv[index + 1])
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return parsed
}

function torontoStamp(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function torontoDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

function sourceIdentity(row: NotificationRow): string {
  return row.event_key.replace(/:(client|agency):(email|in_app)$/, '')
}

async function main(): Promise<void> {
  const slug = process.argv[2]
  if (!slug || slug.startsWith('--')) {
    throw new Error('Usage: pnpm portal-notification-audit -- <client-slug> [--days 7] [--strict]')
  }
  const days = optionNumber('--days', 7, 1, 90)
  const strict = process.argv.includes('--strict')
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const rollingSince = new Date(Date.now() - 86_400_000).toISOString()

  const { data: client, error: clientError } = await admin
    .from('clients').select('id,name,slug').eq('slug', slug).single()
  if (clientError || !client) throw new Error(`Client unavailable: ${clientError?.message ?? slug}`)

  const { data, error } = await admin.rpc('read_notification_audit', {
    p_client_id: client.id, p_since: since, p_limit: 5000,
  })
  if (error) throw new Error(`Notification audit unavailable: ${error.message}`)
  const rows = (data ?? []) as NotificationRow[]
  const { data: volumeTasks, error: volumeTaskError } = await admin
    .from('ops_tasks')
    .select('id,title,due_date,trigger_note,status')
    .eq('client_id', client.id)
    .eq('status', 'open')
    .ilike('title', '%notification volume%')
  if (volumeTaskError) throw new Error(`Notification Ops task unavailable: ${volumeTaskError.message}`)

  const clientRows = rows.filter((row) => row.recipient_kind === 'client')
  const agencyRows = rows.filter((row) => row.recipient_kind === 'agency')
  const emailRows = clientRows.filter((row) => row.channel === 'email')
  const inAppRows = clientRows.filter((row) => row.channel === 'in_app')
  const emailSources = new Set(emailRows.map(sourceIdentity))
  const portalOnly = inAppRows.filter((row) => !emailSources.has(sourceIdentity(row)))
  const held = emailRows.filter((row) => row.status === 'skipped')
  const delivered = emailRows.filter((row) => row.status === 'succeeded')
  const active = emailRows.filter((row) => ['pending', 'processing', 'failed'].includes(row.status))
  const rollingEligible = emailRows.filter((row) => row.created_at >= rollingSince
    && !['abandoned', 'skipped'].includes(row.status))
  const drift = emailRows.filter((row) => {
    if (row.source_kind === 'comment') return false
    return !row.activity_event_type || !QUIET_ACTIVITY_EMAIL_EVENTS.has(row.activity_event_type)
  })

  const byDay = new Map<string, number>()
  for (const row of emailRows.filter((item) => !['abandoned', 'skipped'].includes(item.status))) {
    const day = torontoDay(row.created_at)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const reviewDays = [...byDay.entries()].filter(([, count]) => count >= VOLUME_REVIEW_THRESHOLD)

  console.log(`CLIENT NOTIFICATION AUDIT · ${client.name} · last ${days} day(s)`)
  console.log(`Policy: client email only for decisions, invoices, and direct replies; internal review at ${VOLUME_REVIEW_THRESHOLD} in rolling 24 hours, with no hard delivery cap.`)
  console.log(`Email rows: ${emailRows.length} · sent: ${delivered.length} · active: ${active.length} · held: ${held.length}`)
  console.log(`Portal-only events: ${portalOnly.length} · current rolling volume: ${rollingEligible.length} · review threshold: ${VOLUME_REVIEW_THRESHOLD}`)
  console.log(`Open notification-volume Ops task: ${(volumeTasks ?? []).length ? 'yes' : 'no'}`)

  console.log('\nEMAIL TRACE')
  if (!emailRows.length) console.log('none')
  for (const row of emailRows) {
    const eventType = row.activity_event_type ?? row.source_kind
    const detail = row.last_error ? ` · ${row.last_error}` : ''
    console.log(`${torontoStamp(row.created_at)} · ${row.status} · ${eventType ?? 'unknown'} · ${row.subject}${detail}`)
  }

  console.log('\nPORTAL-ONLY BY EVENT')
  const portalOnlyCounts = new Map<string, number>()
  for (const row of portalOnly) {
    const eventType = row.activity_event_type ?? row.source_kind
    portalOnlyCounts.set(eventType ?? 'unknown', (portalOnlyCounts.get(eventType ?? 'unknown') ?? 0) + 1)
  }
  if (!portalOnlyCounts.size) console.log('none')
  for (const [eventType, count] of [...portalOnlyCounts.entries()].sort()) {
    console.log(`${eventType}: ${count}`)
  }

  const clientNeedsReview = held.length > 0 || active.some((row) => row.status === 'failed')
    || drift.length > 0 || reviewDays.length > 0 || rollingEligible.length >= VOLUME_REVIEW_THRESHOLD
    || (held.length > 0 && !(volumeTasks ?? []).length)
  console.log(`\nCLIENT MONITOR: ${clientNeedsReview ? 'REVIEW' : 'OK'}`)
  if (held.length) console.log(`- ${held.length} email(s) were held by policy.`)
  if (held.length && !(volumeTasks ?? []).length) console.log('- Held email has no open notification-volume Ops task.')
  if (active.length) console.log(`- Active delivery rows: ${active.map((row) => row.status).join(', ')}.`)
  if (drift.length) console.log(`- ${drift.length} activity email row(s) fall outside the quiet allowlist.`)
  for (const [day, count] of reviewDays) console.log(`- ${day}: ${count} eligible client emails.`)

  const agencyEmailRows = agencyRows.filter((row) => row.channel === 'email')
  const agencyDelivered = agencyEmailRows.filter((row) => row.status === 'succeeded')
  const agencyActive = agencyEmailRows.filter((row) => ['pending', 'processing', 'failed'].includes(row.status))
  const now = Date.now()
  const staleAgency = agencyActive.filter((row) => row.status === 'failed'
    || (row.status === 'pending' && row.next_attempt_at
      && new Date(row.next_attempt_at).getTime() < now - 5 * 60_000))
  const abandonedAgency = agencyEmailRows.filter((row) => row.status === 'abandoned')
  const agencyNeedsReview = staleAgency.length > 0 || abandonedAgency.length > 0

  console.log(`\nAGENCY NOTIFICATION AUDIT · ${client.name} · last ${days} day(s)`)
  console.log('Policy: piece edits and comments are grouped by a five-minute quiet window, then delivered as one linked digest.')
  console.log(`Email rows: ${agencyEmailRows.length} · sent: ${agencyDelivered.length} · active: ${agencyActive.length} · abandoned: ${abandonedAgency.length}`)

  console.log('\nAGENCY EMAIL TRACE')
  if (!agencyEmailRows.length) console.log('none')
  for (const row of agencyEmailRows) {
    const eventType = row.activity_event_type ?? row.source_kind
    const bundle = row.template_key === 'agency_piece_digest'
      ? ` · digest ${row.bundle_event_count} (${row.bundle_edit_count} edits, ${row.bundle_comment_count} comments)`
      : ''
    const due = row.status === 'pending' && row.next_attempt_at
      ? ` · due ${torontoStamp(row.next_attempt_at)}`
      : ''
    const link = row.related_url ? ` · ${row.related_url}` : ''
    const detail = row.last_error ? ` · ${row.last_error}` : ''
    console.log(`${torontoStamp(row.created_at)} · ${row.status} · ${eventType} · ${row.subject}${bundle}${due}${link}${detail}`)
  }

  console.log(`\nAGENCY MONITOR: ${agencyNeedsReview ? 'REVIEW' : 'OK'}`)
  if (staleAgency.length) console.log(`- ${staleAgency.length} agency delivery row(s) are failed or overdue.`)
  if (abandonedAgency.length) console.log(`- ${abandonedAgency.length} agency delivery row(s) were abandoned.`)

  if (strict && (clientNeedsReview || agencyNeedsReview)) process.exitCode = 2
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

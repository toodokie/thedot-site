// Durable notification consumer. Drains channel='email' rows from notification_outbox via the fenced
// claim/complete RPCs and sends them (agency-only in v1). In-app rows are NOT drained here; the portal
// reads them under RLS and marks them seen. Run `--once` from cron, `--dry-run` to preview, `--list`
// for the backlog. This is the durable path; at deploy cutover the inline best-effort notify.ts calls
// in the decision/comment server actions are removed so email flows through this consumer alone.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { sendPortalNotificationEmail } from '../src/lib/portal/notify'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const WORKER = `notif-${process.pid}`
const AGENCY_EMAIL = process.env.AGENCY_EMAIL ?? null
const BATCH = 20
const CLAIM_SECONDS = 120
const MAX_ATTEMPTS = 6

type Row = {
  id: string
  claim_token: number
  recipient_kind: 'client' | 'agency'
  subject: string
  body: string
  related_url: string | null
}

async function listBacklog(): Promise<void> {
  const { data, error } = await admin
    .from('notification_outbox')
    .select('channel,status,seen_at')
  if (error) throw new Error(`list: ${error.message}`)
  const rows = data ?? []
  const email = rows.filter((r) => r.channel === 'email')
  const byStatus = email.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {})
  const unreadInApp = rows.filter((r) => r.channel === 'in_app' && r.seen_at === null).length
  console.log(`email by status: ${JSON.stringify(byStatus)}`)
  console.log(`in_app unread:   ${unreadInApp}`)
}

async function drainOnce(dryRun: boolean): Promise<number> {
  if (dryRun) {
    const { data, error } = await admin
      .from('notification_outbox')
      .select('id,subject,recipient_kind')
      .eq('channel', 'email')
      .eq('status', 'pending')
    if (error) throw new Error(`dry-run: ${error.message}`)
    for (const r of data ?? []) console.log(`[dry-run] would send -> ${r.recipient_kind}: ${r.subject}`)
    console.log(`[dry-run] ${(data ?? []).length} pending email notifications (claimed nothing)`)
    return 0
  }

  // Durability guard: if there is no destination configured we must NOT claim-and-succeed (that
  // silently drops alerts). Leave rows pending and surface the misconfiguration loudly.
  if (!AGENCY_EMAIL) {
    console.warn('AGENCY_EMAIL not configured; leaving email notifications PENDING (not dropped). Set AGENCY_EMAIL to deliver.')
    return 0
  }

  const { data: batch, error } = await admin.rpc('claim_notification_batch', {
    p_worker: WORKER,
    p_limit: BATCH,
    p_claim_seconds: CLAIM_SECONDS,
  })
  if (error) throw new Error(`claim: ${error.message}`)
  const rows = (batch ?? []) as Row[]

  for (const row of rows) {
    try {
      // v1: the 0015 trigger only ever enqueues agency-recipient email rows, so AGENCY_EMAIL (checked
      // before claiming) is the sole destination.
      await sendPortalNotificationEmail({
        to: AGENCY_EMAIL,
        subject: row.subject,
        bodyText: row.body,
        url: row.related_url,
      })
      const { error: markErr } = await admin.rpc('mark_notification_succeeded', { p_id: row.id, p_claim_token: row.claim_token })
      if (markErr) console.error(`mark_notification_succeeded failed for ${row.id}: ${markErr.message} (email sent; lease may have expired)`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const { error: failErr } = await admin.rpc('mark_notification_failed', {
        p_id: row.id,
        p_claim_token: row.claim_token,
        p_error: message,
        p_max_attempts: MAX_ATTEMPTS,
      })
      if (failErr) console.error(`mark_notification_failed failed for ${row.id}: ${failErr.message}`)
    }
  }
  return rows.length
}

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2))
  if (flags.has('--list')) return listBacklog()
  const dryRun = flags.has('--dry-run')
  const once = flags.has('--once') || dryRun
  let total = 0
  for (;;) {
    const n = await drainOnce(dryRun)
    total += n
    if (once || n === 0) break
  }
  console.log(`drained ${total} email notification(s)`)
}

main().catch((e) => {
  console.error(`FAILED: ${e?.message ?? e}`)
  process.exit(1)
})

// Durable notification consumer. Drains channel='email' rows from notification_outbox via the fenced
// claim/complete RPCs and sends them (agency-only in v1). In-app rows are NOT drained here; the portal
// reads them under RLS and marks them seen. Run `--once` from cron, `--dry-run` to preview, `--list`
// for the backlog. This is the durable path; at deploy cutover the inline best-effort notify.ts calls
// in the decision/comment server actions are removed so email flows through this consumer alone.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { drainPortalNotifications } from '../src/lib/portal/notification-worker'

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

  const result = await drainPortalNotifications(admin, {
    agencyEmail: AGENCY_EMAIL,
    worker: WORKER,
    limit: BATCH,
    claimSeconds: CLAIM_SECONDS,
    maxAttempts: MAX_ATTEMPTS,
  })
  if (result.skipped) {
    throw new Error(`${result.reason}; leaving email notifications PENDING (not dropped).`)
  }
  return result.claimed
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

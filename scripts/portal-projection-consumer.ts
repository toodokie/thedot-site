// Durable Notion projection consumer. Drains projection_outbox via the fenced claim/complete RPCs:
// claim -> decideProjection -> skip_stale (mark_superseded) / apply|archive (projector). Projectors
// are not yet wired (pending confirmed Supabase view columns + Notion property schemas), so an
// apply/archive for an unwired type is held visibly (mark_failed with a clear reason, backs off)
// rather than writing a guessed mapping. One-way only. The fail-closed notion_projection switch means
// v1 claims nothing until launch enables it (global + tenant). Run --once from cron, --dry-run to
// preview (claims nothing), --list for the backlog.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { decideProjection, routeObjectType, type ProjectionOperation } from '../src/lib/portal/notion-projection'
import { getProjector } from '../src/lib/portal/notion-projectors'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const WORKER = `proj-${process.pid}`
const BATCH = 20
const CLAIM_SECONDS = 120
const MAX_ATTEMPTS = 6

type ClaimRow = {
  id: string
  object_type: string
  object_key: string
  object_revision: number
  operation: ProjectionOperation
  claim_token: number
  last_succeeded_revision: number | null
}

async function mark(rpc: string, id: string, token: number, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await admin.rpc(rpc, { p_id: id, p_claim_token: token, ...extra })
  if (error) console.error(`${rpc} failed for ${id}: ${error.message}`)
}

async function listBacklog(): Promise<void> {
  const { data, error } = await admin.from('projection_outbox').select('status').eq('destination', 'notion')
  if (error) throw new Error(`list: ${error.message}`)
  const byStatus = (data ?? []).reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {})
  console.log(`projection_outbox by status: ${JSON.stringify(byStatus)}`)
}

async function drainOnce(dryRun: boolean): Promise<number> {
  if (dryRun) {
    const { data, error } = await admin
      .from('projection_outbox')
      .select('object_type,object_key,object_revision,operation')
      .eq('destination', 'notion').eq('status', 'pending')
    if (error) throw new Error(`dry-run: ${error.message}`)
    for (const r of data ?? []) console.log(`[dry-run] pending ${r.object_type}/${r.object_key} r${r.object_revision} op=${r.operation}`)
    console.log(`[dry-run] ${(data ?? []).length} pending (claimed nothing)`)
    return 0
  }

  const { data: batch, error } = await admin.rpc('claim_projection_batch', {
    p_worker: WORKER, p_limit: BATCH, p_claim_seconds: CLAIM_SECONDS,
  })
  if (error) throw new Error(`claim: ${error.message}`)
  const rows = (batch ?? []) as ClaimRow[]

  for (const row of rows) {
    try {
      const decision = decideProjection({
        operation: row.operation,
        objectRevision: row.object_revision,
        lastSucceededRevision: row.last_succeeded_revision,
      })
      if (decision === 'skip_stale') {
        await mark('mark_projection_superseded', row.id, row.claim_token)
        continue
      }
      const projector = getProjector(routeObjectType(row.object_type))
      if (!projector.wired) {
        await mark('mark_projection_failed', row.id, row.claim_token, {
          p_error: `projector not wired: ${row.object_type} (pending confirmed Notion schema)`,
          p_max_attempts: MAX_ATTEMPTS,
        })
        continue
      }
      // Wired projectors build a client-safe descriptor (safeFields only) and upsert/archive in
      // Notion, then mark_succeeded. No projector is wired yet; this activates per-type once its
      // Supabase view columns + Notion property schema are confirmed.
      await mark('mark_projection_failed', row.id, row.claim_token, {
        p_error: `wired projector has no writer yet: ${row.object_type}`,
        p_max_attempts: MAX_ATTEMPTS,
      })
    } catch (e) {
      await mark('mark_projection_failed', row.id, row.claim_token, {
        p_error: e instanceof Error ? e.message : String(e),
        p_max_attempts: MAX_ATTEMPTS,
      })
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
  console.log(`processed ${total} projection row(s)`)
}

main().catch((e) => {
  console.error(`FAILED: ${e?.message ?? e}`)
  process.exit(1)
})

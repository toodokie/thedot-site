// Portal health check. Regenerates every measure in the 2026-09-15 architecture audit
// so drift is caught by a schedule instead of by an archaeology session.
//
//   pnpm exec tsx scripts/portal-health.ts [kanset] [--json]
//
// Read-only. Touches no write path, sends no email, needs no clean git tree.
// Exit code 1 when any measure is non-zero, so a cron or CI step can gate on it.
//
// Audit: ~/Kanset/docs/superpowers/specs/2026-09-15-portal-architecture-audit.md (F8, F11).
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase server environment')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const CONTENT_DIR = process.env.KANSET_CONTENT_DIR ?? '/Users/anastasiavolkova/Kanset/content'
const STALE_REVIEW_DAYS = 3
const STUCK_REQUEST_HOURS = 1

type Measure = { key: string; label: string; count: number; detail: string[]; note?: string }

// Resolve a pack by its gates header, never by a bare mention of the content_id.
// The weekly content plan mentions every id in the week and sorts first alphabetically,
// which produced a wrong drift count on 2026-09-15.
function packFor(contentId: string): string | null {
  const hits: string[] = []
  for (const name of readdirSync(CONTENT_DIR)) {
    if (!name.endsWith('.md')) continue
    const path = join(CONTENT_DIR, name)
    if (new RegExp(`<!--\\s*gates:[^>]*content_id=${contentId}(?![\\w-])`).test(readFileSync(path, 'utf8'))) hits.push(path)
  }
  return hits.length === 1 ? hits[0] : null
}

function packBlocks(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<!-- portal-block:([a-z0-9-]+) -->\n(?:##[^\n]*\n)?([\s\S]*?)(?=\n<!-- portal-block:|\n<!-- internal -->|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.set(m[1], m[2].trim())
  return out
}

async function main() {
  const slug = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'kanset'
  const asJson = process.argv.includes('--json')

  const { data: client, error: clientErr } = await admin.from('clients').select('id,name').eq('slug', slug).single()
  if (clientErr || !client) throw new Error(`client unavailable: ${clientErr?.message ?? 'missing'}`)

  const { data: items } = await admin.from('content_items')
    .select('id,content_id,status,planned_date,working_version,client_visible_version,review_ready_at')
    .eq('client_id', client.id)
  const { data: versions } = await admin.from('content_item_versions').select('content_item_id,version,producer,copy_blocks')
  const { data: requests } = await admin.from('content_change_requests').select('content_id,status,updated_at')
  const { data: outbox } = await admin.from('notification_outbox').select('template_key,subject,related_url')

  const now = Date.now()
  const measures: Measure[] = []

  // F3: packs disagreeing with what the client currently sees.
  const drift: string[] = []
  let comparable = 0
  for (const item of items ?? []) {
    const pack = packFor(item.content_id)
    if (!pack) continue
    const released = (versions ?? []).find((v) => v.content_item_id === item.id && v.version === item.client_visible_version)
    const dbBlocks = new Map(((released?.copy_blocks ?? []) as Array<{ key: string; body: string }>)
      .map((b) => [b.key, String(b.body).trim()]))
    if (dbBlocks.size === 0) continue
    comparable += 1
    const pb = packBlocks(readFileSync(pack, 'utf8'))
    if ([...dbBlocks].some(([k, v]) => (pb.get(k) ?? '') !== v)) drift.push(item.content_id)
  }
  measures.push({ key: 'pack_drift', label: 'Packs disagreeing with the released version', count: drift.length,
    detail: drift, note: `${comparable} packs comparable` })

  // F5: versions missing a field a later guard requires.
  const noProducer = (versions ?? []).filter((v) => !v.producer)
  measures.push({ key: 'missing_producer', label: 'Versions with no producer', count: noProducer.length,
    detail: [], note: `of ${(versions ?? []).length} versions` })

  // F2: requests parked in a transaction state.
  const stuck = (requests ?? []).filter((r) => ['applying', 'prepared'].includes(String(r.status))
    && (now - new Date(String(r.updated_at)).getTime()) > STUCK_REQUEST_HOURS * 3600_000)
  measures.push({ key: 'stuck_requests', label: `Requests in a transaction state over ${STUCK_REQUEST_HOURS}h`,
    count: stuck.length, detail: stuck.map((r) => String(r.status)) })

  // The client's own view: genuinely waiting on her, per the SQL rule
  // (status='draft' AND review_ready_at IS NOT NULL).
  const waiting = (items ?? []).filter((i) => i.status === 'draft' && i.review_ready_at)
  const waitingLong = waiting.filter((i) => (now - new Date(String(i.review_ready_at)).getTime()) > STALE_REVIEW_DAYS * 86400_000)
  measures.push({ key: 'awaiting_review_stale', label: `Awaiting client review over ${STALE_REVIEW_DAYS} days`,
    count: waitingLong.length, detail: waitingLong.map((i) => i.content_id),
    note: `${waiting.length} awaiting review in total` })

  // F11: scheduled but the planned date has passed.
  const today = new Date().toISOString().slice(0, 10)
  const overdue = (items ?? []).filter((i) => i.status === 'scheduled' && i.planned_date && String(i.planned_date) < today)
  measures.push({ key: 'scheduled_overdue', label: 'Scheduled pieces past their planned date', count: overdue.length,
    detail: overdue.map((i) => `${i.content_id} (${i.planned_date})`) })

  // F4: a working version ahead of what the client sees, with no open request to explain it.
  const openByItem = new Set((requests ?? []).filter((r) => ['pending', 'applying', 'prepared'].includes(String(r.status)))
    .map((r) => String(r.content_id)))
  // A never-released piece has a null client_visible_version and is not an orphan;
  // only a piece that HAS been released and has newer work with nothing explaining it counts.
  const orphaned = (items ?? []).filter((i) => typeof i.client_visible_version === 'number'
    && i.client_visible_version >= 1
    && (i.working_version ?? 0) > i.client_visible_version
    && !openByItem.has(i.id))
  measures.push({ key: 'orphaned_versions', label: 'Working versions ahead of client-visible with no open request',
    count: orphaned.length, detail: orphaned.map((i) => `${i.content_id} (working v${i.working_version}, visible v${i.client_visible_version})`) })

  // F10: the no-re-review rule, measured from what actually reached her inbox.
  const reviewMails = (outbox ?? []).filter((r) => /needs.?review/i.test(String(r.template_key))
    || /Needs review/i.test(String(r.subject)))
  const perPiece = new Map<string, number>()
  for (const r of reviewMails) {
    const k = String(r.related_url ?? r.subject)
    perPiece.set(k, (perPiece.get(k) ?? 0) + 1)
  }
  const repeated = [...perPiece.entries()].filter(([, n]) => n > 1)
  measures.push({ key: 'repeat_review_requests', label: 'Pieces asked to review more than once', count: repeated.length,
    detail: repeated.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n}x ${k.slice(0, 64)}`),
    note: `${reviewMails.length} review emails across ${perPiece.size} pieces` })

  if (asJson) {
    console.log(JSON.stringify({ client: client.name, checked_at: new Date().toISOString(), measures }, null, 2))
  } else {
    console.log(`PORTAL HEALTH  ${client.name}  ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`)
    for (const m of measures) {
      const flag = m.count === 0 ? 'ok  ' : 'FAIL'
      console.log(`${flag}  ${String(m.count).padStart(4)}  ${m.label}${m.note ? `  (${m.note})` : ''}`)
      for (const d of m.detail.slice(0, 6)) console.log(`              ${d}`)
      if (m.detail.length > 6) console.log(`              ... and ${m.detail.length - 6} more`)
    }
    const failing = measures.filter((m) => m.count > 0).length
    console.log(`\n${failing} of ${measures.length} measures non-zero.`)
  }
  process.exitCode = measures.some((m) => m.count > 0) ? 1 : 0
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(2) })

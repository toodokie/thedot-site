// Portal health check. Regenerates every measure in the 2026-09-15 architecture audit
// so drift is caught by a schedule instead of by an archaeology session.
//
//   pnpm exec tsx scripts/portal-health.ts [kanset] [--json] [--migrations] [--open-ops-task]
//
// --open-ops-task opens an Ops My Tasks item when the portal record has fallen behind the work.
// A piece that shipped without its edits applied or its permalinks recorded emits no event, so
// the absence has to be hunted on a schedule and pushed at someone, rather than found by
// archaeology a fortnight later.

// --migrations adds the applied-versus-repository gap. It shells out to the Supabase CLI, which
// needs a login and takes a few seconds, so it is opt-in rather than part of every run. Turn it
// on wherever this runs on a schedule: production sat two migrations behind for six days without
// anyone noticing, which is F12 in the audit.
//
// Read-only. Touches no write path, sends no email, needs no clean git tree.
// Exit code 1 when any measure is non-zero, so a cron or CI step can gate on it.
//
// Audit: ~/Kanset/docs/superpowers/specs/2026-09-15-portal-architecture-audit.md (F8, F11).
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
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
  const { data: outbox } = await admin.from('notification_outbox')
    .select('template_key,subject,related_url,channel,status,created_at')

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
  // Only a version that could still need a courtesy release matters here. producer is written at
  // sync and cannot be patched in place, so every July import is permanently without one, and a
  // piece that is already live can never be re-shared anyway (publication lock). Counting those
  // kept this measure permanently red at 34 while blocking nothing: on 2026-09-21 all 17 "current"
  // ones were live or partially live July history. Count the current version of a piece that has
  // not shipped, which is the only case where the release guard can actually bite.
  const liveStates = new Set(['posted', 'archived'])
  const openItems = new Map((items ?? []).filter((i) => !liveStates.has(String(i.status))).map((i) => [i.id, i]))
  const blocking = noProducer.filter((v) => {
    const item = openItems.get(v.content_item_id)
    return Boolean(item) && (v.version === item!.working_version || v.version === item!.client_visible_version)
  })
  measures.push({ key: 'missing_producer', label: 'Unshipped versions with no producer', count: blocking.length,
    detail: blocking.map((v) => `${openItems.get(v.content_item_id)!.content_id} v${v.version}`),
    note: `${noProducer.length} of ${(versions ?? []).length} versions lack one; the rest have shipped and cannot be re-shared` })

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

  // Client edits we have not closed. The ops "Needs your attention" list is built from these, so
  // a piece can sit there for a fortnight after it has already shipped. On 2026-09-16 two pieces
  // were carrying six of Maria's edits, both live on YouTube since the day they were planned:
  // the wording had been applied to the artifacts and never recorded in the portal.
  const OPEN_EDIT_DAYS = 3
  const openEdits = (requests ?? []).filter((r) => ['pending', 'applying', 'prepared', 'conflicted']
    .includes(String(r.status)))
  const staleEdits = openEdits.filter((r) => (now - new Date(String(r.updated_at)).getTime())
    > OPEN_EDIT_DAYS * 86400_000)
  const staleByPiece = new Map<string, number>()
  for (const r of staleEdits) {
    const item = (items ?? []).find((i) => i.id === r.content_id)
    const key = item?.content_id ?? String(r.content_id)
    staleByPiece.set(key, (staleByPiece.get(key) ?? 0) + 1)
  }
  measures.push({ key: 'stale_client_edits', label: `Client edits open more than ${OPEN_EDIT_DAYS} days`,
    count: staleEdits.length,
    detail: [...staleByPiece.entries()].map(([k, n]) => `${n} on ${k}`),
    note: `${openEdits.length} open in total` })

  // F12: the repository is not the thing that runs. A migration on disk that never reached
  // production is invisible to every other measure here, because they all read production.
  if (process.argv.includes('--migrations')) {
    const local = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
      .filter((n) => n.endsWith('.sql')).map((n) => n.slice(0, 4)).sort()
    let unapplied: string[] = []
    let note = ''
    try {
      // The CLI emits JSON when its output is piped and a pretty table when it is not, and it
      // does not consistently choose a stream, so both are captured and both shapes accepted.
      const raw = execFileSync('supabase', ['migration', 'list', '--linked'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) + ''
      const brace = raw.indexOf('{"migrations"')
      let remote: Set<string>
      if (brace >= 0) {
        const parsed = JSON.parse(raw.slice(brace, raw.lastIndexOf('}') + 1)) as
          { migrations: Array<{ local: string; remote: string }> }
        remote = new Set(parsed.migrations.filter((m) => m.remote).map((m) => m.remote))
        unapplied = parsed.migrations.filter((m) => m.local && !m.remote).map((m) => m.local)
      } else {
        const rows = [...raw.matchAll(/^\s*`(\d+)`\s*\|\s*(?:`(\d+)`)?\s*\|/gm)]
        if (rows.length === 0) throw new Error('no migration rows in the CLI output')
        remote = new Set(rows.filter((m) => m[2]).map((m) => m[2]!))
        unapplied = rows.filter((m) => !m[2]).map((m) => m[1])
      }
      note = `${remote.size} applied, ${local.length} in the repository`
    } catch (e) {
      // A failure to ask is not a clean bill of health, so it counts as one finding.
      unapplied = ['could not read the remote ledger']
      note = String((e as Error)?.message ?? e).slice(0, 120)
    }
    measures.push({ key: 'unapplied_migrations', label: 'Migrations in the repository but not in production',
      count: unapplied.length, detail: unapplied, note })
  }

  // F10: the no-re-review rule, measured from what actually reached her inbox.
  // Every notification is written once per channel: one in_app row and one email row for the same
  // event. Counting both made this measure read about twice as bad as reality, and on 2026-09-21 it
  // looked like every release since the rule had emailed her twice. Only the email channel is an
  // ask; the in-app row is the same event rendered in the portal. A row that never sent is not an
  // ask either, so failed and queued rows are excluded too.
  const reviewMails = (outbox ?? []).filter((r) => (/needs.?review/i.test(String(r.template_key))
    || /Needs review/i.test(String(r.subject)))
    && r.channel === 'email' && r.status === 'succeeded')
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

  // Nothing emits an event when a record simply fails to follow the work, so the absence has to be
  // looked for on a schedule and then pushed at someone. This mirrors the notification-volume
  // monitor (0065), which opens its own ops task rather than waiting to be noticed. One task per
  // client per day, idempotent, so a daily run refreshes rather than piles up.
  if (process.argv.includes('--open-ops-task')) {
    const behind = measures.filter((m) => ['stale_client_edits', 'scheduled_overdue', 'stuck_requests']
      .includes(m.key) && m.count > 0)
    if (behind.length === 0) {
      console.log('\nRecord is current; no ops task opened.')
    } else {
      const today = new Date().toISOString().slice(0, 10)
      const note = behind.map((m) => `${m.count} ${m.label.toLowerCase()}`).join('; ')
        + '. The work was probably done and the portal record never followed it. Close them out with'
        + ' portal-ship, or apply the edits and release.'
      const { error } = await admin.rpc('add_ops_task', {
        p_client_id: client.id,
        p_title: 'Portal record is behind the work',
        p_category: 'portal',
        p_due_date: today,
        p_trigger_note: note.slice(0, 500),
        p_owner: 'agent',
        p_source: 'Automatic portal health check, portal-health.ts --open-ops-task',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `portal-health-behind:${client.id}:${today}`,
      })
      // The key is one task per client per day. A second run the same day carries a different
      // summary once part of the backlog has been cleared, and add_ops_task refuses a reused key
      // with a changed request, which is correct: it protects the record rather than silently
      // rewriting today's task. Treat that as "already raised today" rather than as a failure.
      if (error && /idempotency key reused/.test(error.message)) {
        console.log('\nOps task for today is already open; leaving it as raised.')
      } else if (error) {
        console.error(`could not open the ops task: ${error.message}`)
      } else {
        console.log(`\nOps task opened: ${note.slice(0, 120)}`)
      }
    }
  }
  process.exitCode = measures.some((m) => m.count > 0) ? 1 : 0
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(2) })

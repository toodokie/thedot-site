// Option B gate-sync (spec: ~/Kanset/docs/superpowers/specs/2026-07-22-gate-sync-and-flow-input-design.md).
//
// Mirrors each pack's STATUS GATES block -> the portal's content_production_gates so the file
// stays the write surface and the portal stops lagging. Deterministic + idempotent + re-runnable.
//
//   npx tsx scripts/sync-gates.ts --dry-run     # print the diff, write NOTHING
//   npx tsx scripts/sync-gates.ts               # push changes via the audited `portal-write gate`
//
// SCOPE (verification boundary, spec section 3): only the FOUR agency-owned production gates
// (source_in_hand, design_built, proofed, approval_sent) live in content_production_gates and are
// synced here. copy-approved (Maria), scheduled, posted, link-confirmed, and fact-check are NEVER
// written from a checkbox; they keep their own audited evidence paths. Absence != n/a (a gate not
// present in a block is never touched). Gate notes are AGENCY-CONFIDENTIAL provenance and are PII-
// screened before send.
//
// Hardened per Codex reviews 2026-07-22 (2 rounds): only markers INSIDE a `## STATUS GATES` section
// count; a block with ANY invalid gate writes NOTHING (fail closed, no partial sync); multiple blocks
// stay separate; Supabase/child errors fail loud; full-provenance compare; occurredAt is passed for
// any supplied date (idempotent for open/na too); duplicates, destination suffixes, and malformed
// lines are rejected; the lookup is Kanset-scoped; reads are confined to the realpath'd content root;
// execution is repo-root-relative.

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)) // scripts/ -> repo root
const CONTENT_DIR = process.env.KANSET_CONTENT_DIR || join(homedir(), 'Kanset', 'content')
const CLIENT_SLUG = 'kanset'
const AGENCY_GATES = new Set(['source-in-hand', 'design-built', 'proofed', 'approval-sent'])
// The other five of the nine gates: recognized, but synced via their own evidence paths, never here.
// A gate key in NEITHER set is an unknown/typo (e.g. "source-in-hnad") and fails the block closed
// rather than being silently ignored (which would leave the portal stale while the hook exits 0).
const OUT_OF_SCOPE_GATES = new Set(['fact-check', 'copy-approved', 'scheduled', 'posted', 'link-confirmed'])
const OWNERS = new Set(['anastasia', 'studio', 'agent'])
const STATE: Record<string, 'open' | 'done' | 'na'> = { ' ': 'open', x: 'done', '~': 'na' }

// `- [state] gate-key[:dest] @owner [date] | note`  (locked grammar, my-tasks-design spec section 5)
const GATE_LINE = /^- \[([ x~])\]\s+([a-z-]+)(:[a-z]+)?\s+@(\w+)(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s*\|\s*(.*))?$/
// Gate notes are agency-confidential provenance (the RPC never shows them to clients). We still
// reject a real EMAIL ADDRESS as a belt-and-suspenders PII guard; it never matches "[email-mg-x.md]"
// filenames or "@handle" mentions (both lack a domain), and unlike a phone regex it can't misfire on dates.
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i

type Gate = { gateKey: string; state: 'open' | 'done' | 'na'; owner: string; date: string | null; note: string | null }
type Block = { contentId: string; gates: Gate[]; errors: string[] }

// Calendar-valid, not just shape-valid: JS silently rolls 2026-02-31 to Mar 3, which would drift the
// portal date. Verify the parsed y/m/d survive a UTC round-trip (Codex should-fix).
function isValidDate(d: string): boolean {
  const [y, mo, day] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, day))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === day
}

// Split a pack into gate BLOCKS. A block is a `<!-- gates: content_id=X -->` marker that appears
// INSIDE a `## STATUS GATES` section (tracked by the current H2), running to the next H2 / next
// marker / EOF. Markers OUTSIDE a STATUS GATES section (copied, commented, quoted in notes) are
// ignored, so gate-shaped text can never become a write. Multiple blocks per file stay separate.
function parseFile(text: string, file: string): { blocks: Block[]; warnings: string[] } {
  const warnings: string[] = []
  const blocks: Block[] = []
  let cur: { contentId: string; body: string[] } | null = null
  let inStatusGates = false
  const flush = () => { if (cur) { blocks.push(parseBlock(cur.contentId, cur.body)); cur = null } }
  for (const line of text.split('\n')) {
    if (/^##\s/.test(line)) { // an H2 boundary closes any open block and re-scopes
      flush()
      inStatusGates = /status gates/i.test(line) // matches "## STATUS GATES" and "## ⛔ STATUS GATES ..."
      continue
    }
    if (/<!--\s*gates:/.test(line)) {
      if (!inStatusGates) continue // a marker outside a STATUS GATES section is never a gate block
      flush()
      const cid = line.match(/\bcontent_id=([\w-]+)/)
      if (!cid) { warnings.push(`${file}: a STATUS GATES block has no content_id= (skipped)`); continue }
      cur = { contentId: cid[1], body: [] }
      continue
    }
    if (cur) cur.body.push(line)
  }
  flush()
  return { blocks, warnings }
}

function parseBlock(contentId: string, body: string[]): Block {
  const gates: Gate[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const line of body) {
    const m = line.match(GATE_LINE)
    if (!m) {
      // A checkbox-shaped line inside the block that does not parse is a typo/malformation, not
      // "absent" (Codex should-fix): surface it rather than silently dropping it.
      if (/^- \[/.test(line.trim())) errors.push(`malformed gate line (does not match grammar): ${line.trim().slice(0, 60)}`)
      continue
    }
    const [, s, gateKey, dest, owner, date, rawNote] = m
    if (OUT_OF_SCOPE_GATES.has(gateKey)) continue // recognized (Maria/external): synced via its own path, not here
    if (!AGENCY_GATES.has(gateKey)) { errors.push(`unknown gate key '${gateKey}' (typo? not one of the nine gates)`); continue }
    const note = rawNote?.trim() || null
    const state = STATE[s]
    if (dest) { errors.push(`${gateKey}: destination suffix '${dest}' not allowed (this table is piece-level in v1)`); continue }
    if (seen.has(gateKey)) { errors.push(`${gateKey}: duplicate gate line`); continue }
    seen.add(gateKey)
    if (!OWNERS.has(owner)) { errors.push(`${gateKey}: owner @${owner} is not an agency owner`); continue }
    if (date && !isValidDate(date)) { errors.push(`${gateKey}: '${date}' is not a valid calendar date`); continue }
    if (state === 'done' && !date) { errors.push(`${gateKey}: done without a date (no provenance, no close)`); continue }
    if (state === 'na' && !note) { errors.push(`${gateKey}: n/a without a reason`); continue }
    if (note && EMAIL.test(note)) { errors.push(`${gateKey}: note contains an email address; gate notes are agency provenance and must not carry PII`); continue }
    gates.push({ gateKey, state, owner, date: date ?? null, note })
  }
  return { contentId, gates, errors }
}

// Normalized provenance tuple, so an owner/date/note correction (not just a state flip) is detected.
function fileTuple(g: Gate): string {
  return [g.state, g.date ?? '', g.owner, g.note ?? '', g.state === 'na' ? (g.note ?? '') : ''].join('|')
}
function portalTuple(row: { state: string; owner_label: string | null; occurred_at: string | null; note: string | null; na_reason: string | null }): string {
  return [row.state, (row.occurred_at ?? '').slice(0, 10), row.owner_label ?? '', row.note ?? '', row.na_reason ?? ''].join('|')
}

async function main() {
  const env = Object.fromEntries(readFileSync(join(REPO_ROOT, '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const dryRun = process.argv.includes('--dry-run')

  // scope to the Kanset tenant (writes hard-code the slug; the lookup must not cross tenants)
  const client = await sb.from('clients').select('id').eq('slug', CLIENT_SLUG).single()
  if (client.error || !client.data) throw new Error(`client lookup failed: ${client.error?.message ?? 'no kanset client'}`)
  const clientId = client.data.id
  const items = await sb.from('content_items').select('id,content_id').eq('client_id', clientId)
  if (items.error) throw new Error(`content_items read failed: ${items.error.message}`)
  const idToCid = new Map((items.data ?? []).map((r) => [r.id, r.content_id]))
  const cidToId = new Map((items.data ?? []).map((r) => [r.content_id, r.id]))
  const gateRows = await sb.from('content_production_gates')
    .select('content_item_id,gate_key,state,owner_label,occurred_at,note,na_reason').eq('client_id', clientId)
  if (gateRows.error) throw new Error(`content_production_gates read failed: ${gateRows.error.message}`)
  const portal = new Map<string, Record<string, typeof gateRows.data[number]>>()
  for (const r of gateRows.data ?? []) {
    const cid = idToCid.get(r.content_item_id)
    if (!cid) continue
    ;(portal.get(cid) ?? portal.set(cid, {}).get(cid)!)[r.gate_key] = r
  }

  const contentRoot = realpathSync(CONTENT_DIR) // canonical root; confine reads to it (no symlink escape)
  const tmp = mkdtempSync(join(tmpdir(), 'gatesync-'))
  let changes = 0, insync = 0, wrote = 0, failures = 0
  const skips: string[] = []
  try {
    for (const file of readdirSync(contentRoot).filter((n) => n.endsWith('.md'))) {
      const full = realpathSync(join(contentRoot, file))
      if (!full.startsWith(contentRoot + sep)) { skips.push(`${file}: resolves outside the content root (symlink?)`); continue }
      const text = readFileSync(full, 'utf8')
      if (!/<!--\s*gates:/.test(text)) continue
      const { blocks, warnings } = parseFile(text, file)
      skips.push(...warnings)
      for (const block of blocks) {
        for (const e of block.errors) { console.log(`INVALID ${file} ${block.contentId}: ${e}`); failures++ }
        // Fail closed: a block with ANY invalid gate writes NOTHING (no partial sync). Codex blocker.
        if (block.errors.length > 0) continue
        if (!cidToId.has(block.contentId)) { skips.push(`${file}: content_id ${block.contentId} not a Kanset piece`); continue }
        const cur = portal.get(block.contentId) ?? {}
        for (const g of block.gates) {
          const key = g.gateKey.replaceAll('-', '_')
          const row = cur[key]
          if (row && portalTuple(row) === fileTuple(g)) { insync++; continue }
          changes++
          const was = row ? portalTuple(row) : '(absent)'
          console.log(`CHANGE ${block.contentId} ${g.gateKey}: portal[${was}] -> file[${fileTuple(g)}]`)
          const fp = createHash('sha256').update(fileTuple(g)).digest('hex').slice(0, 12)
          const payload = {
            clientSlug: CLIENT_SLUG, contentId: block.contentId, gateKey: g.gateKey, state: g.state,
            owner: g.owner, note: g.note ?? undefined,
            naReason: g.state === 'na' ? (g.note ?? 'n/a') : undefined,
            // pass occurredAt for ANY supplied date (not just done), or an open/na gate that carries
            // a date drifts forever (the portal tuple can never match the file tuple). Codex should-fix.
            occurredAt: g.date ? `${g.date}T16:00:00Z` : undefined,
            idempotencyKey: `gatesync-${block.contentId}-${key}-${fp}`,
            actorKey: 'thedot-admin',
          }
          const pf = join(tmp, `${block.contentId}-${key}.json`)
          writeFileSync(pf, JSON.stringify(payload))
          const r = spawnSync('npx', ['tsx', 'scripts/portal-write.ts', 'gate', pf, ...(dryRun ? ['--dry-run'] : [])],
            { encoding: 'utf8', cwd: REPO_ROOT })
          const tail = (r.stdout || '').trim().split('\n').filter(Boolean).pop() ?? ''
          if (r.status !== 0) {
            failures++
            console.log(`  ERROR (exit ${r.status}${r.signal ? ` signal ${r.signal}` : ''}): ${(r.stderr || tail || 'portal-write failed').trim().split('\n').slice(-2).join(' ')}`)
          } else {
            wrote++
            console.log(`  ${dryRun ? 'DRY' : 'WROTE'}: ${tail}`)
          }
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  for (const s of skips) console.log(`SKIP ${s}`)
  console.log(`\n${dryRun ? 'DRY-RUN ' : ''}done: ${changes} change(s), ${wrote} ${dryRun ? 'would-write' : 'written'}, ${insync} in-sync, ${skips.length} skipped, ${failures} failure(s).`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

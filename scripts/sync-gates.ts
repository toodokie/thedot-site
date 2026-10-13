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
// count; multiple blocks stay separate; Supabase/child errors fail loud; full-provenance compare; occurredAt is passed for
// any supplied date (idempotent for open/na too); duplicates, destination suffixes, and malformed
// lines are rejected per line (2026-10-06: one bad line used to block the whole pack, which left
// every pack since ~Sep 24 unsynced; now that line, or that duplicated gate, is skipped with a WARN); the lookup is Kanset-scoped; reads are confined to the realpath'd content root;
// execution is repo-root-relative.

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { parseGateFile, fileTuple, portalTuple } from '../src/lib/portal/gate-sync-parse'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)) // scripts/ -> repo root
const CONTENT_DIR = process.env.KANSET_CONTENT_DIR || join(homedir(), 'Kanset', 'content')
const CLIENT_SLUG = 'kanset'
// Parser lives in src/lib/portal/gate-sync-parse.ts (unit tested). Per-line problems are WARNINGS
// that skip only that line (or, for duplicate lines, that gate); the rest of the block still syncs.
// No state, owner or date is ever inferred: a gate is written only when its line is unambiguous.

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
  let changes = 0, insync = 0, wrote = 0, failures = 0, lineWarnings = 0, backward = 0
  const skips: string[] = []
  try {
    for (const file of readdirSync(contentRoot).filter((n) => n.endsWith('.md'))) {
      const full = realpathSync(join(contentRoot, file))
      if (!full.startsWith(contentRoot + sep)) { skips.push(`${file}: resolves outside the content root (symlink?)`); continue }
      const text = readFileSync(full, 'utf8')
      if (!/<!--\s*gates:/.test(text)) continue
      const { blocks, warnings } = parseGateFile(text, file)
      skips.push(...warnings)
      for (const block of blocks) {
        for (const w of block.warnings) { console.log(`WARN ${file} ${block.contentId}: ${w}`); lineWarnings++ }
        if (!cidToId.has(block.contentId)) { skips.push(`${file}: content_id ${block.contentId} not a Kanset piece`); continue }
        const cur = portal.get(block.contentId) ?? {}
        for (const g of block.gates) {
          const key = g.gateKey.replaceAll('-', '_')
          const row = cur[key]
          if (row && portalTuple(row) === fileTuple(g)) { insync++; continue }
          changes++
          const was = row ? portalTuple(row) : '(absent)'
          // Flag a done gate the file would reopen, so a reviewer of the dry run sees it first.
          const back = row?.state === 'done' && g.state !== 'done'
          if (back) backward++
          console.log(`${back ? 'BACKWARD ' : ''}CHANGE ${block.contentId} ${g.gateKey}: portal[${was}] -> file[${fileTuple(g)}]`)
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
  console.log(`\n${dryRun ? 'DRY-RUN ' : ''}done: ${changes} change(s), ${wrote} ${dryRun ? 'would-write' : 'written'}, ${insync} in-sync, ${skips.length} skipped, ${lineWarnings} line warning(s), ${backward} backward, ${failures} failure(s).`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

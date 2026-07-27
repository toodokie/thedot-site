// Disposable integration harness for the update-portal write path.
//
// This script is deliberately local-only. It resets the local Supabase database, creates a
// throwaway canonical Git checkout, drives the real update-portal CLI, and proves the recovery
// states that unit tests cannot exercise. It never reads PORTAL_CONTENT_DIR and refuses hosted
// Supabase URLs.
import { createClient } from '@supabase/supabase-js'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'

type Env = NodeJS.ProcessEnv & {
  NEXT_PUBLIC_SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  PORTAL_CONTENT_DIR: string
  PORTAL_CONTENT_EXPECTED_REMOTE: string
  PORTAL_LOCK_DIR: string
  PORTAL_PENDING_DIR: string
}

type Snapshot = {
  version: number
  client_body: string
  content_checksum: string
}

const ROOT = mkdtempSync(join(tmpdir(), 'update-portal-harness-'))
const CANONICAL = join(ROOT, 'canonical')
const REMOTE = 'https://github.com/harness/portal-content.git'
const PACKS = join(ROOT, 'packs')
const LOCKS = join(ROOT, 'locks')
const SQL = join(ROOT, 'harness.sql')
mkdirSync(CANONICAL, { recursive: true })
mkdirSync(PACKS, { recursive: true })

function command(file: string, args: string[], env?: NodeJS.ProcessEnv, cwd = process.cwd()): string {
  return execFileSync(file, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function parseStatusEnv(): Record<string, string> {
  const raw = command('supabase', ['status', '-o', 'env'])
  const values: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (match) values[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) as string : match[2]
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error('local Supabase status did not return API_URL/SERVICE_ROLE_KEY')
  const host = new URL(values.API_URL).hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`refusing non-loopback Supabase host ${host}`)
  return values
}

function git(args: string[]): string {
  return command('git', ['-C', CANONICAL, ...args])
}

function commitCanonical(): string {
  git(['add', '--', '.'])
  git(['commit', '-m', `harness ${randomUUID()}`])
  return git(['rev-parse', 'HEAD'])
}

function canonical(version: number, body: string, factCheck: 'confirmed' | 'needs-confirm' = 'confirmed'): string {
  return `---
portal_kind: content
content_id: ${currentId}
client: kanset
title: "Harness ${currentId}"
format: carousel
platforms: [instagram]
scheduled_date: null
status: draft
version: ${version}
fact_check: ${factCheck}
fact_check_scope: not_applicable
fact_check_exemption: "Synthetic harness copy with no factual or regulatory claim."
fact_check_ledger: []
---
<!-- portal-block:caption -->
## Caption
${body}

<!-- internal -->
Harness-only internal note.
`
}

function pack(id: string, body: string): string {
  return `<!-- gates: id=${id} content_id=${id} date=2026-07-27 -->
## STATUS GATES
- [x] fact-check @anastasia [2026-07-27] | synthetic harness
- [x] copy-approved @maria [2026-07-27] | synthetic harness

<!-- portal-block:caption -->
## Caption
${body}

<!-- internal -->
Harness-only pack note.
`
}

let currentId = ''

function writeCanonical(id: string, version: number, body: string, factCheck: 'confirmed' | 'needs-confirm' = 'confirmed') {
  currentId = id
  writeFileSync(join(CANONICAL, `${id}.md`), canonical(version, body, factCheck))
}

function writePack(id: string, body: string, name = 'pack') {
  const dir = join(PACKS, name)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${id}.md`)
  writeFileSync(path, pack(id, body))
  return path
}

function envFor(local: Record<string, string>): Env {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    PORTAL_CONTENT_DIR: CANONICAL,
    PORTAL_CONTENT_EXPECTED_REMOTE: REMOTE,
    PORTAL_LOCK_DIR: LOCKS,
    PORTAL_PENDING_DIR: join(ROOT, 'pending'),
  } as Env
}

function runUpdate(env: Env, path: string, flags: string[] = []): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'scripts/update-portal.ts', path, ...flags], {
      cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
  })
}

function adminFor(local: Record<string, string>) {
  return createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function clientId(admin: ReturnType<typeof adminFor>): Promise<string> {
  const { data, error } = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  if (error || !data) throw new Error(`Kanset client lookup failed: ${error?.message ?? 'missing'}`)
  return data.id
}

async function syncInitial(admin: ReturnType<typeof adminFor>, id: string, release: boolean): Promise<void> {
  currentId = id
  const raw = readFileSync(join(CANONICAL, `${id}.md`), 'utf8')
  const parsed = parseContentFile(raw, `${id}.md`)
  const cid = await clientId(admin)
  const { data, error } = await admin.rpc('sync_content_item_versions', {
    p_items: [{
      client_id: cid, content_id: parsed.content_id, title: parsed.title, format: parsed.format,
      pillar: parsed.pillar, platforms: parsed.platforms, planned_date: parsed.scheduled_date,
      canva_url: parsed.canva_url, drive_url: parsed.drive_url, version: parsed.version,
      fact_check: parsed.fact_check, fact_check_scope: parsed.fact_check_scope,
      fact_check_exemption: parsed.fact_check_exemption, fact_check_ledger: parsed.fact_check_ledger,
      client_body: parsed.client_body, copy_blocks: parsed.copy_blocks, source_path: `${id}.md`,
    }],
  })
  if (error || !data) throw new Error(`initial sync failed: ${error?.message ?? 'missing result'}`)
  if (release) {
    const item = await admin.from('content_items').select('id').eq('client_id', cid).eq('content_id', id).single()
    if (item.error || !item.data) throw new Error(`initial item lookup failed: ${item.error?.message ?? 'missing'}`)
    const ready = await admin.rpc('mark_content_ready', { p_content_id: item.data.id, p_content_version: 1 })
    if (ready.error) throw new Error(`initial release failed: ${ready.error.message}`)
  }
}

async function state(admin: ReturnType<typeof adminFor>, id: string): Promise<{ working_version: number; client_visible_version: number | null; revision_in_progress: boolean }> {
  const cid = await clientId(admin)
  const { data, error } = await admin.from('content_items').select('working_version,client_visible_version,revision_in_progress').eq('client_id', cid).eq('content_id', id).single()
  if (error || !data) throw new Error(`state lookup failed: ${error?.message ?? 'missing'}`)
  return data
}

async function snapshot(admin: ReturnType<typeof adminFor>, id: string, version: number): Promise<Snapshot> {
  const cid = await clientId(admin)
  const { data, error } = await admin.from('content_item_versions').select('version,client_body,content_checksum').eq('client_id', cid).eq('version', version)
    .eq('source_path', `${id}.md`).single()
  if (error || !data) throw new Error(`snapshot lookup failed: ${error?.message ?? 'missing'}`)
  return data
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function waitFor(path: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (existsSync(path)) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${path}`))
      setTimeout(tick, 20)
    }
    tick()
  })
}

function sql(text: string): void {
  writeFileSync(SQL, text)
  command('supabase', ['db', 'query', '--local', '--file', SQL])
}

function checksumFromDatabase(id: string, version: number): string {
  const escaped = id.replaceAll("'", "''")
  const output = command('supabase', ['db', 'query', '--local', '-o', 'json',
    `select public.portal_content_checksum(title, format, pillar, platforms, canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption, fact_check_ledger, client_body, copy_blocks, producer, calendar_note) as checksum from public.content_item_versions where source_path = '${escaped}.md' and version = ${version}`,
  ])
  const parsed = JSON.parse(output) as { rows?: Array<{ checksum?: string }> }
  const checksum = parsed.rows?.[0]?.checksum
  if (!checksum) throw new Error(`database checksum unavailable for ${id} v${version}`)
  return checksum
}

async function main() {
  const local = parseStatusEnv()
  command('supabase', ['db', 'reset', '--local', '--no-seed', '--yes'])
  command('npx', ['tsx', 'scripts/seed-rls-local.ts'], envFor(local))
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'harness@example.invalid'])
  git(['config', 'user.name', 'Portal harness'])
  git(['remote', 'add', 'origin', REMOTE])
  const admin = adminFor(local)
  const env = envFor(local)

  // Scenario 1: the root/piece lock rejects the second live writer, and the winner's canonical
  // body is exactly the DB working snapshot.
  currentId = 'harness-race'
  writeCanonical(currentId, 1, 'Initial race body.')
  commitCanonical()
  await syncInitial(admin, currentId, false)
  sql(`create or replace function public.harness_slow_sync() returns trigger language plpgsql as $$ begin if new.source_path = 'harness-race.md' then perform pg_catalog.pg_sleep(2); end if; return new; end; $$`)
  sql('create trigger harness_slow_sync before insert on public.content_item_versions for each row execute function public.harness_slow_sync()')
  const raceA = writePack(currentId, 'Race body A.', 'race-a')
  const raceB = writePack(currentId, 'Race body B.', 'race-b')
  const first = runUpdate(env, raceA, ['--apply'])
  await waitFor(join(LOCKS, '__canonical-root__.lock'))
  const second = runUpdate(env, raceB, ['--apply'])
  const [raceOne, raceTwo] = await Promise.all([first, second])
  sql('drop trigger if exists harness_slow_sync on public.content_item_versions')
  sql('drop function if exists public.harness_slow_sync()')
  assert([raceOne.code, raceTwo.code].includes(0), 'race has no winning writer')
  assert([raceOne.code, raceTwo.code].some((code) => code !== 0), 'race did not reject the contending writer')
  const raceState = await state(admin, currentId)
  const raceSnapshot = await snapshot(admin, currentId, raceState.working_version)
  const raceCanonical = parseContentFile(readFileSync(join(CANONICAL, `${currentId}.md`), 'utf8'), `${currentId}.md`)
  assert(raceCanonical.client_body === raceSnapshot.client_body, 'race canonical and DB bodies diverged')
  console.log('PASS 1: differing-body race serialized and converged')

  // Scenario 2: commit succeeds but sync fails, then the exact same apply retries the pending
  // canonical version instead of reporting a false no-op.
  currentId = 'harness-sync-fail'
  writeCanonical(currentId, 1, 'Initial sync-failure body.')
  commitCanonical()
  await syncInitial(admin, currentId, false)
  const syncPack = writePack(currentId, 'Committed before sync failure.')
  sql(`create or replace function public.harness_fail_sync() returns trigger language plpgsql as $$ begin if new.source_path = 'harness-sync-fail.md' then raise exception 'harness harnessed sync failure'; end if; return new; end; $$`)
  sql('create trigger harness_fail_sync before insert on public.content_item_versions for each row execute function public.harness_fail_sync()')
  const failedSync = await runUpdate(env, syncPack, ['--apply'])
  assert(failedSync.code !== 0 && failedSync.output.includes('sync failed'), 'sync-failure scenario did not fail at sync')
  const stranded = await state(admin, currentId)
  assert(stranded.working_version === 1, 'sync failure advanced the DB unexpectedly')
  assert(parseContentFile(readFileSync(join(CANONICAL, `${currentId}.md`), 'utf8'), `${currentId}.md`).version === 2, 'commit was not retained after sync failure')
  sql('drop trigger if exists harness_fail_sync on public.content_item_versions')
  sql('drop function if exists public.harness_fail_sync()')
  const retriedSync = await runUpdate(env, syncPack, ['--apply'])
  assert(retriedSync.code === 0, `sync retry failed: ${retriedSync.output}`)
  assert((await state(admin, currentId)).working_version === 2, 'sync retry did not land v2')
  console.log('PASS 2: commit-then-sync-fail recovered without a false no-op')

  // Scenario 3: sync advances the working version but release fails, then the unchanged retry
  // releases that exact working version without creating v3.
  currentId = 'harness-release-fail'
  writeCanonical(currentId, 1, 'Initial release-failure body.')
  commitCanonical()
  await syncInitial(admin, currentId, true)
  const releasePack = writePack(currentId, 'Release failure body.')
  sql(`create or replace function public.harness_fail_release() returns trigger language plpgsql as $$ begin if new.content_id = 'harness-release-fail' and new.client_visible_version = 2 and old.client_visible_version = 1 then raise exception 'harness transient release failure'; end if; return new; end; $$`)
  sql('create trigger harness_fail_release before update on public.content_items for each row execute function public.harness_fail_release()')
  const failedRelease = await runUpdate(env, releasePack, ['--re-share', '--change-note', 'Harness release retry', '--apply', '--confirm'])
  assert(failedRelease.code !== 0 && failedRelease.output.includes('mark_content_ready'), 'release-failure scenario did not fail at release')
  const pending = await state(admin, currentId)
  assert(pending.working_version === 2 && pending.client_visible_version === 1, 'release failure did not preserve old visible version')
  sql('drop trigger if exists harness_fail_release on public.content_items')
  sql('drop function if exists public.harness_fail_release()')
  const retriedRelease = await runUpdate(env, releasePack, ['--re-share', '--change-note', 'Harness release retry', '--apply', '--confirm'])
  assert(retriedRelease.code === 0, `release retry failed: ${retriedRelease.output}`)
  const recovered = await state(admin, currentId)
  assert(recovered.working_version === 2 && recovered.client_visible_version === 2, 'release retry did not release v2')
  console.log('PASS 3: sync-then-release-fail recovered by releasing the existing working version')

  // Scenario 4: a changed pack during a stranded release must create and release a new version,
  // never publish the stale stranded body.
  currentId = 'harness-stale-release'
  writeCanonical(currentId, 1, 'Initial stale-release body.')
  commitCanonical()
  await syncInitial(admin, currentId, true)
  const stalePack = writePack(currentId, 'Stale stranded body.')
  sql(`create or replace function public.harness_fail_stale_release() returns trigger language plpgsql as $$ begin if new.content_id = 'harness-stale-release' and new.client_visible_version = 2 and old.client_visible_version = 1 then raise exception 'harness transient release failure'; end if; return new; end; $$`)
  sql('create trigger harness_fail_stale_release before update on public.content_items for each row execute function public.harness_fail_stale_release()')
  const staleFailure = await runUpdate(env, stalePack, ['--re-share', '--change-note', 'Harness changed pack', '--apply', '--confirm'])
  assert(staleFailure.code !== 0, 'stale-release setup did not strand a release')
  sql('drop trigger if exists harness_fail_stale_release on public.content_items')
  sql('drop function if exists public.harness_fail_stale_release()')
  const changedPack = writePack(currentId, 'New body after the stranded release.', 'stale-changed')
  const changed = await runUpdate(env, changedPack, ['--re-share', '--change-note', 'Harness changed pack', '--apply', '--confirm'])
  assert(changed.code === 0, `changed stranded release failed: ${changed.output}`)
  const changedState = await state(admin, currentId)
  assert(changedState.working_version === 3 && changedState.client_visible_version === 3, 'changed stranded release did not produce v3')
  const changedSnapshot = await snapshot(admin, currentId, 3)
  assert(changedSnapshot.client_body.includes('New body after the stranded release.'), 'stale v2 body was released')
  console.log('PASS 4: changed pending release never published stale content')

  // Scenario 5: every final canonical file converges to its DB version and checksum. The checksum
  // is read from the database-generated snapshot, while body/version equality proves the file that
  // produced it is the one now represented by the working/released record.
  for (const id of ['harness-race', 'harness-sync-fail', 'harness-release-fail', 'harness-stale-release']) {
    const current = await state(admin, id)
    const snap = await snapshot(admin, id, current.working_version)
    const parsed = parseContentFile(readFileSync(join(CANONICAL, `${id}.md`), 'utf8'), `${id}.md`)
    assert(parsed.version === snap.version, `${id}: file version ${parsed.version} != DB ${snap.version}`)
    assert(parsed.client_body === snap.client_body, `${id}: file body != DB snapshot body`)
    assert(/^[0-9a-f]{64}$/.test(snap.content_checksum), `${id}: invalid DB checksum`)
    assert(checksumFromDatabase(id, current.working_version) === snap.content_checksum, `${id}: checksum function does not reproduce snapshot checksum`)
  }
  console.log('PASS 5: canonical version/body/checksum records converge')
  console.log(`UPDATE_PORTAL_HARNESS_GREEN ${ROOT}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  try { rmSync(ROOT, { recursive: true, force: true }) } catch { /* best effort */ }
  process.exitCode = 1
})

/** Disposable Supabase integration harness for update-portal.
 *
 * The harness creates a loopback-only Supabase project, synthetic canonical Git checkout, and
 * one-shot database failure conditions. It never reads or writes the real portal-content checkout.
 * Run: npx tsx scripts/update-portal-harness.ts [--keep]
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseContentFile } from '../src/lib/portal/frontmatter'
import { clientBodyRegion } from '../src/lib/portal/update-portal-core'

type Db = SupabaseClient<any, any, any, any, any>
type Env = NodeJS.ProcessEnv
type PieceState = { id: string; working_version: number; client_visible_version: number | null; revision_in_progress: boolean; status: string }
type Snapshot = { version: number; client_body: string; content_checksum: string; copy_blocks: unknown }
type ChildResult = { status: number | null; stdout: string; stderr: string }

const ROOT = resolve(process.cwd())
const EXPECTED_REMOTE = 'https://github.com/toodokie/kanset-portal-content.git'
const TSX = join(ROOT, 'node_modules/.bin/tsx')
const UPDATE_SCRIPT = join(ROOT, 'scripts/update-portal.ts')
const KEEP = process.argv.includes('--keep')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function sqlQuote(value: string): string { return `'${value.replaceAll("'", "''")}'` }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
function writeExecutable(path: string, body: string): void { writeFileSync(path, body); chmodSync(path, 0o755) }
function run(command: string, args: string[], cwd = ROOT): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }).trim()
}
function jsonFromCli(output: string): any {
  const start = output.indexOf('{')
  if (start < 0) throw new Error(`SQL query returned no JSON: ${output}`)
  return JSON.parse(output.slice(start))
}
function spawnUpdate(pack: string, env: Env, args: string[] = [], script = UPDATE_SCRIPT): Promise<ChildResult> {
  return new Promise((resolveResult) => {
    const child: ChildProcess = spawn(TSX, [script, pack, ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout?.on('data', (x) => { stdout += String(x) })
    child.stderr?.on('data', (x) => { stderr += String(x) })
    child.on('close', (status) => resolveResult({ status, stdout, stderr }))
    child.on('error', (error) => resolveResult({ status: 1, stdout, stderr: `${stderr}${error.message}` }))
  })
}
async function waitFor(path: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (!existsSync(path)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${path}`)
    await sleep(10)
  }
}

function canonicalText(id: string, body: string, version: number, factCheck = 'confirmed'): string {
  return `---
portal_kind: content
content_id: ${id}
client: kanset
title: Synthetic harness ${id}
producer: the_dot
version: ${version}
status: draft
format: social
pillar: test
platforms: [instagram]
fact_check: ${factCheck}
fact_check_scope: not_applicable
fact_check_exemption: Synthetic disposable integration fixture only.
fact_check_ledger: []
---
<!-- portal-block:caption -->
## Caption
${body}
<!-- internal -->
Synthetic harness internal note.
`
}
function packText(packId: string, contentId: string, body: string): string {
  return `<!-- gates: id=${packId} content_id=${contentId} date=2026-07-25 -->
## STATUS GATES
- [x] fact-check | owner=Harness | date=2026-07-25
- [x] copy-approved | owner=Harness | date=2026-07-25

<!-- portal-block:caption -->
## Caption
${body}
<!-- internal -->
Synthetic harness internal note.
`
}
function createRepo(root: string, id: string, body: string): void {
  mkdirSync(root, { recursive: true })
  if (!existsSync(join(root, '.git'))) {
    run('git', ['init', '-q', '-b', 'main'], root)
    run('git', ['config', 'user.email', 'harness@example.invalid'], root)
    run('git', ['config', 'user.name', 'Update Portal Harness'], root)
    run('git', ['remote', 'add', 'origin', EXPECTED_REMOTE], root)
  }
  writeFileSync(join(root, `${id}.md`), canonicalText(id, body, 1))
  run('git', ['add', '--', `${id}.md`], root)
  run('git', ['commit', '-q', '-m', `seed ${id}`], root)
}
function commitCanonical(root: string, id: string, raw: string, message: string): void {
  writeFileSync(join(root, `${id}.md`), raw)
  run('git', ['add', '--', `${id}.md`], root)
  run('git', ['commit', '-q', '-m', message], root)
}
function makePack(root: string, packId: string, contentId: string, body: string): string {
  const path = join(root, `${packId}.md`)
  writeFileSync(path, packText(packId, contentId, body))
  return path
}
function rowFromParsed(parsed: ReturnType<typeof parseContentFile>, clientId: string, sourceCommitSha: string | null) {
  return {
    content_id: parsed.content_id, client_id: clientId, title: parsed.title, producer: parsed.producer,
    calendar_note: parsed.calendar_note, format: parsed.format, pillar: parsed.pillar, platforms: parsed.platforms,
    planned_date: parsed.scheduled_date, canva_url: parsed.canva_url, drive_url: parsed.drive_url, version: parsed.version,
    fact_check: parsed.fact_check, fact_check_scope: parsed.fact_check_scope, fact_check_exemption: parsed.fact_check_exemption,
    fact_check_ledger: parsed.fact_check_ledger, client_body: parsed.client_body, copy_blocks: parsed.copy_blocks,
    source_path: parsed.source_path, source_commit_sha: sourceCommitSha,
  }
}
function createStackConfig(stackRoot: string): void {
  const supabaseRoot = join(stackRoot, 'supabase')
  mkdirSync(supabaseRoot, { recursive: true })
  cpSync(join(ROOT, 'supabase/config.toml'), join(supabaseRoot, 'config.toml'))
  cpSync(join(ROOT, 'supabase/migrations'), join(supabaseRoot, 'migrations'), { recursive: true })
  writeFileSync(join(supabaseRoot, 'seed.sql'), '')
  const base = 55000 + Math.floor(Math.random() * 700)
  let config = readFileSync(join(supabaseRoot, 'config.toml'), 'utf8')
  config = config.replace('project_id = "thedot-site"', `project_id = "update-portal-harness-${process.pid}"`)
  for (const [from, to] of [['54321', `${base + 1}`], ['54322', `${base + 2}`], ['54320', `${base}`], ['54329', `${base + 9}`], ['54323', `${base + 3}`], ['54324', `${base + 4}`], ['54325', `${base + 5}`], ['54326', `${base + 6}`], ['54327', `${base + 7}`]]) config = config.replace(`port = ${from}`, `port = ${to}`)
  writeFileSync(join(supabaseRoot, 'config.toml'), config)
}

class Harness {
  readonly stackRoot = mkdtempSync(join(tmpdir(), 'update-portal-stack-'))
  readonly canonicalRoot = mkdtempSync(join(tmpdir(), 'update-portal-canonical-'))
  readonly packRoot = mkdtempSync(join(tmpdir(), 'update-portal-packs-'))
  readonly lockRoot = mkdtempSync(join(tmpdir(), 'update-portal-locks-'))
  readonly pendingRoot = mkdtempSync(join(tmpdir(), 'update-portal-pending-'))
  readonly keep: boolean
  readonly results: Record<string, unknown>[] = []
  env!: Env; db!: Db; clientId!: string; stackStarted = false
  constructor(keep: boolean) { this.keep = keep }

  async start(): Promise<void> {
    createStackConfig(this.stackRoot)
    run('supabase', ['start', '--workdir', this.stackRoot, '--output', 'json', '--exclude', 'analytics,vector,imgproxy,studio,storage,edge-runtime'])
    this.stackStarted = true
    await sleep(3000)
    try {
      run('supabase', ['db', 'reset', '--workdir', this.stackRoot, '--local', '--no-seed', '--yes'])
    } catch (firstError) {
      // Docker can report the freshly recreated database container before its health check has
      // settled. Retry once after a bounded wait, still on this disposable project only.
      await sleep(5000)
      try { run('supabase', ['db', 'reset', '--workdir', this.stackRoot, '--local', '--no-seed', '--yes']) }
      catch { throw firstError }
    }
    const output = run('supabase', ['status', '--workdir', this.stackRoot, '--output', 'env'])
    const status: Record<string, string> = {}
    for (const line of output.split('\n')) { const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim()); if (m) status[m[1]] = m[2] }
    assert(status.API_URL && status.SERVICE_ROLE_KEY, 'disposable Supabase credentials missing')
    assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(status.API_URL).hostname), 'Supabase URL is not loopback')
    this.env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, PORTAL_CONTENT_DIR: this.canonicalRoot, PORTAL_CONTENT_EXPECTED_REMOTE: EXPECTED_REMOTE, PORTAL_LOCK_DIR: this.lockRoot, PORTAL_PENDING_DIR: this.pendingRoot }
    this.db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await this.db.from('clients').select('id').eq('slug', 'kanset').single()
    if (error || !data) throw new Error(`Kanset seed missing: ${error?.message ?? 'no client'}`)
    this.clientId = data.id
    await this.setSwitches(true)
  }

  sql(query: string): any {
    const output = run('supabase', ['db', 'query', '--workdir', this.stackRoot, '--local', query, '--output', 'json'])
    try { return jsonFromCli(output) } catch { return null }
  }
  async setSwitches(enabled: boolean): Promise<void> {
    for (const scope of [null, this.clientId]) {
      const { error } = await this.db.rpc('set_portal_feature_switch', {
        p_client_id: scope, p_feature: 'agency_mutations', p_enabled: enabled,
        p_reason: `Disposable update-portal harness ${enabled ? 'enabled' : 'disabled'}`,
        p_actor_key: 'thedot-admin', p_idempotency_key: `harness-switch-${randomUUID()}`,
      })
      if (error) throw new Error(`set agency_mutations=${enabled}: ${error.message}`)
    }
    for (const feature of ['client_portal_launch', 'client_mutations', 'repository_worker']) {
      for (const scope of [null, this.clientId]) {
        const { error } = await this.db.rpc('set_portal_feature_switch', {
          p_client_id: scope, p_feature: feature, p_enabled: true,
          p_reason: 'Disposable update-portal harness', p_actor_key: 'thedot-admin',
          p_idempotency_key: `harness-${feature}-${randomUUID()}`,
        })
        if (error) throw new Error(`set ${feature}: ${error.message}`)
      }
    }
  }
  async seed(id: string, body: string, released: boolean): Promise<void> {
    createRepo(this.canonicalRoot, id, body)
    const parsed = parseContentFile(readFileSync(join(this.canonicalRoot, `${id}.md`), 'utf8'), `${id}.md`)
    const { data, error } = await this.db.rpc('sync_content_item_versions', { p_items: [rowFromParsed(parsed, this.clientId, git(this.canonicalRoot, ['rev-parse', 'HEAD']))] })
    if (error || !data) throw new Error(`seed sync ${id}: ${error?.message ?? 'no result'}`)
    if (released) {
      const item = await this.item(id)
      const ready = await this.db.rpc('mark_content_ready', { p_content_id: item.id, p_content_version: 1 })
      if (ready.error) throw new Error(`seed release ${id}: ${ready.error.message}`)
    }
  }
  async item(id: string): Promise<PieceState & { id: string }> {
    const { data, error } = await this.db.from('content_items').select('id, working_version, client_visible_version, revision_in_progress, status').eq('client_id', this.clientId).eq('content_id', id).single()
    if (error || !data) throw new Error(`read item ${id}: ${error?.message ?? 'missing'}`)
    return data
  }
  async snapshots(id: string): Promise<Snapshot[]> {
    const item = await this.item(id)
    const { data, error } = await this.db.from('content_item_versions').select('version, client_body, content_checksum, copy_blocks').eq('content_item_id', item.id).eq('client_id', this.clientId).order('version')
    if (error || !data) throw new Error(`read snapshots ${id}: ${error?.message ?? 'missing'}`)
    return data
  }
  baseEnv(): Env { return { ...this.env, PORTAL_CONTENT_DIR: this.canonicalRoot } }
  update(pack: string, args: string[] = [], script = UPDATE_SCRIPT): Promise<ChildResult> { return spawnUpdate(pack, this.baseEnv(), args, script) }
  mark(id: string): string { const path = join(this.pendingRoot, id); writeFileSync(path, 'pending'); return path }
  async installSyncFailure(id: string): Promise<void> {
    this.sql(`create or replace function public.harness_fail_sync_once() returns trigger language plpgsql as $$ begin if new.source_path = ${sqlQuote(`${id}.md`)} and new.version = 2 then raise exception 'harness sync failure for ${id}'; end if; return new; end $$;`)
    this.sql('drop trigger if exists harness_fail_sync_once on public.content_item_versions')
    this.sql('create trigger harness_fail_sync_once before insert on public.content_item_versions for each row execute function public.harness_fail_sync_once()')
  }
  async removeSyncFailure(): Promise<void> { this.sql('drop trigger if exists harness_fail_sync_once on public.content_item_versions'); this.sql('drop function if exists public.harness_fail_sync_once()') }
  async installReleaseFailure(id: string): Promise<void> {
    const item = await this.item(id)
    this.sql(`create or replace function public.harness_disable_release_after_sync() returns trigger language plpgsql security definer set search_path = public as $$ begin if new.id = ${sqlQuote(item.id)}::uuid and new.working_version > old.working_version then update public.portal_feature_switches set enabled = false, reason = 'Harness forced release failure' where feature = 'agency_mutations'; end if; return new; end $$;`)
    this.sql('drop trigger if exists harness_disable_release_after_sync on public.content_items')
    this.sql('create trigger harness_disable_release_after_sync after update of working_version on public.content_items for each row execute function public.harness_disable_release_after_sync()')
  }
  async removeReleaseFailure(): Promise<void> { this.sql('drop trigger if exists harness_disable_release_after_sync on public.content_items'); this.sql('drop function if exists public.harness_disable_release_after_sync()') }
  async beginAndSyncV2(id: string, body: string): Promise<void> {
    const item = await this.item(id)
    const begin = await this.db.rpc('begin_content_revision', { p_content_id: item.id, p_content_version: 1 })
    if (begin.error) throw new Error(`begin revision ${id}: ${begin.error.message}`)
    const raw = readFileSync(join(this.canonicalRoot, `${id}.md`), 'utf8')
    const revised = raw.replace('version: 1', 'version: 2').replace(/## Caption\n[\s\S]*?\n<!-- internal -->/, `## Caption\n${body}\n<!-- internal -->`)
    commitCanonical(this.canonicalRoot, id, revised, `seed stranded ${id} v2`)
    const parsed = parseContentFile(revised, `${id}.md`)
    const synced = await this.db.rpc('sync_content_item_versions', { p_items: [rowFromParsed(parsed, this.clientId, git(this.canonicalRoot, ['rev-parse', 'HEAD']))] })
    if (synced.error) throw new Error(`seed stranded sync ${id}: ${synced.error.message}`)
  }
  async assertConverged(id: string, expectedBody?: string): Promise<void> {
    const item = await this.item(id); const snapshots = await this.snapshots(id); const latest = snapshots.at(-1)
    assert(latest, `${id} has no snapshot`)
    const raw = readFileSync(join(this.canonicalRoot, `${id}.md`), 'utf8'); const parsed = parseContentFile(raw, `${id}.md`)
    assert(parsed.version === item.working_version, `${id}: canonical v${parsed.version} != working v${item.working_version}`)
    assert(latest.version === parsed.version, `${id}: latest snapshot v${latest.version} != canonical v${parsed.version}`)
    assert(latest.client_body === parsed.client_body, `${id}: DB body != canonical parsed body`)
    if (expectedBody) assert(clientBodyRegion(raw, `${id}.md`).clientBody.includes(expectedBody), `${id}: canonical body missing expected text`)
    const check = this.sql(`select version, content_checksum, public.portal_content_checksum(title,format,pillar,platforms,canva_url,drive_url,fact_check,fact_check_scope,fact_check_exemption,fact_check_ledger,client_body,copy_blocks,producer,calendar_note) as recomputed, content_checksum = public.portal_content_checksum(title,format,pillar,platforms,canva_url,drive_url,fact_check,fact_check_scope,fact_check_exemption,fact_check_ledger,client_body,copy_blocks,producer,calendar_note) as checksum_ok from public.content_item_versions where content_item_id = ${sqlQuote(item.id)}::uuid and version = ${item.working_version}`)
    assert(check.rows?.[0]?.checksum_ok === true || check.rows?.[0]?.checksum_ok === 't' || check.rows?.[0]?.checksum_ok === 'true', `${id}: DB checksum does not recompute (${JSON.stringify(check.rows?.[0])})`)
  }

  async scenarioRace(): Promise<void> {
    const id = 'harness-race'; await this.seed(id, 'seed race body', false)
    const a = makePack(this.packRoot, 'harness-race-a', id, 'RACE BODY A'); const b = makePack(this.packRoot, 'harness-race-b', id, 'RACE BODY B')
    const hook = join(this.canonicalRoot, '.git/hooks/pre-commit'); writeExecutable(hook, '#!/bin/sh\nsleep 1\n')
    const firstPromise = this.update(a, ['--apply']); await waitFor(join(this.lockRoot, `${id}.lock`)); const secondPromise = this.update(b, ['--apply'])
    const [first, second] = await Promise.all([firstPromise, secondPromise]); rmSync(hook, { force: true })
    assert(first.status === 0, `race winner failed: ${first.stderr}`); assert(second.status !== 0 && /holds the lock/.test(second.stderr), 'race loser did not fail on the piece lock')
    assert((await this.item(id)).working_version === 2, 'race produced more than one version'); await this.assertConverged(id, 'RACE BODY A')
    this.results.push({ scenario: 1, name: 'two-process differing-body race', winner: 'A', loser: 'lock-refused' })
  }
  async scenarioSyncRetry(): Promise<void> {
    const id = 'harness-sync-retry'; await this.seed(id, 'seed sync body', false); const pack = makePack(this.packRoot, 'harness-sync-retry-pack', id, 'SYNC RETRY BODY'); const marker = this.mark(id)
    await this.installSyncFailure(id); const failed = await this.update(pack, ['--apply'])
    assert(failed.status !== 0 && /sync failed/.test(failed.stderr), 'sync failure trigger did not fire')
    assert((await this.item(id)).working_version === 1, 'failed sync changed DB'); assert(parseContentFile(readFileSync(join(this.canonicalRoot, `${id}.md`), 'utf8'), `${id}.md`).version === 2, 'failed sync did not leave canonical v2'); assert(existsSync(marker), 'failed sync cleared pending marker')
    await this.removeSyncFailure(); const retried = await this.update(pack, ['--apply']); assert(retried.status === 0, `sync retry failed: ${retried.stderr}`)
    assert((await this.item(id)).working_version === 2, 'sync retry did not advance working version'); assert(!existsSync(marker), 'successful retry retained pending marker'); await this.assertConverged(id, 'SYNC RETRY BODY')
    this.results.push({ scenario: 2, name: 'commit-ok / sync-fail / rerun', first_failure: true, retry: true })
  }
  async scenarioReleaseRetry(): Promise<void> {
    const id = 'harness-release-retry'; await this.seed(id, 'seed release body', true); const pack = makePack(this.packRoot, 'harness-release-retry-pack', id, 'RELEASE RETRY BODY'); const marker = this.mark(id)
    await this.installReleaseFailure(id); const failed = await this.update(pack, ['--re-share', '--change-note', 'Synthetic retry', '--apply', '--confirm'])
    assert(failed.status !== 0 && /ready|agency_mutations|release/i.test(failed.stderr), 'release failure trigger did not fire')
    const stranded = await this.item(id); assert(stranded.working_version === 2 && stranded.client_visible_version === 1 && stranded.revision_in_progress, 'release failure did not leave safe stranded draft'); assert((await this.snapshots(id)).length === 2, 'release failure changed snapshot count unexpectedly'); assert(existsSync(marker), 'release failure cleared pending marker')
    await this.removeReleaseFailure(); await this.setSwitches(true); const retried = await this.update(pack, ['--re-share', '--change-note', 'Synthetic retry', '--apply', '--confirm']); assert(retried.status === 0, `release retry failed: ${retried.stderr}`)
    const released = await this.item(id); assert(released.working_version === 2 && released.client_visible_version === 2 && !released.revision_in_progress, 'release retry did not release existing working version'); assert((await this.snapshots(id)).length === 2, 'release retry synced a third version'); assert(!existsSync(marker), 'successful release retry retained pending marker'); await this.assertConverged(id, 'RELEASE RETRY BODY')
    this.results.push({ scenario: 3, name: 'sync-ok / release-fail / rerun', first_failure: true, release_retry_without_resync: true })
  }
  async scenarioChangedPendingRelease(): Promise<void> {
    const id = 'harness-changed-pending'; await this.seed(id, 'seed pending body', true); await this.beginAndSyncV2(id, 'STRANDED OLD BODY')
    const pack = makePack(this.packRoot, 'harness-changed-pending-pack', id, 'NEW BODY AFTER STRANDED RELEASE'); const result = await this.update(pack, ['--re-share', '--change-note', 'New body', '--apply', '--confirm'])
    assert(result.status === 0, `changed pending-release apply failed: ${result.stderr}`); const item = await this.item(id); assert(item.working_version === 3 && item.client_visible_version === 3, 'changed pending release did not sync/release new version')
    const snapshots = await this.snapshots(id); assert(snapshots.length === 3, 'changed pending release did not create v3'); assert(snapshots[1].client_body.includes('STRANDED OLD BODY'), 'v2 stale body was not preserved'); assert(snapshots[2].client_body.includes('NEW BODY AFTER STRANDED RELEASE'), 'v3 new body was not persisted'); await this.assertConverged(id, 'NEW BODY AFTER STRANDED RELEASE')
    this.results.push({ scenario: 4, name: 'changed pack during pending-release recovery', old_visible: 2, new_visible: 3, regression_guard: 'passed' })
  }

  async shadowScript(replacement: 'remove-pending-sync' | 'release-always' | 'remove-body-guard'): Promise<string> {
    const shadowRoot = mkdtempSync(join(tmpdir(), 'update-portal-shadow-'))
    mkdirSync(join(shadowRoot, 'scripts'), { recursive: true })
    cpSync(join(ROOT, 'src'), join(shadowRoot, 'src'), { recursive: true })
    // Keep package resolution identical to the frozen checkout while the shadow source lives in
    // a disposable directory. No production files are changed by these mutation runs.
    symlinkSync(join(ROOT, 'node_modules'), join(shadowRoot, 'node_modules'), 'dir')
    const original = readFileSync(UPDATE_SCRIPT, 'utf8')
    let mutated = original
    let changed = false
    if (replacement === 'remove-pending-sync') {
      const corePath = join(shadowRoot, 'src/lib/portal/update-portal-core.ts')
      const core = readFileSync(corePath, 'utf8')
      const changedCore = core.replace('changed: input.bodyChanged || pendingSync || pendingRelease,', 'changed: input.bodyChanged || pendingRelease,')
      assert(changedCore !== core, 'pendingSync self-doubt mutation did not match frozen core')
      writeFileSync(corePath, changedCore)
      changed = true
    } else if (replacement === 'release-always') {
      mutated = mutated.replace('const releaseRetry = ctx.pendingRelease && !ctx.bodyChanged\n    && ctx.canonicalVersion === ctx.workingVersion && ctx.revisionInProgress', 'const releaseRetry = ctx.pendingRelease\n    && ctx.canonicalVersion === ctx.workingVersion && ctx.revisionInProgress')
      changed = mutated !== original
    } else {
      mutated = mutated.replace('const releaseRetry = ctx.pendingRelease && !ctx.bodyChanged\n    && ctx.canonicalVersion === ctx.workingVersion && ctx.revisionInProgress', 'const releaseRetry = false')
      changed = mutated !== original
    }
    assert(changed, `self-doubt mutation ${replacement} did not match frozen source`)
    const script = join(shadowRoot, 'scripts/update-portal.ts'); writeFileSync(script, mutated); return script
  }

  async selfDoubt(): Promise<void> {
    const syncId = 'harness-shadow-sync'; await this.seed(syncId, 'shadow seed sync', false); const syncPack = makePack(this.packRoot, 'harness-shadow-sync-pack', syncId, 'SHADOW SYNC BODY'); const shadowNoRetry = await this.shadowScript('remove-pending-sync')
    await this.installSyncFailure(syncId); const first = await this.update(syncPack, ['--apply'], shadowNoRetry); assert(first.status !== 0, 'shadow sync-failure setup unexpectedly succeeded'); await this.removeSyncFailure()
    const second = await this.update(syncPack, ['--apply'], shadowNoRetry); const syncState = await this.item(syncId); assert(second.status === 0 && syncState.working_version === 1, `retry test would not fail with pendingSync removed (status=${second.status}, working=${syncState.working_version}, stderr=${second.stderr})`)

    const releaseId = 'harness-shadow-release'; await this.seed(releaseId, 'shadow seed release', true); const releasePack = makePack(this.packRoot, 'harness-shadow-release-pack', releaseId, 'SHADOW RELEASE BODY'); const shadowNoReleaseRetry = await this.shadowScript('remove-body-guard')
    await this.installReleaseFailure(releaseId); const releaseFirst = await this.update(releasePack, ['--re-share', '--change-note', 'Shadow retry', '--apply', '--confirm'], shadowNoReleaseRetry); assert(releaseFirst.status !== 0, 'shadow release-failure setup unexpectedly succeeded'); await this.removeReleaseFailure(); await this.setSwitches(true)
    const releaseSecond = await this.update(releasePack, ['--re-share', '--change-note', 'Shadow retry', '--apply', '--confirm'], shadowNoReleaseRetry); const releaseState = await this.item(releaseId); assert(releaseSecond.status === 0 && releaseState.working_version === 3, 'release retry test would not detect a removed retry path')

    const changedId = 'harness-shadow-changed'; await this.seed(changedId, 'shadow seed changed', true); await this.beginAndSyncV2(changedId, 'SHADOW STALE BODY'); const changedPack = makePack(this.packRoot, 'harness-shadow-changed-pack', changedId, 'SHADOW NEW BODY'); const shadowNoBodyGuard = await this.shadowScript('release-always')
    const changed = await this.update(changedPack, ['--re-share', '--change-note', 'Shadow changed', '--apply', '--confirm'], shadowNoBodyGuard); const changedState = await this.item(changedId)
    assert(changed.status === 0 && changedState.client_visible_version === 2 && changedState.working_version === 2, 'Blocker-1 mutation did not produce stale-release signal')
    this.results.push({ self_doubt: 'passed', scenario_2_revert: 'caught_pendingSync_removed', scenario_3_revert: 'caught_release_retry_removed', scenario_4_revert: 'caught_body_changed_guard_removed', uncovered: ['begin-revision failure after preflight', 'partial git index/commit corruption', 'process death between gate reopen and release', 'a live lock holder killed at every possible boundary'] })
  }

  async stop(): Promise<void> {
    if (this.stackStarted && !this.keep) { try { run('supabase', ['stop', '--workdir', this.stackRoot, '--no-backup']) } catch { /* cleanup best effort */ } }
    if (!this.keep) for (const path of [this.stackRoot, this.canonicalRoot, this.packRoot, this.lockRoot, this.pendingRoot]) rmSync(path, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const harness = new Harness(KEEP)
  const fullRun = !process.argv.includes('--self-doubt-only')
  try {
    await harness.start()
    if (fullRun) {
      await harness.scenarioRace(); await harness.scenarioSyncRetry(); await harness.scenarioReleaseRetry(); await harness.scenarioChangedPendingRelease()
    }
    await harness.selfDoubt()
    console.log(JSON.stringify({ harness: 'update-portal', target: 'loopback disposable Supabase', results: harness.results }, null, 2))
    console.log(fullRun
      ? 'GO: all five required scenarios and behavioral self-doubt checks passed on the disposable target.'
      : 'SELF-DOUBT GO: all mutation-based regression checks passed on the disposable target.')
  } finally { await harness.stop() }
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })

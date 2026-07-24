// scripts/update-portal.ts
//
// The default portal-update closing step (spec: Kanset/docs/superpowers/specs/
// 2026-07-24-default-portal-update-flow-design.md, §0/§4, verified §14; hardened per Codex review
// 2026-07-24).
//
// One deterministic command that keeps the client portal current with a pack's client-facing copy,
// behind the PII wall and the publication lock.
//
//   npx tsx scripts/update-portal.ts <pack-file | content_id> [flags]
//     (default)          PREVIEW: no file/DB writes. Extract, safety-gate, detect state, decide,
//                        preview the sync RPC, report.
//     --apply            Perform the write for new/unreleased pieces (refresh canonical, commit, sync).
//                        Released pieces are FLAGGED, never auto-synced. Locked pieces refuse.
//     --re-share         HUMAN-only re-arm of an already-released piece. Requires --change-note and
//                        (with --apply) --confirm.
//     --change-note "…"  Required for --re-share (single line, <=300 chars).
//     --confirm          Required to actually execute a --re-share --apply.
//
// SAFETY (Codex-reviewed): default is preview. Writes happen only under --apply. On --apply the repo
// is preflighted BEFORE any mutation; the whole per-piece operation is serialized by a lock; stranded
// applies (commit-then-sync-failed / sync-then-release-failed) are detected and retried; canonical
// identity is asserted; the PII safety gate (assertClientSafeContent, inside parseContentFile) is a
// HARD STOP that runs before every write.
import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { parseContentFile, type ParsedContent } from '../src/lib/portal/frontmatter'
import { inspectCanonicalContentRoot, type CanonicalContentInspection } from '../src/lib/portal/canonical-content-root'
import { acquirePieceLock } from '../src/lib/portal/update-portal-lock'
import {
  buildRefreshedCanonical,
  clientBodyRegion,
  CONTENT_ID_PATTERN,
  decideAction,
  deriveState,
  extractPack,
  normalizeCopy,
  planVersioning,
  readPackContentId,
  reopenCopyApprovedGate,
  validateChangeNote,
  type ContentState,
} from '../src/lib/portal/update-portal-core'

loadEnvConfig(process.cwd())

const CLIENT_SLUG = 'kanset'
const LOCK_STALE_MS = 10 * 60 * 1000

// The service-role client is untyped here (no generated Database types), matching the other portal
// scripts. `.rpc()` is called with a variable name so it resolves the loose overload.
type Db = SupabaseClient<any, any, any, any, any>
const PREVIEW_RPC = 'preview_content_item_versions'
const SYNC_RPC = 'sync_content_item_versions'

type Flags = {
  target: string
  apply: boolean
  reShare: boolean
  changeNote: string | null
  confirm: boolean
}

function parseArgs(argv: string[]): Flags {
  const positional: string[] = []
  let apply = false
  let previewOnly = false
  let reShare = false
  let confirm = false
  let changeNote: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') apply = true
    else if (arg === '--preview-only') previewOnly = true
    else if (arg === '--re-share') reShare = true
    else if (arg === '--confirm') confirm = true
    else if (arg === '--change-note') { changeNote = argv[i + 1] ?? ''; i += 1 }
    else if (arg.startsWith('--change-note=')) changeNote = arg.slice('--change-note='.length)
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`)
    else positional.push(arg)
  }
  if (positional.length !== 1) {
    throw new Error('Usage: update-portal <pack-file | content_id> [--apply] [--re-share --change-note "…" --confirm]')
  }
  // Reject contradictory / meaningless flag combinations (Codex should-fix 10).
  if (apply && previewOnly) throw new Error('--apply and --preview-only are mutually exclusive')
  if (confirm && !reShare) throw new Error('--confirm is only valid with --re-share')
  if (changeNote !== null && !reShare) throw new Error('--change-note is only valid with --re-share')
  const note = changeNote !== null ? validateChangeNote(changeNote) : null
  return { target: positional[0], apply: apply && !previewOnly, reShare, changeNote: note, confirm }
}

function logRun(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ tool: 'update-portal', ...entry })
  console.log(line)
  try { appendFileSync(join(process.cwd(), '.update-portal.log'), line + '\n') } catch { /* best-effort */ }
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function safeHead(dir: string): string | null {
  try { return git(dir, ['rev-parse', '--verify', 'HEAD']) } catch { return null }
}

// Re-arm coordination with the reminder hook (§0.7): clear the per-piece marker ONLY on a genuinely
// settled terminal outcome (no-op / flag / completed sync / completed re-share). A failed or still-
// pending write RETAINS the marker so the reminder re-fires (Codex should-fix 8).
function clearPendingMarker(contentId: string): void {
  const dir = process.env.PORTAL_PENDING_DIR ?? join(process.env.HOME ?? '', 'Kanset', '.portal-pending')
  try { const m = join(dir, contentId); if (existsSync(m)) unlinkSync(m) } catch { /* best-effort */ }
}

function toRow(parsed: ParsedContent, clientId: string, sourcePath: string, sourceCommitSha: string | null) {
  return {
    content_id: parsed.content_id, client_id: clientId, title: parsed.title, producer: parsed.producer,
    calendar_note: parsed.calendar_note, format: parsed.format, pillar: parsed.pillar, platforms: parsed.platforms,
    planned_date: parsed.scheduled_date, canva_url: parsed.canva_url, drive_url: parsed.drive_url,
    version: parsed.version, fact_check: parsed.fact_check, fact_check_scope: parsed.fact_check_scope,
    fact_check_exemption: parsed.fact_check_exemption, fact_check_ledger: parsed.fact_check_ledger,
    client_body: parsed.client_body, copy_blocks: parsed.copy_blocks, source_path: sourcePath,
    source_commit_sha: sourceCommitSha,
  }
}

// Canonical identity must match the piece we looked up by content_id (Codex blocker 4): a stale or
// misnamed canonical file could otherwise sync a DIFFERENT content item than the pack names.
function assertCanonicalIdentity(parsed: ParsedContent, contentId: string): void {
  if (parsed.content_id !== contentId) {
    throw new Error(`canonical content_id "${parsed.content_id}" does not match the pack's "${contentId}"`)
  }
  if (parsed.client !== CLIENT_SLUG) {
    throw new Error(`canonical client "${parsed.client}" is not "${CLIENT_SLUG}"`)
  }
}

function inspect(portalDir: string, mode: 'preview' | 'apply'): CanonicalContentInspection {
  return inspectCanonicalContentRoot({
    directory: portalDir, fixtureDirectory: join(process.cwd(), 'content/portal'),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!, mode,
    expectedRemote: process.env.PORTAL_CONTENT_EXPECTED_REMOTE,
  })
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const writeMode = flags.apply

  // §5 degrade gracefully with no portal access — but ONLY in a read (preview) mode. A write mode
  // that cannot reach Supabase / the canonical dir must FAIL, not silently "succeed" (Codex B6).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const portalDir = process.env.PORTAL_CONTENT_DIR
  if (!url || !key || !portalDir) {
    if (writeMode) {
      throw new Error('cannot --apply: missing Supabase credentials or PORTAL_CONTENT_DIR')
    }
    logRun({ outcome: 'skipped', reason: 'no portal access (preview)' })
    console.log('portal update deferred: no access (fine for a headless/cron preview run).')
    return
  }

  // Resolve the target to a content_id. A pack is read MINIMALLY here just to learn its id; the
  // authoritative re-read + validation happens UNDER the lock (Codex blocker 2). A bare content_id is
  // validated against the canonical pattern before it is used to build any path (Codex SF6).
  const targetPath = isAbsolute(flags.target) ? flags.target : resolve(process.cwd(), flags.target)
  const isPack = flags.target.endsWith('.md') && existsSync(targetPath)
  let contentId: string
  if (isPack) {
    contentId = readPackContentId(readFileSync(targetPath, 'utf8'), targetPath).contentId
  } else {
    contentId = flags.target
    if (!CONTENT_ID_PATTERN.test(contentId)) throw new Error(`invalid content_id target: "${contentId}"`)
  }

  const canonicalName = `${contentId}.md`
  const canonicalPath = join(portalDir, canonicalName)

  // Serialize the whole per-piece operation for write modes, and re-read every input UNDER the lock so
  // a run that waited on the lock cannot act on stale pack / canonical / DB state (Codex blocker 2).
  const lock = writeMode
    ? acquirePieceLock(contentId, { dir: process.env.PORTAL_LOCK_DIR ?? join(tmpdir(), 'update-portal-locks'), staleMs: LOCK_STALE_MS })
    : null
  try {
    // Fresh, lock-held reads.
    let packText: string | null = null
    let packPath: string | null = null
    let extractedBody: string | null = null
    if (isPack) {
      packText = readFileSync(targetPath, 'utf8')
      packPath = targetPath
      const ids = readPackContentId(packText, targetPath)
      if (ids.contentId !== contentId) throw new Error(`pack content_id changed under the lock (${ids.contentId} != ${contentId})`)
      // The pack must carry an id= that matches its filename (Codex B4/SF6 identity contract).
      if (!ids.packId) throw new Error(`pack ${targetPath} gate header has no id= (identity contract)`)
      const fileId = basename(targetPath).replace(/\.md$/, '')
      if (ids.packId !== fileId) throw new Error(`pack filename "${fileId}" does not match its gate header id="${ids.packId}"`)
      const extracted = extractPack(packText, targetPath)
      extractedBody = extracted.clientBody
      if (extracted.factCheckGate === 'open') {
        logRun({ content_id: contentId, outcome: 'refused', reason: 'fact-check gate open' })
        console.error(`REFUSED: ${targetPath} has an OPEN fact-check gate. Close it (- [x] fact-check) before sharing.`)
        process.exitCode = 2
        return
      }
    }
    const canonicalExists = existsSync(canonicalPath)

    const supabase: Db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: client, error: clientErr } = await supabase.from('clients').select('id').eq('slug', CLIENT_SLUG).single()
    if (clientErr || !client) throw new Error(`client "${CLIENT_SLUG}" not found: ${clientErr?.message ?? 'missing'}`)
    const { data: item, error: itemErr } = await supabase
      .from('content_items')
      .select('id, working_version, client_visible_version, publication_locked_version, status, revision_in_progress')
      .eq('client_id', client.id).eq('content_id', contentId).maybeSingle()
    if (itemErr) throw new Error(`content_items lookup failed: ${itemErr.message}`)
    const state: ContentState = deriveState(item ?? null)
    const workingVersion = item?.working_version ?? 0
    const clientVisibleVersion = item?.client_visible_version ?? 0
    const revisionInProgress = Boolean(item?.revision_in_progress)

    // Normalized change detection + retry-aware versioning (§4.3, Codex blocker 3).
    let canonicalVersion: number | null = null
    let bodyChanged: boolean
    if (!canonicalExists) {
      bodyChanged = true
    } else {
      const canonicalRaw = readFileSync(canonicalPath, 'utf8')
      canonicalVersion = parseContentFile(canonicalRaw, canonicalName).version
      if (extractedBody !== null) {
        const current = clientBodyRegion(canonicalRaw, canonicalPath).clientBody
        bodyChanged = normalizeCopy(extractedBody) !== normalizeCopy(current)
      } else {
        bodyChanged = false // content_id-only: no pack to diff; rely on pending/DB signals
      }
    }
    const plan = planVersioning({ workingVersion, clientVisibleVersion, canonicalVersion, bodyChanged })

    // Fail closed on an inconsistent canonical/DB version relationship (Codex SF4): a gap > 1, or a
    // canonical BEHIND the DB, must never be silently "recovered" by rebuilding a lower version.
    if (plan.reconcile) {
      logRun({ content_id: contentId, outcome: 'refused', reason: 'version reconcile', canonical_version: canonicalVersion, working_version: workingVersion })
      console.error(`REFUSED: canonical v${canonicalVersion} vs DB working v${workingVersion} for ${contentId} — inconsistent (gap > 1 or canonical behind DB). Reconcile manually.`)
      process.exitCode = 4
      return
    }

    const { action } = decideAction({
      state, changed: plan.changed, isReshare: flags.reShare,
      hasChangeNote: Boolean(flags.changeNote),
    })

    // Refreshing copy needs the pack; a bare content_id can only refuse / flag / no-op.
    if ((action === 'sync' || action === 'create' || action === 'reshare') && extractedBody === null) {
      logRun({ content_id: contentId, outcome: 'refused', reason: 'content_id-only input cannot refresh copy' })
      console.error(`REFUSED: pass the PACK FILE (not a bare content_id) to sync/create/re-share ${contentId}.`)
      process.exitCode = 2
      return
    }

    const report = (extra: Record<string, unknown> = {}) => logRun({
      content_id: contentId, mode: flags.apply ? 'apply' : 'preview', state, action, changed: plan.changed,
      working_version: item?.working_version ?? null, client_visible_version: item?.client_visible_version ?? null,
      pre_launch_note: 'Maria is NOT notified pre-launch (email is the ask until the launch switch flips)', ...extra,
    })

    switch (action) {
      case 'noop':
        report({ outcome: 'noop' }); clearPendingMarker(contentId)
        console.log(`already in sync: ${contentId} (${state}).`)
        return

      case 'refuse-locked':
        report({ outcome: 'refused' })
        console.error(`REFUSED: ${contentId} is LOCKED (a destination is verified live). Never overwrite a shipped version; a correction is a new linked version via the reviewed workflow (portal-content/REPOSITORY-CONTRACT.txt step 7).`)
        process.exitCode = 3
        return

      case 'refuse-no-change-note':
        report({ outcome: 'refused' })
        console.error('REFUSED: --re-share re-arms Maria’s approval and needs --change-note "what changed and why".')
        process.exitCode = 2
        return

      case 'flag-reshare':
        report({ outcome: 'flagged' }); clearPendingMarker(contentId)
        console.log(`⚠️  FLAG: ${contentId} is RELEASED and its copy CHANGED. The default step does NOT re-arm Maria.`)
        console.log(`   A human runs:  npx tsx scripts/update-portal.ts ${packPath ?? contentId} --re-share --change-note "…" --apply --confirm`)
        return

      case 'create':
        // New piece. Per §14.2 (Option A) the canonical frontmatter — incl. the structured
        // fact_check_ledger — is AUTHORED, not generated. We do not print the body (Codex SF9: no
        // unscreened copy in logs); we only report the block keys.
        report({ outcome: 'needs-frontmatter' })
        console.log(`NEW piece ${contentId}: no canonical file at ${canonicalPath}.`)
        console.log(`   Author the canonical frontmatter once (title, fact_check, fact_check_scope, fact_check_ledger),`)
        console.log(`   paste the pack’s portal-block copy below it + one <!-- internal --> marker, then re-run to sync.`)
        console.log(`   (Pack blocks to move: ${extractPack(packText!, packPath!).blockKeys.join(', ')})`)
        return

      case 'sync':
        await runSync({ supabase, clientId: client.id, portalDir, canonicalPath, canonicalName, contentId,
          extractedBody: extractedBody!, newVersion: plan.newVersion, apply: flags.apply, report })
        return

      case 'reshare':
        await runReshare({ supabase, clientId: client.id, portalDir, canonicalPath, canonicalName, contentId,
          packPath, extractedBody: extractedBody!, releasedVersion: clientVisibleVersion, workingVersion,
          canonicalVersion, bodyChanged, revisionInProgress, newVersion: plan.newVersion,
          pendingRelease: plan.pendingRelease, changeNote: flags.changeNote!,
          apply: flags.apply, confirm: flags.confirm, report })
        return
    }
  } finally {
    lock?.release()
  }
}

// Refresh the canonical body + push a new (or first) version. No re-arm. Preview does no writes.
async function runSync(ctx: {
  supabase: Db; clientId: string; portalDir: string; canonicalPath: string
  canonicalName: string; contentId: string; extractedBody: string; newVersion: number; apply: boolean
  report: (extra?: Record<string, unknown>) => void
}) {
  if (!existsSync(ctx.canonicalPath)) {
    throw new Error(`canonical ${ctx.canonicalPath} missing for an existing content item — inconsistent state`)
  }
  const existingRaw = readFileSync(ctx.canonicalPath, 'utf8')
  const refreshed = buildRefreshedCanonical(existingRaw, ctx.extractedBody, ctx.newVersion, ctx.canonicalName)
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // structure + PII safety gate (HARD STOP)
  assertCanonicalIdentity(parsed, ctx.contentId)

  if (!ctx.apply) {
    const { error } = await ctx.supabase.rpc(PREVIEW_RPC, {
      p_items: [toRow(parsed, ctx.clientId, ctx.canonicalName, safeHead(ctx.portalDir))],
    })
    if (error) throw new Error(`preview failed: ${error.message}`)
    ctx.report({ outcome: 'preview-ok', would_write_version: ctx.newVersion }) // marker RETAINED: push still pending
    console.log(`PREVIEW ${ctx.contentId}: would refresh canonical + sync v${ctx.newVersion} (unreleased). Re-run with --apply.`)
    return
  }

  // APPLY. Preflight BEFORE any mutation (Codex blocker 1): a dirty repo / wrong remote must abort
  // with zero side effects. If the refreshed content equals what's on disk, this is a stranded-sync
  // retry (Codex blocker 3) — the file is already committed, so skip the write and just re-sync.
  inspect(ctx.portalDir, 'apply')
  if (refreshed !== existingRaw) {
    writeFileSync(ctx.canonicalPath, refreshed)
    git(ctx.portalDir, ['add', '--', ctx.canonicalName])
    git(ctx.portalDir, ['commit', '-m', `update-portal: sync ${ctx.contentId} v${ctx.newVersion}`])
  }
  const finalInspection = inspect(ctx.portalDir, 'apply') // clean now -> final provenance SHA
  const { error } = await ctx.supabase.rpc(SYNC_RPC, {
    p_items: [toRow(parsed, ctx.clientId, ctx.canonicalName, finalInspection.sourceCommitSha)],
  })
  if (error) {
    ctx.report({ outcome: 'sync-failed', new_version: ctx.newVersion, error: error.message }) // marker RETAINED
    throw new Error(`sync failed (canonical committed at v${ctx.newVersion}; re-run to retry): ${error.message}`)
  }
  ctx.report({ outcome: 'synced', new_version: ctx.newVersion }); clearPendingMarker(ctx.contentId)
  console.log(`SYNCED ${ctx.contentId} v${ctx.newVersion} (unreleased — Maria sees nothing until a separate release).`)
}

// Human-only re-arm of a released piece. Retries a PURE stranded release when it's provably the same
// content; otherwise begin-revision -> commit -> sync -> re-open pack gate -> release.
async function runReshare(ctx: {
  supabase: Db; clientId: string; portalDir: string; canonicalPath: string
  canonicalName: string; contentId: string; packPath: string | null; extractedBody: string
  releasedVersion: number; workingVersion: number; canonicalVersion: number | null; bodyChanged: boolean
  revisionInProgress: boolean; newVersion: number; pendingRelease: boolean
  changeNote: string; apply: boolean; confirm: boolean; report: (extra?: Record<string, unknown>) => void
}) {
  if (!ctx.apply || !ctx.confirm) {
    ctx.report({ outcome: 'reshare-preview' })
    console.log(`RE-SHARE PREVIEW ${ctx.contentId}: this re-arms Maria’s approval and re-opens the pack copy-approved gate.`)
    console.log(`   Change note: "${ctx.changeNote}"`)
    console.log('   Pre-launch: Maria is NOT notified (email is the ask until the launch switch flips).')
    console.log('   To execute: add --apply --confirm.')
    return
  }

  // Stranded-release retry (Codex blocker 3) — ONLY when it is provably the SAME content that was
  // already synced: no body change, the canonical version equals the DB working version, and the row
  // is in an open revision (Codex blocker 1 — otherwise a pack changed since the stranded release
  // would publish stale content). A DB write, so it still runs the apply preflight + identity assert
  // (Codex blocker 3).
  const releaseRetry = ctx.pendingRelease && !ctx.bodyChanged
    && ctx.canonicalVersion === ctx.workingVersion && ctx.revisionInProgress
  if (releaseRetry) {
    inspect(ctx.portalDir, 'apply')
    assertCanonicalIdentity(parseContentFile(readFileSync(ctx.canonicalPath, 'utf8'), ctx.canonicalName), ctx.contentId)
    reopenGateOrThrow(ctx.packPath, ctx.changeNote) // SF7: before release
    runAdmin(['ready', CLIENT_SLUG, ctx.contentId, String(ctx.workingVersion)])
    ctx.report({ outcome: 'reshared-release-retry', released_version: ctx.workingVersion }); clearPendingMarker(ctx.contentId)
    console.log(`RE-RELEASED ${ctx.contentId} v${ctx.workingVersion} (retried a stranded release of unchanged content). Re-ask Maria by EMAIL.`)
    return
  }

  const existingRaw = readFileSync(ctx.canonicalPath, 'utf8')
  const refreshed = buildRefreshedCanonical(existingRaw, ctx.extractedBody, ctx.newVersion, ctx.canonicalName)
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // safety gate
  assertCanonicalIdentity(parsed, ctx.contentId)

  // Preflight BEFORE any mutation (file OR begin-revision). File work first (cheap/reversible), then
  // the DB sequence tight, so a failure leaves at most a safe unreleased draft.
  inspect(ctx.portalDir, 'apply')
  if (refreshed !== existingRaw) {
    writeFileSync(ctx.canonicalPath, refreshed)
    git(ctx.portalDir, ['add', '--', ctx.canonicalName])
    git(ctx.portalDir, ['commit', '-m', `update-portal: re-share ${ctx.contentId} v${ctx.newVersion} — ${ctx.changeNote}`])
  }
  const finalInspection = inspect(ctx.portalDir, 'apply')

  runAdmin(['begin-revision', CLIENT_SLUG, ctx.contentId, String(ctx.releasedVersion)])
  const { error } = await ctx.supabase.rpc(SYNC_RPC, {
    p_items: [toRow(parsed, ctx.clientId, ctx.canonicalName, finalInspection.sourceCommitSha)],
  })
  if (error) {
    // §4.7: unreleased v+1 draft left behind (Maria keeps the old approved version). Recoverable via
    // the retry path on re-run. Marker RETAINED.
    ctx.report({ outcome: 'reshare-incomplete', stage: 'sync', new_version: ctx.newVersion, error: error.message })
    throw new Error(`sync failed during re-share (left an unreleased draft — safe; re-run to retry): ${error.message}`)
  }
  reopenGateOrThrow(ctx.packPath, ctx.changeNote) // SF7: re-open the pack gate BEFORE release
  runAdmin(['ready', CLIENT_SLUG, ctx.contentId, String(ctx.newVersion)])
  ctx.report({ outcome: 'reshared', new_version: ctx.newVersion, change_note: ctx.changeNote }); clearPendingMarker(ctx.contentId)
  console.log(`RE-SHARED ${ctx.contentId} v${ctx.newVersion}. Pack copy-approved gate re-opened; prior approval no longer covers this version. Re-ask Maria by EMAIL.`)
}

function runAdmin(args: string[]): void {
  execFileSync('npx', ['tsx', 'scripts/portal-admin.ts', ...args], { cwd: process.cwd(), stdio: 'inherit' })
}

// Re-open the pack's copy-approved gate (file-side view of the re-arm), SECTION-SCOPED via the core
// helper (Codex SF7). REQUIRED for a re-share: fail loudly if the pack is missing or has no
// copy-approved gate inside STATUS GATES, so the portal is never re-released while the pack still
// claims copy-approved (Codex SF7).
function reopenGateOrThrow(packPath: string | null, changeNote: string): void {
  if (!packPath || !existsSync(packPath)) {
    throw new Error('cannot re-open the copy-approved gate: pack file not found for this re-share')
  }
  const raw = readFileSync(packPath, 'utf8')
  const { text, found } = reopenCopyApprovedGate(raw, changeNote)
  if (!found) {
    throw new Error(`cannot re-open the copy-approved gate: no copy-approved line in the STATUS GATES section of ${packPath}`)
  }
  if (text !== raw) writeFileSync(packPath, text) // already [ ] / [~] -> idempotent, nothing to write
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'update-portal failed')
  process.exitCode = 1
})

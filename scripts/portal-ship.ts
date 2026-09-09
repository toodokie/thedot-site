// portal-ship: close a piece out in the portal at the moment it is posted.
//
//   pnpm exec tsx scripts/portal-ship.ts kanset <content-id> \
//     --instagram <url> --facebook <url> --youtube <url> [--published-at <iso>] [--apply]
//
// Reconciles Maria's open copy edits verbatim, releases the resulting version, records the agency
// override, attaches every permalink, and verifies that no client email escaped. Preview by
// default; --apply executes.
//
// Every write goes through the same audited command the agency runs by hand, spawned as a child
// process, so the receipts, validation and inbox events are identical. Running this command IS
// Anastasia's authorization for the override it records.

import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'
import { planShip, shipOverrideReason, type ShipDestination, type ShipInput } from '../src/lib/portal/ship-plan'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase server environment')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const DESTINATIONS: ShipDestination[] = ['instagram', 'facebook', 'youtube', 'linkedin', 'squarespace']

function run(args: string[]): string {
  return execFileSync('pnpm', ['exec', 'tsx', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

function parseArgs() {
  const [slug, contentId, ...rest] = process.argv.slice(2)
  if (!slug || !contentId) {
    throw new Error('usage: portal-ship <clientSlug> <content-id> --<destination> <url> ... '
      + '[--published-at <iso>] [--apply]')
  }
  const links: Array<{ destination: ShipDestination; liveUrl: string }> = []
  let apply = false
  let publishedAt: string | null = null
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--apply') { apply = true; continue }
    if (arg === '--published-at') { publishedAt = rest[i + 1] ?? null; i += 1; continue }
    const destination = arg.replace(/^--/, '') as ShipDestination
    if (!arg.startsWith('--') || !DESTINATIONS.includes(destination)) {
      throw new Error(`unknown argument ${arg}`)
    }
    const liveUrl = rest[i + 1]
    if (!liveUrl || liveUrl.startsWith('--')) throw new Error(`${arg} needs a URL`)
    links.push({ destination, liveUrl }); i += 1
  }
  return { slug, contentId, links, apply, publishedAt }
}

async function readState(slug: string, contentId: string, links: ShipInput['links']) {
  const { data: client, error } = await admin.from('clients').select('id,slug').eq('slug', slug).single()
  if (error || !client) throw new Error(`client unavailable: ${error?.message ?? 'missing'}`)
  const { data: item, error: itemError } = await admin.from('content_items')
    .select('id,status,working_version,client_visible_version,revision_in_progress,planned_date,platforms,archived_at')
    .eq('client_id', client.id).eq('content_id', contentId).single()
  if (itemError || !item) throw new Error(`content item unavailable: ${itemError?.message ?? 'missing'}`)

  const { data: rows } = await admin.from('content_change_requests')
    .select('id,status,payload,base_version,request_type')
    .eq('client_id', client.id).eq('content_id', item.id)
  const requests = (rows ?? [])
    .filter((r) => r.request_type === 'edit'
      && ['pending', 'applying', 'prepared', 'conflicted'].includes(r.status as string))
    .map((r) => {
      const payload = r.payload as Record<string, unknown>
      return {
        id: r.id as string,
        status: r.status as string,
        blockKey: (payload.block_key as string) ?? null,
        targetKind: (payload.target_kind as string) ?? 'copy_block',
        baseVersion: r.base_version as number | null,
      }
    })

  const dir = process.env.PORTAL_CONTENT_DIR
  if (!dir) throw new Error('Missing PORTAL_CONTENT_DIR')

  const base = (item.client_visible_version as number | null) ?? 0
  const open = requests.filter((r) => ['pending', 'applying'].includes(r.status)).length
  const targetVersion = open > 0 ? base + 1 : base
  // Read the RELEASED BASE from git, not the working file: the reconciler generates the new
  // version from these bytes, so metadata that only exists on disk never reaches it.
  const { data: baseVersion } = await admin.from('content_item_versions')
    .select('version,source_path,source_commit_sha')
    .eq('client_id', client.id).eq('content_item_id', item.id).eq('version', base).maybeSingle()
  let releasedBase = { readable: false, version: null as number | null, producer: null as string | null, scheduledDate: null as string | null }
  if (baseVersion?.source_commit_sha && baseVersion.source_path) {
    try {
      const raw = execFileSync('git', ['-C', dir, 'show', `${baseVersion.source_commit_sha}:${baseVersion.source_path}`], { encoding: 'utf8' })
      const parsed = parseContentFile(raw, baseVersion.source_path as string)
      releasedBase = { readable: true, version: parsed.version, producer: parsed.producer, scheduledDate: parsed.scheduled_date }
    } catch { /* unreachable provenance stays readable:false and is reported as a blocker */ }
  }

  const { data: targets } = await admin.from('content_publication_targets')
    .select('destination,content_version').eq('client_id', client.id).eq('content_id', item.id)
  const { data: approvals } = await admin.from('approvals')
    .select('content_version,state,created_at').eq('client_id', client.id).eq('content_id', item.id)
    .eq('content_version', targetVersion).order('created_at', { ascending: false }).limit(1)
  const clientApproved = (approvals ?? [])[0]?.state === 'approved'
  const { data: courtesy } = await admin.from('content_courtesy_releases')
    .select('content_version').eq('client_id', client.id).eq('content_id', item.id)
    .eq('content_version', targetVersion).limit(1)

  return {
    client,
    itemId: item.id as string,
    input: {
      contentId,
      item: {
        status: item.status as string,
        workingVersion: item.working_version as number | null,
        clientVisibleVersion: item.client_visible_version as number | null,
        revisionInProgress: Boolean(item.revision_in_progress),
        plannedDate: (item.planned_date as string | null)?.slice(0, 10) ?? null,
        platforms: (item.platforms as string[]) ?? [],
        archived: item.archived_at != null,
      },
      requests,
      releasedBase,
      links,
      existingTargets: (targets ?? []).map((t) => ({
        destination: t.destination as string, contentVersion: t.content_version as number,
      })),
      clientApprovedTargetVersion: clientApproved,
      courtesyReleaseRecorded: (courtesy ?? []).length > 0,
    } satisfies ShipInput,
  }
}

async function main() {
  const { slug, contentId, links, apply, publishedAt } = parseArgs()
  const { input } = await readState(slug, contentId, links)
  const plan = planShip(input)

  console.log(`\nportal-ship ${slug}/${contentId}`)
  console.log(`  released version now: v${input.item.clientVisibleVersion ?? '-'}  ->  target v${plan.targetVersion}`)
  console.log(`  reconcile: ${plan.reconcile}${plan.reconcileRequestIds.length ? ` (${plan.reconcileRequestIds.join(', ')})` : ''}`)
  console.log(`  release: ${plan.release}   courtesy release: ${plan.courtesyRelease}`)
  console.log(`  destination overrides: ${plan.overrideDestinations.join(', ') || 'none'}`)
  console.log(`  permalinks to confirm: ${plan.publishDestinations.join(', ') || 'none'}`)
  for (const w of plan.warnings) console.log(`  WARNING: ${w}`)
  for (const b of plan.blockers) console.error(`  BLOCKER: ${b}`)
  if (plan.blockers.length > 0) { process.exitCode = 2; return }
  if (!apply) { console.log('\nPreview only. Re-run with --apply.'); return }

  const publishedOn = (publishedAt ?? new Date().toISOString()).slice(0, 10)
  const reason = shipOverrideReason({
    destinations: plan.publishDestinations, publishedOn,
    targetVersion: plan.targetVersion, appliedEditCount: plan.reconcileRequestIds.length,
  })
  const scratch = mkdtempSync(join(tmpdir(), 'portal-ship-'))
  const payload = (name: string, body: Record<string, unknown>) => {
    const file = join(scratch, `${name}.json`)
    writeFileSync(file, `${JSON.stringify({ clientSlug: slug, actorKey: 'thedot-admin', ...body }, null, 2)}\n`, 'utf8')
    return file
  }

  let alertsClosed = false
  try {
    if (plan.reconcile === 'bundle') {
      run(['scripts/portal-inbox.ts', 'apply-edit-batch', slug, ...plan.reconcileRequestIds, '--apply'])
    } else if (plan.reconcile === 'single') {
      run(['scripts/portal-inbox.ts', 'apply-edit', slug, plan.reconcileRequestIds[0], '--apply'])
    }

    if (plan.release || plan.courtesyRelease) {
      // Releasing queues a "Needs review" email, and the courtesy release does not cancel it, so
      // the client would be invited to approve a piece that is already live and that the portal
      // will refuse to let her approve.
      run(['scripts/portal-admin.ts', 'switch', slug, 'client_alerts', 'off',
        `Quiet window for the ${contentId} close-out. The piece is already live.`])
      alertsClosed = true
      if (plan.release) run(['scripts/portal-admin.ts', 'ready', slug, contentId, String(plan.targetVersion)])
      if (plan.courtesyRelease) {
        run(['scripts/portal-write.ts', 'courtesy-release', payload('courtesy', {
          contentId, contentVersion: plan.targetVersion, reason, idempotencyKey: randomUUID(),
        })])
      }
    }

    for (const destination of plan.overrideDestinations) {
      run(['scripts/portal-write.ts', 'override-destination', payload(`override-${destination}`, {
        contentId, contentVersion: plan.targetVersion, destination, reason, idempotencyKey: randomUUID(),
      })])
    }
    for (const link of links) {
      run(['scripts/portal-write.ts', 'publication-confirm', payload(`publish-${link.destination}`, {
        contentId, contentVersion: plan.targetVersion, destination: link.destination,
        liveUrl: link.liveUrl,
        publishedAt: publishedAt ?? new Date().toISOString(),
        capturedAt: new Date().toISOString(),
        verificationNote: publishedAt
          ? 'Permalink supplied by the agency at posting time.'
          : 'Permalink supplied by the agency at posting time. No provider timestamp was supplied, '
            + 'so publishedAt records when the close-out ran.',
        idempotencyKey: randomUUID(),
      })])
    }
  } finally {
    // Restore alerts even when a step above threw, then prove nothing reached the client.
    if (alertsClosed) {
      run(['scripts/portal-admin.ts', 'switch', slug, 'client_alerts', 'on',
        `Restore normal client alerts after the ${contentId} close-out.`])
    }
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(run(['scripts/portal-notification-audit.ts', slug, '--days', '1']))
  console.log(`\nShipped ${contentId} at v${plan.targetVersion}. Confirm the client email count above is unchanged.`)
}

main().catch((error) => { console.error(`FAILED: ${(error as Error).message}`); process.exit(1) })

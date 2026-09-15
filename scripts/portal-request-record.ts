// Write the before-and-after of a client's change requests into the piece pack.
//
// Why this exists: applying an edit request destroys nothing (every version keeps its
// own copy, and every request keeps the client's exact submitted text), but once the
// requests move to history the piece page shows only the merged result. Anastasia,
// 2026-09-14: "you merged her edits in a way that i can no longer see what her
// comments/edits were." This writes the same record into the pack, where it does not
// depend on the portal UI at all.
//
// Run it BEFORE or AFTER apply-edit-batch; it reads the request rows either way, and
// the "before" text comes from the version the request was raised against, which is
// retained permanently.
//
//   portal-request-record <clientSlug> <contentId> [--pack <path>] [--apply]
//   portal-request-record <clientSlug> --request <requestUuid> [--apply]
//
// The --request form resolves the piece from the request row, so the reconciliation
// hook can pass through the same UUIDs that were just applied without knowing the id.
//
// Without --apply it prints the section it would write and touches nothing.
//
// SAFETY: it only ever edits the pack BELOW the `<!-- internal -->` marker. Everything
// above that is client-visible copy that update-portal syncs verbatim, so this tool
// must never be able to alter it.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase server environment')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const CONTENT_DIR = process.env.KANSET_CONTENT_DIR ?? '/Users/anastasiavolkova/Kanset/content'
const INTERNAL_MARKER = '<!-- internal -->'
const HEADING = '## Client change requests, before and after'

function resolvePack(contentId: string): string {
  // Same convention update-portal uses: the pack declares its content_id in the gates
  // header, so one id maps to exactly one pack and a rename cannot silently mis-target.
  const hits: string[] = []
  for (const name of readdirSync(CONTENT_DIR)) {
    if (!name.endsWith('.md')) continue
    const path = join(CONTENT_DIR, name)
    const text = readFileSync(path, 'utf8')
    if (new RegExp(`<!--\\s*gates:[^>]*content_id=${contentId}(?![\\w-])`).test(text)) hits.push(path)
  }
  if (hits.length === 0) throw new Error(`No pack in ${CONTENT_DIR} carries a gates header with content_id=${contentId}`)
  if (hits.length > 1) throw new Error(`Several packs claim content_id=${contentId}: ${hits.join(', ')}`)
  return hits[0]
}

function fence(body: string): string[] {
  // A block can itself contain ``` (the reel scripts do not, but captions might), so
  // pick a fence longer than anything inside it.
  const longest = (body.match(/`{3,}/g) ?? []).reduce((max, run) => Math.max(max, run.length), 2)
  const bar = '`'.repeat(Math.max(3, longest + 1))
  return [bar, body.trim(), bar]
}

async function build(clientSlug: string, contentId: string): Promise<string> {
  const { data: client, error: clientError } = await admin
    .from('clients').select('id,name').eq('slug', clientSlug).single()
  if (clientError || !client) throw new Error(`client unavailable: ${clientError?.message ?? 'missing'}`)

  const { data: item, error: itemError } = await admin
    .from('content_items').select('id,content_id,title').eq('content_id', contentId).maybeSingle()
  if (itemError) throw new Error(itemError.message)
  if (!item) throw new Error(`No portal row for ${contentId}`)

  const { data: versions } = await admin
    .from('content_item_versions').select('version,copy_blocks').eq('content_item_id', item.id)
  const blocksByVersion = new Map<number, Array<{ key: string; label?: string; body: string }>>(
    (versions ?? []).map((row: Record<string, unknown>) =>
      [row.version as number, (row.copy_blocks ?? []) as Array<{ key: string; label?: string; body: string }>]))

  const { data: requests } = await admin
    .from('content_change_requests').select('*').eq('content_id', item.id).order('created_at')
  if (!requests?.length) throw new Error(`No change requests recorded against ${contentId}`)

  const today = new Date().toISOString().slice(0, 10)
  const out: string[] = [HEADING, '']
  out.push(`**Written ${today} by \`portal-request-record\`, read from the live portal rows, not from anyone's recollection.**`)
  out.push('')
  out.push('Applying an edit request destroys nothing: every version keeps its own full copy and every request keeps the client\'s exact submitted text. But once requests move to history the piece page shows only the merged result, so this is the same record in a form that does not depend on the portal UI.')
  out.push('')

  for (const request of requests as Array<Record<string, any>>) {
    const payload = (request.payload ?? {}) as Record<string, any>
    const blockKey: string | null = payload.block_key ?? null
    const label: string = payload.target_label ?? payload.target_key ?? 'request'
    out.push(`### ${label}  (\`${payload.target_key ?? blockKey ?? '?'}\`)`)
    out.push('')
    out.push(`- Raised by **${request.requester_name}**, ${String(request.created_at).replace('T', ' ').slice(0, 16)} UTC`)
    out.push(`- Against version **${request.base_version}**, resolved as **${request.status}**`
      + (request.canonical_version ? `, applied as version **${request.canonical_version}**` : ''))
    if (request.resolution_note) out.push(`- Our note back: ${request.resolution_note}`)
    out.push('')

    const proposed = String(payload.proposed_text ?? '').trim()
    if (!blockKey) {
      // Asset and design-link requests carry a comment, not a copy replacement.
      out.push('**What they wrote:**', '', ...proposed.split('\n').map((line) => `> ${line}`), '')
      if (payload.url_snapshot) out.push(`Referring to: ${payload.url_snapshot}`, '')
      continue
    }
    const before = blocksByVersion.get(request.base_version)?.find((block) => block.key === blockKey)?.body
    if (before === undefined) {
      out.push(`**Before:** not recoverable, version ${request.base_version} no longer carries a \`${blockKey}\` block.`, '')
    } else {
      out.push(`**Before, as released in version ${request.base_version}**`, '', ...fence(before), '')
    }
    out.push(`**Their version${request.canonical_version ? `, live as version ${request.canonical_version}` : ', not applied'}**`, '', ...fence(proposed), '')
  }
  return out.join('\n').trimEnd() + '\n'
}

function merge(pack: string, section: string): string {
  const markerAt = pack.indexOf(INTERNAL_MARKER)
  if (markerAt === -1) throw new Error(`Pack has no ${INTERNAL_MARKER} marker; refusing to write into client-visible copy`)
  const head = pack.slice(0, markerAt + INTERNAL_MARKER.length)
  let tail = pack.slice(markerAt + INTERNAL_MARKER.length)
  // Idempotent: replace any section this tool wrote before, so re-running after a
  // second round of edits refreshes rather than duplicating.
  const existing = tail.indexOf(`\n${HEADING}`)
  if (existing !== -1) {
    const after = tail.slice(existing + 1 + HEADING.length)
    const nextHeading = after.search(/\n## /)
    tail = tail.slice(0, existing) + (nextHeading === -1 ? '\n' : after.slice(nextHeading))
  }
  return `${head}\n\n${section}\n${tail.replace(/^\n+/, '\n')}`
}

async function main() {
  const [clientSlug, second, ...tail] = process.argv.slice(2)
  const argv = second === '--request' ? [second, ...tail] : tail
  let contentId = second === '--request' ? null : second
  if (!clientSlug || (!contentId && second !== '--request'))
    throw new Error('usage: portal-request-record <clientSlug> <contentId|--request <uuid>> [--pack <path>] [--apply]')
  if (!contentId) {
    const requestId = argv[argv.indexOf('--request') + 1]
    if (!requestId || requestId.startsWith('--')) throw new Error('--request needs a request UUID')
    const { data: row, error } = await admin
      .from('content_change_requests').select('content_id').eq('id', requestId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) throw new Error(`No change request ${requestId}`)
    const { data: owner, error: ownerError } = await admin
      .from('content_items').select('content_id').eq('id', row.content_id).maybeSingle()
    if (ownerError) throw new Error(ownerError.message)
    if (!owner) throw new Error(`Request ${requestId} points at no content item`)
    contentId = owner.content_id
  }
  const rest = argv
  const apply = rest.includes('--apply')
  const packFlag = rest.indexOf('--pack')
  const packPath = packFlag === -1 ? resolvePack(contentId) : rest[packFlag + 1]
  if (!packPath) throw new Error('--pack needs a path')

  const section = await build(clientSlug, contentId)
  if (!apply) {
    console.log(section)
    console.log(`\nPREVIEW only. Would write into ${packPath}, below ${INTERNAL_MARKER}. Re-run with --apply.`)
    return
  }
  const pack = readFileSync(packPath, 'utf8')
  writeFileSync(packPath, merge(pack, section))
  console.log(`Wrote "${HEADING}" into ${packPath}`)
}

main().catch((error) => { console.error(String(error?.message ?? error)); process.exit(1) })

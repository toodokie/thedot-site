// Bring a piece pack back into line with the copy the client can actually see.
//
// The pack under content/ is what update-portal reads when it refreshes a piece. The portal holds
// the released copy, INCLUDING every edit Maria has sent us. When the two disagree, the next
// re-share of that piece silently replaces her copy with our older draft, and nothing warns anyone:
// the tool reports a change and applies it exactly as asked. portal-health calls this "packs
// disagreeing with the released version"; on 2026-09-21 thirteen pieces were in that state, several
// of them holding our pre-edit draft against her approved wording.
//
// So the portal wins here, always. This writer only ever copies the released block body INTO the
// pack. It never writes to the portal, never touches a block the portal does not have, and never
// touches anything outside a portal-block region: headings, internal notes, status gates and the
// rest of the pack are left exactly as they are.
//
//   pnpm exec tsx scripts/portal-pack-reconcile.ts kanset               # preview every drifting pack
//   pnpm exec tsx scripts/portal-pack-reconcile.ts kanset --apply       # write them
//   pnpm exec tsx scripts/portal-pack-reconcile.ts kanset <content_id>  # one piece
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

loadEnvConfig(process.cwd())

const CONTENT_DIR = process.env.KANSET_CONTENT_DIR ?? '/Users/anastasiavolkova/Kanset/content'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, key, { auth: { persistSession: false } })

// Same shape portal-health uses, so the two agree on what "drift" means: the marker line, an
// optional section heading that belongs to the pack rather than the copy, then the body.
const BLOCK_RE =
  /<!-- portal-block:([a-z0-9-]+) -->\n(?:##[^\n]*\n)?([\s\S]*?)(?=\n<!-- portal-block:|\n<!-- internal -->|$)/g

function packBlocks(text: string): Map<string, string> {
  const out = new Map<string, string>()
  BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLOCK_RE.exec(text))) out.set(m[1], m[2].trim())
  return out
}

function packPaths(): string[] {
  const roots = [CONTENT_DIR, ...['2026-07', '2026-08', '2026-09'].map((m) => join(CONTENT_DIR, 'archive', m))]
  return roots.filter(existsSync).flatMap((root) =>
    readdirSync(root).filter((f) => f.endsWith('.md')).map((f) => join(root, f)))
}

// A pack claims a piece ONLY through its gate header. Matching on a mention of the content_id
// instead pulled in POSTED.md and the weekly plan files, which name many pieces and are not packs
// at all; this writer edits files, so a loose match here would corrupt them. Same rule as
// portal-health, including the refusal when two files claim the same piece.
function packFor(contentId: string, paths: string[]): string | null {
  const gate = new RegExp(`<!--\\s*gates:[^>]*content_id=${contentId}(?![\\w-])`)
  const hits = paths.filter((path) => gate.test(readFileSync(path, 'utf8')))
  if (hits.length > 1) {
    console.log(`  ambiguous: ${hits.length} packs claim ${contentId}; skipped`)
    return null
  }
  return hits[0] ?? null
}

// Replace one block's body in place, keeping the marker line and any section heading.
function rewriteBlock(text: string, blockKey: string, body: string): string {
  BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLOCK_RE.exec(text))) {
    if (m[1] !== blockKey) continue
    const whole = m[0]
    const oldBody = m[2]
    // Rebuild from the matched region so the marker, the optional heading and the trailing
    // whitespace that separates blocks all survive untouched.
    const head = whole.slice(0, whole.length - oldBody.length)
    const trailing = oldBody.slice(oldBody.trimEnd().length)
    return text.slice(0, m.index) + head + body + trailing + text.slice(m.index + whole.length)
  }
  throw new Error(`block ${blockKey} not found while rewriting`)
}

async function main() {
  const [slug, maybeContentId] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const apply = process.argv.includes('--apply')
  if (!slug) throw new Error('usage: portal-pack-reconcile <clientSlug> [contentId] [--apply]')

  const { data: client, error: clientError } = await admin.from('clients').select('id,name').eq('slug', slug).single()
  if (clientError || !client) throw new Error(`client unavailable: ${clientError?.message ?? 'missing'}`)

  let itemQuery = admin.from('content_items').select('id,content_id,client_visible_version').eq('client_id', client.id)
  if (maybeContentId) itemQuery = itemQuery.eq('content_id', maybeContentId)
  const { data: items, error: itemsError } = await itemQuery
  if (itemsError) throw new Error(itemsError.message)

  const { data: versions, error: versionsError } = await admin
    .from('content_item_versions').select('content_item_id,version,copy_blocks').eq('client_id', client.id)
  if (versionsError) throw new Error(versionsError.message)

  const paths = packPaths()
  let drifting = 0
  let written = 0
  const noPack: string[] = []

  for (const item of items ?? []) {
    const released = (versions ?? []).find((v) => v.content_item_id === item.id && v.version === item.client_visible_version)
    const blocks = (released?.copy_blocks ?? []) as Array<{ key: string; body: string }>
    if (blocks.length === 0) continue
    const path = packFor(item.content_id, paths)
    if (!path) { noPack.push(item.content_id); continue }

    let text = readFileSync(path, 'utf8')
    const current = packBlocks(text)
    const stale = blocks.filter((b) => (current.get(b.key) ?? '') !== String(b.body).trim())
    // A block the pack does not carry at all is a structural mismatch, not drift. Rewriting cannot
    // invent a region for it, so report it and leave the pack alone.
    const missing = stale.filter((b) => !current.has(b.key))
    const fixable = stale.filter((b) => current.has(b.key))
    if (stale.length === 0) continue

    drifting += 1
    console.log(`\n${item.content_id}  v${item.client_visible_version}  ${path.replace(CONTENT_DIR, 'content')}`)
    for (const b of missing) console.log(`  SKIP  ${b.key}: the pack has no such block`)
    for (const b of fixable) {
      const was = (current.get(b.key) ?? '').length
      console.log(`  ${apply ? 'write' : 'would'} ${b.key}: ${was} chars in the pack -> ${String(b.body).trim().length} in the portal`)
    }
    if (!apply || fixable.length === 0) continue
    for (const b of fixable) text = rewriteBlock(text, b.key, String(b.body).trim())
    // Prove the write did what it claimed before it lands.
    const after = packBlocks(text)
    for (const b of fixable) {
      if ((after.get(b.key) ?? '') !== String(b.body).trim()) {
        throw new Error(`${item.content_id}: rewriting ${b.key} did not produce the released body`)
      }
    }
    writeFileSync(path, text)
    written += 1
  }

  if (noPack.length > 0) console.log(`\n${noPack.length} released pieces have no pack in ${CONTENT_DIR}`)
  console.log(`\n${drifting} pack(s) disagreed with the portal.${apply ? ` ${written} rewritten.` : ' Re-run with --apply to write them.'}`)
}

main().catch((error) => { console.error(`FAILED: ${error?.message ?? error}`); process.exit(1) })

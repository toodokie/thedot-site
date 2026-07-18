import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dir = process.env.PORTAL_CONTENT_DIR   // REQUIRED (Kanset workspace in prod; content/portal for fixtures)
if (!url || !key) { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY') }
if (!dir) { throw new Error('Missing PORTAL_CONTENT_DIR (no silent fallback; use npm run sync-content:fixtures for seeds)') }

// PORTAL_CONTENT_DIR is a FLAT, trusted directory of lowercase `.md` files (the dedicated canonical
// checkout, or content/portal for fixtures). Nested directories are not traversed; directory/file
// symlinks are rejected rather than followed into an unintended source tree.
// LIMITATION (deliberately deferred): this sync is upsert-only. Deleting a source `.md` file does
// NOT remove its content_items row. Deletion reconciliation is a later, deliberately client-scoped
// step (an unscoped delete is unsafe because PORTAL_CONTENT_DIR may hold only one client's files).
async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } })
  if (lstatSync(dir!).isSymbolicLink()) throw new Error(`PORTAL_CONTENT_DIR must not be a symlink: ${dir}`)
  const root = realpathSync(dir!)
  const entries = readdirSync(root, { withFileTypes: true })
  const markdownEntries = entries.filter((entry) => entry.name.endsWith('.md'))
  for (const entry of markdownEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Portal content source must be a regular file, not a link/directory: ${join(root, entry.name)}`)
    }
  }
  const files = markdownEntries.map((entry) => entry.name).sort()
  if (files.length === 0) throw new Error(`No .md files in ${dir}`)

  // Parse everything first: any parse error stops the run before a single DB write.
  const parsed = files.map((file) => {
    const p = join(root, file)
    return parseContentFile(readFileSync(p, 'utf8'), p)
  })

  // Reject duplicate (client, content_id) across files (otherwise the last file silently wins).
  // content_id is unique PER CLIENT now, so the same content_id may legitimately repeat across
  // different clients; only a collision within one client is a conflict.
  const seen = new Map<string, string>()
  for (const item of parsed) {
    const dupeKey = JSON.stringify([item.client, item.content_id])
    const prev = seen.get(dupeKey)
    if (prev) throw new Error(`Duplicate content_id "${item.content_id}" for client "${item.client}" in ${prev} and ${item.source_path}`)
    seen.set(dupeKey, item.source_path)
  }

  // Resolve every distinct client slug up front; an unknown client stops the run.
  const clientIdBySlug = new Map<string, string>()
  for (const slug of new Set(parsed.map((p) => p.client))) {
    const { data: client, error: cErr } = await supabase.from('clients').select('id').eq('slug', slug).single()
    if (cErr || !client) throw new Error(`No client "${slug}": ${cErr?.message ?? 'not found'}`)
    clientIdBySlug.set(slug, client.id)
  }

  const rows = parsed.map((p) => ({
    content_id: p.content_id,
    client_id: clientIdBySlug.get(p.client)!,
    title: p.title,
    format: p.format,
    pillar: p.pillar,
    platforms: p.platforms,
    planned_date: p.scheduled_date,
    canva_url: p.canva_url,
    drive_url: p.drive_url,
    version: p.version,
    fact_check: p.fact_check,
    fact_check_ledger: [],
    client_body: p.client_body,   // internal_notes deliberately NOT stored
    copy_blocks: p.copy_blocks,
    source_path: p.source_path,
  }))

  // One security-definer RPC owns identity creation, immutable snapshot insertion, checksum retry
  // semantics, and working-version advancement. The JSON array is processed in one DB transaction:
  // one invalid/conflicting item rolls back the entire batch. File status is deliberately ignored;
  // Supabase workflow transitions own approval/schedule/publication state.
  const { data, error } = await supabase.rpc('sync_content_item_versions', { p_items: rows })
  if (error) throw new Error(`Content sync failed: ${error.message}`)
  const results = Array.isArray(data) ? data : []
  console.log(`Synced ${rows.length} content item(s): ${rows.map((r) => r.content_id).join(', ')}`)
  for (const result of results) console.log(result)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dir = process.env.PORTAL_CONTENT_DIR   // REQUIRED (Kanset workspace in prod; content/portal for fixtures)
if (!url || !key) { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY') }
if (!dir) { throw new Error('Missing PORTAL_CONTENT_DIR (no silent fallback; use npm run sync-content:fixtures for seeds)') }

// Assumptions: PORTAL_CONTENT_DIR is a FLAT, trusted directory of lowercase `.md` files (the Kanset
// workspace, or content/portal for fixtures). Nested subdirectories, uppercase `.MD`, and symlinks
// are intentionally NOT traversed.
// LIMITATION (deliberately deferred): this sync is upsert-only. Deleting a source `.md` file does
// NOT remove its content_items row. Deletion reconciliation is a later, deliberately client-scoped
// step (an unscoped delete is unsafe because PORTAL_CONTENT_DIR may hold only one client's files).
async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } })
  const files = readdirSync(dir!).filter((f) => f.endsWith('.md'))
  if (files.length === 0) throw new Error(`No .md files in ${dir}`)

  // Parse everything first: any parse error stops the run before a single DB write.
  const parsed = files.map((file) => {
    const p = join(dir!, file)
    return parseContentFile(readFileSync(p, 'utf8'), p)
  })

  // Reject duplicate content_id across files (otherwise the last file silently wins, and a
  // different `client` could even reassign the row between tenants).
  const seen = new Map<string, string>()
  for (const item of parsed) {
    const prev = seen.get(item.content_id)
    if (prev) throw new Error(`Duplicate content_id "${item.content_id}" in ${prev} and ${item.source_path}`)
    seen.set(item.content_id, item.source_path)
  }

  // Resolve every distinct client slug up front; an unknown client stops the run.
  const clientIdBySlug = new Map<string, string>()
  for (const slug of new Set(parsed.map((p) => p.client))) {
    const { data: client, error: cErr } = await supabase.from('clients').select('id').eq('slug', slug).single()
    if (cErr || !client) throw new Error(`No client "${slug}": ${cErr?.message ?? 'not found'}`)
    clientIdBySlug.set(slug, client.id)
  }

  const now = new Date().toISOString()
  const rows = parsed.map((p) => ({
    content_id: p.content_id,
    client_id: clientIdBySlug.get(p.client)!,
    title: p.title,
    format: p.format,
    pillar: p.pillar,
    platforms: p.platforms,
    scheduled_date: p.scheduled_date,
    status: p.status,
    canva_url: p.canva_url,
    drive_url: p.drive_url,
    version: p.version,
    fact_check: p.fact_check,
    client_body: p.client_body,   // internal_notes deliberately NOT stored
    source_path: p.source_path,
    updated_at: now,
  }))

  // One array upsert is a single atomic statement: all rows land, or none do (no partial read-model).
  const { error } = await supabase.from('content_items').upsert(rows, { onConflict: 'content_id' })
  if (error) throw new Error(`Content sync failed: ${error.message}`)
  console.log(`Synced ${rows.length} content item(s): ${rows.map((r) => r.content_id).join(', ')}`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })

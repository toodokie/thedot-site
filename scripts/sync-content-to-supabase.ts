import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'
import { inspectCanonicalContentRoot, type SyncMode } from '../src/lib/portal/canonical-content-root'

// LIMITATION (deliberately deferred): this sync is upsert-only. Deleting a source `.md` file does
// NOT remove its content_items row. Deletion reconciliation is a later, deliberately client-scoped
// step (an unscoped delete is unsafe because PORTAL_CONTENT_DIR may hold only one client's files).
async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--dry-run') || args.filter((arg) => arg === '--dry-run').length > 1) {
    throw new Error('Usage: npm run sync-content -- [--dry-run]')
  }
  const mode: SyncMode = args.includes('--dry-run') ? 'preview' : 'apply'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dir = process.env.PORTAL_CONTENT_DIR
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  if (!dir) throw new Error('Missing PORTAL_CONTENT_DIR (no silent fallback)')

  const inspection = inspectCanonicalContentRoot({
    directory: dir,
    fixtureDirectory: join(process.cwd(), 'content/portal'),
    supabaseUrl: url,
    mode,
    expectedRemote: process.env.PORTAL_CONTENT_EXPECTED_REMOTE,
  })

  // Parse everything first: any parse error stops the run before a single DB write.
  const parsed = inspection.files.map((file) =>
    parseContentFile(readFileSync(file.absolutePath, 'utf8'), file.sourcePath))

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

  // The service client is created only after every file/path/frontmatter/privacy check succeeds.
  // The first network operation is the tenant lookup below.
  const supabase = createClient(url, key, { auth: { persistSession: false } })

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
    producer: p.producer,
    calendar_note: p.calendar_note,
    format: p.format,
    pillar: p.pillar,
    platforms: p.platforms,
    planned_date: p.scheduled_date,
    canva_url: p.canva_url,
    drive_url: p.drive_url,
    version: p.version,
    fact_check: p.fact_check,
    fact_check_scope: p.fact_check_scope,
    fact_check_exemption: p.fact_check_exemption,
    fact_check_ledger: p.fact_check_ledger,
    client_body: p.client_body,   // internal_notes deliberately NOT stored
    copy_blocks: p.copy_blocks,
    source_path: p.source_path,
    source_commit_sha: inspection.sourceCommitSha,
  }))

  // One security-definer RPC owns identity creation, immutable snapshot insertion, checksum retry
  // semantics, and working-version advancement. The JSON array is processed in one DB transaction:
  // one invalid/conflicting item rolls back the entire batch. File status is deliberately ignored;
  // Supabase workflow transitions own approval/schedule/publication state.
  const rpc = mode === 'preview' ? 'preview_content_item_versions' : 'sync_content_item_versions'
  const { data, error } = await supabase.rpc(rpc, { p_items: rows })
  if (error) throw new Error(`Content ${mode} failed: ${error.message}`)
  const results = Array.isArray(data) ? data : []
  const safeResults = results.map((result) => ({
    content_id: result.content_id,
    outcome: result.outcome,
    working_version: result.working_version,
    client_visible_version: result.client_visible_version,
  }))
  console.log(JSON.stringify({
    mode,
    count: rows.length,
    dirty_source_paths: mode === 'preview' ? inspection.dirtySourcePaths : [],
    results: safeResults,
  }))
  console.log(`${mode === 'preview' ? 'Previewed' : 'Synced'} ${rows.length} content item(s): ${rows.map((r) => r.content_id).join(', ')}`)
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Content sync failed')
  process.exitCode = 1
})

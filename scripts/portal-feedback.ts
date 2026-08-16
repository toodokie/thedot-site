// portal-feedback: read-only pull of ALL outstanding client feedback in the portal.
// Reads BOTH surfaces so nothing sits unseen: content_change_requests (binding edits) and
// comments (Q&A). This exists because a comments-only sweep missed Maria's pending copy
// edits (2026-07-29). Run at session start and before any publish.
// Usage: PORTAL_CONTENT_DIR=... npx tsx scripts/portal-feedback.ts [clientSlug]  (default kanset)
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'

async function main() {
  const slug = process.argv[2] ?? 'kanset'
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const client = await db.from('clients').select('id').eq('slug', slug).single()
  if (client.error || !client.data) throw new Error(`client ${slug} not found: ${client.error?.message}`)
  const cid = client.data.id
  const items = await db.from('content_items').select('id, content_id').eq('client_id', cid)
  const name = new Map((items.data ?? []).map((r: any) => [r.id, r.content_id]))

  // 1) All unresolved binding edits. Conflicted remains open from the client's perspective.
  const crs = await db.from('content_change_requests')
    .select('id, content_id, base_version, request_type, status, requester_name, payload, created_at, resolution_note')
    .eq('client_id', cid).order('created_at')
  const pendingCrs = (crs.data ?? []).filter((r: any) =>
    ['pending', 'applying', 'prepared', 'conflicted'].includes(r.status))

  // 2) OPEN comments (client-authored, not resolved = likely awaiting our reply/action).
  const cmts = await db.from('comments')
    .select('content_id, author_type, author_name, body, copy_block_key, resolved, reply_to_comment_id, created_at')
    .eq('client_id', cid).order('created_at')
  const openComments = (cmts.data ?? []).filter((r: any) => r.author_type === 'client' && !r.resolved)

  console.log(`\n=== PORTAL FEEDBACK for ${slug} ===`)
  console.log(`Unresolved edits: ${pendingCrs.length}   |   Open client conversations: ${openComments.length}\n`)

  if (pendingCrs.length) {
    console.log('--- UNRESOLVED BINDING EDITS ---')
    for (const r of pendingCrs) {
      const p = r.payload ?? {}
      console.log(`\n• ${name.get(r.content_id) ?? r.content_id}  [${p.target_kind ?? 'copy_block'}: ${p.target_key ?? p.block_key ?? '?'}]  v${r.base_version ?? '?'}  ${r.status}  by ${r.requester_name}  ${r.created_at?.slice(0, 16)}`)
      console.log(`  proposed:\n    ${String(p.proposed_text ?? '').replace(/\r\n/g, '\n').replace(/\n/g, '\n    ')}`)
    }
    console.log()
  } else {
    console.log('No unresolved edits.\n')
  }

  if (openComments.length) {
    console.log('--- OPEN CLIENT COMMENTS (unresolved, may need a reply) ---')
    for (const r of openComments) {
      console.log(`\n• ${name.get(r.content_id) ?? r.content_id}  [block: ${r.copy_block_key ?? '-'}]  by ${r.author_name}  ${r.created_at?.slice(0, 16)}`)
      console.log(`  "${r.body}"`)
    }
    console.log()
  } else {
    console.log('No open client comments.\n')
  }

  if (!pendingCrs.length && !openComments.length) console.log('Clean: nothing outstanding from the client in the portal.\n')
}
main().catch((e) => { console.error(e.message); process.exit(1) })

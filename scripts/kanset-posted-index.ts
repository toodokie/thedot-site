// Generates the human-and-agent readable "what actually posted" index.
// Source of truth is the portal. This file is a PROJECTION: never hand-edit it.
//   npx tsx scripts/kanset-posted-index.ts [outfile]
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
loadEnvConfig(process.cwd())
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const OUT = process.argv[2] ?? '/Users/anastasiavolkova/Kanset/content/POSTED.md'

async function main() {
  const { data: cl } = await admin.from('clients').select('id,name').eq('slug', 'kanset').single()
  const { data: items, error: itemsErr } = await admin.from('content_items')
    .select('id,content_id,title,planned_date,format').eq('client_id', cl!.id)
  if (itemsErr) throw new Error('content_items query failed: ' + itemsErr.message)
  const ids = (items ?? []).map((i: any) => i.id)
  if (!ids.length) throw new Error('no content_items returned for kanset')
  const [{ data: pubs }, { data: assets }, { data: links }] = await Promise.all([
    admin.from('content_publication_targets').select('content_id,destination,status,published_at,live_url').in('content_id', ids),
    admin.from('content_review_assets').select('content_item_id,asset_kind,label,url').in('content_item_id', ids),
    admin.from('content_design_links').select('content_item_id,drive_url').in('content_item_id', ids),
  ])
  const byItem = new Map<string, any>()
  for (const i of items ?? []) byItem.set(i.id, { ...i, live: [] as any[], pending: [] as string[], drive: [] as {kind:string,url:string}[] })
  for (const p of pubs ?? []) {
    const r = byItem.get(p.content_id); if (!r) continue
    if (p.live_url) r.live.push(p); else if (p.status === 'pending') r.pending.push(p.destination)
  }
  for (const a of assets ?? []) { const r = byItem.get(a.content_item_id); if (r && a.url && !r.drive.some((d:any)=>d.url===a.url)) r.drive.push({ kind: a.asset_kind ?? 'asset', url: a.url }) }
  for (const l of links ?? []) { const r = byItem.get(l.content_item_id); if (r && l.drive_url && !r.drive.some((d:any)=>d.url===l.drive_url)) r.drive.push({ kind: 'design', url: l.drive_url }) }

  const rows = [...byItem.values()]
  const posted = rows.filter(r => r.live.length)
    .sort((a, b) => String(b.live[0].published_at).localeCompare(String(a.live[0].published_at)))
  const notPosted = rows.filter(r => !r.live.length)
    .sort((a, b) => String(b.planned_date ?? '').localeCompare(String(a.planned_date ?? '')))

  const L: string[] = []
  L.push('# What actually posted, Kanset')
  L.push('')
  L.push('**Generated file. Do not hand-edit.** Regenerate from `~/thedot-site`:')
  L.push('')
  L.push('```')
  L.push('npx tsx scripts/kanset-posted-index.ts')
  L.push('```')
  L.push('')
  L.push(`Source: the portal database, which is the record. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`)
  L.push(`${posted.length} pieces live, ${notPosted.length} not yet live.`)
  L.push('')
  L.push('A piece counts as posted only when a destination carries a verified live URL. A planned date is not evidence.')
  L.push('')
  L.push('## Posted, newest first')
  L.push('')
  L.push('| Posted | Piece | content_id | Live on | Asset |')
  L.push('|---|---|---|---|---|')
  for (const r of posted) {
    const when = String(r.live[0].published_at).slice(0, 10)
    const dest = r.live.map((p: any) => `[${p.destination}](${p.live_url})`).join(' · ')
    const pend = r.pending.length ? ` <br>*pending: ${r.pending.join(', ')}*` : ''
    const counts: Record<string, number> = {}
    const drive = r.drive.length
      ? r.drive.map((d: any) => { counts[d.kind] = (counts[d.kind] ?? 0) + 1
          const n = counts[d.kind]; const seen = r.drive.filter((x: any) => x.kind === d.kind).length
          return `[${d.kind}${seen > 1 ? ' ' + n : ''}](${d.url})` }).join(' · ')
      : '**none recorded**'
    L.push(`| ${when} | ${r.title} | \`${r.content_id}\` | ${dest}${pend} | ${drive} |`)
  }
  L.push('')
  L.push('## Not live yet')
  L.push('')
  L.push('| Planned | Piece | content_id | Destinations pending |')
  L.push('|---|---|---|---|')
  for (const r of notPosted) {
    L.push(`| ${r.planned_date ?? 'unscheduled'} | ${r.title} | \`${r.content_id}\` | ${r.pending.join(', ') || 'none recorded'} |`)
  }
  L.push('')
  await writeFile(OUT, L.join('\n') + '\n', 'utf8')
  console.log(`wrote ${OUT}: ${posted.length} posted, ${notPosted.length} not live`)
}
main()

// scripts/seed-surfaces.ts
// Seeds a small amount of DEMO data for the new portal surfaces (recommendations, links,
// report_snapshots, content_ideas) so they render populated for review. Idempotent-ish: it skips a
// table that already has rows for the Kanset client, so re-running does not duplicate. Real Kanset
// content replaces this later. Service-role only (reads keys from .env.local, never hardcoded).
// Run: npx tsx scripts/seed-surfaces.ts   (after migration 0004 is applied)
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

async function hasRows(table: string, clientId: string): Promise<boolean> {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  if (error) throw new Error(`${table} count: ${error.message}`)
  return (count ?? 0) > 0
}

async function seed(table: string, clientId: string, rows: Record<string, unknown>[]) {
  if (await hasRows(table, clientId)) {
    console.log(`skip ${table} (already has rows)`)
    return
  }
  const { error } = await admin.from(table).insert(rows.map((r) => ({ ...r, client_id: clientId })))
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  console.log(`seeded ${table}: ${rows.length} row(s)`)
}

async function main() {
  const { data: c, error } = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  if (error || !c) throw new Error(`kanset client not found: ${error?.message ?? 'missing'}`)
  const clientId = c.id as string

  await seed('recommendations', clientId, [
    { title: 'Make employer content the weekly anchor', category: 'content', platform: 'all',
      body: 'Employer situations (LMIA, lost-track-of-filings, hiring a foreign worker) are your highest-intent audience. Lead one graphic post a week with a concrete employer scenario and a single clear next step.' },
    { title: 'Start a recurring "Express Entry this week" post', category: 'growth', platform: 'instagram',
      body: 'The draw-number content earns your best saves. A short, consistent format ("your category can matter more than your score") builds a habit and gives the feed a reliable beat.' },
    { title: 'Open carousels with a question, not a label', category: 'copy', platform: 'facebook',
      body: 'Your strongest-performing pieces lead with a rhetorical question ("Waiting on Ontario PR?") rather than a topic label. Keep the first slide a question and the last slide one action: book a consultation.' },
  ])

  await seed('links', clientId, [
    { category: 'brand', label: 'Brand guide (PDF)', description: 'Palette, fonts, logo system, voice.', url: 'https://drive.google.com/', sort: 1 },
    { category: 'brand', label: 'Logo files', description: 'Full-colour, white, and mark-only.', url: 'https://drive.google.com/', sort: 2 },
    { category: 'brand', label: 'Canva brand kit', description: 'Templates and the shared brand kit.', url: 'https://www.canva.com/', sort: 3 },
    { category: 'video', label: 'Studio reels (Set 1)', description: 'The 13 short reels from the studio.', url: 'https://www.dropbox.com/', sort: 1 },
    { category: 'video', label: 'Kanset Talks on YouTube', description: 'The podcast channel.', url: 'https://youtube.com/', sort: 2 },
    { category: 'posting', label: 'Posting folder', description: 'Where the posts and schedules live.', url: 'https://drive.google.com/open?id=1j09apVmzmm6XiEQQk-l9Nw1mMi3yBZrv', sort: 1 },
  ])

  // Patch already-seeded demo rows for the 0005 features (platform badge + posting folder), idempotent.
  await admin.from('recommendations').update({ platform: 'all' }).eq('client_id', clientId).eq('category', 'content').is('platform', null)
  await admin.from('recommendations').update({ platform: 'instagram' }).eq('client_id', clientId).eq('category', 'growth').is('platform', null)
  await admin.from('recommendations').update({ platform: 'facebook' }).eq('client_id', clientId).eq('category', 'copy').is('platform', null)
  {
    const { count } = await admin.from('links').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('category', 'posting')
    if (!count) {
      await admin.from('links').insert({ client_id: clientId, category: 'posting', label: 'Posting folder', description: 'Where the posts and schedules live.', url: 'https://drive.google.com/open?id=1j09apVmzmm6XiEQQk-l9Nw1mMi3yBZrv', sort: 1 })
      console.log('patched: added posting folder link')
    }
  }

  await seed('report_snapshots', clientId, [
    { period: '2026-07-H1', platform: 'instagram', summary: 'Steady growth off a small base; the OINP carousel drove the most saves.',
      metrics: { reach: { value: 1420, prev: 980 }, engagement: { value: 186, prev: 121 }, saves: { value: 41, prev: 22 },
        profile_visits: { value: 63, prev: 38 }, follower_growth: { value: 9, prev: 5 },
        top_posts: [{ title: 'Waiting on Ontario PR?', url: 'https://instagram.com/', metric: '41 saves' }] } },
    { period: '2026-07-H1', platform: 'facebook', summary: 'Reach holding; the July roundup carried the period.',
      metrics: { reach: { value: 2110, prev: 2040 }, engagement: { value: 97, prev: 88 },
        follower_growth: { value: 4, prev: 3 },
        top_posts: [{ title: 'This month in Canadian immigration', url: 'https://facebook.com/', metric: '97 interactions' }] } },
    { period: '2026-07-H1', platform: 'youtube', summary: 'Channel launched with the intro; strong first-day CTR.',
      metrics: { reach: { value: 59 }, engagement: { value: 6 }, follower_growth: { value: 10 },
        top_posts: [{ title: 'Meet Kanset (intro)', url: 'https://youtu.be/N_NzNqnNZNw', metric: '10.1% CTR' }] } },
    { period: '2026-07-H1', platform: 'website', summary: 'Traffic lifted by the OINP news article.',
      metrics: { traffic: { value: 640, prev: 500 }, contact_clicks: { value: 18, prev: 12 },
        top_pages: [{ page: '/news/ontario-workforce-priority-stream', views: 210 }, { page: '/contact', views: 96 }] } },
  ])

  await seed('content_ideas', clientId, [
    { author_type: 'client', author_name: 'Maria (demo)', title: 'Employer: hired before, lost track of filings', body: 'Reassuring angle for employers who sponsored a worker years ago and are unsure where the file stands.', status: 'new' },
    { author_type: 'client', author_name: 'Maria (demo)', title: 'H&C success story', body: '7 families got Approval in Principle in the last 3 months. Keep the no-guarantee framing.', status: 'considering' },
    { author_type: 'anastasia', author_name: 'The Dot (demo)', title: '500 Google reviews milestone', body: 'Hold-and-fire on the day Google reaches 500. 14 years, 4.7 stars.', status: 'planned' },
  ])

  console.log('\nseed-surfaces done.')
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message ?? e); process.exit(1) })

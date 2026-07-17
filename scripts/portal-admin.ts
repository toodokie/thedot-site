// scripts/portal-admin.ts
// Dev/admin utility for the client portal DB. Uses the service-role key (read from .env.local,
// never hardcoded) to verify the schema, seed, and memberships, link a test/client user, and post
// a reply into a piece's comment thread on The Dot's behalf (the agency side of a two-way thread).
// Run: npx tsx scripts/portal-admin.ts [status | link <email> "<name>"
//   | signin-link <email> [origin] | reply <slug> <content_id> "<body>" ["<author name>"]]
// Default action is `status`. `link` is idempotent.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findAuthUser(email: string) {
  const target = email.toLowerCase()
  // small project: one page of up to 1000 is plenty
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users.find((u) => u.email?.toLowerCase() === target) ?? null
}

async function status() {
  const { data: clients, error: cErr } = await admin.from('clients').select('id, name, slug, created_at')
  if (cErr) throw new Error(`select clients: ${cErr.message}`)
  console.log('clients:', clients)

  const { count: ciCount, error: ciErr } = await admin
    .from('content_items')
    .select('id', { count: 'exact', head: true })
  if (ciErr) console.log('content_items check FAILED:', ciErr.message)
  else console.log('content_items rows:', ciCount ?? 0)

  const { data: members, error: mErr } = await admin
    .from('client_users')
    .select('email, name, role, client_id')
  if (mErr) console.log('client_users read FAILED:', mErr.message)
  else console.log('client_users:', members)
}

async function link(email: string, name: string) {
  const { data: clients, error: cErr } = await admin.from('clients').select('id, slug').eq('slug', 'kanset')
  if (cErr) throw new Error(`select clients: ${cErr.message}`)
  const kanset = clients?.[0]
  if (!kanset) throw new Error("kanset client not found (seed missing)")

  const user = await findAuthUser(email)
  if (!user) throw new Error(`auth user ${email} not found; add it in Supabase Auth first`)
  console.log('auth user:', { id: user.id, email: user.email })

  const { data: existing, error: eErr } = await admin
    .from('client_users')
    .select('id, email, name, role')
    .eq('client_id', kanset.id)
    .eq('auth_user_id', user.id)
  if (eErr) throw new Error(`select client_users: ${eErr.message}`)
  if (existing && existing.length) {
    console.log('link already exists (no-op):', existing[0])
    return
  }

  const { data: inserted, error: iErr } = await admin
    .from('client_users')
    .insert({ client_id: kanset.id, auth_user_id: user.id, email: user.email, name, role: 'client' })
    .select('id, email, name, role')
  if (iErr) throw new Error(`insert client_users: ${iErr.message}`)
  console.log('link created:', inserted?.[0])
}

// Mint a one-time sign-in URL WITHOUT sending email (bypasses the built-in email rate limit and any
// mail-client link pre-consumption). Uses the token_hash flow, which the callback verifies server-side.
async function signinLink(email: string, origin: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const props = data.properties as { hashed_token?: string; verification_type?: string }
  if (!props?.hashed_token) throw new Error('generateLink returned no hashed_token')
  const type = props.verification_type ?? 'magiclink'
  const url = `${origin}/client/auth/callback?token_hash=${encodeURIComponent(props.hashed_token)}&type=${encodeURIComponent(type)}&next=/client/kanset`
  console.log(`One-time sign-in link for ${email} (type=${type}); paste into your browser (no email, single use):\n`)
  console.log(url)
}

// Post a reply into a piece's comment thread AS THE DOT (the agency side). Uses the service role,
// which has insert on comments + activity_log; mirrors what the client's add_comment RPC does, so the
// client reads the reply in the same thread and sees a client-visible 'comment_added' activity. This
// is the teammate write path: the client comments in the portal, The Dot replies from here.
async function reply(slug: string, contentId: string, body: string, authorName: string) {
  const text = (body ?? '').trim()
  if (!text) throw new Error('reply body is required')
  if (text.length > 4000) throw new Error('reply body is too long (4000 characters max)')

  const { data: clients, error: cErr } = await admin.from('clients').select('id').eq('slug', slug)
  if (cErr) throw new Error(`select clients: ${cErr.message}`)
  const client = clients?.[0]
  if (!client) throw new Error(`client with slug "${slug}" not found`)

  const { data: items, error: iErr } = await admin
    .from('content_items').select('id, title, version')
    .eq('client_id', client.id).eq('content_id', contentId)
  if (iErr) throw new Error(`select content_items: ${iErr.message}`)
  const item = items?.[0]
  if (!item) throw new Error(`content "${contentId}" not found for client "${slug}"`)

  const { data: inserted, error: insErr } = await admin.from('comments').insert({
    content_id: item.id, client_id: client.id,
    author_type: 'anastasia', author_name: authorName, body: text,
  }).select('id').single()
  if (insErr) throw new Error(`insert comment: ${insErr.message}`)

  const { error: actErr } = await admin.from('activity_log').insert({
    client_id: client.id, content_id: item.id, content_version: item.version,
    event_type: 'comment_added', title: `Comment: ${item.title}`, summary: text,
    actor_type: 'anastasia', actor_name: authorName,
  })
  if (actErr) throw new Error(`insert activity: ${actErr.message}`)

  console.log(`reply posted on "${item.title}" (${slug}/${contentId}) as ${authorName}: ${inserted?.id}`)
}

async function main() {
  const [action, email, name] = process.argv.slice(2)
  if (action === 'reply') {
    const [, slug, contentId, body, authorName] = process.argv.slice(2)
    if (!slug || !contentId || !body) {
      throw new Error('usage: portal-admin.ts reply <slug> <content_id> "<body>" ["<author name>"]')
    }
    await reply(slug, contentId, body, authorName ?? 'The Dot')
    return
  }
  if (action === 'signin-link') {
    if (!email) throw new Error('usage: portal-admin.ts signin-link <email> [origin]')
    await signinLink(email, name ?? 'http://localhost:3000') // 3rd positional = origin
    return
  }
  if (action === 'link') {
    if (!email) throw new Error('usage: portal-admin.ts link <email> "<name>"')
    await link(email, name ?? email)
    console.log('--- status after link ---')
  }
  await status()
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e?.message ?? e)
  process.exit(1)
})

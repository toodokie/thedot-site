// scripts/portal-admin.ts
// Dev/admin utility for the client portal DB. Uses the service-role key (read from .env.local,
// never hardcoded) to verify the schema, seed, and memberships, and to link a test/client user.
// Run: npx tsx scripts/portal-admin.ts [status | link <email> "<name>"]
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

async function main() {
  const [action, email, name] = process.argv.slice(2)
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

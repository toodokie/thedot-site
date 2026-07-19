// Local-only baseline for scripts/test-rls.ts. Refuses non-loopback Supabase URLs so this helper
// cannot seed production accidentally. The disposable database must already have migrations 0001–0008.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Missing local Supabase URL/service key')

const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)) {
  throw new Error(`Refusing to seed a non-loopback Supabase project: ${parsedUrl.hostname}`)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMAIL = 'info@thedotcreative.co'
const CONTENT_ID = 'rls-kanset-baseline'

async function main() {
  const { data: client, error: clientError } = await admin
    .from('clients').select('id').eq('slug', 'kanset').single()
  if (clientError || !client) throw new Error(`Kanset client missing: ${clientError?.message ?? 'missing'}`)

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) throw new Error(`listUsers: ${usersError.message}`)
  let user = users.users.find((candidate) => candidate.email?.toLowerCase() === EMAIL)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? 'missing user'}`)
    user = data.user
  }

  const { error: membershipError } = await admin.rpc('upsert_portal_membership', {
    p_client_id: client.id,
    p_auth_user_id: user.id,
    p_email: EMAIL,
    p_name: 'RLS Kanset Baseline',
    p_can_decide: true,
    p_can_comment: true,
    p_can_submit_requests: true,
    p_can_manage_schedule: true,
    p_can_use_assistant: false,
    p_actor_key: 'thedot-admin',
    p_idempotency_key: `local-membership-${randomUUID()}`,
  })
  if (membershipError) throw new Error(`membership provision: ${membershipError.message}`)

  for (const [scope, feature] of [
    [null, 'client_portal_launch'],
    [client.id, 'client_portal_launch'],
    [null, 'client_mutations'],
    [client.id, 'client_mutations'],
    [null, 'agency_mutations'],
    [client.id, 'agency_mutations'],
    [null, 'repository_worker'],
    [client.id, 'repository_worker'],
  ] as const) {
    const { error } = await admin.rpc('set_portal_feature_switch', {
      p_client_id: scope,
      p_feature: feature,
      p_enabled: true,
      p_reason: 'Loopback-only RLS test baseline',
      p_actor_key: 'thedot-admin',
      p_idempotency_key: `local-switch-${randomUUID()}`,
    })
    if (error) throw new Error(`enable ${feature}: ${error.message}`)
  }

  const { data: released, error: releasedError } = await admin
    .from('content_with_state').select('id').eq('client_id', client.id).limit(1)
  if (releasedError) throw new Error(`released content read: ${releasedError.message}`)
  if (!released?.length) {
    const payload = [{
      client_id: client.id,
      content_id: CONTENT_ID,
      version: 1,
      title: 'RLS Kanset baseline',
      format: 'test',
      pillar: 'test',
      platforms: ['instagram'],
      planned_date: null,
      canva_url: null,
      drive_url: null,
      fact_check: 'confirmed',
      fact_check_scope: 'not_applicable',
      fact_check_exemption: 'Local RLS fixture with no factual client claim.',
      fact_check_ledger: [],
      client_body: 'Released Kanset baseline body',
      copy_blocks: [{ key: 'caption', label: 'Caption', body: 'Released Kanset baseline body' }],
      source_path: 'local-test:rls-kanset-baseline.md',
    }]
    const { data, error } = await admin.rpc('sync_content_item_versions', { p_items: payload })
    if (error) throw new Error(`baseline sync: ${error.message}`)
    const itemId = (data as { item_id?: string }[] | null)?.[0]?.item_id
    if (!itemId) throw new Error('baseline sync returned no item_id')
    const { error: readyError } = await admin.rpc('mark_content_ready', {
      p_content_id: itemId,
      p_content_version: 1,
    })
    if (readyError) throw new Error(`baseline release: ${readyError.message}`)
  }

  console.log('Local RLS baseline ready: Kanset user, membership, and released content exist.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

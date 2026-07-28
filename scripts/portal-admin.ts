// scripts/portal-admin.ts
// Dev/admin utility for the client portal DB. Uses the service-role key (read from .env.local,
// never hardcoded) to verify the schema, seed, and memberships, link a test/client user, and post
// a reply into a piece's comment thread on The Dot's behalf (the agency side of a two-way thread).
// Run: npx tsx scripts/portal-admin.ts [status | link <email> "<name>"
//   | provision <slug> <email> "<name>" [decide,comment,requests,schedule,assistant]
//   | offboard <slug> <email> "<reason>"
//   | transfer-decider <slug> <from-email> <to-email> "<reason>"
//   | switch <global|slug> <feature> <on|off> "<reason>" | access-log [slug]
//   | signin-link <email> [origin] | ready <slug> <content_id> [version]
//   | begin-revision <slug> <content_id> [released-version]
//   | schedule-status <slug> <content_id>
//   | reply <slug> <content_id> "<body>" ["<author name>"]]
// Default action is `status`. `link` is idempotent.
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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

  const { data: members, error: mErr } = await admin.rpc('list_portal_access')
  if (mErr) console.log('client_users read FAILED:', mErr.message)
  else console.log('client_users:', members)

  const { data: switches, error: sErr } = await admin.rpc('list_portal_feature_switches')
  if (sErr) console.log('feature switches read FAILED:', sErr.message)
  else console.log('feature switches:', switches)
}

async function clientBySlug(slug: string) {
  const { data: clients, error: cErr } = await admin.from('clients').select('id, slug').eq('slug', slug)
  if (cErr) throw new Error(`select clients: ${cErr.message}`)
  const client = clients?.[0]
  if (!client) throw new Error(`client ${slug} not found`)
  return client
}

const CAPABILITIES = new Set([
  'decide', 'comment', 'requests', 'schedule', 'assistant',
])

function parseCapabilities(value = ''): Set<string> {
  const caps = new Set(value.split(',').map((part) => part.trim()).filter(Boolean))
  for (const cap of caps) {
    if (!CAPABILITIES.has(cap)) throw new Error(`unknown capability: ${cap}`)
  }
  return caps
}

const ASSISTANT_DISABLE_CONFIRMATION = 'CONFIRM_ASSISTANT_DISABLE'

async function provision(
  slug: string,
  email: string,
  name: string,
  capabilityList = '',
  disableConfirmation = '',
) {
  const client = await clientBySlug(slug)

  let user = await findAuthUser(email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (error || !data.user) throw new Error(`create auth user: ${error?.message ?? 'missing user'}`)
    user = data.user
  }
  console.log('auth user:', { id: user.id, email: user.email })
  const caps = parseCapabilities(capabilityList)
  const { data: accessRows, error: accessError } = await admin.rpc('list_portal_access')
  if (accessError) throw new Error(`list_portal_access: ${accessError.message}`)
  const current = (accessRows as Array<{
    client_id?: string
    auth_user_id?: string
    can_use_assistant?: boolean
  }> | null)?.find(
    (row) => row.client_id === client.id && row.auth_user_id === user.id,
  )
  if (
    current?.can_use_assistant === true &&
    !caps.has('assistant') &&
    disableConfirmation !== ASSISTANT_DISABLE_CONFIRMATION
  ) {
    throw new Error(
      'refusing to remove live assistant access without the final argument ' +
      ASSISTANT_DISABLE_CONFIRMATION,
    )
  }

  const { data: membershipId, error } = await admin.rpc('upsert_portal_membership', {
    p_client_id: client.id,
    p_auth_user_id: user.id,
    p_email: user.email,
    p_name: name,
    p_can_decide: caps.has('decide'),
    p_can_comment: caps.has('comment'),
    p_can_submit_requests: caps.has('requests'),
    p_can_manage_schedule: caps.has('schedule'),
    p_can_use_assistant: caps.has('assistant'),
    p_actor_key: 'thedot-admin',
    p_idempotency_key: `membership-${randomUUID()}`,
  })
  if (error) throw new Error(`upsert_portal_membership: ${error.message}`)
  console.log('membership ensured:', {
    id: membershipId, client: slug, email: user.email, name, capabilities: [...caps],
  })
}

async function offboard(slug: string, email: string, reason: string) {
  const client = await clientBySlug(slug)
  const user = await findAuthUser(email)
  if (!user) throw new Error(`auth user ${email} not found`)
  const { data, error } = await admin.rpc('offboard_portal_membership', {
    p_client_id: client.id,
    p_auth_user_id: user.id,
    p_reason: reason,
    p_actor_key: 'thedot-admin',
    p_idempotency_key: `offboard-${randomUUID()}`,
  })
  if (error) throw new Error(`offboard_portal_membership: ${error.message}`)
  console.log('tenant membership removed; global auth user and other memberships preserved:', data)
}

async function transferDecider(slug: string, fromEmail: string, toEmail: string, reason: string) {
  const client = await clientBySlug(slug)
  const [fromUser, toUser] = await Promise.all([findAuthUser(fromEmail), findAuthUser(toEmail)])
  if (!fromUser || !toUser) throw new Error('both auth users must already exist')
  const { data, error } = await admin.rpc('transfer_portal_primary_decider', {
    p_client_id: client.id,
    p_from_auth_user_id: fromUser.id,
    p_to_auth_user_id: toUser.id,
    p_reason: reason,
    p_actor_key: 'thedot-admin',
    p_idempotency_key: `transfer-decider-${randomUUID()}`,
  })
  if (error) throw new Error(`transfer_portal_primary_decider: ${error.message}`)
  console.log('primary decision-maker transferred:', data)
}

async function setSwitch(
  scope: string,
  feature: string,
  enabledText: string,
  reason: string,
  disableConfirmation = '',
) {
  if (!['on', 'off'].includes(enabledText)) throw new Error('switch value must be on or off')
  if (
    feature === 'assistant' &&
    enabledText === 'off' &&
    disableConfirmation !== ASSISTANT_DISABLE_CONFIRMATION
  ) {
    throw new Error(
      'refusing to disable the live assistant without the final argument ' +
      ASSISTANT_DISABLE_CONFIRMATION,
    )
  }
  const clientId = scope === 'global' ? null : (await clientBySlug(scope)).id
  const { data, error } = await admin.rpc('set_portal_feature_switch', {
    p_client_id: clientId,
    p_feature: feature,
    p_enabled: enabledText === 'on',
    p_reason: reason,
    p_actor_key: 'thedot-admin',
    p_idempotency_key: `switch-${randomUUID()}`,
  })
  if (error) throw new Error(`set_portal_feature_switch: ${error.message}`)
  console.log('feature switch updated:', data)
}

async function accessLog(slug?: string) {
  const clientId = slug ? (await clientBySlug(slug)).id : null
  const { data, error } = await admin.rpc('list_portal_access_commands', {
    p_client_id: clientId,
  })
  if (error) throw new Error(`list_portal_access_commands: ${error.message}`)
  console.dir(data, { depth: null })
}

// Mint a one-time sign-in URL WITHOUT sending email (bypasses the built-in email rate limit and any
// mail-client link pre-consumption). Points at the CONFIRM page (GET renders a button, only the button
// POST spends the token), never the GET-consuming callback: browsers preload pasted/typed URLs before
// Enter, which would burn a callback-style link invisibly.
async function signinLink(email: string, origin: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const props = data.properties as { hashed_token?: string; verification_type?: string }
  if (!props?.hashed_token) throw new Error('generateLink returned no hashed_token')
  const type = props.verification_type ?? 'magiclink'
  const url = `${origin}/client/auth/confirm?token_hash=${encodeURIComponent(props.hashed_token)}&type=${encodeURIComponent(type)}&next=/client/kanset`
  console.log(`One-time sign-in link for ${email} (type=${type}); paste into any browser, then click Sign in (no email, single use):\n`)
  console.log(url)
}

// Explicit human release gate after an immutable snapshot has synced. Sync itself never advances
// client_visible_version. Supplying an optional version makes automation fail closed if the local
// file advanced after it was reviewed; omitting it releases the currently locked working version.
async function ready(slug: string, contentId: string, expectedVersion?: string) {
  const parsedVersion = expectedVersion === undefined ? null : Number(expectedVersion)
  if (parsedVersion !== null && (!Number.isInteger(parsedVersion) || parsedVersion < 1)) {
    throw new Error('version must be an integer >= 1')
  }

  const { data: client, error: clientError } = await admin
    .from('clients').select('id').eq('slug', slug).single()
  if (clientError || !client) {
    throw new Error(`client with slug "${slug}" not found: ${clientError?.message ?? 'missing'}`)
  }

  const { data: item, error: itemError } = await admin
    .from('content_items')
    .select('id, working_version, client_visible_version, client_visible, status')
    .eq('client_id', client.id)
    .eq('content_id', contentId)
    .single()
  if (itemError || !item) {
    throw new Error(`content "${contentId}" not found for client "${slug}": ${itemError?.message ?? 'missing'}`)
  }

  const version = parsedVersion ?? item.working_version
  if (version !== item.working_version) {
    throw new Error(`reviewed version ${version} is stale; current working version is ${item.working_version}`)
  }

  const { data: snapshot, error: snapshotError } = await admin
    .from('content_item_versions')
    .select('fact_check, fact_check_scope, fact_check_exemption, fact_check_ledger')
    .eq('content_item_id', item.id)
    .eq('version', version)
    .single()
  if (snapshotError || !snapshot) {
    throw new Error(`release metadata unavailable: ${snapshotError?.message ?? 'missing'}`)
  }
  const ledger = Array.isArray(snapshot.fact_check_ledger)
    ? snapshot.fact_check_ledger as Array<{ status?: unknown }>
    : []
  const statusCounts = ledger.reduce<Record<string, number>>((counts, entry) => {
    const status = typeof entry.status === 'string' ? entry.status : 'invalid'
    counts[status] = (counts[status] ?? 0) + 1
    return counts
  }, {})
  const gateCodes: string[] = []
  if (snapshot.fact_check !== 'confirmed') gateCodes.push('fact_check_unconfirmed')
  if (snapshot.fact_check_scope === 'required' && ledger.length === 0) gateCodes.push('ledger_invalid')
  if (snapshot.fact_check_scope === 'not_applicable'
      && (ledger.length > 0 || !snapshot.fact_check_exemption)) gateCodes.push('ledger_invalid')
  if (ledger.some((entry) => entry.status !== 'confirmed')) gateCodes.push('ledger_entry_unconfirmed')
  console.log('release gate:', {
    client: slug,
    content_id: contentId,
    version,
    fact_check_scope: snapshot.fact_check_scope,
    ledger_entries: ledger.length,
    ledger_status_counts: statusCounts,
    deterministic_gate_codes: [...new Set(gateCodes)],
  })

  const { error } = await admin.rpc('mark_content_ready', {
    p_content_id: item.id,
    p_content_version: version,
  })
  if (error) throw new Error(`mark_content_ready: ${error.message}`)

  console.log(`released ${slug}/${contentId} v${version} for client review`)
}

// Pull a currently released/reviewing piece back to The Dot before syncing changed authored copy.
// This is deliberately separate from file sync so a background projection cannot change workflow.
async function beginRevision(slug: string, contentId: string, expectedVersion?: string) {
  const parsedVersion = expectedVersion === undefined ? null : Number(expectedVersion)
  if (parsedVersion !== null && (!Number.isInteger(parsedVersion) || parsedVersion < 1)) {
    throw new Error('released version must be an integer >= 1')
  }

  const { data: client, error: clientError } = await admin
    .from('clients').select('id').eq('slug', slug).single()
  if (clientError || !client) {
    throw new Error(`client with slug "${slug}" not found: ${clientError?.message ?? 'missing'}`)
  }
  const { data: item, error: itemError } = await admin
    .from('content_items')
    .select('id, client_visible_version')
    .eq('client_id', client.id)
    .eq('content_id', contentId)
    .single()
  if (itemError || !item) {
    throw new Error(`content "${contentId}" not found for client "${slug}": ${itemError?.message ?? 'missing'}`)
  }

  const version = parsedVersion ?? item.client_visible_version
  if (!version) throw new Error('content has never been released; no revision transition is needed')
  const { error } = await admin.rpc('begin_content_revision', {
    p_content_id: item.id,
    p_content_version: version,
  })
  if (error) throw new Error(`begin_content_revision: ${error.message}`)
  console.log(`revision opened for ${slug}/${contentId} from released v${version}`)
}

// Read-only until Slice 4 adds the evidence-backed agency confirmation RPC. This command must not
// provide a shortcut that can turn a requested time into a provider commitment.
async function scheduleStatus(slug: string, contentId: string) {
  const { data: client, error: clientError } = await admin
    .from('clients').select('id').eq('slug', slug).single()
  if (clientError || !client) {
    throw new Error(`client with slug "${slug}" not found: ${clientError?.message ?? 'missing'}`)
  }
  const { data: item, error: itemError } = await admin
    .from('content_with_state')
    .select('id, content_id, title, version, planned_date, schedule_state, client_state')
    .eq('client_id', client.id).eq('content_id', contentId).single()
  if (itemError || !item) {
    throw new Error(`released content "${contentId}" not found: ${itemError?.message ?? 'missing'}`)
  }
  const [targets, requests] = await Promise.all([
    admin.from('content_schedule_targets_client')
      .select('destination, required, scheduled_at, status, verified_at, verification_label')
      .eq('client_id', client.id).eq('content_id', item.id).eq('content_version', item.version)
      .order('destination'),
    admin.from('content_schedule_requests_client')
      .select('id, request_kind, requested_for, requested_local, requested_timezone, requested_utc_offset_minutes, status, client_message, created_at, resolved_at')
      .eq('client_id', client.id).eq('content_id', item.id).eq('content_version', item.version)
      .order('created_at', { ascending: false }),
  ])
  if (targets.error) throw new Error(`select schedule targets: ${targets.error.message}`)
  if (requests.error) throw new Error(`select schedule requests: ${requests.error.message}`)
  console.dir({ item, targets: targets.data, requests: requests.data }, { depth: null })
}

// Post a reply into a piece's comment thread AS THE DOT. The service-only RPC locks the released
// version and inserts the comment + activity atomically, so a version change or partial write cannot
// detach the reply from the snapshot the client sees.
async function reply(slug: string, contentId: string, body: string, authorName: string) {
  const text = (body ?? '').trim()
  if (!text) throw new Error('reply body is required')
  if (text.length > 4000) throw new Error('reply body is too long (4000 characters max)')

  const { data: clients, error: cErr } = await admin.from('clients').select('id').eq('slug', slug)
  if (cErr) throw new Error(`select clients: ${cErr.message}`)
  const client = clients?.[0]
  if (!client) throw new Error(`client with slug "${slug}" not found`)

  const { data: items, error: iErr } = await admin
    .from('content_with_state').select('id, title, version')
    .eq('client_id', client.id).eq('content_id', contentId)
  if (iErr) throw new Error(`select content_items: ${iErr.message}`)
  const item = items?.[0]
  if (!item) throw new Error(`content "${contentId}" not found for client "${slug}"`)

  const { data: commentId, error: replyErr } = await admin.rpc('add_agency_comment', {
    p_content_id: item.id,
    p_body: text,
    p_author_name: authorName,
  })
  if (replyErr) throw new Error(`add_agency_comment: ${replyErr.message}`)

  console.log(`reply posted on "${item.title}" (${slug}/${contentId}) as ${authorName}: ${commentId}`)
}

async function main() {
  const [action, email, name] = process.argv.slice(2)
  if (action === 'provision') {
    const [, slug, memberEmail, memberName, capabilities, disableConfirmation] = process.argv.slice(2)
    if (!slug || !memberEmail || !memberName) {
      throw new Error(
        'usage: portal-admin.ts provision <slug> <email> "<name>" ' +
        '[decide,comment,requests,schedule,assistant] [CONFIRM_ASSISTANT_DISABLE]',
      )
    }
    await provision(slug, memberEmail, memberName, capabilities, disableConfirmation)
    return
  }
  if (action === 'offboard') {
    const [, slug, memberEmail, reason] = process.argv.slice(2)
    if (!slug || !memberEmail || !reason) {
      throw new Error('usage: portal-admin.ts offboard <slug> <email> "<reason>"')
    }
    await offboard(slug, memberEmail, reason)
    return
  }
  if (action === 'transfer-decider') {
    const [, slug, fromEmail, toEmail, reason] = process.argv.slice(2)
    if (!slug || !fromEmail || !toEmail || !reason) {
      throw new Error('usage: portal-admin.ts transfer-decider <slug> <from-email> <to-email> "<reason>"')
    }
    await transferDecider(slug, fromEmail, toEmail, reason)
    return
  }
  if (action === 'switch') {
    const [, scope, feature, enabled, reason, disableConfirmation] = process.argv.slice(2)
    if (!scope || !feature || !enabled || !reason) {
      throw new Error(
        'usage: portal-admin.ts switch <global|client-slug> <feature> <on|off> "<reason>" ' +
        '[CONFIRM_ASSISTANT_DISABLE]',
      )
    }
    await setSwitch(scope, feature, enabled, reason, disableConfirmation)
    return
  }
  if (action === 'access-log') {
    const [, slug] = process.argv.slice(2)
    await accessLog(slug)
    return
  }
  if (action === 'ready') {
    const [, slug, contentId, version] = process.argv.slice(2)
    if (!slug || !contentId) {
      throw new Error('usage: portal-admin.ts ready <slug> <content_id> [version]')
    }
    await ready(slug, contentId, version)
    return
  }
  if (action === 'begin-revision') {
    const [, slug, contentId, version] = process.argv.slice(2)
    if (!slug || !contentId) {
      throw new Error('usage: portal-admin.ts begin-revision <slug> <content_id> [released-version]')
    }
    await beginRevision(slug, contentId, version)
    return
  }
  if (action === 'schedule-status') {
    const [, slug, contentId] = process.argv.slice(2)
    if (!slug || !contentId) {
      throw new Error('usage: portal-admin.ts schedule-status <slug> <content_id>')
    }
    await scheduleStatus(slug, contentId)
    return
  }
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
    await provision('kanset', email, name ?? email)
    console.log('--- status after link ---')
  }
  await status()
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e?.message ?? e)
  process.exit(1)
})

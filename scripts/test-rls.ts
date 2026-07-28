// PostgREST integration proof for portal tenant isolation and the immutable released-version model.
// This script mutates the configured disposable database with a unique throwaway tenant/user.
// The complete tenant/Auth/data set remains until the required local/staging database reset: the
// approval audit FK intentionally prevents deleting a decision-maker independently.
// Run only after applying 0001..0008 to a disposable/staging database first.
import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { PRIMARY_SOURCE_HOSTS } from '../src/lib/portal/primary-source-policy'
import { loadAgencyStagePiece } from '../src/lib/portal/gates-loader'
import { deriveMyTasks, renderStatusGatesBlock } from '../src/lib/portal/gates'

loadEnvConfig(process.cwd())

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!rawUrl || !rawAnon || !rawService) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
}
const SUPABASE_URL = rawUrl
const ANON_KEY = rawAnon
const SERVICE_KEY = rawService

// This suite creates tenants, users, content, approvals, comments, schedules, and other
// dependent rows. Refuse a non-loopback project by default so a production .env.local cannot
// turn a verification run into a destructive data write. A deliberately named override is
// available only for an explicitly disposable staging project.
const supabaseHost = new URL(SUPABASE_URL).hostname
if (!['127.0.0.1', 'localhost', '::1'].includes(supabaseHost)
    && process.env.PORTAL_RLS_ALLOW_REMOTE !== 'I_UNDERSTAND_THIS_MUTATES_DISPOSABLE_DB') {
  throw new Error(
    `Refusing RLS test against non-loopback Supabase host ${supabaseHost}. `
      + 'Use a local stack or set PORTAL_RLS_ALLOW_REMOTE=I_UNDERSTAND_THIS_MUTATES_DISPOSABLE_DB '
      + 'only for a disposable staging database.',
  )
}

const RUN_ID = randomUUID().slice(0, 8)
const B_SLUG = `rls-test-${RUN_ID}`
const B_EMAIL = `rls-test-${RUN_ID}@example.com`
const B_VIEWER_EMAIL = `rls-viewer-${RUN_ID}@example.com`
const B_CONTENT_ID = 'rls-test-piece'
const B_LEAK_ID = 'rls-test-leak'
const B_HIDDEN_ID = 'rls-test-hidden'
const B_REQUEST_ID = 'rls-test-request'
const KANSET_SLUG = 'kanset'
const KANSET_EMAIL = 'info@thedotcreative.co'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
let failures = 0

function check(name: string, passed: boolean, detail = ''): void {
  const suffix = detail ? ` (${detail})` : ''
  if (passed) console.log(`PASS  ${name}${suffix}`)
  else {
    failures++
    console.log(`FAIL  ${name}${suffix}`)
  }
}

async function tokenFor(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: (data.properties as { hashed_token: string }).hashed_token,
    type: 'magiclink',
  })
  if (verifyError || !verified.session) throw verifyError ?? new Error(`no session for ${email}`)
  return verified.session.access_token
}

function clientForToken(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

type SyncResult = {
  content_id: string
  item_id: string
  outcome: string
  working_version: number
  client_visible_version: number | null
}

type PortalInboxRow = {
  event_type: string
  object_type: string
  object_id: string | null
  payload: { decision?: string }
}

function snapshot(
  clientId: string,
  contentId: string,
  version: number,
  title: string,
  body: string,
  blockKey: string,
  extra?: Record<string, unknown>,
) {
  return {
    client_id: clientId,
    content_id: contentId,
    version,
    title,
    format: 'test',
    pillar: 'test',
    platforms: ['instagram'],
    planned_date: null,
    canva_url: null,
    drive_url: null,
    ...extra,
    fact_check: 'confirmed',
    fact_check_scope: 'required',
    fact_check_exemption: null,
    fact_check_ledger: [{
      claim_key: 'test-source',
      claim: 'Canada publishes public immigration information.',
      status: 'confirmed',
      source_url: 'https://www.canada.ca/immigration',
      source_title: 'Canada immigration',
      checked_at: '2026-07-18',
      checked_by_role: 'agency_fact_checker',
      source_type: 'primary_source',
    }],
    client_body: body,
    copy_blocks: [{ key: blockKey, label: 'Test copy', body }],
    source_path: `${contentId}.md`,
    source_commit_sha: '1'.repeat(40),
  }
}

async function sync(items: Record<string, unknown>[]): Promise<SyncResult[]> {
  const { data, error } = await admin.rpc('sync_content_item_versions', { p_items: items })
  if (error) throw new Error(`sync_content_item_versions: ${error.message}`)
  return data as SyncResult[]
}

async function main(): Promise<void> {
  let bClientId: string | null = null
  let bUserId: string | null = null
  let bViewerUserId: string | null = null
  try {
    const { data: kanset, error: kansetError } = await admin
      .from('clients').select('id').eq('slug', KANSET_SLUG).single()
    if (kansetError || !kanset) throw new Error(`kanset client missing: ${kansetError?.message ?? 'missing'}`)
    const kansetClientId = kanset.id as string
    const { data: kansetItems, error: kansetItemsError } = await admin
      .from('content_with_state').select('id, content_id, version').eq('client_id', kansetClientId)
    if (kansetItemsError || !kansetItems?.length) {
      throw new Error(`released kanset content missing: ${kansetItemsError?.message ?? 'no rows'}`)
    }
    const kansetContentIds = new Set(kansetItems.map((row) => row.content_id as string))
    const foreignContentId = [...kansetContentIds][0]
    const kansetItemId = kansetItems[0].id as string
    const kansetVersion = kansetItems[0].version as number

    const { data: clientId, error: clientError } = await admin.rpc('create_portal_client', {
      p_name: 'RLS Test Co',
      p_slug: B_SLUG,
    })
    if (clientError || !clientId) throw new Error(`create client B: ${clientError?.message ?? 'missing'}`)
    bClientId = clientId as string

    const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
      email: B_EMAIL,
      email_confirm: true,
    })
    if (userError || !createdUser.user) throw new Error(`create user B: ${userError?.message ?? 'missing'}`)
    bUserId = createdUser.user.id

    const { error: membershipError } = await admin.rpc('upsert_portal_membership', {
      p_client_id: bClientId,
      p_auth_user_id: bUserId,
      p_email: B_EMAIL,
      p_name: 'RLS Test B',
      p_can_decide: true,
      p_can_comment: true,
      p_can_submit_requests: true,
      p_can_manage_schedule: true,
      p_can_use_assistant: false,
      p_actor_key: 'thedot-admin',
      p_idempotency_key: `rls-primary-${RUN_ID}`,
    })
    if (membershipError) throw new Error(`membership B: ${membershipError.message}`)
    const forgedMembership = await admin.rpc('upsert_portal_membership', {
      p_client_id: bClientId,
      p_auth_user_id: bUserId,
      p_email: 'different@example.com',
      p_name: 'Wrong identity',
      p_can_decide: true,
      p_can_comment: true,
      p_can_submit_requests: true,
      p_can_manage_schedule: true,
      p_can_use_assistant: false,
      p_actor_key: 'thedot-admin',
      p_idempotency_key: `rls-forged-${RUN_ID}`,
    })
    check('S-1: membership RPC rejects an email/auth-user mismatch', !!forgedMembership.error,
      forgedMembership.error?.message ?? 'NO ERROR')

    const { data: viewerUser, error: viewerError } = await admin.auth.admin.createUser({
      email: B_VIEWER_EMAIL,
      email_confirm: true,
    })
    if (viewerError || !viewerUser.user) {
      throw new Error(`create viewer B: ${viewerError?.message ?? 'missing'}`)
    }
    bViewerUserId = viewerUser.user.id
    const viewerMembership = await admin.rpc('upsert_portal_membership', {
      p_client_id: bClientId,
      p_auth_user_id: bViewerUserId,
      p_email: B_VIEWER_EMAIL,
      p_name: 'RLS Test Viewer',
      p_can_decide: false,
      p_can_comment: false,
      p_can_submit_requests: false,
      p_can_manage_schedule: false,
      p_can_use_assistant: false,
      p_actor_key: 'thedot-admin',
      p_idempotency_key: `rls-viewer-${RUN_ID}`,
    })
    if (viewerMembership.error) throw new Error(`viewer membership: ${viewerMembership.error.message}`)

    const preLaunchClient = clientForToken(await tokenFor(B_EMAIL))
    const disabledSession = await preLaunchClient.rpc('portal_client_session', { p_slug: B_SLUG })
    const disabledWrite = await preLaunchClient.rpc('add_idea', {
      p_client_id: bClientId, p_title: 'must not be written', p_body: null,
    })
    check('A0: default-off launch returns no session and rejects direct mutation RPC',
      !disabledSession.error && (disabledSession.data as unknown[] | null)?.length === 0
        && !!disabledWrite.error,
      disabledSession.error?.message ?? disabledWrite.error?.message ?? 'unexpected access')

    for (const [scope, feature, key] of [
      [null, 'client_portal_launch', `rls-global-launch-${RUN_ID}`],
      [bClientId, 'client_portal_launch', `rls-tenant-launch-${RUN_ID}`],
      [null, 'client_mutations', `rls-global-mutations-${RUN_ID}`],
      [bClientId, 'client_mutations', `rls-tenant-mutations-${RUN_ID}`],
      [null, 'agency_mutations', `rls-global-agency-${RUN_ID}`],
      [bClientId, 'agency_mutations', `rls-tenant-agency-${RUN_ID}`],
      [null, 'repository_worker', `rls-global-repository-${RUN_ID}`],
      [bClientId, 'repository_worker', `rls-tenant-repository-${RUN_ID}`],
    ] as const) {
      const enabled = await admin.rpc('set_portal_feature_switch', {
        p_client_id: scope,
        p_feature: feature,
        p_enabled: true,
        p_reason: 'Disposable RLS integration test',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: key,
      })
      if (enabled.error) throw new Error(`enable ${feature}: ${enabled.error.message}`)
    }

    const initial = await sync([
      snapshot(bClientId, B_CONTENT_ID, 1, 'Visible main v1', 'Visible main body', 'main'),
      snapshot(bClientId, B_LEAK_ID, 1, 'Released leak v1', 'Released body v1', 'leak'),
      snapshot(bClientId, B_HIDDEN_ID, 1, 'Hidden working v1', 'TOP SECRET UNRELEASED', 'hidden'),
      snapshot(bClientId, B_REQUEST_ID, 1, 'Request workflow v1', 'Original request body', 'caption'),
    ])
    const byId = new Map(initial.map((row) => [row.content_id, row]))
    const bItemId = byId.get(B_CONTENT_ID)?.item_id
    const bLeakItemId = byId.get(B_LEAK_ID)?.item_id
    const bHiddenItemId = byId.get(B_HIDDEN_ID)?.item_id
    const bRequestItemId = byId.get(B_REQUEST_ID)?.item_id
    if (!bItemId || !bLeakItemId || !bHiddenItemId || !bRequestItemId) throw new Error('sync did not return all item IDs')

    const hostParityPayloads = PRIMARY_SOURCE_HOSTS.map((host, index) => {
      const payload = snapshot(
        bClientId!, `source-policy-${index}`, 1, `Source policy ${index}`, 'Policy body', 'caption',
      )
      payload.fact_check_ledger[0].source_url = `https://${host}/policy-source`
      payload.fact_check_ledger[0].source_title = `Source policy ${index}`
      return payload
    })
    const hostParity = await admin.rpc('preview_content_item_versions', { p_items: hostParityPayloads })
    check('S0: TypeScript primary-source hosts all pass the database validator', !hostParity.error,
      hostParity.error?.message ?? `hosts=${PRIMARY_SOURCE_HOSTS.length}`)

    for (const itemId of [bItemId, bLeakItemId, bRequestItemId]) {
      const { error } = await admin.rpc('mark_content_ready', { p_content_id: itemId, p_content_version: 1 })
      if (error) throw new Error(`mark_content_ready: ${error.message}`)
    }

    const { error: beginRevisionError } = await admin.rpc('begin_content_revision', {
      p_content_id: bLeakItemId,
      p_content_version: 1,
    })
    if (beginRevisionError) throw new Error(`begin_content_revision: ${beginRevisionError.message}`)

    const version2 = snapshot(bClientId, B_LEAK_ID, 2, 'UNRELEASED TITLE V2', 'TOP SECRET UNRELEASED V2', 'leak')
    await sync([version2])

    const kansetToken = await tokenFor(KANSET_EMAIL)
    const bToken = await tokenFor(B_EMAIL)
    const bViewerToken = await tokenFor(B_VIEWER_EMAIL)
    const kansetClient = clientForToken(kansetToken)
    const bClient = clientForToken(bToken)
    const bViewerClient = clientForToken(bViewerToken)
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

    const releasedAvailability = await kansetClient.rpc('get_client_content_availability', {
      p_client_id: kansetClientId, p_content_id: foreignContentId,
    })
    const crossAvailability = await bClient.rpc('get_client_content_availability', {
      p_client_id: kansetClientId, p_content_id: foreignContentId,
    })
    check('AV1: client availability reports released only for its own tenant',
      !releasedAvailability.error && releasedAvailability.data === 'released'
        && !crossAvailability.error && crossAvailability.data === 'not_available',
      `own=${releasedAvailability.error?.message ?? releasedAvailability.data} cross=${crossAvailability.error?.message ?? crossAvailability.data}`)

    const activeSession = await bClient.rpc('portal_client_session', { p_slug: B_SLUG })
    check('A1: enabled launch resolves only the caller membership and capabilities',
      !activeSession.error && activeSession.data?.length === 1
        && activeSession.data[0].client_id === bClientId
        && activeSession.data[0].can_decide === true,
      activeSession.error?.message ?? JSON.stringify(activeSession.data))

    const viewerRead = await bViewerClient.from('content_with_state').select('client_id')
    const viewerIdea = await bViewerClient.rpc('add_idea', {
      p_client_id: bClientId, p_title: 'forbidden viewer idea', p_body: null,
    })
    const viewerComment = await bViewerClient.rpc('add_comment', {
      p_content_id: bItemId, p_body: 'forbidden viewer comment', p_quoted_text: null,
      p_copy_block_key: null,
    })
    const viewerDecision = await bViewerClient.rpc('record_content_decision', {
      p_content_id: bItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
    })
    const viewerPlan = await bViewerClient.rpc('set_content_plan', {
      p_content_id: bItemId, p_content_version: 1, p_planned_date: '2027-07-21',
      p_idempotency_key: `viewer-plan-${RUN_ID}`,
    })
    const viewerReschedule = await bViewerClient.rpc('request_content_reschedule', {
      p_content_id: bItemId, p_content_version: 1, p_requested_local: '2027-07-21 10:00:00',
      p_timezone: 'America/Toronto', p_utc_offset_minutes: -240,
      p_idempotency_key: `viewer-reschedule-${RUN_ID}`,
    })
    check('A2: same-tenant viewer can read but cannot idea/comment/decide/schedule',
      !viewerRead.error && viewerRead.data?.length === 3
        && viewerRead.data.every((row) => row.client_id === bClientId)
        && !!viewerIdea.error && !!viewerComment.error && !!viewerDecision.error
        && !!viewerPlan.error && !!viewerReschedule.error,
      viewerRead.error?.message ?? viewerIdea.error?.message ?? viewerComment.error?.message
        ?? viewerDecision.error?.message ?? viewerPlan.error?.message
        ?? viewerReschedule.error?.message ?? 'unexpected capability')

    {
      const externalId = `rls-external-${RUN_ID}`
      const externalSync = await sync([
        snapshot(bClientId, externalId, 1, 'Externally approved piece', 'Approved by email.', 'caption'),
      ])
      const externalItemId = externalSync[0]?.item_id
      if (!externalItemId) throw new Error('external-decision test sync returned no item')
      const ready = await admin.rpc('mark_content_ready', {
        p_content_id: externalItemId,
        p_content_version: 1,
      })
      const recorded = await admin.rpc('record_external_decision', {
        p_client_id: bClientId,
        p_content_id: externalItemId,
        p_content_version: 1,
        p_contact_auth_user_id: bViewerUserId,
        p_decision: 'approved',
        p_note: 'Approved in the client email thread.',
        p_decision_source: 'email',
        p_source_occurred_at: '2026-07-24T16:00:00Z',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-external-decision-${RUN_ID}`,
      })
      const externalView = await bClient.from('content_with_state')
        .select('current_decision,client_state,status').eq('id', externalItemId).single()
      const access = await admin.rpc('list_portal_access')
      const viewerAccess = ((access.data ?? []) as Array<{
        client_id: string
        auth_user_id: string
        can_decide: boolean
      }>).find((row) => row.client_id === bClientId && row.auth_user_id === bViewerUserId)
      check('A2b: service records a member email decision without transferring can_decide',
        !ready.error && !recorded.error && !externalView.error && !access.error
          && externalView.data?.current_decision === 'approved'
          && externalView.data?.client_state === 'approved'
          && externalView.data?.status === 'approved'
          && viewerAccess?.can_decide === false,
        ready.error?.message ?? recorded.error?.message ?? externalView.error?.message
          ?? access.error?.message ?? JSON.stringify({ view: externalView.data, viewerAccess }))
    }

    console.log('\n--- Slice 1 release/RLS assertions ---')

    const security = await admin.rpc('assert_portal_slice1_security')
    check('S1: catalog exact-grant + safe-view assertion passes', !security.error, security.error?.message ?? 'ok')

    {
      const { data, error } = await kansetClient.from('content_with_state').select('content_id')
      const ids = (data ?? []).map((row) => row.content_id as string)
      check('S2: kanset user sees only kanset released content', !error
        && ids.length >= 1
        && ids.every((id) => kansetContentIds.has(id))
        && !ids.includes(B_CONTENT_ID), error?.message ?? `rows=${ids.length}`)
    }

    {
      const { data, error } = await bClient.from('content_with_state')
        .select('content_id, title, client_body, version, client_state')
      const rows = data ?? []
      const ids = new Set(rows.map((row) => row.content_id as string))
      const leak = rows.find((row) => row.content_id === B_LEAK_ID)
      check('S3: B sees released rows but not never-released identity', !error
        && ids.has(B_CONTENT_ID) && ids.has(B_LEAK_ID) && !ids.has(B_HIDDEN_ID),
      error?.message ?? `rows=${rows.length}`)
      check('S4: view remains pinned to released v1 while working v2 is hidden', leak?.version === 1
        && leak?.title === 'Released leak v1'
        && leak?.client_body === 'Released body v1'
        && leak?.client_state === 'with_dot', JSON.stringify(leak))
      check('S5: unreleased title/body never appear in released view', !JSON.stringify(rows).includes('TOP SECRET')
        && !JSON.stringify(rows).includes('UNRELEASED TITLE'), `rows=${rows.length}`)
    }

    {
      const base = await bClient.from('content_items').select('id, content_id')
      const ids = new Set((base.data ?? []).map((row) => row.content_id as string))
      check('S6: base-table RLS hides never-released identities', !base.error
        && ids.has(B_CONTENT_ID) && ids.has(B_LEAK_ID) && !ids.has(B_HIDDEN_ID),
      base.error?.message ?? `rows=${base.data?.length ?? 0}`)
      const forbidden = await bClient.from('content_items').select('id, title, client_body, copy_blocks')
      check('S7: authenticated cannot select legacy authored columns', !!forbidden.error,
        forbidden.error?.message ?? 'NO ERROR')
    }

    {
      const versions = await bClient.from('content_item_versions')
        .select('content_item_id, version, title, client_body, copy_blocks, fact_check_scope, fact_check_exemption, fact_check_ledger')
      const rows = versions.data ?? []
      const seesMainV1 = rows.some((row) => row.content_item_id === bItemId && row.version === 1)
      const seesLeakV1 = rows.some((row) => row.content_item_id === bLeakItemId && row.version === 1)
      const seesLeakV2 = rows.some((row) => row.content_item_id === bLeakItemId && row.version === 2)
      const seesHidden = rows.some((row) => row.content_item_id === bHiddenItemId)
      check('S8: version-table RLS returns only each released pointer', !versions.error
        && seesMainV1 && seesLeakV1 && !seesLeakV2 && !seesHidden,
      versions.error?.message ?? `rows=${rows.length}`)
      check('S9: version rows expose no unreleased content', !JSON.stringify(rows).includes('TOP SECRET'),
        `rows=${rows.length}`)
      check('S10: released evidence is present only on the tenant-scoped released versions', !versions.error
        && rows.length >= 2
        && rows.every((row) => row.fact_check_scope === 'required'
          && Array.isArray(row.fact_check_ledger)
          && row.fact_check_ledger.length === 1), versions.error?.message ?? `rows=${rows.length}`)
      const internal = await bClient.from('content_item_versions')
        .select('content_checksum, source_path, source_commit_sha')
      check('S11: checksum/source provenance are not authenticated columns', !!internal.error,
        internal.error?.message ?? 'NO ERROR')
      const directEvidenceWrite = await bClient.from('content_item_versions')
        .update({ fact_check_scope: 'not_applicable', fact_check_exemption: 'Forged exemption.' })
        .eq('content_item_id', bItemId)
      check('S12: authenticated cannot mutate evidence fields directly', !!directEvidenceWrite.error,
        directEvidenceWrite.error?.message ?? 'NO ERROR')
    }

    {
      const retry = await sync([snapshot(bClientId, B_CONTENT_ID, 1, 'Visible main v1', 'Visible main body', 'main')])
      check('S13: exact snapshot retry is a no-op success', retry[0]?.outcome === 'exact_retry', JSON.stringify(retry))
      const changed = await admin.rpc('sync_content_item_versions', {
        p_items: [snapshot(bClientId, B_CONTENT_ID, 1, 'Changed without version bump', 'Visible main body', 'main')],
      })
      check('S14: same version with changed checksum is rejected', !!changed.error, changed.error?.message ?? 'NO ERROR')
    }

    {
      const cross = await bClient.rpc('record_content_decision', {
        p_content_id: kansetItemId,
        p_content_version: kansetVersion,
        p_decision: 'approved',
        p_note: null,
      })
      check('S15: cross-tenant decision is rejected', !!cross.error, cross.error?.message ?? 'NO ERROR')
      const hidden = await bClient.rpc('record_content_decision', {
        p_content_id: bHiddenItemId,
        p_content_version: 1,
        p_decision: 'approved',
        p_note: null,
      })
      check('S16: never-released decision is rejected', !!hidden.error, hidden.error?.message ?? 'NO ERROR')
      const working = await bClient.rpc('record_content_decision', {
        p_content_id: bLeakItemId,
        p_content_version: 2,
        p_decision: 'approved',
        p_note: null,
      })
      check('S17: unreleased working-version decision is rejected', !!working.error, working.error?.message ?? 'NO ERROR')
    }

    {
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const args = { p_content_id: bItemId, p_content_version: 1, p_decision: 'approved' }
      const first = await bClient.rpc('record_content_decision', args)
      const second = await bClient.rpc('record_content_decision', args)
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      check('S18: released current version can be approved', !first.error, first.error?.message ?? 'ok')
      check('S19: exact decision retry succeeds', !second.error, second.error?.message ?? 'ok')
      check('S20: exact decision retry creates one activity event', !before.error && !after.error
        && (after.count ?? 0) - (before.count ?? 0) === 1,
      `before=${before.count} after=${after.count}`)
      const directApproval = await bClient.from('approvals').insert({
        content_id: bItemId,
        client_id: bClientId,
        content_version: 1,
        state: 'approved',
        decided_by: bUserId,
      })
      check('S21: direct authenticated approval write is rejected', !!directApproval.error,
        directApproval.error?.message ?? 'NO ERROR')
    }

    console.log('\n--- Slice 9 content requests/local reconciliation boundary ---')

    {
      const viewerRequest = await bViewerClient.rpc('request_content_edit', {
        p_content_id: bRequestItemId, p_content_version: 1, p_block_key: 'caption',
        p_proposed_text: 'Viewer must not write this.', p_idempotency_key: randomUUID(),
      })
      const crossRequest = await bClient.rpc('request_content_edit', {
        p_content_id: kansetItemId, p_content_version: kansetVersion, p_block_key: 'caption',
        p_proposed_text: 'Cross-tenant attempt.', p_idempotency_key: randomUUID(),
      })
      check('R1: no-capability and cross-tenant edit requests are rejected',
        !!viewerRequest.error && !!crossRequest.error,
        `${viewerRequest.error?.message ?? 'VIEWER WROTE'} / ${crossRequest.error?.message ?? 'CROSS WROTE'}`)

      const nullEdit = await bClient.rpc('request_content_edit', {
        p_content_id: bRequestItemId, p_content_version: 1, p_block_key: 'caption',
        p_proposed_text: null, p_idempotency_key: randomUUID(),
      })
      const nullCreate = await bClient.rpc('request_content_create', {
        p_client_id: bClientId, p_title: null, p_brief: 'missing title',
        p_platforms: ['instagram'], p_desired_date: '2026-07-30', p_notes: null,
        p_idempotency_key: randomUUID(),
      })
      check('R1b: NULL required request inputs are rejected', !!nullEdit.error && !!nullCreate.error,
        `${nullEdit.error?.message ?? 'NULL EDIT ACCEPTED'} / ${nullCreate.error?.message ?? 'NULL CREATE ACCEPTED'}`)

      const editKey = randomUUID()
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const editArgs = { p_content_id: bRequestItemId, p_content_version: 1,
        p_block_key: 'caption', p_proposed_text: 'Prepared request body v2',
        p_idempotency_key: editKey }
      const first = await bClient.rpc('request_content_edit', editArgs)
      const second = await bClient.rpc('request_content_edit', editArgs)
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const editId = (first.data as { id?: string } | null)?.id
      check('R2: exact edit retry returns one durable request and one activity event',
        !first.error && !second.error && !!editId && editId === (second.data as { id?: string } | null)?.id
          && (after.count ?? 0) - (before.count ?? 0) === 1,
        first.error?.message ?? second.error?.message ?? `id=${editId} delta=${(after.count ?? 0)-(before.count ?? 0)}`)
      if (!editId) throw new Error('edit request id missing')

      const ownRows = await bClient.from('content_change_requests_client')
        .select('id,client_id,request_type,status,payload').eq('id', editId)
      const otherRows = await kansetClient.from('content_change_requests_client').select('id').eq('id', editId)
      const directWrite = await bClient.from('content_change_requests').insert({
        client_id: bClientId, request_type: 'create', payload: {}, requester_name: 'forged',
      })
      const privateJobRead = await bClient.from('canonical_change_jobs').select('id')
      const forgedServiceRpc = await bClient.rpc('start_content_request_reconciliation', {
        p_request_id: editId, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin', p_idempotency_key: editId,
      })
      check('R3: request RLS is tenant-only and browser cannot write/read jobs/call service RPCs',
        !ownRows.error && ownRows.data?.length === 1 && ownRows.data[0].client_id === bClientId
          && !otherRows.error && otherRows.data?.length === 0 && !!directWrite.error
          && !!privateJobRead.error && !!forgedServiceRpc.error,
        ownRows.error?.message ?? otherRows.error?.message ?? directWrite.error?.message
          ?? privateJobRead.error?.message ?? forgedServiceRpc.error?.message ?? 'unexpected access')
      check('R4: edit original checksum is server-derived and proposed copy is tenant-visible',
        typeof ownRows.data?.[0]?.payload?.original_checksum === 'string'
          && ownRows.data?.[0]?.payload?.proposed_text === 'Prepared request body v2',
        JSON.stringify(ownRows.data?.[0]?.payload))

      const started = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: editId, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin', p_idempotency_key: editId,
      })
      if (started.error) throw new Error(`start edit reconciliation: ${started.error.message}`)
      const begin = await admin.rpc('begin_content_revision', {
        p_content_id: bRequestItemId, p_content_version: 1,
      })
      if (begin.error) throw new Error(`begin request revision: ${begin.error.message}`)
      const editV2 = snapshot(bClientId, B_REQUEST_ID, 2, 'Request workflow v2',
        'Prepared request body v2', 'caption')
      editV2.source_commit_sha = '2'.repeat(40)
      await sync([editV2])
      const prepared = await admin.rpc('mark_content_request_prepared', {
        p_request_id: editId, p_commit_sha: '2'.repeat(40), p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const stillV1 = await bClient.from('content_with_state')
        .select('version,client_body').eq('id', bRequestItemId).single()
      const preparedRow = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key').eq('id', editId).single()
      check('R5: prepared edit keeps released v1 body visible while the request stays in progress',
        !prepared.error && !stillV1.error && stillV1.data?.version === 1
          && stillV1.data?.client_body === 'Original request body'
          && preparedRow.data?.status === 'prepared' && preparedRow.data?.canonical_content_key === B_REQUEST_ID,
        prepared.error?.message ?? stillV1.error?.message ?? JSON.stringify(preparedRow.data))
      const release = await admin.rpc('mark_content_ready', {
        p_content_id: bRequestItemId, p_content_version: 2,
      })
      const appliedRow = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key,canonical_version').eq('id', editId).single()
      const nowV2 = await bClient.from('content_with_state').select('version,client_body')
        .eq('id', bRequestItemId).single()
      check('R6: release gate atomically makes prepared edit applied and links exact v2',
        !release.error && appliedRow.data?.status === 'applied'
          && appliedRow.data?.canonical_content_key === B_REQUEST_ID
          && appliedRow.data?.canonical_version === 2 && nowV2.data?.version === 2
          && nowV2.data?.client_body === 'Prepared request body v2',
        release.error?.message ?? appliedRow.error?.message ?? JSON.stringify(nowV2.data))
    }

    {
      const createKey = randomUUID()
      const created = await bClient.rpc('request_content_create', {
        p_client_id: bClientId, p_title: 'Requested from the portal',
        p_brief: 'A safe client brief for a new piece.', p_platforms: ['instagram','facebook'],
        p_desired_date: '2026-07-30', p_notes: null, p_idempotency_key: createKey,
      })
      const createId = (created.data as { id?: string } | null)?.id
      const crossCreate = await bClient.rpc('request_content_create', {
        p_client_id: kansetClientId, p_title: 'Cross tenant', p_brief: 'Must fail.',
        p_platforms: ['instagram'], p_desired_date: '2026-07-30', p_notes: null,
        p_idempotency_key: randomUUID(),
      })
      check('R7: create request is tenant-scoped and creates no premature content row',
        !created.error && !!createId && !!crossCreate.error,
        created.error?.message ?? crossCreate.error?.message ?? `id=${createId}`)
      if (!createId) throw new Error('create request id missing')
      const requestedContentId = `requested-${RUN_ID}`
      const sourcePath = `${requestedContentId}.md`
      const started = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: createId, p_requested_content_id: requestedContentId,
        p_canonical_object_key: sourcePath, p_expected_base_commit: '3'.repeat(40),
        p_actor_key: 'thedot-admin', p_idempotency_key: createId,
      })
      if (started.error) throw new Error(`start create reconciliation: ${started.error.message}`)
      const createSnapshot = snapshot(bClientId, requestedContentId, 1,
        'Requested from the portal', 'Authored and checked body.', 'caption')
      createSnapshot.source_path = sourcePath
      createSnapshot.source_commit_sha = '3'.repeat(40)
      const [createdSync] = await sync([createSnapshot])
      const prepared = await admin.rpc('mark_content_request_prepared', {
        p_request_id: createId, p_commit_sha: '3'.repeat(40), p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const beforeRelease = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key').eq('id', createId).single()
      const hiddenContent = await bClient.from('content_with_state').select('id').eq('id', createdSync.item_id)
      check('R8: prepared create remains request-visible but new content stays unreleased',
        !prepared.error && beforeRelease.data?.status === 'prepared'
          && beforeRelease.data?.canonical_content_key === null && hiddenContent.data?.length === 0,
        prepared.error?.message ?? JSON.stringify({ request: beforeRelease.data, content: hiddenContent.data }))
      const release = await admin.rpc('mark_content_ready', {
        p_content_id: createdSync.item_id, p_content_version: 1,
      })
      const applied = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key').eq('id', createId).single()
      check('R9: create request links to canonical content only after explicit release',
        !release.error && applied.data?.status === 'applied'
          && applied.data?.canonical_content_key === requestedContentId,
        release.error?.message ?? JSON.stringify(applied.data))

      const archive = await bClient.rpc('request_content_archive', {
        p_content_id: createdSync.item_id, p_content_version: 1,
        p_reason: 'No longer needed.', p_idempotency_key: randomUUID(),
      })
      const archiveId = (archive.data as { id?: string } | null)?.id
      if (!archiveId) throw new Error(`archive request missing: ${archive.error?.message ?? 'no id'}`)
      const archiveStart = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: archiveId, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin', p_idempotency_key: archiveId,
      })
      const archiveApply = await admin.rpc('apply_content_archive_request', {
        p_request_id: archiveId, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const archived = await bClient.from('content_with_state').select('client_state')
        .eq('id', createdSync.item_id).single()
      const archivedRequest = await bClient.from('content_change_requests_client')
        .select('status,resolution_note').eq('id', archiveId).single()
      check('R10: archive applies only through service reconciliation and retains client history',
        !archiveStart.error && !archiveApply.error && archived.data?.client_state === 'archived'
          && archivedRequest.data?.status === 'applied',
        archiveStart.error?.message ?? archiveApply.error?.message ?? JSON.stringify({ archived: archived.data, request: archivedRequest.data }))
    }

    console.log('\n--- Slice 3 scheduling/rescheduling ---')

    {
      const targets = await bClient.from('content_schedule_targets_client')
        .select('client_id, content_id, content_version, destination, scheduled_at, status, verification_label')
        .eq('content_id', bItemId).eq('content_version', 1)
      check('T1: approval creates one independent Instagram target', !targets.error
        && targets.data?.length === 1
        && targets.data[0].client_id === bClientId
        && targets.data[0].destination === 'instagram'
        && targets.data[0].scheduled_at === null
        && targets.data[0].status === 'pending',
      targets.error?.message ?? JSON.stringify(targets.data))

      const crossRead = await kansetClient.from('content_schedule_targets_client')
        .select('content_id').eq('content_id', bItemId)
      check('T2: another tenant cannot read B schedule targets', !crossRead.error
        && (crossRead.data ?? []).length === 0,
      crossRead.error?.message ?? `rows=${crossRead.data?.length ?? 0}`)

      const directTarget = await bClient.from('content_schedule_targets').insert({
        client_id: bClientId,
        content_id: bItemId,
        content_version: 1,
        destination: 'facebook',
      })
      const directRequest = await bClient.from('content_schedule_requests').insert({
        client_id: bClientId,
        content_id: bItemId,
        content_version: 1,
        request_kind: 'reschedule',
      })
      check('T3: authenticated cannot write targets or requests directly',
        !!directTarget.error && !!directRequest.error,
      `${directTarget.error?.message ?? 'target wrote'} / ${directRequest.error?.message ?? 'request wrote'}`)

      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const requestArgs = {
        p_content_id: bItemId,
        p_content_version: 1,
        p_requested_local: '2027-07-20 10:00:00',
        p_timezone: 'America/Toronto',
        p_utc_offset_minutes: -240,
        p_idempotency_key: `resched-${RUN_ID}`,
      }
      const first = await bClient.rpc('request_content_reschedule', requestArgs)
      const second = await bClient.rpc('request_content_reschedule', requestArgs)
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      check('T4: eligible tenant member creates a durable multi-target request', !first.error,
        first.error?.message ?? String(first.data))
      check('T5: exact reschedule retry returns the same request', !second.error
        && first.data === second.data, second.error?.message ?? `${first.data} / ${second.data}`)
      check('T6: exact reschedule retry creates one activity event', !before.error && !after.error
        && (after.count ?? 0) - (before.count ?? 0) === 1,
      `before=${before.count} after=${after.count}`)

      const changedRetry = await bClient.rpc('request_content_reschedule', {
        ...requestArgs,
        p_requested_local: '2027-07-20 11:00:00',
      })
      const secondPending = await bClient.rpc('request_content_reschedule', {
        ...requestArgs,
        p_idempotency_key: `resched2-${RUN_ID}`,
      })
      check('T7: changed payload cannot reuse an idempotency key', !!changedRetry.error,
        changedRetry.error?.message ?? 'NO ERROR')
      check('T8: a second active request cannot race the first', !!secondPending.error,
        secondPending.error?.message ?? 'NO ERROR')

      const scheduleView = await bClient.from('content_with_state')
        .select('schedule_state, client_state, planned_date').eq('id', bItemId).single()
      const requests = await bClient.from('content_schedule_requests_client')
        .select('id, content_id, requested_for, requested_local, status').eq('content_id', bItemId)
      const attempts = await bClient.from('content_schedule_attempts_client')
        .select('request_id, destination, requested_for, previous_scheduled_at, status')
        .eq('request_id', requests.data?.[0]?.id ?? '00000000-0000-0000-0000-000000000000')
      const retainedTarget = await bClient.from('content_schedule_targets_client')
        .select('scheduled_at, status').eq('content_id', bItemId).single()
      check('T9: request is visible as pending without fabricating a committed time',
        !scheduleView.error && scheduleView.data?.schedule_state === 'reschedule_pending'
        && scheduleView.data?.client_state === 'reschedule_pending'
        && !requests.error && requests.data?.length === 1 && requests.data[0].status === 'pending'
        && !attempts.error && attempts.data?.length === 1 && attempts.data[0].status === 'pending'
        && !retainedTarget.error && retainedTarget.data?.scheduled_at === null,
      scheduleView.error?.message || requests.error?.message || attempts.error?.message
        || retainedTarget.error?.message || JSON.stringify({
          state: scheduleView.data,
          requests: requests.data,
          attempts: attempts.data,
          target: retainedTarget.data,
        }))

      const crossRequest = await bClient.rpc('request_content_reschedule', {
        ...requestArgs,
        p_content_id: kansetItemId,
        p_content_version: kansetVersion,
        p_idempotency_key: `cross-${RUN_ID}`,
      })
      check('T10: cross-tenant reschedule is rejected', !!crossRequest.error,
        crossRequest.error?.message ?? 'NO ERROR')

      const gap = await bClient.rpc('request_content_reschedule', {
        ...requestArgs,
        p_requested_local: '2027-03-14 02:30:00',
        p_idempotency_key: `dstgap-${RUN_ID}`,
      })
      check('T11: nonexistent Toronto spring-forward time is rejected', !!gap.error,
        gap.error?.message ?? 'NO ERROR')
    }

    {
      const planPayload = snapshot(
        bClientId, 'rls-plan-only', 1, 'Plan-only fixture', 'Plan-only body', 'caption',
      )
      planPayload.platforms = []
      const [planSync] = await sync([planPayload])
      const planItemId = planSync.item_id
      const ready = await admin.rpc('mark_content_ready', {
        p_content_id: planItemId, p_content_version: 1,
      })
      if (ready.error) throw new Error(`plan-only ready: ${ready.error.message}`)
      const approved = await bClient.rpc('record_content_decision', {
        p_content_id: planItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      if (approved.error) throw new Error(`plan-only approve: ${approved.error.message}`)

      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const planArgs = {
        p_content_id: planItemId,
        p_content_version: 1,
        p_planned_date: '2027-07-21',
        p_idempotency_key: `planonly-${RUN_ID}`,
      }
      const first = await bClient.rpc('set_content_plan', planArgs)
      const second = await bClient.rpc('set_content_plan', planArgs)
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const row = await bClient.from('content_with_state')
        .select('planned_date, schedule_state, client_state').eq('id', planItemId).single()
      check('T12: no-target approved piece updates editorial plan only', !first.error
        && !row.error && row.data?.planned_date === '2027-07-21'
        && row.data?.schedule_state === 'unverified' && row.data?.client_state === 'approved',
      first.error?.message || row.error?.message || JSON.stringify(row.data))
      check('T13: exact plan retry is a no-op with one activity event', !second.error
        && !before.error && !after.error && (after.count ?? 0) - (before.count ?? 0) === 1,
      second.error?.message ?? `before=${before.count} after=${after.count}`)
      const staleKey = await bClient.rpc('set_content_plan', {
        ...planArgs, p_planned_date: '2027-07-22',
      })
      check('T14: plan idempotency key rejects a changed date', !!staleKey.error,
        staleKey.error?.message ?? 'NO ERROR')

      const agencyBefore = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const agencyArgs = {
        p_client_id: bClientId,
        p_content_id: 'rls-plan-only',
        p_planned_date: '2027-07-22',
        p_note: 'Moved by The Dot for the next weekly plan.',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `agency-plan-${RUN_ID}`,
      }
      const agencyFirst = await admin.rpc('agency_set_content_plan_date', agencyArgs)
      const agencyRetry = await admin.rpc('agency_set_content_plan_date', agencyArgs)
      const agencyAfter = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const agencyRow = await bClient.from('content_with_state')
        .select('planned_date').eq('id', planItemId).single()
      const agencyAnon = await anonClient.rpc('agency_set_content_plan_date', {
        ...agencyArgs, p_planned_date: '2027-07-23', p_idempotency_key: `agency-anon-${RUN_ID}`,
      })
      check('T15: agency plan-date writer updates the canonical date and is idempotent',
        !agencyFirst.error && !agencyRetry.error
        && agencyFirst.data?.outcome === 'updated'
        && agencyRetry.data?.outcome === 'updated'
        && !agencyRow.error && agencyRow.data?.planned_date === '2027-07-22'
        && !agencyBefore.error && !agencyAfter.error
        && (agencyAfter.count ?? 0) - (agencyBefore.count ?? 0) === 1,
      agencyFirst.error?.message ?? agencyRetry.error?.message ?? agencyRow.error?.message
        ?? JSON.stringify({ first: agencyFirst.data, retry: agencyRetry.data, row: agencyRow.data }))
      check('T16: agency plan-date RPC is not callable by anon', !!agencyAnon.error,
        agencyAnon.error?.message ?? 'NO ERROR')
    }

    {
      const multiPayload = snapshot(
        bClientId, 'rls-multi-target', 1, 'Multi-target fixture', 'Multi-target body', 'caption',
      )
      multiPayload.platforms = ['instagram', 'facebook']
      const [multiSync] = await sync([multiPayload])
      const ready = await admin.rpc('mark_content_ready', {
        p_content_id: multiSync.item_id, p_content_version: 1,
      })
      if (ready.error) throw new Error(`multi-target ready: ${ready.error.message}`)
      const approved = await bClient.rpc('record_content_decision', {
        p_content_id: multiSync.item_id, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const targets = await bClient.from('content_schedule_targets_client')
        .select('destination').eq('content_id', multiSync.item_id).order('destination')
      check('T15: Instagram and Facebook become independent required targets', !approved.error
        && !targets.error && JSON.stringify(targets.data) === JSON.stringify([
          { destination: 'facebook' }, { destination: 'instagram' },
        ]), approved.error?.message || targets.error?.message || JSON.stringify(targets.data))

      const lightTarget = await admin.from('content_schedule_targets')
        .select('id').eq('content_id', multiSync.item_id).eq('destination', 'facebook').single()
      const lightScheduled = lightTarget.data ? await admin.rpc('confirm_schedule_target', {
        p_schedule_target_id: lightTarget.data.id,
        p_scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        p_external_url: null, p_external_id: null, p_evidence_id: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-light-schedule-${RUN_ID}`,
      }) : { data: null, error: lightTarget.error }
      const lightTargetRead = await bClient.from('content_schedule_targets_client')
        .select('status,scheduled_at')
        .eq('content_id', multiSync.item_id).eq('destination', 'facebook').single()
      const lightPrivateRead = await admin.from('content_schedule_targets')
        .select('external_url,evidence_id').eq('id', lightTarget.data?.id ?? '00000000-0000-0000-0000-000000000000').single()
      check('T16: scheduled confirmation accepts an audited report without evidence or URL',
        !lightTarget.error && !lightScheduled.error && !lightTargetRead.error
          && lightTargetRead.data?.status === 'scheduled'
          && lightTargetRead.data?.scheduled_at !== null
          && !lightPrivateRead.error
          && lightPrivateRead.data?.external_url === null
          && lightPrivateRead.data?.evidence_id === null,
        lightTarget.error?.message || lightScheduled.error?.message || lightTargetRead.error?.message
          || lightPrivateRead.error?.message || JSON.stringify(lightTargetRead.data))

      const unsafePayload = snapshot(
        bClientId, 'rls-unsupported-target', 1, 'Unsupported target fixture',
        'Unsupported target body', 'caption',
      )
      unsafePayload.platforms = ['instagram', 'unconfigured-network']
      const [unsafeSync] = await sync([unsafePayload])
      const unsafeReady = await admin.rpc('mark_content_ready', {
        p_content_id: unsafeSync.item_id, p_content_version: 1,
      })
      if (unsafeReady.error) throw new Error(`unsupported-target ready: ${unsafeReady.error.message}`)
      const unsafeApproval = await bClient.rpc('record_content_decision', {
        p_content_id: unsafeSync.item_id, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const unsafeItem = await bClient.from('content_with_state')
        .select('status, current_decision').eq('id', unsafeSync.item_id).single()
      const unsafeTargets = await bClient.from('content_schedule_targets_client')
        .select('id').eq('content_id', unsafeSync.item_id)
      check('T17: an unconfigured destination fails the approval transaction closed',
        !!unsafeApproval.error && !unsafeItem.error && unsafeItem.data?.status === 'draft'
        && unsafeItem.data?.current_decision === null
        && !unsafeTargets.error && unsafeTargets.data?.length === 0,
      unsafeApproval.error?.message ?? 'NO ERROR')
    }

    console.log('\n--- Slice 4 publication evidence ---')

    {
      const ownTargets = await bClient.from('content_publication_targets_client')
        .select('id,client_id,content_id,destination,status,verification_label')
        .eq('content_id', bItemId)
      const crossTargets = await kansetClient.from('content_publication_targets_client')
        .select('id').eq('content_id', bItemId)
      check('P1: client sees only its own safe publication targets', !ownTargets.error
        && ownTargets.data?.length === 1 && ownTargets.data[0].client_id === bClientId
        && !crossTargets.error && crossTargets.data?.length === 0,
      ownTargets.error?.message || crossTargets.error?.message || JSON.stringify(ownTargets.data))

      const evidenceRead = await bClient.from('publication_evidence').select('id,object_key')
      const directTargetWrite = await bClient.from('content_publication_targets').update({ status: 'live' })
        .eq('content_id', bItemId)
      const directObservationWrite = await bClient.from('content_publication_observations').insert({
        client_id: bClientId, publication_target_id: ownTargets.data?.[0]?.id,
        provider_state: 'live', observation_key: 'forged-observation',
      })
      const directRpc = await bClient.rpc('record_publication_observation', {
        p_publication_target_id: ownTargets.data?.[0]?.id,
        p_provider_state: 'live', p_observation_key: 'forged-rpc',
      })
      check('P2: authenticated cannot read evidence or write publication state directly',
        !!evidenceRead.error && !!directTargetWrite.error && !!directObservationWrite.error && !!directRpc.error,
      `${evidenceRead.error?.message ?? 'evidence read'} / ${directTargetWrite.error?.message ?? 'target wrote'} / ${directObservationWrite.error?.message ?? 'observation wrote'} / ${directRpc.error?.message ?? 'rpc ran'}`)

      const evidenceKey = `rls-evidence-${RUN_ID}`
      const { data: evidenceId, error: evidenceError } = await admin.rpc('register_publication_evidence', {
        p_client_id: bClientId, p_actor_key: 'thedot-admin', p_evidence_kind: 'reviewed_link',
        p_object_key: null, p_evidence_url: 'https://www.instagram.com/p/rls-proof',
        p_attestation_note: null, p_captured_at: new Date().toISOString(), p_sha256: null,
        p_mime_type: null, p_byte_length: null, p_idempotency_key: evidenceKey,
      })
      if (evidenceError || !evidenceId) throw new Error(`publication evidence: ${evidenceError?.message ?? 'missing'}`)
      const { data: scheduleTarget, error: scheduleTargetError } = await admin
        .from('content_schedule_targets').select('id').eq('content_id', bItemId).single()
      if (scheduleTargetError || !scheduleTarget) throw new Error(`schedule target: ${scheduleTargetError?.message ?? 'missing'}`)
      const scheduled = await admin.rpc('confirm_schedule_target', {
        p_schedule_target_id: scheduleTarget.id,
        p_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        p_external_url: 'https://business.facebook.com/rls-schedule',
        p_external_id: 'rls-schedule', p_evidence_id: evidenceId,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-schedule-${RUN_ID}`,
      })
      check('P3: evidence-backed schedule confirmation resolves provider truth', !scheduled.error,
        scheduled.error?.message ?? JSON.stringify(scheduled.data))

      const { data: publicationTarget, error: publicationTargetError } = await admin
        .from('content_publication_targets').select('id').eq('content_id', bItemId).single()
      if (publicationTargetError || !publicationTarget) throw new Error(`publication target: ${publicationTargetError?.message ?? 'missing'}`)
      const observationArgs = {
        p_publication_target_id: publicationTarget.id, p_provider_state: 'live',
        p_live_url: 'https://www.instagram.com/p/rls-live',
        p_published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        p_visibility: 'public', p_evidence_id: evidenceId, p_actor_key: 'thedot-admin',
        p_source_type: 'manual', p_reconciliation_status: 'verified',
        p_provider_object_id: 'rls-live', p_observed_title: 'RLS publication proof',
        p_observed_text: 'Visible main body', p_observation_key: `rls-publication-${RUN_ID}`,
        p_supersedes_observation_id: null, p_verification_note: 'Opened and visibly checked.',
      }
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const first = await admin.rpc('record_publication_observation', observationArgs)
      const second = await admin.rpc('record_publication_observation', observationArgs)
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const view = await bClient.from('content_with_state')
        .select('publication_state,client_state,status').eq('id', bItemId).single()
      const safe = await bClient.from('content_publication_targets_client')
        .select('status,live_url,verification_label').eq('content_id', bItemId).single()
      check('P4: manual live confirmation is idempotent and locks aggregate live state',
        !first.error && !second.error && first.data === second.data
        && !view.error && view.data?.publication_state === 'live'
        && view.data?.client_state === 'live' && view.data?.status === 'posted'
        && !safe.error && safe.data?.verification_label === 'manually verified by The Dot'
        && !before.error && !after.error && (after.count ?? 0) - (before.count ?? 0) === 2,
      first.error?.message || second.error?.message || view.error?.message || safe.error?.message
        || `activity delta=${(after.count ?? 0) - (before.count ?? 0)}`)
      const locked = await admin.rpc('begin_content_revision', { p_content_id: bItemId, p_content_version: 1 })
      check('P5: first verified live destination blocks in-place revision', !!locked.error,
        locked.error?.message ?? 'NO ERROR')
    }

    console.log('\n--- Version-bound comments ---')

    {
      const plain = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'plain comment' })
      check('C1: unquoted comment succeeds through compatibility signature', !plain.error, plain.error?.message ?? 'ok')
      const quoted = await bClient.rpc('add_comment', {
        p_content_id: bItemId,
        p_body: 'quoted comment',
        p_quoted_text: 'Visible main body',
        p_copy_block_key: 'main',
      })
      check('C2: exact released-block quote succeeds', !quoted.error, quoted.error?.message ?? 'ok')
      const forged = await bClient.rpc('add_comment', {
        p_content_id: bItemId,
        p_body: 'forged quote',
        p_quoted_text: 'not in released copy',
        p_copy_block_key: 'main',
      })
      check('C3: forged quote is rejected', !!forged.error, forged.error?.message ?? 'NO ERROR')
      const wrongKey = await bClient.rpc('add_comment', {
        p_content_id: bItemId,
        p_body: 'wrong key',
        p_quoted_text: 'Visible main body',
        p_copy_block_key: 'other',
      })
      check('C4: quote against wrong block key is rejected', !!wrongKey.error, wrongKey.error?.message ?? 'NO ERROR')

      const comments = await bClient.from('comments').select('content_id, content_version, copy_block_key, body')
      check('C5: visible comments remain bound to released version 1', !comments.error
        && (comments.data ?? []).length === 2
        && (comments.data ?? []).every((row) => row.content_id === bItemId && row.content_version === 1),
      comments.error?.message ?? `rows=${comments.data?.length ?? 0}`)
    }

    {
      const cross = await bClient.rpc('add_comment', { p_content_id: kansetItemId, p_body: 'cross tenant' })
      check('C6: cross-tenant comment is rejected', !!cross.error, cross.error?.message ?? 'NO ERROR')
      const direct = await bClient.from('comments').insert({
        content_id: bItemId,
        client_id: bClientId,
        content_version: 1,
        author_type: 'client',
        author_name: 'x',
        body: 'y',
      })
      check('C7: direct authenticated comment write is rejected', !!direct.error, direct.error?.message ?? 'NO ERROR')
    }

    {
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const reply = await admin.rpc('add_agency_comment', {
        p_content_id: bItemId,
        p_body: 'Dot reply to B',
        p_author_name: 'The Dot',
      })
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const thread = await bClient.from('comments').select('author_type, body, content_version')
      check('C8: agency reply RPC succeeds atomically', !reply.error, reply.error?.message ?? 'ok')
      check('C9: agency reply adds exactly one activity event', !before.error && !after.error
        && (after.count ?? 0) - (before.count ?? 0) === 1,
      `before=${before.count} after=${after.count}`)
      check('C10: client sees agency reply on released version', !thread.error
        && (thread.data ?? []).some((row) => row.author_type === 'anastasia'
          && row.body === 'Dot reply to B' && row.content_version === 1),
      thread.error?.message ?? `rows=${thread.data?.length ?? 0}`)
    }

    {
      const anonRead = await anonClient.from('content_with_state').select('id')
      const anonComment = await anonClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'x' })
      const anonSync = await anonClient.rpc('sync_content_item_versions', { p_items: [] })
      const anonSchedule = await anonClient.rpc('request_content_reschedule', {
        p_content_id: bItemId,
        p_content_version: 1,
        p_requested_local: '2027-07-20 10:00:00',
        p_timezone: 'America/Toronto',
        p_utc_offset_minutes: -240,
        p_idempotency_key: `anon-${RUN_ID}`,
      })
      check('C11: anon cannot read released portal content', !!anonRead.error || (anonRead.data ?? []).length === 0,
        anonRead.error?.message ?? `rows=${anonRead.data?.length ?? 0}`)
      check('C12: anon cannot call client comment RPC', !!anonComment.error, anonComment.error?.message ?? 'NO ERROR')
      check('C13: anon cannot call service sync RPC', !!anonSync.error, anonSync.error?.message ?? 'NO ERROR')
      check('C14: anon cannot call scheduling writers', !!anonSchedule.error,
        anonSchedule.error?.message ?? 'NO ERROR')
    }

    {
      const links = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/RLSCOMMENT/view',
        p_drive_url: 'https://drive.google.com/file/d/RLSCOMMENT/view',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const canva = await bClient.rpc('add_design_comment', {
        p_content_id: bItemId, p_body: 'Canva needs a stronger opening frame.',
        p_design_url: 'https://www.canva.com/design/RLSCOMMENT/view',
      })
      const drive = await bClient.rpc('add_design_comment', {
        p_content_id: bItemId, p_body: 'Drive proof needs the final export attached.',
        p_design_url: 'https://drive.google.com/file/d/RLSCOMMENT/view',
      })
      const designRows = await bClient.from('comments')
        .select('target_kind,target_url,body').eq('content_id', bItemId).eq('target_kind', 'design')
      const cross = await bClient.rpc('add_design_comment', {
        p_content_id: kansetItemId, p_body: 'cross tenant design comment',
        p_design_url: 'https://www.canva.com/design/RLSCOMMENT/view',
      })
      check('C15: client can comment on both released design links through the RPC',
        !links.error && !canva.error && !drive.error && !designRows.error
          && (designRows.data ?? []).length === 2
          && (designRows.data ?? []).every((row) => row.target_kind === 'design'),
        links.error?.message ?? canva.error?.message ?? drive.error?.message
          ?? designRows.error?.message ?? JSON.stringify(designRows.data))
      check('C16: design comments retain the exact safe target URLs',
        (designRows.data ?? []).some((row) => row.target_url === 'https://www.canva.com/design/RLSCOMMENT/view')
          && (designRows.data ?? []).some((row) => row.target_url === 'https://drive.google.com/file/d/RLSCOMMENT/view'),
        JSON.stringify(designRows.data))
      check('C17: design comment RPC remains tenant-scoped', !!cross.error,
        cross.error?.message ?? 'NO ERROR')
    }

    console.log('\n--- Slice 5 Google Calendar coordination ---')

    {
      const credentialId = randomUUID(), integrationId = randomUUID()
      const credential = await admin.from('calendar_credentials').insert({
        id: credentialId, client_id: bClientId, ciphertext: 'x'.repeat(40),
        iv: 'a'.repeat(16), auth_tag: 'b'.repeat(16),
      })
      const integration = await admin.from('calendar_integrations').insert({
        id: integrationId, client_id: bClientId, credential_id: credentialId,
        calendar_id: `rls-${RUN_ID}@example.com`, display_name: 'RLS shared calendar',
        owner_email: 'durable-owner@example.com', access_role: 'owner',
      })
      const state = await admin.from('calendar_sync_state').insert({
        integration_id: integrationId, client_id: bClientId,
      })
      const item = await admin.from('content_items').select('projection_revision')
        .eq('id', bItemId).single()
      const mapping = await admin.rpc('confirm_calendar_projection', {
        p_integration_id: integrationId, p_content_id: bItemId, p_content_version: 1,
        p_schedule_target_id: null, p_event_role: 'editorial_plan',
        p_stable_key: `portal:${integrationId}:${bItemId}:editorial`,
        p_event_id: `rls-event-${RUN_ID}`, p_event_etag: '"rls-etag-1"',
        p_event_updated_at: new Date().toISOString(),
        p_event_html_link: 'https://www.google.com/calendar/event?eid=synthetic',
        p_event_start_date: '2027-07-20', p_event_start_at: null, p_event_end_at: null,
        p_portal_revision: item.data?.projection_revision,
      })
      check('G1: service creates a tenant-bound safe calendar mapping', !credential.error
        && !integration.error && !state.error && !item.error && !mapping.error,
      credential.error?.message || integration.error?.message || state.error?.message
        || item.error?.message || mapping.error?.message || 'ok')

      const own = await bClient.from('calendar_events_client')
        .select('client_id,content_id,event_role,event_html_link,sync_status,sync_label')
      const foreign = await kansetClient.from('calendar_events_client').select('id,client_id')
      check('G2: client sees only its own safe calendar projection', !own.error
        && own.data?.length === 1 && own.data[0].client_id === bClientId
        && own.data[0].content_id === bItemId && own.data[0].event_role === 'editorial_plan'
        && own.data[0].sync_status === 'confirmed', own.error?.message ?? `rows=${own.data?.length ?? 0}`)
      check('G3: another tenant cannot read B calendar mappings', !foreign.error
        && !(foreign.data ?? []).some((row) => row.client_id === bClientId)
        && (foreign.data ?? []).every((row) => row.client_id === kansetClientId),
      foreign.error?.message ?? `rows=${foreign.data?.length ?? 0}`)

      const internalColumns = await bClient.from('calendar_event_mappings')
        .select('event_id,event_etag,stable_key,portal_projection_revision')
      const directWrite = await bClient.from('calendar_event_mappings').insert({
        client_id: bClientId, integration_id: integrationId, content_id: bItemId,
      })
      const directWebhook = await bClient.rpc('accept_calendar_webhook', {
        p_channel_id: 'forged', p_resource_id: 'forged', p_channel_token: 'forged',
        p_message_number: 1, p_resource_state: 'exists',
      })
      check('G4: provider IDs, etags, stable keys, and revisions are not client columns',
        !!internalColumns.error, internalColumns.error?.message ?? 'NO ERROR')
      check('G5: authenticated cannot write mappings or invoke webhook ingestion',
        !!directWrite.error && !!directWebhook.error,
        `${directWrite.error?.message ?? 'NO WRITE ERROR'} / ${directWebhook.error?.message ?? 'NO RPC ERROR'}`)
    }

    console.log('\n--- Existing tenant-isolated surfaces ---')

    {
      const recommendation = await admin.rpc('upsert_portal_recommendation', {
        p_client_id: bClientId, p_source_key: 'rls:recommendation', p_title: 'B rec', p_body: 'Safe body',
        p_category: 'content', p_platform: 'instagram', p_source_type: 'strategy_review',
        p_source_ref: 'rls:test', p_provenance: { test: true }, p_status: 'active',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-rec-${RUN_ID}`,
      })
      const link = await admin.rpc('upsert_portal_link', {
        p_client_id: bClientId, p_link_key: 'rls:link', p_category: 'brand', p_label: 'B link',
        p_url: 'https://drive.google.com/open?id=rls', p_description: null, p_sort: 1,
        p_source_type: 'agency_curated', p_source_ref: 'rls:test', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-link-${RUN_ID}`,
      })
      const report = await admin.rpc('upsert_portal_report_snapshot', {
        p_client_id: bClientId, p_period_start: '2026-07-01', p_period_end: '2026-07-15',
        p_platform: 'instagram', p_schema_version: 1, p_metrics: { reach: 12 }, p_summary: 'Safe report',
        p_collected_at: '2026-07-16T12:00:00Z', p_source_type: 'platform_ui', p_source_ref: 'rls:test',
        p_source_checksum: 'a'.repeat(64), p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-report-${RUN_ID}`,
      })
      const directService = await admin.from('recommendations').insert({
        client_id: bClientId, title: 'bypass', body: 'bypass', category: 'content',
      })
      check('D1: service RPCs atomically seed B read-only surfaces and direct service write is denied',
        !recommendation.error && !link.error && !report.error && !!directService.error,
        recommendation.error?.message || link.error?.message || report.error?.message || 'ok')
    }

    for (const table of ['recommendations', 'links', 'report_snapshots']) {
      const read = await bClient.from(table).select('client_id')
      check(`D2: B sees only its own ${table}`, !read.error
        && (read.data ?? []).length >= 1
        && (read.data ?? []).every((row) => row.client_id === bClientId)
        && !(read.data ?? []).some((row) => row.client_id === kansetClientId),
      read.error?.message ?? `rows=${read.data?.length ?? 0}`)
      const direct = await bClient.from(table).insert({ client_id: bClientId })
      check(`D3: direct authenticated ${table} write is rejected`, !!direct.error, direct.error?.message ?? 'NO ERROR')
    }

    {
      const bInvoice = await admin.rpc('upsert_invoice', {
        p_client_id: bClientId, p_number: `RLS-${RUN_ID}`, p_issued_at: '2026-07-19',
        p_period_start: '2026-07-01', p_period_end: '2026-07-31', p_amount: 800,
        p_currency: 'CAD', p_document_url: 'https://docs.google.com/document/d/rls-invoice',
        p_notes: 'private test note', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-invoice-${RUN_ID}`,
      })
      const kansetInvoice = await admin.rpc('upsert_invoice', {
        p_client_id: kansetClientId, p_number: `RLS-K-${RUN_ID}`, p_issued_at: '2026-07-19',
        p_period_start: null, p_period_end: null, p_amount: 1, p_currency: 'CAD',
        p_document_url: null, p_notes: 'private Kanset note', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-k-invoice-${RUN_ID}`,
      })
      const read = await bClient.from('invoices_client')
        .select('id,client_id,number,issued_at,amount,currency,status,document_url')
      const privateRead = await bClient.from('invoices').select('notes,document_object_key')
      const direct = await bClient.from('invoices').insert({
        client_id: bClientId, number: 'FORGED', issued_at: '2026-07-19', amount: 1,
      })
      const directRpc = await bClient.rpc('set_invoice_status', {
        p_client_id: bClientId, p_invoice_id: bInvoice.data, p_status: 'paid',
        p_actor_key: 'thedot-admin', p_idempotency_key: 'forged-browser-status',
      })
      check('D4: service invoice writers succeed through the atomic boundary',
        !bInvoice.error && !kansetInvoice.error,
        bInvoice.error?.message ?? kansetInvoice.error?.message ?? 'ok')
      check('D5: B sees only B safe invoice rows', !read.error && (read.data ?? []).length === 1
        && read.data?.[0]?.client_id === bClientId,
      read.error?.message ?? `rows=${read.data?.length ?? 0}`)
      check('D6: private invoice fields and all browser writes/RPCs are denied',
        !!privateRead.error && !!direct.error && !!directRpc.error,
        `${privateRead.error?.message ?? 'NO PRIVATE ERROR'} / ${direct.error?.message ?? 'NO WRITE ERROR'} / ${directRpc.error?.message ?? 'NO RPC ERROR'}`)
    }

    {
      const added = await bClient.rpc('add_idea', { p_client_id: bClientId, p_title: 'B idea', p_body: 'first' })
      check('D7: B adds an idea through RPC', !added.error, added.error?.message ?? 'ok')
      const ideaId = added.data as string | null
      const cross = await bClient.rpc('add_idea', { p_client_id: kansetClientId, p_title: 'cross' })
      check('D8: cross-tenant idea is rejected', !!cross.error, cross.error?.message ?? 'NO ERROR')
      if (ideaId) {
        const edited = await bClient.rpc('edit_idea', { p_idea_id: ideaId, p_title: 'B idea edited' })
        check('D9: B edits its own idea through RPC', !edited.error, edited.error?.message ?? 'ok')
      }
      const direct = await bClient.from('content_ideas').insert({
        client_id: bClientId, author_type: 'client', author_name: 'x', title: 'direct',
      })
      check('D10: direct authenticated idea write is rejected', !!direct.error, direct.error?.message ?? 'NO ERROR')
    }

    {
      // 0015 notifications: create a client in_app row and an agency email row for B via the
      // service-role enqueue RPC (activity_log is write-only through definer RPCs, even for the
      // service role), then prove RLS visibility + authz.
      const encClient = await admin.rpc('portal_enqueue_notification', {
        p_client_id: bClientId, p_recipient_kind: 'client', p_channel: 'in_app',
        p_source_kind: 'activity', p_source_id: randomUUID(), p_subject: 'N client alert',
        p_body: 'x', p_related_url: null,
      })
      const encAgency = await admin.rpc('portal_enqueue_notification', {
        p_client_id: bClientId, p_recipient_kind: 'agency', p_channel: 'email',
        p_source_kind: 'activity', p_source_id: randomUUID(), p_subject: 'N agency alert',
        p_body: 'x', p_related_url: null,
      })
      const bSees = await bClient.from('notification_outbox').select('id,channel,recipient_kind,client_id,subject')
      const bRows = (bSees.data ?? []) as Array<{ id: string; channel: string; recipient_kind: string; client_id: string; subject: string }>
      const firstId = bRows[0]?.id ?? '00000000-0000-0000-0000-000000000000'
      check('N1: client sees only its own in_app client-recipient notifications (never email/agency)',
        !encClient.error && !encAgency.error && !bSees.error
          && bRows.some((r) => r.subject === 'N client alert')
          && bRows.every((r) => r.channel === 'in_app' && r.recipient_kind === 'client' && r.client_id === bClientId)
          && !bRows.some((r) => r.subject === 'N agency alert'),
        encClient.error?.message ?? encAgency.error?.message ?? bSees.error?.message
          ?? JSON.stringify(bRows.map((r) => `${r.recipient_kind}/${r.channel}`)))
      const kSees = await kansetClient.from('notification_outbox').select('id').eq('client_id', bClientId)
      check('N2: cross-tenant cannot see B notifications',
        !kSees.error && (kSees.data ?? []).length === 0,
        kSees.error?.message ?? `rows=${(kSees.data ?? []).length}`)
      const claim = await bClient.rpc('claim_notification_batch', { p_worker: 'x', p_limit: 1, p_claim_seconds: 60 })
      const mark = await bClient.rpc('mark_notification_failed',
        { p_id: firstId, p_claim_token: 1, p_error: 'x', p_max_attempts: 3 })
      check('N3: client denied the service-role consumer RPCs', !!claim.error && !!mark.error,
        `${claim.error?.message ?? 'NO CLAIM ERROR'} / ${mark.error?.message ?? 'NO MARK ERROR'}`)
      const seen = await bClient.rpc('mark_notification_seen', { p_id: firstId })
      const afterSeen = await bClient.from('notification_outbox').select('seen_at').eq('id', firstId).maybeSingle()
      const seenAt = (afterSeen.data as { seen_at?: string } | null)?.seen_at ?? null
      check('N4: client marks its own notification seen', !seen.error && !!seenAt,
        seen.error?.message ?? (seenAt ? `seen_at=${seenAt}` : 'seen_at NOT set'))
    }

    {
      // 0038 client alerts: the switch enables one tenant-resolved email row for agency activity,
      // while the recipient address remains unavailable to an authenticated client JWT.
      for (const [scope, key] of [
        [null, `rls-global-client-alerts-${RUN_ID}`],
        [bClientId, `rls-tenant-client-alerts-${RUN_ID}`],
      ] as const) {
        const enabled = await admin.rpc('set_portal_feature_switch', {
          p_client_id: scope,
          p_feature: 'client_alerts',
          p_enabled: true,
          p_reason: 'Disposable RLS integration test',
          p_actor_key: 'thedot-admin',
          p_idempotency_key: key,
        })
        if (enabled.error) throw new Error(`enable client alerts: ${enabled.error.message}`)
      }
      const alertBody = `client-email-alert-${RUN_ID}`
      const reply = await admin.rpc('add_agency_comment', {
        p_content_id: bItemId,
        p_body: alertBody,
        p_author_name: 'The Dot',
      })
      const rows = await admin.from('notification_outbox')
        .select('recipient_kind,channel,recipient_email,body,status')
        .eq('client_id', bClientId)
        .eq('body', alertBody)
      const clientEmailRows = (rows.data ?? []).filter((row) => row.recipient_kind === 'client' && row.channel === 'email')
      const clientInAppRows = (rows.data ?? []).filter((row) => row.recipient_kind === 'client' && row.channel === 'in_app')
      const deniedRecipient = await bClient.from('notification_outbox').select('recipient_email').eq('body', alertBody)
      check('N5: enabled client alerts resolve the primary decider and preserve in-app delivery',
        !reply.error && !rows.error && clientEmailRows.length === 1
          && clientEmailRows[0].recipient_email === B_EMAIL
          && clientEmailRows[0].status === 'pending'
          && clientInAppRows.length === 1,
        reply.error?.message ?? rows.error?.message ?? JSON.stringify(rows.data))
      check('N6: authenticated client cannot read recipient email', !!deniedRecipient.error,
        deniedRecipient.error?.message ?? 'recipient_email was readable')
    }

    {
      // 0016 projection consumer RPCs are service-role only; a client JWT must be denied every one.
      const pClaim = await bClient.rpc('claim_projection_batch', { p_worker: 'x', p_limit: 1, p_claim_seconds: 60 })
      const pSucc = await bClient.rpc('mark_projection_succeeded', { p_id: '00000000-0000-0000-0000-000000000000', p_claim_token: 1 })
      const pRec = await bClient.rpc('enqueue_projection_reconcile', { p_client_id: bClientId, p_object_type: 'content', p_object_key: 'x' })
      check('PC1: client denied all projection consumer RPCs', !!pClaim.error && !!pSucc.error && !!pRec.error,
        `${pClaim.error?.message ?? 'NO CLAIM ERR'} / ${pSucc.error?.message ?? 'NO SUCC ERR'} / ${pRec.error?.message ?? 'NO REC ERR'}`)
    }

    console.log('\n--- 0018 assistant plane (gate/index/search/reserve/settle/feedback) ---')

    {
      // Grant the assistant capability to B's primary member (identical flags otherwise), then prove
      // the gate stays closed while the 'assistant' switch is off: fail-closed before any model call.
      const grantAssistant = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_email: B_EMAIL,
        p_name: 'RLS Test B', p_can_decide: true, p_can_comment: true,
        p_can_submit_requests: true, p_can_manage_schedule: true, p_can_use_assistant: true,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-assistant-member-${RUN_ID}`,
      })
      const gateOff = await bClient.rpc('portal_assistant_gate', { p_client_id: bClientId })
      check('AS1: assistant gate refuses a capable member while the switch is off',
        !grantAssistant.error && !!gateOff.error,
        grantAssistant.error?.message ?? gateOff.error?.message ?? 'GATE OPENED WHILE OFF')

      for (const [scope, key] of [
        [null, `rls-global-assistant-${RUN_ID}`],
        [bClientId, `rls-tenant-assistant-${RUN_ID}`],
      ] as const) {
        const enabled = await admin.rpc('set_portal_feature_switch', {
          p_client_id: scope, p_feature: 'assistant', p_enabled: true,
          p_reason: 'Disposable RLS integration test', p_actor_key: 'thedot-admin',
          p_idempotency_key: key,
        })
        if (enabled.error) throw new Error(`enable assistant: ${enabled.error.message}`)
      }

      const gateOn = await bClient.rpc('portal_assistant_gate', { p_client_id: bClientId })
      const gateViewer = await bViewerClient.rpc('portal_assistant_gate', { p_client_id: bClientId })
      const gateCross = await bClient.rpc('portal_assistant_gate', { p_client_id: kansetClientId })
      const gateAnon = await anonClient.rpc('portal_assistant_gate', { p_client_id: bClientId })
      check('AS2: capable member passes the gate; viewer, cross-tenant, and anon are refused',
        !gateOn.error && !!gateViewer.error && !!gateCross.error && !!gateAnon.error,
        gateOn.error?.message ?? `viewer=${gateViewer.error?.message ?? 'OPEN'} cross=${gateCross.error?.message ?? 'OPEN'} anon=${gateAnon.error?.message ?? 'OPEN'}`)

      // Safe index: service rebuild works and is denied to the client.
      const reindex = await admin.rpc('portal_assistant_reindex', { p_client_id: bClientId })
      const clientReindex = await bClient.rpc('portal_assistant_reindex', { p_client_id: bClientId })
      check('AS3: service reindex builds the tenant index; client is denied the reindex RPC',
        !reindex.error && (reindex.data?.documents ?? 0) >= 1 && (reindex.data?.chunks ?? 0) >= 1
          && !!clientReindex.error,
        reindex.error?.message ?? clientReindex.error?.message
          ?? JSON.stringify(reindex.data))

      // Search boundary: own-tenant hits only; a foreign client_id fails before any read; a
      // term that exists only in the OTHER tenant's indexed corpus returns nothing.
      const reindexKanset = await admin.rpc('portal_assistant_reindex', { p_client_id: kansetClientId })
      if (reindexKanset.error) throw new Error(`kanset reindex: ${reindexKanset.error.message}`)
      const searchOwn = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Visible main',
      })
      const searchForged = await bClient.rpc('portal_assistant_search', {
        p_client_id: kansetClientId, p_query: 'Visible main',
      })
      const searchCrossTerm = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Kanset baseline',
      })
      check('AS4: search returns own-tenant chunks; forged tenant id fails; cross-tenant corpus is invisible',
        !searchOwn.error && (searchOwn.data ?? []).length >= 1
          && !!searchForged.error
          && !searchCrossTerm.error && (searchCrossTerm.data ?? []).length === 0,
        searchOwn.error?.message ?? searchCrossTerm.error?.message
          ?? `forged=${searchForged.error?.message ?? 'RETURNED'} own=${(searchOwn.data ?? []).length} cross=${(searchCrossTerm.data ?? []).length}`)

      // The RPCs are the ONLY client boundary: every direct table read/write is denied.
      const directChecks = await Promise.all([
        bClient.from('assistant_documents').select('id').limit(1),
        bClient.from('assistant_document_chunks').select('id').limit(1),
        bClient.from('assistant_runs').select('id').limit(1),
        bClient.from('assistant_feedback').select('id').limit(1),
        bClient.from('assistant_runs').insert({
          client_id: bClientId, auth_user_id: bUserId, mode: 'portal_workspace',
          query_hmac: 'a'.repeat(64), safety_outcome: 'answered',
          model: 'forged', prompt_version: 'v0',
        }),
      ])
      check('AS5: direct client access to documents/chunks/runs/feedback is denied',
        directChecks.every((result) => !!result.error),
        directChecks.map((result, index) => `${index}=${result.error?.message ?? 'ALLOWED'}`)
          .filter((message) => message.includes('ALLOWED')).join(' '))

      // Atomic reservation: service reserves a generation, settles it once, never twice;
      // the client is denied all three service RPCs.
      const reserve = await admin.rpc('portal_assistant_reserve_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'portal_workspace',
        p_query_hmac: 'a'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
      })
      const runId = reserve.data?.run_id as string | undefined
      const settle = runId ? await admin.rpc('portal_assistant_settle_run', {
        p_run_id: runId, p_safety_outcome: 'answered',
        p_retrieved_chunk_ids: [], p_citation_chunk_ids: [], p_citation_urls: [],
        p_input_tokens: 1200, p_output_tokens: 300, p_cost_cents: 0.75, p_latency_ms: 900,
      }) : { error: new Error('no run id') }
      const doubleSettle = runId ? await admin.rpc('portal_assistant_settle_run', {
        p_run_id: runId, p_safety_outcome: 'answered',
        p_retrieved_chunk_ids: [], p_citation_chunk_ids: [], p_citation_urls: [],
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      }) : { error: null }
      check('AS6: reserve creates a generation row, settles exactly once',
        !reserve.error && reserve.data?.allowed === true && !!runId
          && !settle.error && !!doubleSettle.error,
        reserve.error?.message ?? (settle.error as Error | null)?.message
          ?? `double=${(doubleSettle.error as Error | null)?.message ?? 'SETTLED TWICE'}`)

      const clientReserve = await bClient.rpc('portal_assistant_reserve_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'portal_workspace',
        p_query_hmac: 'b'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
      })
      const clientSettle = await bClient.rpc('portal_assistant_settle_run', {
        p_run_id: runId ?? '00000000-0000-0000-0000-000000000000', p_safety_outcome: 'answered',
        p_retrieved_chunk_ids: [], p_citation_chunk_ids: [], p_citation_urls: [],
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      })
      const clientLog = await bClient.rpc('portal_assistant_log_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'refused_case_specific',
        p_query_hmac: 'c'.repeat(64), p_retrieved_chunk_ids: [], p_citation_chunk_ids: [],
        p_citation_urls: [], p_safety_outcome: 'case_specific_refusal',
        p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      })
      check('AS7: client denied the reserve/settle/log service RPCs',
        !!clientReserve.error && !!clientSettle.error && !!clientLog.error,
        `${clientReserve.error?.message ?? 'RESERVED'} / ${clientSettle.error?.message ?? 'SETTLED'} / ${clientLog.error?.message ?? 'LOGGED'}`)

      const badLog = await admin.rpc('portal_assistant_log_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'not-a-mode',
        p_query_hmac: 'c'.repeat(64), p_retrieved_chunk_ids: [], p_citation_chunk_ids: [],
        p_citation_urls: [], p_safety_outcome: 'case_specific_refusal',
        p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      })
      const badUrl = await admin.rpc('portal_assistant_log_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'public_immigration_research',
        p_query_hmac: 'c'.repeat(64), p_retrieved_chunk_ids: [], p_citation_chunk_ids: [],
        p_citation_urls: ['http://insecure.example'], p_safety_outcome: 'source_validation_failed',
        p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      })
      check('AS8: service logger rejects an invalid mode and a non-https citation url',
        !!badLog.error && !!badUrl.error,
        `mode=${badLog.error?.message ?? 'WROTE'} url=${badUrl.error?.message ?? 'WROTE'}`)

      // Per-user daily generation cap: fill to 30 reserved generations, then refuse the 31st.
      let fillFailure: string | null = null
      let filled = 1 // AS6 reserved one for this user already
      while (filled < 30) {
        const fill = await admin.rpc('portal_assistant_reserve_run', {
          p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'portal_workspace',
          p_query_hmac: 'd'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
        })
        if (fill.error || fill.data?.allowed !== true) {
          fillFailure = fill.error?.message ?? JSON.stringify(fill.data)
          break
        }
        filled += 1
      }
      const overLimit = await admin.rpc('portal_assistant_reserve_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'portal_workspace',
        p_query_hmac: 'd'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
      })
      check('AS9: the 31st reservation for a user inside 24h is refused (user_daily_limit)',
        fillFailure === null && !overLimit.error && overLimit.data?.allowed === false
          && overLimit.data?.reason === 'user_daily_limit',
        fillFailure ?? overLimit.error?.message ?? JSON.stringify(overLimit.data))

      // Feedback binds to the caller's own run; a foreign run and a bad category fail.
      const viewerRun = await admin.rpc('portal_assistant_reserve_run', {
        p_client_id: bClientId, p_auth_user_id: bViewerUserId, p_mode: 'portal_workspace',
        p_query_hmac: 'e'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
      })
      const feedbackOwn = await bClient.rpc('portal_assistant_report_answer', {
        p_client_id: bClientId, p_run_id: runId, p_category: 'inaccurate',
        p_comment: 'RLS test feedback',
      })
      const feedbackForeign = await bClient.rpc('portal_assistant_report_answer', {
        p_client_id: bClientId, p_run_id: viewerRun.data?.run_id, p_category: 'inaccurate',
        p_comment: null,
      })
      const feedbackBadCategory = await bClient.rpc('portal_assistant_report_answer', {
        p_client_id: bClientId, p_run_id: runId, p_category: 'not-a-category', p_comment: null,
      })
      check('AS10: feedback works for the run owner only, with a validated category',
        !feedbackOwn.error && !!feedbackOwn.data
          && !!feedbackForeign.error && !!feedbackBadCategory.error,
        feedbackOwn.error?.message
          ?? `foreign=${feedbackForeign.error?.message ?? 'WROTE'} category=${feedbackBadCategory.error?.message ?? 'WROTE'}`)

      const disableAssistant = await admin.rpc('set_portal_feature_switch', {
        p_client_id: bClientId, p_feature: 'assistant', p_enabled: false,
        p_reason: 'Disposable RLS integration test teardown', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-assistant-off-${RUN_ID}`,
      })
      const disabledReserve = await admin.rpc('portal_assistant_reserve_run', {
        p_client_id: bClientId, p_auth_user_id: bUserId, p_mode: 'portal_workspace',
        p_query_hmac: 'f'.repeat(64), p_model: 'gpt-5.6-terra', p_prompt_version: 'rls-test',
      })
      const disabledGate = await bClient.rpc('portal_assistant_gate', { p_client_id: bClientId })
      const disabledSearch = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Visible main',
      })
      check('AS11: tenant switch off fails reserve, gate, and search closed',
        !disableAssistant.error && !disabledReserve.error
          && disabledReserve.data?.allowed === false
          && disabledReserve.data?.reason === 'assistant_disabled'
          && !!disabledGate.error && !!disabledSearch.error,
        disableAssistant.error?.message ?? disabledReserve.error?.message
          ?? disabledGate.error?.message ?? disabledSearch.error?.message
          ?? JSON.stringify(disabledReserve.data))

      console.log('\n--- 0019 assistant ops (triggers/agency idea/settle/reaper/purge) ---')

      // Re-enable the tenant switch (AS11 turned it off) so search works again.
      const reEnable = await admin.rpc('set_portal_feature_switch', {
        p_client_id: bClientId, p_feature: 'assistant', p_enabled: true,
        p_reason: 'Disposable RLS integration test (0019 block)', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-assistant-on2-${RUN_ID}`,
      })
      if (reEnable.error) throw new Error(`re-enable assistant: ${reEnable.error.message}`)

      // In-transaction index freshness: a client-added idea is searchable WITHOUT any
      // manual reindex call (the deferred constraint trigger rebuilt at commit), and it
      // is indexed navigation_only (metadata, no body chunk).
      const freshIdea = await bClient.rpc('add_idea', {
        p_client_id: bClientId, p_title: 'Zanzibar freshness probe', p_body: 'body must not index',
      })
      const freshSearch = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Zanzibar freshness probe',
      })
      const freshRows = (freshSearch.data ?? []) as Array<{
        answer_eligibility: string
        excerpt: string
      }>
      check('AS12: a new idea is searchable with no manual reindex, as navigation_only metadata',
        !freshIdea.error && !freshSearch.error && freshRows.length >= 1
          && freshRows.every((row) => row.answer_eligibility === 'navigation_only')
          && freshRows.every((row) => !row.excerpt.includes('body must not index')),
        freshIdea.error?.message ?? freshSearch.error?.message
          ?? `rows=${freshRows.length} ${JSON.stringify(freshRows[0] ?? null)}`)

      // Audited agency idea write path: insert, idempotent retry, changed-fingerprint
      // rejection, client denial, invalid status, and the client-safety shape gate.
      const ideaArgs = {
        p_client_id: bClientId, p_title: 'Quokka agency idea', p_body: 'From the weekly call.',
        p_status: 'considering', p_author_type: 'client', p_author_name: 'RLS Test B',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-agency-idea-${RUN_ID}`,
      }
      const agencyIdea = await admin.rpc('agency_add_idea', ideaArgs)
      const agencyIdeaRetry = await admin.rpc('agency_add_idea', ideaArgs)
      const agencyIdeaConflict = await admin.rpc('agency_add_idea', {
        ...ideaArgs, p_title: 'Different title, same key',
      })
      const agencyIdeaClient = await bClient.rpc('agency_add_idea', {
        ...ideaArgs, p_idempotency_key: `rls-agency-idea-client-${RUN_ID}`,
      })
      const agencyIdeaBadStatus = await admin.rpc('agency_add_idea', {
        ...ideaArgs, p_status: 'not-a-status',
        p_idempotency_key: `rls-agency-idea-status-${RUN_ID}`,
      })
      const agencyIdeaUnsafe = await admin.rpc('agency_add_idea', {
        ...ideaArgs, p_body: 'Reach maria at maria@kanset.com about the case',
        p_idempotency_key: `rls-agency-idea-unsafe-${RUN_ID}`,
      })
      const agencyIdeaSearch = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Quokka agency idea',
      })
      check('AS13: agency idea path inserts once, is idempotent, audited, gated, and indexed',
        !agencyIdea.error && !!agencyIdea.data
          && !agencyIdeaRetry.error && agencyIdeaRetry.data === agencyIdea.data
          && !!agencyIdeaConflict.error && !!agencyIdeaClient.error
          && !!agencyIdeaBadStatus.error && !!agencyIdeaUnsafe.error
          && !agencyIdeaSearch.error && (agencyIdeaSearch.data ?? []).length >= 1,
        agencyIdea.error?.message ?? agencyIdeaSearch.error?.message
          ?? `retry=${String(agencyIdeaRetry.data)} conflict=${agencyIdeaConflict.error?.message ?? 'WROTE'} `
          + `client=${agencyIdeaClient.error?.message ?? 'WROTE'} status=${agencyIdeaBadStatus.error?.message ?? 'WROTE'} `
          + `unsafe=${agencyIdeaUnsafe.error?.message ?? 'WROTE'} rows=${(agencyIdeaSearch.data ?? []).length}`)

      // 0023 flow input: curated news ideas are proposed, retain agency-only provenance,
      // and the lifecycle link is tenant-bound and terminal once promoted.
      const newsArgs = {
        p_client_id: bClientId, p_title: 'Ontario policy update probe',
        p_body: 'A curated source-backed angle.', p_source_ref: 'https://ontario.ca/policy-probe',
        p_author_name: 'Kanset news monitor', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-news-idea-${RUN_ID}`,
      }
      const newsIdea = await admin.rpc('agency_add_news_idea', newsArgs)
      const newsRetry = await admin.rpc('agency_add_news_idea', newsArgs)
      const newsUnverified = await admin.rpc('agency_add_news_idea', {
        ...newsArgs, p_title: 'Needs confirm [confirm]',
        p_idempotency_key: `rls-news-unverified-${RUN_ID}`,
      })
      const newsClient = await bClient.rpc('agency_add_news_idea', {
        ...newsArgs, p_idempotency_key: `rls-news-client-${RUN_ID}`,
      })
      const newsRow = newsIdea.data
        ? await admin.from('content_ideas').select('status,source_type,source_ref,became_content_id')
          .eq('id', newsIdea.data).single()
        : { data: null, error: newsIdea.error }
      const newsClientShape = await bClient.from('content_ideas').select('id,source_type').limit(1)
      const promote = newsIdea.data
        ? await admin.rpc('set_idea_status', {
          p_idea_id: newsIdea.data, p_status: 'became_piece', p_became_content_id: B_CONTENT_ID,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-news-promote-${RUN_ID}`,
        })
        : { data: null, error: newsIdea.error }
      const promoteRetry = newsIdea.data
        ? await admin.rpc('set_idea_status', {
          p_idea_id: newsIdea.data, p_status: 'became_piece', p_became_content_id: B_CONTENT_ID,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-news-promote-${RUN_ID}`,
        })
        : { data: null, error: newsIdea.error }
      const promoteCrossTenant = agencyIdea.data
        ? await admin.rpc('set_idea_status', {
          p_idea_id: agencyIdea.data, p_status: 'became_piece', p_became_content_id: foreignContentId,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-news-cross-${RUN_ID}`,
        })
        : { data: null, error: agencyIdea.error }
      const promotionInbox = newsIdea.data
        ? await admin.rpc('read_portal_inbox', {
          p_consumer_key: `rls-promotion-consumer-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
        }).then((result) => ({
          data: (result.data as Array<Record<string, unknown>> | null)?.find(
            (row) => row.event_key === `agency:idea-promoted:${newsIdea.data}:${B_CONTENT_ID}`,
          ) ?? null,
          error: result.error,
        }))
        : { data: null, error: newsIdea.error }
      check('AS19: news ingest is curated, idempotent, provenance-private, tenant-safe, and promotable',
        !newsIdea.error && !newsRetry.error && newsRetry.data === newsIdea.data
          && !!newsUnverified.error && !!newsClient.error
          && !newsRow.error && newsRow.data?.status === 'proposed'
          && newsRow.data?.source_type === 'news_run'
          && newsRow.data?.source_ref === newsArgs.p_source_ref
          && !!newsClientShape.error
          && !promote.error && !promoteRetry.error
          && promoteRetry.data?.id === promote.data?.id
          && promoteRetry.data?.status === promote.data?.status
          && !promotionInbox.error
          && promotionInbox.data?.event_type === 'idea_promoted'
          && promotionInbox.data?.object_type === 'content_idea'
          && promotionInbox.data?.object_id === newsIdea.data
          && (promotionInbox.data?.payload as { content_id?: string } | null)?.content_id === B_CONTENT_ID
          && !!promoteCrossTenant.error,
        JSON.stringify({
          add: newsIdea.error?.message, retry: newsRetry.error?.message,
          unverified: newsUnverified.error?.message, client: newsClient.error?.message,
          row: newsRow.error?.message, shape: newsClientShape.error?.message,
          promote: promote.error?.message, retryPromote: promoteRetry.error?.message,
          cross: promoteCrossTenant.error?.message,
          inbox: promotionInbox.error?.message,
          status: newsRow.data?.status, source: newsRow.data?.source_type,
          retryId: promoteRetry.data?.id, promoteId: promote.data?.id,
        }))

      // Error settlement preserves the conservative reservation cost (Codex blocker):
      // the viewer's AS10 reservation is settled as 'error' with zeroed usage, and the
      // recorded cost must stay at the reserved worst case, not drop to 0.
      const viewerRunId = viewerRun.data?.run_id as string
      const errorSettle = await admin.rpc('portal_assistant_settle_run', {
        p_run_id: viewerRunId, p_safety_outcome: 'error',
        p_retrieved_chunk_ids: [], p_citation_chunk_ids: [], p_citation_urls: [],
        p_input_tokens: 0, p_output_tokens: 0, p_cost_cents: 0, p_latency_ms: 0,
      })
      const settledRow = await admin.from('assistant_runs')
        .select('cost_cents, safety_outcome, settled_at').eq('id', viewerRunId).single()
      check('AS14: settling as error preserves the reserved worst-case cost',
        !errorSettle.error && !settledRow.error
          && Number(settledRow.data?.cost_cents) >= 8
          && settledRow.data?.safety_outcome === 'error'
          && !!settledRow.data?.settled_at,
        errorSettle.error?.message ?? settledRow.error?.message
          ?? JSON.stringify(settledRow.data))

      // Maintenance RPCs: service runs succeed and validate; the client is denied all.
      const reap = await admin.rpc('portal_assistant_reap_reservations', { p_older_than_minutes: 30 })
      const reapTooYoung = await admin.rpc('portal_assistant_reap_reservations', { p_older_than_minutes: 2 })
      const purge = await admin.rpc('portal_assistant_purge_feedback')
      const reconcile = await admin.rpc('portal_assistant_reconcile_index')
      const clientOps = await Promise.all([
        bClient.rpc('portal_assistant_reap_reservations', { p_older_than_minutes: 30 }),
        bClient.rpc('portal_assistant_purge_feedback'),
        bClient.rpc('portal_assistant_reconcile_index'),
      ])
      check('AS15: maintenance RPCs run for service, validate age, and are denied to clients',
        !reap.error && typeof reap.data === 'number'
          && !!reapTooYoung.error
          && !purge.error && typeof purge.data === 'number'
          && !reconcile.error && (reconcile.data?.clients ?? 0) >= 2
          && clientOps.every((result) => !!result.error),
        reap.error?.message ?? purge.error?.message ?? reconcile.error?.message
          ?? `tooYoung=${reapTooYoung.error?.message ?? 'RAN'} client=${clientOps.map((r) => r.error?.message ?? 'RAN').join('/')}`)

      // Demo-purge overreach guard: the REAL rows survive the 0019 purge criteria
      // (which ran at migration time): kanset keeps released content, B keeps its
      // report/link/idea surfaces, and no fixture-content ids exist for kanset.
      const kansetContent = await admin.from('content_with_state')
        .select('id', { count: 'exact', head: true }).eq('client_id', kansetClientId)
      const kansetFixture = await admin.from('content_items')
        .select('id', { count: 'exact', head: true }).eq('client_id', kansetClientId)
        .in('content_id', ['kanset-2026-07-lmia-reel', 'kanset-2026-07-oinp-employer'])
      const bReports = await admin.from('report_snapshots')
        .select('id', { count: 'exact', head: true }).eq('client_id', bClientId)
      const bLinks = await admin.from('links')
        .select('id', { count: 'exact', head: true }).eq('client_id', bClientId)
      const bIdeas = await admin.from('content_ideas')
        .select('id', { count: 'exact', head: true }).eq('client_id', bClientId)
      check('AS16: demo purge criteria spare real content, reports, links, and ideas',
        (kansetContent.count ?? 0) >= 1 && (kansetFixture.count ?? 0) === 0
          && (bReports.count ?? 0) >= 1 && (bLinks.count ?? 0) >= 1 && (bIdeas.count ?? 0) >= 1,
        `kanset=${kansetContent.count} fixture=${kansetFixture.count} `
          + `bReports=${bReports.count} bLinks=${bLinks.count} bIdeas=${bIdeas.count}`)

      // Two-session concurrency (round-3 blocker): the scheduled reconciliation and a
      // source write's commit-time trigger refresh race for the same tenant index. The
      // per-tenant advisory lock in portal_assistant_reindex must serialize them: no
      // duplicate-key failures, and every write is searchable afterwards.
      let concurrencyFailure: string | null = null
      const concurrencyRounds = 4
      for (let round = 0; round < concurrencyRounds && !concurrencyFailure; round++) {
        const [reconcileA, reconcileB, write] = await Promise.all([
          admin.rpc('portal_assistant_reconcile_index'),
          admin.rpc('portal_assistant_reconcile_index'),
          bClient.rpc('add_idea', {
            p_client_id: bClientId, p_title: `Zephyr concurrency probe ${round}`, p_body: null,
          }),
        ])
        concurrencyFailure = reconcileA.error?.message ?? reconcileB.error?.message
          ?? write.error?.message ?? null
      }
      const concurrencySearch = await bClient.rpc('portal_assistant_search', {
        p_client_id: bClientId, p_query: 'Zephyr concurrency probe',
      })
      check('AS17: concurrent reconciliation and source writes never fail or lose index rows',
        concurrencyFailure === null && !concurrencySearch.error
          && (concurrencySearch.data ?? []).length >= concurrencyRounds,
        concurrencyFailure ?? concurrencySearch.error?.message
          ?? `rows=${(concurrencySearch.data ?? []).length}`)

      // Tenant relocation (round-3 blocker): a source row can NEVER move to another
      // tenant. Two independent walls both forbid it: the API surface holds no
      // client_id update grant, and the 0019 BEFORE UPDATE immutability trigger raises
      // even for privileged in-database paths. Either failure mode passes; the
      // migration assertion separately proves the trigger exists on all 12 tables.
      const relocationTarget = (await admin.from('content_ideas')
        .select('id').eq('client_id', bClientId).limit(1).single()).data?.id
      const relocation = await admin.from('content_ideas')
        .update({ client_id: kansetClientId })
        .eq('id', relocationTarget ?? '00000000-0000-0000-0000-000000000000')
        .select()
      const relocated = await admin.from('content_ideas')
        .select('id', { count: 'exact', head: true })
        .eq('id', relocationTarget ?? '00000000-0000-0000-0000-000000000000')
        .eq('client_id', kansetClientId)
      check('AS18: a source row can never move tenants (grant wall or immutability trigger)',
        !!relocationTarget && !!relocation.error && (relocated.count ?? 0) === 0,
        relocation.error?.message ?? `RELOCATED (count=${relocated.count})`)

      // Leave the disposable tenant's assistant switch off, as AS11 intended.
      const reDisable = await admin.rpc('set_portal_feature_switch', {
        p_client_id: bClientId, p_feature: 'assistant', p_enabled: false,
        p_reason: 'Disposable RLS integration test teardown (0019 block)', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-assistant-off2-${RUN_ID}`,
      })
      if (reDisable.error) throw new Error(`re-disable assistant: ${reDisable.error.message}`)
    }

    console.log('\n--- 0020 design links (item-level presentation metadata) ---')

    {
      const itemRow = await admin.from('content_items')
        .select('id').eq('client_id', bClientId).eq('content_id', B_CONTENT_ID).single()
      const itemId = itemRow.data?.id as string
      const checksumBefore = await admin.from('content_item_versions')
        .select('content_checksum').eq('content_item_id', itemId).eq('version', 1).single()

      // DL1: the audited write sets ITEM-level links; the client view serves them; the
      // released version snapshot (checksum + row count) is untouched by construction.
      const setLinks = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/TESTDESIGN/view',
        p_drive_url: 'https://drive.google.com/open?id=TESTFILE',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-link-${RUN_ID}`,
      })
      const viewRow = await bClient.from('content_with_state')
        .select('canva_url, drive_url').eq('content_id', B_CONTENT_ID).single()
      const checksumAfter = await admin.from('content_item_versions')
        .select('content_checksum').eq('content_item_id', itemId).eq('version', 1).single()
      const versionCount = await admin.from('content_item_versions')
        .select('id', { count: 'exact', head: true }).eq('content_item_id', itemId)
      check('DL1: item-level design links render in the client view with the released checksum untouched',
        !!itemId && !setLinks.error
          && viewRow.data?.canva_url === 'https://www.canva.com/design/TESTDESIGN/view'
          && viewRow.data?.drive_url === 'https://drive.google.com/open?id=TESTFILE'
          && !checksumBefore.error && !checksumAfter.error
          && checksumBefore.data?.content_checksum === checksumAfter.data?.content_checksum
          && (versionCount.count ?? 0) === 1,
        setLinks.error?.message ?? viewRow.error?.message
          ?? `view=${JSON.stringify(viewRow.data)} checksum=${checksumBefore.data?.content_checksum === checksumAfter.data?.content_checksum} versions=${versionCount.count}`)

      // DL2: fingerprinted idempotency: exact retry returns the receipt, a reused key
      // with a different payload is rejected.
      const retry = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/TESTDESIGN/view',
        p_drive_url: 'https://drive.google.com/open?id=TESTFILE',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-link-${RUN_ID}`,
      })
      const conflicted = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/OTHER/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-link-${RUN_ID}`,
      })
      check('DL2: design-link writes are idempotent by fingerprint',
        !retry.error && retry.data?.canva_url === 'https://www.canva.com/design/TESTDESIGN/view'
          && !!conflicted.error,
        retry.error?.message ?? conflicted.error?.message ?? 'CONFLICT ACCEPTED')

      // DL3: URL shape wall (non-allowlisted hosts, http, lookalikes, userinfo tricks),
      // client denial, and cross-tenant denial.
      const rejections = await Promise.all([
        admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID,
          p_canva_url: null, p_drive_url: 'https://www.dropbox.com/s/leak',
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-bad1-${RUN_ID}`,
        }),
        admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID,
          p_canva_url: 'http://www.canva.com/design/X/view', p_drive_url: null,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-bad2-${RUN_ID}`,
        }),
        admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID,
          p_canva_url: 'https://canva.com.evil.example/design/X', p_drive_url: null,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-bad3-${RUN_ID}`,
        }),
        admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID,
          p_canva_url: null, p_drive_url: 'https://drive.google.com@evil.example/x',
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-bad4-${RUN_ID}`,
        }),
      ])
      const clientDenied = await bClient.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-client-${RUN_ID}`,
      })
      const crossTenant = await admin.rpc('set_content_design_links', {
        p_client_id: kansetClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-dl-cross-${RUN_ID}`,
      })
      check('DL3: bad hosts, http, lookalikes, userinfo, client callers, and cross-tenant ids all reject',
        rejections.every((result) => !!result.error) && !!clientDenied.error && !!crossTenant.error,
        rejections.map((r, i) => `${i}=${r.error ? 'ok' : 'ACCEPTED'}`).join(' ')
          + ` client=${clientDenied.error?.message ?? 'ALLOWED'} cross=${crossTenant.error?.message ?? 'ALLOWED'}`)

      // DL4: null clears the item-level override and the view falls back to the sealed
      // version values (this fixture's v1 carries none, so the view reads null again).
      const clearLinks = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-clear-${RUN_ID}`,
      })
      const clearedView = await bClient.from('content_with_state')
        .select('canva_url, drive_url').eq('content_id', B_CONTENT_ID).single()
      check('DL4: clearing the override falls back to the sealed version values',
        !clearLinks.error && !clearedView.error
          && clearedView.data?.canva_url === null && clearedView.data?.drive_url === null,
        clearLinks.error?.message ?? clearedView.error?.message ?? JSON.stringify(clearedView.data))

      // DL5 (Codex round-4 test ask): a sealed version that already CARRIES a link.
      // The coalesce is per column: an item-level drive override wins while the
      // untouched canva column keeps serving the sealed version value, and clearing
      // restores the sealed value in full.
      const DL5_ID = 'rls-design-piece'
      const SEALED_CANVA = 'https://www.canva.com/design/SEALEDV1/view'
      const sealedSync = await sync([snapshot(bClientId, DL5_ID, 1,
        'Design piece v1', 'Design piece body', 'main', { canva_url: SEALED_CANVA })])
      const dl5ItemId = sealedSync[0]?.item_id
      const dl5Release = await admin.rpc('mark_content_ready', {
        p_content_id: dl5ItemId, p_content_version: 1 })
      const sealedView = await bClient.from('content_with_state')
        .select('canva_url, drive_url').eq('content_id', DL5_ID).single()
      const partial = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: DL5_ID,
        p_canva_url: null, p_drive_url: 'https://drive.google.com/open?id=OVERRIDE',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-partial-${RUN_ID}`,
      })
      const partialView = await bClient.from('content_with_state')
        .select('canva_url, drive_url').eq('content_id', DL5_ID).single()
      const dl5Clear = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: DL5_ID,
        p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-clear2-${RUN_ID}`,
      })
      const restoredView = await bClient.from('content_with_state')
        .select('canva_url, drive_url').eq('content_id', DL5_ID).single()
      check('DL5: sealed-version link + partial override + clear behave per column',
        !!dl5ItemId && !dl5Release.error && !partial.error && !dl5Clear.error
          && sealedView.data?.canva_url === SEALED_CANVA && sealedView.data?.drive_url === null
          && partialView.data?.canva_url === SEALED_CANVA
          && partialView.data?.drive_url === 'https://drive.google.com/open?id=OVERRIDE'
          && restoredView.data?.canva_url === SEALED_CANVA && restoredView.data?.drive_url === null,
        dl5Release.error?.message ?? partial.error?.message ?? dl5Clear.error?.message
          ?? `sealed=${JSON.stringify(sealedView.data)} partial=${JSON.stringify(partialView.data)} restored=${JSON.stringify(restoredView.data)}`)

      // DL6 (0021): design links are an INDEXED assistant source: the commit-time touch
      // trigger projects a navigation_only chunk carrying the URL, and retracting the
      // link retracts the chunk. Uses a fresh set on the main piece, then clears it.
      const dl6Set = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/INDEXME/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-index-${RUN_ID}`,
      })
      const projected = await admin.from('assistant_document_chunks')
        .select('body').eq('client_id', bClientId).like('body', '%INDEXME%')
      const projectedDoc = await admin.from('assistant_documents')
        .select('answer_eligibility').eq('client_id', bClientId)
        .eq('source_type', 'design_link').eq('source_id', B_CONTENT_ID).single()
      const dl6Clear = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-design-index-clear-${RUN_ID}`,
      })
      const retracted = await admin.from('assistant_document_chunks')
        .select('id').eq('client_id', bClientId).like('body', '%INDEXME%')
      check('DL6: the assistant index projects and retracts the design link as navigation_only',
        !dl6Set.error && !dl6Clear.error
          && (projected.data?.length ?? 0) === 1
          && projectedDoc.data?.answer_eligibility === 'navigation_only'
          && (retracted.data?.length ?? 0) === 0,
        dl6Set.error?.message ?? dl6Clear.error?.message
          ?? `projected=${projected.data?.length} eligibility=${projectedDoc.data?.answer_eligibility} retracted=${retracted.data?.length}`)
    }

    console.log('\n--- 0022 production gates + ops tasks (agency-only) ---')

    {
      // PG1: client roles reach NOTHING: no table read, no RPC execute.
      const reads = await Promise.all([
        bClient.from('content_production_gates').select('id').limit(1),
        bClient.from('production_gate_events').select('id').limit(1),
        bClient.from('ops_tasks').select('id').limit(1),
      ])
      const clientGate = await bClient.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'open', p_owner: 'anastasia', p_note: null, p_na_reason: null,
        p_occurred_at: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-client-${RUN_ID}`,
      })
      const clientOps = await bClient.rpc('add_ops_task', {
        p_client_id: bClientId, p_title: 'x', p_category: 'admin', p_due_date: null,
        p_trigger_note: null, p_owner: 'anastasia', p_source: 'x',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-client-ops-${RUN_ID}`,
      })
      check('PG1: client roles are denied the gate tables and every gate RPC',
        reads.every((result) => !!result.error) && !!clientGate.error && !!clientOps.error,
        reads.map((r, i) => `${i}=${r.error ? 'ok' : 'READ'}`).join(' ')
          + ` gate=${clientGate.error ? 'ok' : 'EXECUTED'} ops=${clientOps.error ? 'ok' : 'EXECUTED'}`)

      // PG2: gate lifecycle: open -> done -> reopen, event per transition, grammar rules
      // enforced (na needs a reason, done needs a date), fingerprinted idempotency.
      const marker = `PG-MARKER-${RUN_ID}`
      const openGate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'open', p_owner: 'anastasia', p_note: marker, p_na_reason: null,
        p_occurred_at: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-open-${RUN_ID}`,
      })
      const doneGate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'done', p_owner: 'anastasia', p_note: 'built', p_na_reason: null,
        p_occurred_at: '2026-07-21T12:00:00Z', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-pg-done-${RUN_ID}`,
      })
      const reopened = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'open', p_owner: 'anastasia', p_note: 'change requested: rebuild frame 2',
        p_na_reason: null, p_occurred_at: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-pg-reopen-${RUN_ID}`,
      })
      const naNoReason = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'proofed',
        p_state: 'na', p_owner: 'anastasia', p_note: null, p_na_reason: null,
        p_occurred_at: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-na-${RUN_ID}`,
      })
      const doneNoDate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'proofed',
        p_state: 'done', p_owner: 'anastasia', p_note: null, p_na_reason: null,
        p_occurred_at: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-nodate-${RUN_ID}`,
      })
      const retryGate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'open', p_owner: 'anastasia', p_note: 'change requested: rebuild frame 2',
        p_na_reason: null, p_occurred_at: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-pg-reopen-${RUN_ID}`,
      })
      const conflictGate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
        p_state: 'done', p_owner: 'anastasia', p_note: 'different', p_na_reason: null,
        p_occurred_at: '2026-07-21T13:00:00Z', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-pg-reopen-${RUN_ID}`,
      })
      const gateItemRow = await admin.from('content_items')
        .select('id').eq('client_id', bClientId).eq('content_id', B_CONTENT_ID).single()
      const events = await admin.from('production_gate_events')
        .select('gate_key, from_state, to_state').eq('client_id', bClientId)
        .eq('content_item_id', gateItemRow.data?.id).eq('gate_key', 'design_built')
        .order('created_at', { ascending: true })
      const transitions = (events.data ?? []).map((row) => `${row.from_state ?? 'none'}>${row.to_state}`)
      check('PG2: gate lifecycle appends an event per transition and enforces the grammar',
        !openGate.error && !doneGate.error && !reopened.error && !retryGate.error
          && !!naNoReason.error && !!doneNoDate.error && !!conflictGate.error
          && transitions.join(',') === 'none>open,open>done,done>open',
        openGate.error?.message ?? doneGate.error?.message ?? reopened.error?.message
          ?? retryGate.error?.message ?? `na=${naNoReason.error ? 'ok' : 'ACCEPTED'} nodate=${doneNoDate.error ? 'ok' : 'ACCEPTED'} conflict=${conflictGate.error ? 'ok' : 'ACCEPTED'} transitions=${transitions.join(',')}`)

      // PG3: the audit trail is append-only even for service_role
      const eventTamper = await admin.from('production_gate_events')
        .delete().eq('client_id', bClientId)
      check('PG3: gate events are immutable (service_role cannot delete)',
        !!eventTamper.error, eventTamper.error?.message ?? 'DELETED')

      // PG4: ops task lifecycle: add (client-scoped + agency-global), complete,
      // re-complete refused, add retries idempotent by fingerprint.
      const clientTask = await admin.rpc('add_ops_task', {
        p_client_id: bClientId, p_title: 'Chase the studio brief', p_category: 'follow_up',
        p_due_date: '2026-07-23', p_trigger_note: 'watch: brief due Wed', p_owner: 'anastasia',
        p_source: 'rls test', p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-a-${RUN_ID}`,
      })
      const globalTask = await admin.rpc('add_ops_task', {
        p_client_id: null, p_title: 'Renew the domain', p_category: 'admin',
        p_due_date: null, p_trigger_note: 'watch: expiry notice', p_owner: 'anastasia',
        p_source: 'rls test', p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-b-${RUN_ID}`,
      })
      const addRetry = await admin.rpc('add_ops_task', {
        p_client_id: bClientId, p_title: 'Chase the studio brief', p_category: 'follow_up',
        p_due_date: '2026-07-23', p_trigger_note: 'watch: brief due Wed', p_owner: 'anastasia',
        p_source: 'rls test', p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-a-${RUN_ID}`,
      })
      const taskId = (clientTask.data as { id?: string } | null)?.id
      const completed = await admin.rpc('complete_ops_task', {
        p_task_id: taskId, p_status: 'done', p_note: 'closed after the studio delivered',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-done-${RUN_ID}`,
      })
      const completeRetry = await admin.rpc('complete_ops_task', {
        p_task_id: taskId, p_status: 'done', p_note: 'closed after the studio delivered',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-done-${RUN_ID}`,
      })
      const recomplete = await admin.rpc('complete_ops_task', {
        p_task_id: taskId, p_status: 'dropped', p_note: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-again-${RUN_ID}`,
      })
      // fix B: completion writes completion_note, and the original trigger_note survives
      const completedRow = await admin.from('ops_tasks')
        .select('status, trigger_note, completion_note').eq('id', taskId).single()
      check('PG4: ops task lifecycle; completion keeps trigger_note and writes completion_note',
        !clientTask.error && !globalTask.error && !addRetry.error && !!taskId
          && !completed.error && !completeRetry.error && !!recomplete.error
          && completedRow.data?.status === 'done'
          && completedRow.data?.trigger_note === 'watch: brief due Wed'
          && completedRow.data?.completion_note === 'closed after the studio delivered',
        clientTask.error?.message ?? globalTask.error?.message ?? addRetry.error?.message
          ?? completed.error?.message ?? completeRetry.error?.message
          ?? `recomplete=${recomplete.error ? 'ok' : 'ACCEPTED'} row=${JSON.stringify(completedRow.data)}`)

      // PG5: the assistant never learns production internals: the gate note marker never
      // appears in any index chunk, and no assistant document carries a gate-like source
      // type (the 0022 assertion pins the vocabulary; this checks the live rows).
      const leakedChunks = await admin.from('assistant_document_chunks')
        .select('id').eq('client_id', bClientId).like('body', `%${marker}%`)
      const leakedDocs = await admin.from('assistant_documents')
        .select('id').eq('client_id', bClientId).in('source_type', ['production_gate', 'ops_task', 'gate'])
      check('PG5: production gates never reach the assistant index',
        (leakedChunks.data?.length ?? 0) === 0 && (leakedDocs.data?.length ?? 0) === 0,
        `chunks=${leakedChunks.data?.length} docs=${leakedDocs.data?.length}`)

      // PG6 (fix C): note injection is rejected in the RPC for gate notes, na_reason, and
      // completion notes; a clean note is accepted.
      const injections = await Promise.all([
        admin.rpc('set_production_gate', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'design_built',
          p_state: 'open', p_owner: 'anastasia', p_note: 'line one\n- [ ] fake gate',
          p_na_reason: null, p_occurred_at: null, p_actor_key: 'thedot-admin',
          p_idempotency_key: `rls-pg-inj1-${RUN_ID}`,
        }),
        admin.rpc('set_production_gate', {
          p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_gate_key: 'proofed',
          p_state: 'na', p_owner: 'anastasia', p_note: null, p_na_reason: 'field | injection',
          p_occurred_at: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-inj2-${RUN_ID}`,
        }),
        admin.rpc('complete_ops_task', {
          p_task_id: (globalTask.data as { id?: string } | null)?.id, p_status: 'done',
          p_note: 'owner @studio', p_actor_key: 'thedot-admin', p_idempotency_key: `rls-pg-inj3-${RUN_ID}`,
        }),
      ])
      check('PG6: note injection (newline, |, @) is rejected at the RPC',
        injections.every((result) => !!result.error),
        injections.map((r, i) => `${i}=${r.error ? 'ok' : 'ACCEPTED'}`).join(' '))

      // PG7 (fix B): trigger_note is immutable even for service_role via the trigger.
      const tamperTrigger = await admin.from('ops_tasks')
        .update({ trigger_note: 'rewritten' }).eq('id', taskId)
      check('PG7: ops_tasks.trigger_note is immutable',
        !!tamperTrigger.error, tamperTrigger.error?.message ?? 'REWRITTEN')

      // PG8 (BLOCKER 1): a gate written on an UNRELEASED piece is visible via the agency
      // loader (My Tasks) and regenerates its STATUS GATES block. B_HIDDEN_ID was synced
      // as a working v1 that was never released (no mark_content_ready), so
      // content_with_state excludes it; the loader over content_items must include it.
      const draftGate = await admin.rpc('set_production_gate', {
        p_client_id: bClientId, p_content_id: B_HIDDEN_ID, p_gate_key: 'design_built',
        p_state: 'open', p_owner: 'anastasia', p_note: 'draft-piece design pending',
        p_na_reason: null, p_occurred_at: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-pg-draft-${RUN_ID}`,
      })
      const draftPiece = await loadAgencyStagePiece(admin, bClientId, B_HIDDEN_ID)
      const draftTasks = draftPiece ? deriveMyTasks([draftPiece], [], '2026-07-21') : []
      const draftBlock = draftPiece ? renderStatusGatesBlock(draftPiece, '2026-07-21') : ''
      check('PG8: a gate on an unreleased piece is visible in My Tasks and regenerates its block',
        !draftGate.error && draftPiece !== null
          && draftTasks.some((task) => task.kind === 'action' && task.gate === 'design-built')
          && draftBlock.includes('- [ ] design-built @anastasia'),
        draftGate.error?.message
          ?? `piece=${draftPiece ? 'loaded' : 'null'} tasks=${draftTasks.length} block=${draftBlock.includes('design-built')}`)

      // PG9 (Codex round-3 blocker, extended round 4): the loader canonicalizes raw
      // frontmatter platforms to the schedule/publication destination vocabulary. Synced
      // with alias platforms (youtube_shorts + website) AND an UNSUPPORTED one (tiktok),
      // the loaded StagePiece must carry only the canonical SUPPORTED destinations
      // (instagram + youtube + squarespace) that content_schedule_targets /
      // content_publication_targets are stored under: the alias collapses correctly and
      // tiktok is DROPPED (no phantom destination). Also carries the tenant name (fix 2).
      const canonSync = await sync([snapshot(bClientId, 'rls-canon-piece', 1,
        'Canonicalization piece', 'body', 'main',
        { platforms: ['instagram', 'youtube_shorts', 'tiktok', 'website'] })])
      const canonPiece = canonSync[0]?.item_id
        ? await loadAgencyStagePiece(admin, bClientId, 'rls-canon-piece') : null
      const canonNine = canonPiece ? renderStatusGatesBlock(canonPiece, '2026-07-21') : ''
      check('PG9: the loader canonicalizes to supported destinations and drops unsupported ones',
        canonPiece !== null
          && JSON.stringify(canonPiece.platforms) === JSON.stringify(['instagram', 'youtube', 'squarespace'])
          && canonPiece.dests.every((d) => ['instagram', 'youtube', 'squarespace'].includes(d.destination))
          && !canonNine.includes('tiktok') // no phantom tiktok gate line
          && canonPiece.clientName === 'RLS Test Co',
        `platforms=${JSON.stringify(canonPiece?.platforms)} tiktok=${canonNine.includes('tiktok')} client=${canonPiece?.clientName}`)
    }

    console.log('\n--- 0029 selected-idea identity lifecycle ---')

    {
      const ideaContentId = `rls-plan-idea-${RUN_ID}`
      const plan = await admin.rpc('agency_upsert_plan_cycle', {
        p_client_id: bClientId,
        p_cycle_key: `rls-week-${RUN_ID}`,
        p_week_start: '2026-07-27',
        p_week_end: '2026-07-31',
        p_title: 'RLS next week',
        p_direction_summary: 'A client-safe weekly direction.',
        p_items: [{
          content_id: ideaContentId,
          title: 'Selected idea without copy',
          format: 'carousel',
          pillar: 'employer',
          platforms: ['instagram', 'facebook'],
          producer: 'the_dot',
          planned_date: '2026-07-27',
          direction_note: 'Included in the approved weekly direction.',
          position: 1,
        }],
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-plan-create-${RUN_ID}`,
      })
      const identity = await admin.from('content_items')
        .select('id,status,working_version,client_visible_version,planned_date')
        .eq('client_id', bClientId).eq('content_id', ideaContentId).single()
      const identityId = identity.data?.id as string | undefined
      const snapshotsBefore = identityId
        ? await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
          .eq('content_item_id', identityId)
        : { count: -1, error: new Error('identity missing') }
      const agencyPiece = identityId
        ? await loadAgencyStagePiece(admin, bClientId, ideaContentId)
        : null
      check('PI1: plan submission creates one hidden versionless idea identity',
        !plan.error && !identity.error && identity.data?.status === 'idea'
          && identity.data?.working_version === null
          && identity.data?.client_visible_version === null
          && snapshotsBefore.count === 0
          && agencyPiece?.workingVersion === null
          && deriveMyTasks(agencyPiece ? [agencyPiece] : [], [], '2026-07-25').length === 0,
        plan.error?.message ?? identity.error?.message
          ?? `identity=${JSON.stringify(identity.data)} snapshots=${snapshotsBefore.count}`)

      const ownPlan = await bClient.from('plan_cycle_items_client')
        .select('content_item_id,content_id,title,pillar,planned_date')
        .eq('content_id', ideaContentId).single()
      const producerProbe = await bClient.from('plan_cycle_items')
        .select('producer').eq('content_id', ideaContentId)
      const foreignPlan = await kansetClient.from('plan_cycle_items_client')
        .select('content_id').eq('content_id', ideaContentId)
      const copyLeak = await bClient.from('content_with_state')
        .select('content_id').eq('content_id', ideaContentId)
      check('PI2: client sees only the safe plan projection; producer and copy remain hidden',
        !ownPlan.error && ownPlan.data?.content_item_id === identityId
          && ownPlan.data?.pillar === 'employer'
          && !!producerProbe.error
          && !foreignPlan.error && (foreignPlan.data ?? []).length === 0
          && !copyLeak.error && (copyLeak.data ?? []).length === 0,
        ownPlan.error?.message ?? producerProbe.error?.message
          ?? foreignPlan.error?.message ?? copyLeak.error?.message ?? 'unexpected exposure')

      const v1 = snapshot(
        bClientId, ideaContentId, 1, 'Selected idea with authored copy',
        'The first authored version.', 'caption',
        { planned_date: '2026-07-27', pillar: 'employer',
          platforms: ['instagram', 'facebook'], producer: 'the_dot' },
      )
      const preview = await admin.rpc('preview_content_item_versions', { p_items: [v1] })
      const afterPreview = identityId
        ? await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
          .eq('content_item_id', identityId)
        : { count: -1, error: new Error('identity missing') }
      check('PI3: first-pack preview reports hydration and performs zero writes',
        !preview.error && preview.data?.[0]?.outcome === 'idea_hydrated'
          && preview.data?.[0]?.item_id === identityId && afterPreview.count === 0,
        preview.error?.message ?? `preview=${JSON.stringify(preview.data)} count=${afterPreview.count}`)

      const hydrated = await sync([v1])
      const hydratedItem = await admin.from('content_items')
        .select('id,status,working_version,client_visible_version')
        .eq('client_id', bClientId).eq('content_id', ideaContentId).single()
      const snapshotsAfter = identityId
        ? await admin.from('content_item_versions')
          .select('version,content_checksum').eq('content_item_id', identityId)
        : { data: [], error: new Error('identity missing') }
      const retry = await sync([v1])
      check('PI4: first sync hydrates the same UUID as v1 and exact retry converges',
        hydrated[0]?.outcome === 'idea_hydrated'
          && hydrated[0]?.item_id === identityId
          && hydratedItem.data?.id === identityId
          && hydratedItem.data?.status === 'draft'
          && hydratedItem.data?.working_version === 1
          && hydratedItem.data?.client_visible_version === null
          && !snapshotsAfter.error && snapshotsAfter.data?.length === 1
          && snapshotsAfter.data[0]?.version === 1
          && retry[0]?.outcome === 'exact_retry'
          && retry[0]?.item_id === identityId,
        hydratedItem.error?.message ?? snapshotsAfter.error?.message
          ?? `hydrate=${JSON.stringify(hydrated)} retry=${JSON.stringify(retry)}`)

      const planInboxConsumer = `rls-plan-inbox-${RUN_ID}`
      const planInboxBefore = await admin.rpc('read_portal_inbox', {
        p_consumer_key: planInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const planDecision = await bClient.rpc('record_plan_cycle_decision', {
        p_plan_cycle_id: plan.data, p_revision: 1, p_decision: 'approved', p_note: null,
      })
      const planInboxAfter = await admin.rpc('read_portal_inbox', {
        p_consumer_key: planInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const planInboxRow = (planInboxAfter.data ?? []).find((row: PortalInboxRow) =>
        row.event_type === 'plan_cycle_approved' && row.object_id === plan.data)
      const planRetry = await bClient.rpc('record_plan_cycle_decision', {
        p_plan_cycle_id: plan.data, p_revision: 1, p_decision: 'approved', p_note: null,
      })
      const planInboxRetry = await admin.rpc('read_portal_inbox', {
        p_consumer_key: planInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const planMatches = (planInboxRetry.data ?? []).filter((row: PortalInboxRow) =>
        row.event_type === 'plan_cycle_approved' && row.object_id === plan.data)
      check('PI5: batch idea approval creates an agent inbox event',
        !planDecision.error && !planInboxBefore.error && !planInboxAfter.error
          && !(planInboxBefore.data ?? []).some((row: PortalInboxRow) => row.event_type === 'plan_cycle_approved' && row.object_id === plan.data)
          && planInboxRow?.object_type === 'plan_cycle'
          && planInboxRow?.payload?.decision === 'approved'
          && !planRetry.error && !planInboxRetry.error && planMatches.length === 1,
        planDecision.error?.message ?? planInboxBefore.error?.message ?? planInboxAfter.error?.message
          ?? planRetry.error?.message ?? planInboxRetry.error?.message
          ?? `before=${planInboxBefore.data?.length ?? 0} after=${planInboxAfter.data?.length ?? 0} retry=${planMatches.length}`)

      const piecePlan = await admin.rpc('agency_upsert_plan_cycle', {
        p_client_id: bClientId,
        p_cycle_key: `rls-piece-week-${RUN_ID}`,
        p_week_start: '2026-08-03', p_week_end: '2026-08-07',
        p_title: 'RLS piece approval', p_direction_summary: 'A second approval surface.',
        p_items: [{
          content_id: ideaContentId, title: 'Selected idea with authored copy', format: 'carousel',
          pillar: 'employer', platforms: ['instagram'], producer: 'the_dot',
          planned_date: '2026-08-03', direction_note: 'Approve this piece.', position: 1,
        }],
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-piece-plan-${RUN_ID}`,
      })
      const ideaInboxConsumer = `rls-idea-inbox-${RUN_ID}`
      const ideaInboxBefore = await admin.rpc('read_portal_inbox', {
        p_consumer_key: ideaInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const ideaDecision = piecePlan.data
        ? await bClient.rpc('record_content_idea_decision', {
          p_content_item_id: identityId, p_plan_cycle_id: piecePlan.data,
          p_plan_cycle_revision: 1, p_decision: 'approved', p_note: null,
        })
        : { data: null, error: new Error('piece plan missing') }
      const ideaInboxAfter = await admin.rpc('read_portal_inbox', {
        p_consumer_key: ideaInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const ideaInboxRow = (ideaInboxAfter.data ?? []).find((row: PortalInboxRow) =>
        row.event_type === 'idea_approved' && row.object_id === identityId)
      const ideaRetry = await bClient.rpc('record_content_idea_decision', {
        p_content_item_id: identityId, p_plan_cycle_id: piecePlan.data,
        p_plan_cycle_revision: 1, p_decision: 'approved', p_note: null,
      })
      const ideaInboxRetry = await admin.rpc('read_portal_inbox', {
        p_consumer_key: ideaInboxConsumer, p_client_id: bClientId, p_limit: 500,
      })
      const ideaMatches = (ideaInboxRetry.data ?? []).filter((row: PortalInboxRow) =>
        row.event_type === 'idea_approved' && row.object_id === identityId)
      check('PI6: per-piece idea approval creates an agent inbox event',
        !ideaDecision.error && !ideaInboxBefore.error && !ideaInboxAfter.error
          && !(ideaInboxBefore.data ?? []).some((row: PortalInboxRow) => row.event_type === 'idea_approved' && row.object_id === identityId)
          && ideaInboxRow?.object_type === 'content_idea'
          && ideaInboxRow?.payload?.decision === 'approved'
          && !ideaRetry.error && !ideaInboxRetry.error && ideaMatches.length === 1,
        ideaDecision.error?.message ?? ideaInboxBefore.error?.message ?? ideaInboxAfter.error?.message
          ?? ideaRetry.error?.message ?? ideaInboxRetry.error?.message
          ?? `before=${ideaInboxBefore.data?.length ?? 0} after=${ideaInboxAfter.data?.length ?? 0} retry=${ideaMatches.length}`)

      // 0039: an agency can record a real out-of-band cycle approval, but the client
      // decider and email/call provenance are durable and immutable. The existing 0034
      // trigger, not the RPC, owns the one inbox event.
      const agencyCycle = await admin.rpc('agency_upsert_plan_cycle', {
        p_client_id: bClientId,
        p_cycle_key: `rls-agency-decision-${RUN_ID}`,
        p_week_start: '2026-08-10', p_week_end: '2026-08-14',
        p_title: 'RLS agency-recorded decision',
        p_direction_summary: 'A real email decision is recorded with durable provenance.',
        p_items: [{
          content_id: B_CONTENT_ID, title: 'Visible main v1', format: 'caption',
          pillar: 'employer', platforms: ['instagram'], producer: 'the_dot',
          planned_date: '2026-08-10', direction_note: 'Agency decision recorder fixture.', position: 1,
        }],
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-agency-cycle-${RUN_ID}`,
      })
      const sourceOccurredAt = new Date(Date.now() - 60_000).toISOString()
      const decisionArgs = {
        p_client_id: bClientId, p_plan_cycle_id: agencyCycle.data, p_revision: 1,
        p_contact_auth_user_id: bUserId, p_decision: 'approved', p_note: null,
        p_decision_source: 'email', p_source_occurred_at: sourceOccurredAt,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-agency-decision-${RUN_ID}`,
      }
      const agencyDecision = agencyCycle.data
        ? await admin.rpc('agency_record_plan_cycle_decision', decisionArgs)
        : { data: null, error: new Error('agency plan missing') }
      const agencyDecisionId = (agencyDecision.data as { id?: string } | null)?.id
      const agencyProvenance = agencyDecisionId
        ? await admin.from('plan_cycle_decision_provenance')
          .select('plan_cycle_decision_id,decision_source,source_occurred_at,recorded_by')
          .eq('plan_cycle_decision_id', agencyDecisionId).single()
        : { data: null, error: new Error('agency decision missing') }
      const agencyCycleRow = agencyCycle.data
        ? await admin.from('plan_cycles').select('status,approved_revision').eq('id', agencyCycle.data).single()
        : { data: null, error: new Error('agency plan missing') }
      const agencyInboxConsumer = `rls-agency-cycle-inbox-${RUN_ID}`
      const agencyInbox = agencyCycle.data
        ? await admin.rpc('read_portal_inbox', {
          p_consumer_key: agencyInboxConsumer, p_client_id: bClientId, p_limit: 500,
        })
        : { data: [], error: new Error('agency plan missing') }
      const agencyExactRetry = agencyCycle.data
        ? await admin.rpc('agency_record_plan_cycle_decision', decisionArgs)
        : { data: null, error: new Error('agency plan missing') }
      const agencyInboxRetry = agencyCycle.data
        ? await admin.rpc('read_portal_inbox', {
          p_consumer_key: agencyInboxConsumer, p_client_id: bClientId, p_limit: 500,
        })
        : { data: [], error: new Error('agency plan missing') }
      const changedContact = agencyCycle.data
        ? await admin.rpc('agency_record_plan_cycle_decision', {
          ...decisionArgs, p_contact_auth_user_id: bViewerUserId,
          p_idempotency_key: `rls-agency-other-contact-${RUN_ID}`,
        })
        : { data: null, error: new Error('agency plan missing') }
      const changedProvenance = agencyCycle.data
        ? await admin.rpc('agency_record_plan_cycle_decision', {
          ...decisionArgs, p_decision_source: 'call',
          p_idempotency_key: `rls-agency-other-source-${RUN_ID}`,
        })
        : { data: null, error: new Error('agency plan missing') }
      const clientProvenanceRead = await bClient.from('plan_cycle_decision_provenance')
        .select('plan_cycle_decision_id').eq('plan_cycle_decision_id', agencyDecisionId ?? '')
      const directProvenanceWrite = await admin.from('plan_cycle_decision_provenance').insert({
        plan_cycle_decision_id: agencyDecisionId,
        decision_source: 'email', source_occurred_at: sourceOccurredAt,
        recorded_by: '00000000-0000-0000-0000-000000000000',
      })
      check('PCD1: agency cycle decisions persist provenance, keep one trigger-owned inbox event, and reject identity/provenance rewrites',
        !agencyDecision.error && !agencyProvenance.error
          && agencyProvenance.data?.decision_source === 'email'
          && new Date(agencyProvenance.data?.source_occurred_at ?? '').toISOString() === sourceOccurredAt
          && !agencyCycleRow.error && agencyCycleRow.data?.status === 'approved'
          && agencyCycleRow.data?.approved_revision === 1
          && !agencyInbox.error && (agencyInbox.data ?? []).filter((row: PortalInboxRow) =>
            row.event_type === 'plan_cycle_approved' && row.object_id === agencyCycle.data).length === 1
          && !agencyExactRetry.error && !agencyInboxRetry.error && (agencyInboxRetry.data ?? []).filter((row: PortalInboxRow) =>
            row.event_type === 'plan_cycle_approved' && row.object_id === agencyCycle.data).length === 1
          && !!changedContact.error && !!changedProvenance.error
          && !!clientProvenanceRead.error && !!directProvenanceWrite.error,
        agencyDecision.error?.message ?? agencyProvenance.error?.message ?? agencyCycleRow.error?.message
          ?? agencyInbox.error?.message ?? agencyExactRetry.error?.message ?? agencyInboxRetry.error?.message
          ?? changedContact.error?.message ?? changedProvenance.error?.message
          ?? clientProvenanceRead.error?.message ?? directProvenanceWrite.error?.message
          ?? 'unexpected agency plan-cycle provenance result')
    }

    {
      const stop = await admin.rpc('set_portal_feature_switch', {
        p_client_id: bClientId, p_feature: 'client_mutations', p_enabled: false,
        p_reason: 'Exercise emergency tenant stop', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-stop-${RUN_ID}`,
      })
      const before = await admin.from('content_ideas').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId)
      const blocked = await bClient.rpc('add_idea', {
        p_client_id: bClientId, p_title: 'blocked after stop', p_body: null,
      })
      const after = await admin.from('content_ideas').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId)
      check('A3: tenant mutation kill switch rejects before any write', !stop.error
        && !!blocked.error && before.count === after.count,
      stop.error?.message ?? blocked.error?.message ?? `before=${before.count} after=${after.count}`)

      const secondDecider = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: bViewerUserId, p_email: B_VIEWER_EMAIL,
        p_name: 'RLS Test Viewer', p_can_decide: true, p_can_comment: false,
        p_can_submit_requests: false, p_can_manage_schedule: false, p_can_use_assistant: false,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-second-decider-${RUN_ID}`,
      })
      check('A4: database rejects a second primary decision-maker', !!secondDecider.error,
        secondDecider.error?.message ?? 'NO ERROR')
      const transfer = await admin.rpc('transfer_portal_primary_decider', {
        p_client_id: bClientId, p_from_auth_user_id: bUserId, p_to_auth_user_id: bViewerUserId,
        p_reason: 'Exercise atomic test transfer', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-transfer-${RUN_ID}`,
      })
      const deciders = await admin.rpc('list_portal_access')
      const activeDeciders = ((deciders.data ?? []) as Array<{
        client_id: string
        auth_user_id: string
        can_decide: boolean
      }>).filter((row) =>
        row.client_id === bClientId && row.can_decide === true)
      check('A5: explicit transfer atomically preserves one primary decision-maker',
        !transfer.error && !deciders.error && activeDeciders.length === 1
          && activeDeciders[0].auth_user_id === bViewerUserId,
        transfer.error?.message ?? deciders.error?.message ?? JSON.stringify(activeDeciders))
    }
  } finally {
    console.log('\n--- Cleanup ---')
    if (bClientId) {
      console.log(`cleanup: disposable tenant ${B_SLUG} remains until the local/staging database reset`)
    }
    if (bUserId) console.log(`cleanup: disposable Auth user ${B_EMAIL} remains until database reset`)
    if (bViewerUserId) console.log(`cleanup: disposable Auth user ${B_VIEWER_EMAIL} remains until database reset`)
  }
}

main()
  .then(() => {
    console.log(`\n=== SUMMARY: ${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} FAILURE(S)`} ===`)
    process.exit(failures === 0 ? 0 : 1)
  })
  .catch((error) => {
    console.error('\nFATAL:', error?.message ?? error)
    process.exit(1)
  })

// PostgREST integration proof for portal tenant isolation and the immutable released-version model.
// This script mutates the configured disposable database with a unique throwaway tenant/user.
// The complete tenant/Auth/data set remains until the required local/staging database reset: the
// approval audit FK intentionally prevents deleting a decision-maker independently.
// Run only after applying 0001..0008 to a disposable/staging database first.
import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { PRIMARY_SOURCE_HOSTS } from '../src/lib/portal/primary-source-policy'

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

function snapshot(
  clientId: string,
  contentId: string,
  version: number,
  title: string,
  body: string,
  blockKey: string,
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
      check('T16: an unconfigured destination fails the approval transaction closed',
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

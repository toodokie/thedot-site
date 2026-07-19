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
const B_CONTENT_ID = 'rls-test-piece'
const B_LEAK_ID = 'rls-test-leak'
const B_HIDDEN_ID = 'rls-test-hidden'
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
    source_path: `/tmp/${contentId}.md`,
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

    const { error: membershipError } = await admin.rpc('upsert_client_membership', {
      p_client_id: bClientId,
      p_auth_user_id: bUserId,
      p_email: B_EMAIL,
      p_name: 'RLS Test B',
    })
    if (membershipError) throw new Error(`membership B: ${membershipError.message}`)
    const forgedMembership = await admin.rpc('upsert_client_membership', {
      p_client_id: bClientId,
      p_auth_user_id: bUserId,
      p_email: 'different@example.com',
      p_name: 'Wrong identity',
    })
    check('S-1: membership RPC rejects an email/auth-user mismatch', !!forgedMembership.error,
      forgedMembership.error?.message ?? 'NO ERROR')

    const initial = await sync([
      snapshot(bClientId, B_CONTENT_ID, 1, 'Visible main v1', 'Visible main body', 'main'),
      snapshot(bClientId, B_LEAK_ID, 1, 'Released leak v1', 'Released body v1', 'leak'),
      snapshot(bClientId, B_HIDDEN_ID, 1, 'Hidden working v1', 'TOP SECRET UNRELEASED', 'hidden'),
    ])
    const byId = new Map(initial.map((row) => [row.content_id, row]))
    const bItemId = byId.get(B_CONTENT_ID)?.item_id
    const bLeakItemId = byId.get(B_LEAK_ID)?.item_id
    const bHiddenItemId = byId.get(B_HIDDEN_ID)?.item_id
    if (!bItemId || !bLeakItemId || !bHiddenItemId) throw new Error('sync did not return all item IDs')

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

    for (const itemId of [bItemId, bLeakItemId]) {
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
    const kansetClient = clientForToken(kansetToken)
    const bClient = clientForToken(bToken)
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

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

    console.log('\n--- Existing tenant-isolated surfaces ---')

    {
      const recommendation = await admin.from('recommendations').insert({
        client_id: bClientId, title: 'B rec', body: 'x', category: 'content',
      })
      const link = await admin.from('links').insert({
        client_id: bClientId, category: 'brand', label: 'B link', url: 'https://example.com',
      })
      const report = await admin.from('report_snapshots').insert({
        client_id: bClientId, period: 'test', platform: 'instagram', metrics: {},
      })
      check('D1: service seeds B read-only surfaces', !recommendation.error && !link.error && !report.error,
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
      const added = await bClient.rpc('add_idea', { p_client_id: bClientId, p_title: 'B idea', p_body: 'first' })
      check('D4: B adds an idea through RPC', !added.error, added.error?.message ?? 'ok')
      const ideaId = added.data as string | null
      const cross = await bClient.rpc('add_idea', { p_client_id: kansetClientId, p_title: 'cross' })
      check('D5: cross-tenant idea is rejected', !!cross.error, cross.error?.message ?? 'NO ERROR')
      if (ideaId) {
        const edited = await bClient.rpc('edit_idea', { p_idea_id: ideaId, p_title: 'B idea edited' })
        check('D6: B edits its own idea through RPC', !edited.error, edited.error?.message ?? 'ok')
      }
      const direct = await bClient.from('content_ideas').insert({
        client_id: bClientId, author_type: 'client', author_name: 'x', title: 'direct',
      })
      check('D7: direct authenticated idea write is rejected', !!direct.error, direct.error?.message ?? 'NO ERROR')
    }
  } finally {
    console.log('\n--- Cleanup ---')
    if (bClientId) {
      console.log(`cleanup: disposable tenant ${B_SLUG} remains until the local/staging database reset`)
    }
    if (bUserId) console.log(`cleanup: disposable Auth user ${B_EMAIL} remains until database reset`)
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

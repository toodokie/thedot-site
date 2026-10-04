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
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import {
  REVIEW_PREVIEW_BUCKET, REVIEW_PREVIEW_COLUMNS, signReviewPreview, type ReviewPreviewRow,
} from '../src/lib/portal/review-preview-core'
import { purgePreviewsAfterPublication, runPreviewRetention } from '../src/lib/portal/review-preview-retention'
import {
  uploadReviewPreview, type PreviewTools, type ReviewPreviewRequest,
} from '../src/lib/portal/review-preview-upload'

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
// This test suite creates tenants, auth users, content, approvals, and agency-global
// tasks. The production portal project is NEVER a disposable target. Do not weaken this
// with PORTAL_RLS_ALLOW_REMOTE: that escape hatch is only for an explicitly disposable
// staging project.
const PRODUCTION_SUPABASE_HOST = 'ltotkkpytvtcgelrgdkg.supabase.co'
if (supabaseHost === PRODUCTION_SUPABASE_HOST) {
  throw new Error('Refusing RLS test against the production Kanset Supabase project')
}
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
const B_BUNDLE_ID = 'rls-test-request-bundle'
const KANSET_SLUG = 'kanset'
const KANSET_EMAIL = 'info@thedotcreative.co'

// Unwrapped service-role client, for any check that must see the release media guard (0092) bare.
const rawAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Release media guard (0092): a release needs a review asset, a portal preview or a design link.
// Fixtures written to test other rules release bare text pieces, so before each release this
// gives the piece an item-level design link (placeholder URL, same style as seed-rls-local.ts)
// when nothing is attached yet. The release then passes the guard legitimately. Items listed in
// PREVIEW_ONLY get a portal preview instead: a design link or review asset would also satisfy the
// final-package design check, and FP1 needs a released piece that has neither.
const PREVIEW_ONLY = new Set<string>()
const admin = new Proxy(rawAdmin, {
  get(target, property, receiver) {
    if (property !== 'rpc') return Reflect.get(target, property, receiver)
    const rpc = target.rpc.bind(target)
    return ((fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => {
      if ((fn !== 'mark_content_ready' && fn !== 'record_content_courtesy_release') || !args) {
        return rpc(fn, args, options as never)
      }
      return (async () => {
        const item = await target.from('content_items').select('client_id, content_id')
          .eq('id', args.p_content_id as string).maybeSingle()
        if (item.data) {
          const status = await rpc('agency_release_media_status', {
            p_content_item_id: args.p_content_id, p_content_version: args.p_content_version,
          })
          const media = status.data as {
            review_assets?: number; previews?: number; design_link?: boolean
          } | null
          if (media && !media.review_assets && !media.previews && !media.design_link) {
            if (PREVIEW_ONLY.has(args.p_content_id as string)) {
              const sha = 'a'.repeat(64)
              const prefix = `${item.data.client_id}/${args.p_content_id}/v${args.p_content_version}/fixture/${sha.slice(0, 16)}/`
              const previewResult = await rpc('agency_register_review_preview', {
                p_client_id: item.data.client_id, p_content_id: item.data.content_id,
                p_content_version: args.p_content_version, p_preview_key: 'fixture',
                p_review_asset_key: null, p_media_kind: 'pages', p_object_prefix: prefix,
                p_video_path: null, p_poster_path: null,
                p_frames: [{ path: `${prefix}page-1.jpg`, label: 'Page 1' }],
                p_width_px: 1080, p_height_px: 1350, p_duration_seconds: null,
                p_byte_total: 1000, p_source_sha256: sha, p_actor_key: 'thedot-admin',
              })
              if (previewResult.error) console.error('fixture preview:', previewResult.error.message)
            } else {
              await rpc('set_content_design_links', {
                p_client_id: item.data.client_id, p_content_id: item.data.content_id,
                p_canva_url: 'https://www.canva.com/design/RLSFIXTURE/view', p_drive_url: null,
                p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
              })
            }
          }
        }
        return rpc(fn, args, options as never)
      })()
    }) as unknown as typeof target.rpc
  },
})
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
  payload: { decision?: string; comment_id?: string }
  requires_reconciliation: boolean
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

    const bundleV1 = snapshot(bClientId, B_BUNDLE_ID, 1, 'Bundled request workflow v1', 'Caption base', 'caption')
    bundleV1.copy_blocks = [
      { key: 'caption', label: 'Caption', body: 'Caption base' },
      { key: 'script', label: 'Script', body: 'Script base' },
    ]
    const initial = await sync([
      snapshot(bClientId, B_CONTENT_ID, 1, 'Visible main v1', 'Visible main body', 'main'),
      snapshot(bClientId, B_LEAK_ID, 1, 'Released leak v1', 'Released body v1', 'leak'),
      snapshot(bClientId, B_HIDDEN_ID, 1, 'Hidden working v1', 'TOP SECRET UNRELEASED', 'hidden'),
      snapshot(bClientId, B_REQUEST_ID, 1, 'Request workflow v1', 'Original request body', 'caption'),
      bundleV1,
    ])
    const byId = new Map(initial.map((row) => [row.content_id, row]))
    const bItemId = byId.get(B_CONTENT_ID)?.item_id
    const bLeakItemId = byId.get(B_LEAK_ID)?.item_id
    const bHiddenItemId = byId.get(B_HIDDEN_ID)?.item_id
    const bRequestItemId = byId.get(B_REQUEST_ID)?.item_id
    const bBundleItemId = byId.get(B_BUNDLE_ID)?.item_id
    if (!bItemId || !bLeakItemId || !bHiddenItemId || !bRequestItemId || !bBundleItemId) throw new Error('sync did not return all item IDs')

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

    PREVIEW_ONLY.add(bRequestItemId)
    for (const itemId of [bItemId, bLeakItemId, bRequestItemId, bBundleItemId]) {
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
      !viewerRead.error && viewerRead.data?.length === 4
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
      // 0050: a released fact-checked copy may be visible for plan feedback, but it
      // cannot record either final-package decision before a client-safe design link
      // exists. The check belongs at the RPC boundary, not only in the page UI.
      const noDesignBefore = await bClient.from('content_with_state')
        .select('current_decision').eq('id', bRequestItemId).single()
      const noDesign = await bClient.rpc('record_content_decision', {
        p_content_id: bRequestItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const noDesignAfter = await bClient.from('content_with_state')
        .select('current_decision').eq('id', bRequestItemId).single()
      const mainDesign = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID,
        p_canva_url: 'https://www.canva.com/design/FINALPACKAGE/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-final-package-design-${RUN_ID}`,
      })
      check('FP1: final package decision rejects copy-only review and accepts a linked design',
        !!noDesign.error && noDesign.error.message.includes('final_package_design_required') && !mainDesign.error
          && noDesignBefore.data?.current_decision === null && noDesignAfter.data?.current_decision === null,
        noDesign.error?.message ?? mainDesign.error?.message ?? `before=${noDesignBefore.data?.current_decision} after=${noDesignAfter.data?.current_decision}`)

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

      const pendingEditState = await bClient.from('content_with_state')
        .select('client_state,current_decision,revision_in_progress').eq('id', bRequestItemId).single()
      check('R2b: a pending client edit immediately returns the released piece to The Dot',
        !pendingEditState.error && pendingEditState.data?.client_state === 'with_dot'
          && pendingEditState.data?.current_decision === null
          && pendingEditState.data?.revision_in_progress === false,
        pendingEditState.error?.message ?? JSON.stringify(pendingEditState.data))

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

      const browserCandidate = await bClient.rpc('upsert_content_request_review_candidate', {
        p_request_id: editId, p_candidate_text: 'Prepared request body v2',
        p_change_summary: 'Accepted the requested wording.', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const candidateKey = randomUUID()
      const candidate = await admin.rpc('upsert_content_request_review_candidate', {
        p_request_id: editId, p_candidate_text: 'Prepared request body v2',
        p_change_summary: 'Accepted the requested wording.', p_actor_key: 'thedot-admin',
        p_idempotency_key: candidateKey,
      })
      const candidateRetry = await admin.rpc('upsert_content_request_review_candidate', {
        p_request_id: editId, p_candidate_text: 'Prepared request body v2',
        p_change_summary: 'Accepted the requested wording.', p_actor_key: 'thedot-admin',
        p_idempotency_key: candidateKey,
      })
      const hiddenCandidate = await bClient.from('content_request_review_candidates')
        .select('request_id,status').eq('request_id', editId)
      const crossCandidate = await kansetClient.from('content_request_review_candidates')
        .select('request_id,status').eq('request_id', editId)
      const candidateRow = await admin.from('content_request_review_candidates')
        .select('request_id,status,revision,candidate_text,change_summary').eq('request_id', editId).single()
      const browserApproval = await bClient.rpc('approve_content_request_review_candidate', {
        p_request_id: editId, p_expected_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const staleApproval = await admin.rpc('approve_content_request_review_candidate', {
        p_request_id: editId, p_expected_revision: 2,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const approval = await admin.rpc('approve_content_request_review_candidate', {
        p_request_id: editId, p_expected_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const approvedCandidate = await admin.from('content_request_review_candidates')
        .select('status,revision,approved_at').eq('request_id', editId).single()
      const requestAfterApproval = await bClient.from('content_change_requests_client')
        .select('status').eq('id', editId).single()
      check('R4aa: agency-only candidate save is idempotent and invisible to both client tenants',
        !!browserCandidate.error && !candidate.error && !candidateRetry.error
          && !!hiddenCandidate.error && !!crossCandidate.error
          && candidateRow.data?.status === 'draft' && candidateRow.data?.revision === 1
          && candidateRow.data?.candidate_text === 'Prepared request body v2',
        browserCandidate.error?.message ?? candidate.error?.message ?? candidateRetry.error?.message
          ?? JSON.stringify({ own: hiddenCandidate.data, cross: crossCandidate.data, row: candidateRow.data }))
      check('R4ab: only agency can approve the exact candidate revision without advancing the request',
        !!browserApproval.error && !!staleApproval.error && !approval.error
          && approvedCandidate.data?.status === 'approved'
          && approvedCandidate.data?.revision === 1 && !!approvedCandidate.data?.approved_at
          && requestAfterApproval.data?.status === 'pending',
        browserApproval.error?.message ?? staleApproval.error?.message ?? approval.error?.message
          ?? JSON.stringify({ candidate: approvedCandidate.data, request: requestAfterApproval.data }))

      const started = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: editId, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin', p_idempotency_key: editId,
      })
      if (started.error) throw new Error(`start edit reconciliation: ${started.error.message}`)
      const interrupted = await admin.rpc('resolve_content_request', {
        p_request_id: editId, p_status: 'conflicted',
        p_reason: 'Simulated local tool interruption before portal sync.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const clientResume = await bClient.rpc('resume_content_request_reconciliation', {
        p_request_id: editId, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const resumed = await admin.rpc('resume_content_request_reconciliation', {
        p_request_id: editId, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const resumedRow = await bClient.from('content_change_requests_client')
        .select('status').eq('id', editId).single()
      const resumedActivity = await bClient.from('activity_log').select('event_type')
        .eq('event_type', 'request_reopened').eq('content_id', bRequestItemId)
      check('R4b: only service can resume an interrupted reconciliation without changing the client base version',
        !interrupted.error && !!clientResume.error && !resumed.error
          && resumedRow.data?.status === 'applying' && resumedActivity.data?.length === 1,
        interrupted.error?.message ?? clientResume.error?.message ?? resumed.error?.message
          ?? JSON.stringify({ request: resumedRow.data, activity: resumedActivity.data }))
      const begin = await admin.rpc('begin_content_request_revision', {
        p_request_id: editId, p_content_id: bRequestItemId, p_content_version: 1,
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
        .select('version,client_body,client_state').eq('id', bRequestItemId).single()
      const preparedRow = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key').eq('id', editId).single()
      check('R5: prepared edit keeps released v1 body visible while the request stays in progress',
        !prepared.error && !stillV1.error && stillV1.data?.version === 1
          && stillV1.data?.client_body === 'Original request body'
          && stillV1.data?.client_state === 'with_dot'
          && preparedRow.data?.status === 'prepared' && preparedRow.data?.canonical_content_key === B_REQUEST_ID,
        prepared.error?.message ?? stillV1.error?.message ?? JSON.stringify(preparedRow.data))
      const release = await admin.rpc('mark_content_ready', {
        p_content_id: bRequestItemId, p_content_version: 2,
      })
      const appliedRow = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key,canonical_version').eq('id', editId).single()
      const nowV2 = await bClient.from('content_with_state').select('version,client_body,client_state')
        .eq('id', bRequestItemId).single()
      check('R6: release gate atomically makes prepared edit applied and links exact v2',
        !release.error && appliedRow.data?.status === 'applied'
          && appliedRow.data?.canonical_content_key === B_REQUEST_ID
          && appliedRow.data?.canonical_version === 2 && nowV2.data?.version === 2
          && nowV2.data?.client_body === 'Prepared request body v2'
          && nowV2.data?.client_state === 'needs_review',
        release.error?.message ?? appliedRow.error?.message ?? JSON.stringify(nowV2.data))

      const ownBaseCopy = await bClient.rpc('get_content_request_base_copies', {
        p_request_ids: [editId],
      })
      const crossBaseCopy = await kansetClient.rpc('get_content_request_base_copies', {
        p_request_ids: [editId],
      })
      const anonBaseCopy = await anonClient.rpc('get_content_request_base_copies', {
        p_request_ids: [editId],
      })
      const directHistoricalVersions = await bClient.from('content_item_versions')
        .select('version,client_body').eq('content_item_id', bRequestItemId)
      check('R6c: request history exposes only the tenant-owned base block without opening historical versions',
        !ownBaseCopy.error
          && ownBaseCopy.data?.length === 1
          && ownBaseCopy.data[0]?.request_id === editId
          && ownBaseCopy.data[0]?.base_copy === 'Original request body'
          && !crossBaseCopy.error && (crossBaseCopy.data ?? []).length === 0
          && !!anonBaseCopy.error
          && !directHistoricalVersions.error
          && directHistoricalVersions.data?.length === 1
          && directHistoricalVersions.data[0]?.version === 2,
        ownBaseCopy.error?.message ?? crossBaseCopy.error?.message
          ?? anonBaseCopy.error?.message ?? directHistoricalVersions.error?.message
          ?? JSON.stringify({ own: ownBaseCopy.data, cross: crossBaseCopy.data,
            versions: directHistoricalVersions.data }))

      const bundleCaption = await bClient.rpc('request_content_edit', {
        p_content_id: bBundleItemId, p_content_version: 1, p_block_key: 'caption',
        p_proposed_text: '  Caption requested by Maria. \t\r\nSecond line.  ', p_idempotency_key: randomUUID(),
      })
      const bundleScript = await bClient.rpc('request_content_edit', {
        p_content_id: bBundleItemId, p_content_version: 1, p_block_key: 'script',
        p_proposed_text: 'Script requested by Maria.\r\nSecond line.\t', p_idempotency_key: randomUUID(),
      })
      const bundleCaptionId = (bundleCaption.data as { id?: string } | null)?.id
      const bundleScriptId = (bundleScript.data as { id?: string } | null)?.id
      if (!bundleCaptionId || !bundleScriptId) throw new Error(`bundle requests unavailable: ${bundleCaption.error?.message ?? bundleScript.error?.message ?? 'missing IDs'}`)
      const bundleDigests = await admin.from('notification_outbox')
        .select('template_key,status,next_attempt_at,related_url,bundle_event_count,bundle_edit_count,bundle_comment_count,bundle_targets')
        .eq('client_id', bClientId)
        .eq('bundle_key', `piece-edit:${bBundleItemId}`)
      const bundleDigestRows = bundleDigests.data ?? []
      check('R6aa: same-piece edits share one linked agency digest with a rolling quiet window',
        !bundleDigests.error
          && bundleDigestRows.length === 1
          && bundleDigestRows[0]?.template_key === 'agency_piece_digest'
          && bundleDigestRows[0]?.status === 'pending'
          && bundleDigestRows[0]?.bundle_event_count === 2
          && bundleDigestRows[0]?.bundle_edit_count === 2
          && bundleDigestRows[0]?.bundle_comment_count === 0
          && bundleDigestRows[0]?.related_url === `https://www.thedotcreative.co/admin/portal/pieces/${B_BUNDLE_ID}`
          && new Set(bundleDigestRows[0]?.bundle_targets ?? []).size === 2
          && new Date(bundleDigestRows[0]?.next_attempt_at ?? 0).getTime() > Date.now(),
        bundleDigests.error?.message ?? JSON.stringify(bundleDigestRows))
      const normalizedIntake = await admin.from('content_change_requests')
        .select('id,payload').in('id', [bundleCaptionId, bundleScriptId])
      const normalizedById = new Map((normalizedIntake.data ?? []).map((row) => [row.id, row.payload as { proposed_text?: string }]))
      check('R6a: edit intake removes invisible line-end whitespace before persistence',
        !normalizedIntake.error
          && normalizedById.get(bundleCaptionId)?.proposed_text === 'Caption requested by Maria.\nSecond line.'
          && normalizedById.get(bundleScriptId)?.proposed_text === 'Script requested by Maria.\nSecond line.',
        normalizedIntake.error?.message ?? JSON.stringify(normalizedIntake.data))

      const bundleCaptionCandidate = await admin.rpc('upsert_content_request_review_candidate', {
        p_request_id: bundleCaptionId,
        p_candidate_text: 'Caption safe merge approved by The Dot.\nSecond line retained.',
        p_change_summary: 'Keeps Maria\'s requested direction and restores the complete caption block.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const bundleScriptCandidate = await admin.rpc('upsert_content_request_review_candidate', {
        p_request_id: bundleScriptId,
        p_candidate_text: 'Script safe merge approved by The Dot.\nSecond line retained.',
        p_change_summary: 'Keeps Maria\'s requested direction and restores the complete script block.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const bundleCaptionApproval = await admin.rpc('approve_content_request_review_candidate', {
        p_request_id: bundleCaptionId, p_expected_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const bundleScriptApproval = await admin.rpc('approve_content_request_review_candidate', {
        p_request_id: bundleScriptId, p_expected_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })

      const bundleStart = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: bundleCaptionId, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin', p_idempotency_key: bundleCaptionId,
      })
      const bundleBegin = await admin.rpc('begin_content_request_revision', {
        p_request_id: bundleCaptionId, p_content_id: bBundleItemId, p_content_version: 1,
      })
      const bundleV2 = snapshot(bClientId, B_BUNDLE_ID, 2, 'Bundled request workflow v2', 'Caption requested by Maria.', 'caption')
      bundleV2.copy_blocks = [
        { key: 'caption', label: 'Caption', body: 'Caption safe merge approved by The Dot.\nSecond line retained.' },
        { key: 'script', label: 'Script', body: 'Script safe merge approved by The Dot.\nSecond line retained.' },
      ]
      bundleV2.source_commit_sha = '3'.repeat(40)
      const bundleSync = await sync([bundleV2])
      const browserBundleWriter = await bClient.rpc('mark_content_request_bundle_prepared', {
        p_request_ids: [bundleCaptionId, bundleScriptId], p_commit_sha: '3'.repeat(40),
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const bundlePrepared = await admin.rpc('mark_content_request_bundle_prepared', {
        p_request_ids: [bundleCaptionId, bundleScriptId], p_commit_sha: '3'.repeat(40),
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const bundleRows = await bClient.from('content_change_requests_client')
        .select('id,status,canonical_version').in('id', [bundleCaptionId, bundleScriptId])
      const bundleRelease = await admin.rpc('mark_content_ready', {
        p_content_id: bBundleItemId, p_content_version: 2,
      })
      const bundleApplied = await bClient.from('content_change_requests_client')
        .select('id,status,canonical_version').in('id', [bundleCaptionId, bundleScriptId])
      check('R6b: two same-version edits are prepared and released as one exact audited revision',
        !bundleCaptionCandidate.error && !bundleScriptCandidate.error
          && !bundleCaptionApproval.error && !bundleScriptApproval.error
          && !bundleStart.error && !bundleBegin.error && bundleSync.length === 1 && !!browserBundleWriter.error
          && !bundlePrepared.error && bundleRows.data?.length === 2
          && bundleRows.data.every((row) => row.status === 'prepared' && row.canonical_version === 2)
          && !bundleRelease.error && bundleApplied.data?.length === 2
          && bundleApplied.data.every((row) => row.status === 'applied' && row.canonical_version === 2),
        bundleCaptionCandidate.error?.message ?? bundleScriptCandidate.error?.message
          ?? bundleCaptionApproval.error?.message ?? bundleScriptApproval.error?.message
          ?? bundleStart.error?.message ?? bundleBegin.error?.message ?? browserBundleWriter.error?.message
          ?? bundlePrepared.error?.message ?? bundleRelease.error?.message
          ?? JSON.stringify({ prepared: bundleRows.data, applied: bundleApplied.data }))
    }

    {
      const createKey = randomUUID()
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      const desiredDate = tomorrow.toISOString().slice(0, 10)
      const created = await bClient.rpc('request_content_create', {
        p_client_id: bClientId, p_title: 'Requested from the portal',
        p_brief: 'A safe client brief for a new piece.', p_platforms: ['linkedin'],
        p_desired_date: desiredDate, p_notes: null, p_idempotency_key: createKey,
      })
      const createId = (created.data as { id?: string } | null)?.id
      const crossCreate = await bClient.rpc('request_content_create', {
        p_client_id: kansetClientId, p_title: 'Cross tenant', p_brief: 'Must fail.',
        p_platforms: ['instagram'], p_desired_date: desiredDate, p_notes: null,
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

    console.log('\n--- Slice 34 client-request conversations ---')

    {
      const request = await bClient.rpc('request_content_edit', {
        p_content_id: bRequestItemId, p_content_version: 2, p_block_key: 'caption',
        p_proposed_text: 'Conversation request body v3', p_idempotency_key: randomUUID(),
      })
      const requestId = (request.data as { id?: string } | null)?.id
      if (!requestId) throw new Error(`conversation request missing: ${request.error?.message ?? 'no id'}`)
      const clientKey = randomUUID()
      const clientReply = await bClient.rpc('reply_to_content_request_as_client', {
        p_request_id: requestId, p_body: 'Could we keep the longer caption as the reviewed version?',
        p_idempotency_key: clientKey,
      })
      const clientRetry = await bClient.rpc('reply_to_content_request_as_client', {
        p_request_id: requestId, p_body: 'Could we keep the longer caption as the reviewed version?',
        p_idempotency_key: clientKey,
      })
      const directMessage = await bClient.from('content_change_request_messages').insert({
        client_id: bClientId, request_id: requestId, author_type: 'client', author_name: 'forged',
        body: 'forged direct write', idempotency_key: randomUUID(), message_fingerprint: '0'.repeat(64),
      })
      const crossReply = await kansetClient.rpc('reply_to_content_request_as_client', {
        p_request_id: requestId, p_body: 'cross tenant reply', p_idempotency_key: randomUUID(),
      })
      const agencyKey = randomUUID()
      const agencyReply = await admin.rpc('reply_to_content_request', {
        p_request_id: requestId, p_body: 'Yes. We will use one primary caption for review and adapt the other platform versions.',
        p_close: true, p_actor_key: 'thedot-admin', p_idempotency_key: agencyKey,
      })
      const agencyRetry = await admin.rpc('reply_to_content_request', {
        p_request_id: requestId, p_body: 'Yes. We will use one primary caption for review and adapt the other platform versions.',
        p_close: true, p_actor_key: 'thedot-admin', p_idempotency_key: agencyKey,
      })
      const requestRow = await bClient.from('content_change_requests_client')
        .select('status,resolution_note').eq('id', requestId).single()
      const thread = await bClient.from('content_change_request_messages')
        .select('author_type,body').eq('request_id', requestId).order('created_at')
      const crossRead = await kansetClient.from('content_change_request_messages')
        .select('id').eq('request_id', requestId)
      const browserAgencyRpc = await bClient.rpc('reply_to_content_request', {
        p_request_id: requestId, p_body: 'forged agency reply', p_close: true,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('R11: client request reply is idempotent and direct message writes are denied',
        !clientReply.error && !clientRetry.error && !!directMessage.error,
        clientReply.error?.message ?? clientRetry.error?.message ?? directMessage.error?.message ?? 'NO ERROR')
      check('R12: agency can answer a request without pretending the copy was applied',
        !agencyReply.error && !agencyRetry.error && requestRow.data?.status === 'answered'
          && requestRow.data?.resolution_note === 'Answered in the portal. No copy change was requested.',
        agencyReply.error?.message ?? agencyRetry.error?.message ?? requestRow.error?.message ?? JSON.stringify(requestRow.data))
      check('R13: request thread stays tenant-scoped and agency writer is browser-denied',
        !thread.error && (thread.data ?? []).length === 2
          && thread.data?.[0]?.author_type === 'client' && thread.data?.[1]?.author_type === 'anastasia'
          && !crossRead.error && (crossRead.data ?? []).length === 0 && !!crossReply.error && !!browserAgencyRpc.error,
        thread.error?.message ?? crossRead.error?.message ?? crossReply.error?.message
          ?? browserAgencyRpc.error?.message ?? JSON.stringify(thread.data))
      const reopened = await bClient.rpc('reply_to_content_request_as_client', {
        p_request_id: requestId, p_body: 'Thank you. One more clarification, please.', p_idempotency_key: randomUUID(),
      })
      const reopenedRow = await bClient.from('content_change_requests_client').select('status,resolution_note')
        .eq('id', requestId).single()
      const inboxRows = await admin.rpc('read_portal_inbox', {
        p_consumer_key: `rls-request-reply-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
      })
      const requestReplyEvents: PortalInboxRow[] = (inboxRows.data ?? []).filter((row: PortalInboxRow) =>
        row.event_type === 'request_replied' && row.object_id === requestId,
      )
      check('R14: a client follow-up reopens an answered request for the agency',
        !reopened.error && reopenedRow.data?.status === 'pending' && reopenedRow.data?.resolution_note === null
          && !inboxRows.error && requestReplyEvents.length === 2
          && requestReplyEvents.every((row) => row.requires_reconciliation === true),
        reopened.error?.message ?? reopenedRow.error?.message ?? inboxRows.error?.message
          ?? JSON.stringify({ request: reopenedRow.data, inbox: requestReplyEvents }))

      const recoveryKey = randomUUID()
      const browserRecovery = await bClient.rpc('supersede_content_request_with_released_version', {
        p_request_id: requestId, p_content_id: bRequestItemId, p_content_version: 2,
        p_note: 'A later released version is the current review package.',
        p_actor_key: 'thedot-admin', p_idempotency_key: recoveryKey,
      })
      const wrongVersion = await admin.rpc('supersede_content_request_with_released_version', {
        p_request_id: requestId, p_content_id: bRequestItemId, p_content_version: 1,
        p_note: 'A later released version is the current review package.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const recovery = await admin.rpc('supersede_content_request_with_released_version', {
        p_request_id: requestId, p_content_id: bRequestItemId, p_content_version: 2,
        p_note: 'A later released version is the current review package.',
        p_actor_key: 'thedot-admin', p_idempotency_key: recoveryKey,
      })
      const recoveryRetry = await admin.rpc('supersede_content_request_with_released_version', {
        p_request_id: requestId, p_content_id: bRequestItemId, p_content_version: 2,
        p_note: 'A later released version is the current review package.',
        p_actor_key: 'thedot-admin', p_idempotency_key: recoveryKey,
      })
      const recoveredRow = await bClient.from('content_change_requests_client')
        .select('status,canonical_content_key,canonical_version,resolution_note').eq('id', requestId).single()
      const recoveryInbox = await admin.rpc('read_portal_inbox', {
        p_consumer_key: `rls-request-recovery-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
      })
      const recoveryEvents: PortalInboxRow[] = (recoveryInbox.data ?? []).filter((row: PortalInboxRow) =>
        row.event_type === 'request_superseded' && row.object_id === requestId,
      )
      check('R15: only service role can truthfully supersede a stale pending request with its current released version',
        !!browserRecovery.error && !!wrongVersion.error && !recovery.error && !recoveryRetry.error
          && recoveredRow.data?.status === 'superseded'
          && recoveredRow.data?.canonical_content_key === B_REQUEST_ID
          && recoveredRow.data?.canonical_version === 2
          && recoveredRow.data?.resolution_note === 'A later released version is the current review package.'
          && !recoveryInbox.error && recoveryEvents.length === 1
          && recoveryEvents[0].requires_reconciliation === false,
        browserRecovery.error?.message ?? wrongVersion.error?.message ?? recovery.error?.message
          ?? recoveryRetry.error?.message ?? recoveredRow.error?.message ?? recoveryInbox.error?.message
          ?? JSON.stringify({ row: recoveredRow.data, events: recoveryEvents }))

      // The two writers share the content row lock. A client edit that wins first blocks a generic
      // agency revision, while an opened agency revision blocks a later browser edit. This is the
      // real race closure behind update-portal's preflight warning.
      const pendingRaceId = `rls-revision-pending-${RUN_ID}`
      const [pendingRaceSync] = await sync([
        snapshot(bClientId, pendingRaceId, 1, 'Pending revision race', 'Pending race body', 'caption'),
      ])
      const pendingRaceItemId = pendingRaceSync.item_id
      const pendingRaceReady = await admin.rpc('mark_content_ready', {
        p_content_id: pendingRaceItemId, p_content_version: 1,
      })
      const pendingRaceRequest = await bClient.rpc('request_content_edit', {
        p_content_id: pendingRaceItemId, p_content_version: 1, p_block_key: 'caption',
        p_proposed_text: 'Client edit wins the race.', p_idempotency_key: randomUUID(),
      })
      const blockedAgencyRevision = await admin.rpc('begin_content_revision', {
        p_content_id: pendingRaceItemId, p_content_version: 1,
      })

      const agencyRaceId = `rls-revision-agency-${RUN_ID}`
      const [agencyRaceSync] = await sync([
        snapshot(bClientId, agencyRaceId, 1, 'Agency revision race', 'Agency race body', 'caption'),
      ])
      const agencyRaceItemId = agencyRaceSync.item_id
      const agencyRaceReady = await admin.rpc('mark_content_ready', {
        p_content_id: agencyRaceItemId, p_content_version: 1,
      })
      const openedAgencyRevision = await admin.rpc('begin_content_revision', {
        p_content_id: agencyRaceItemId, p_content_version: 1,
      })
      const blockedClientEdit = await bClient.rpc('request_content_edit', {
        p_content_id: agencyRaceItemId, p_content_version: 1, p_block_key: 'caption',
        p_proposed_text: 'Client edit loses the race.', p_idempotency_key: randomUUID(),
      })
      check('R16: a client edit and an agency revision cannot cross and strand each other',
        !pendingRaceReady.error && !pendingRaceRequest.error && !!blockedAgencyRevision.error
          && !agencyRaceReady.error && !openedAgencyRevision.error && !!blockedClientEdit.error,
        pendingRaceReady.error?.message ?? pendingRaceRequest.error?.message ?? blockedAgencyRevision.error?.message
          ?? agencyRaceReady.error?.message ?? openedAgencyRevision.error?.message ?? blockedClientEdit.error?.message
          ?? 'NO ERROR')

      // A courtesy release is deliberately agency-only and version-bound. It clears the
      // client queue without inventing an approval row, then permits the normal evidence
      // writer to record an already-live studio cut for that exact released version.
      const courtesyContentId = `rls-courtesy-${RUN_ID}`
      const [courtesySync] = await sync([
        snapshot(bClientId, courtesyContentId, 1, 'Courtesy studio short', 'Studio-owned short body', 'youtube-short', {
          platforms: ['youtube'], producer: 'studio', fact_check_scope: 'not_applicable',
          fact_check_exemption: 'Studio-owned brand clip with no regulated claim.', fact_check_ledger: [],
        }),
      ])
      const courtesyItemId = courtesySync.item_id
      const courtesyReady = await admin.rpc('mark_content_ready', {
        p_content_id: courtesyItemId, p_content_version: 1,
      })
      const browserCourtesy = await bClient.rpc('record_content_courtesy_release', {
        p_content_id: courtesyItemId, p_content_version: 1,
        p_reason: 'Studio-owned short released as a courtesy review, no client decision required.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const courtesyKey = randomUUID()
      const courtesyArgs = {
        p_content_id: courtesyItemId, p_content_version: 1,
        p_reason: 'Studio-owned short released as a courtesy review, no client decision required.',
        p_actor_key: 'thedot-admin', p_idempotency_key: courtesyKey,
      }
      const courtesy = await admin.rpc('record_content_courtesy_release', courtesyArgs)
      const courtesyRetry = await admin.rpc('record_content_courtesy_release', courtesyArgs)
      const courtesyView = await bClient.from('content_with_state')
        .select('status,current_decision,client_state').eq('id', courtesyItemId).single()
      const courtesyApproval = await admin.from('approvals').select('id')
        .eq('content_id', courtesyItemId).eq('content_version', 1)
      const courtesyRows = await admin.from('content_courtesy_releases')
        .select('id,content_version').eq('content_id', courtesyItemId)
      const browserCourtesyRows = await bClient.from('content_courtesy_releases').select('id')
      const courtesySchedule = await admin.from('content_schedule_targets')
        .select('id,destination').eq('content_id', courtesyItemId).eq('content_version', 1).single()
      const courtesyPublication = await admin.from('content_publication_targets')
        .select('id').eq('content_id', courtesyItemId).eq('content_version', 1).single()
      const { data: courtesyEvidenceId, error: courtesyEvidenceError } = await admin.rpc('register_publication_evidence', {
        p_client_id: bClientId, p_actor_key: 'thedot-admin', p_evidence_kind: 'yt_check',
        p_object_key: null, p_evidence_url: 'https://youtube.com/shorts/rls-courtesy-proof',
        p_attestation_note: null, p_captured_at: new Date().toISOString(), p_sha256: null,
        p_mime_type: null, p_byte_length: null, p_idempotency_key: `rls-courtesy-evidence-${RUN_ID}`,
      })
      const courtesyPublicationWrite = courtesyPublication.data && courtesyEvidenceId
        ? await admin.rpc('record_publication_observation', {
          p_publication_target_id: courtesyPublication.data.id, p_provider_state: 'live',
          p_live_url: 'https://youtube.com/shorts/rls-courtesy-live',
          p_published_at: new Date(Date.now() - 60_000).toISOString(), p_visibility: 'public',
          p_evidence_id: courtesyEvidenceId, p_actor_key: 'thedot-admin', p_source_type: 'manual',
          p_reconciliation_status: 'verified', p_provider_object_id: 'rls-courtesy-live',
          p_observed_title: 'Courtesy studio short', p_observed_text: null,
          p_observation_key: `rls-courtesy-publication-${RUN_ID}`,
          p_supersedes_observation_id: null, p_verification_note: 'Public YouTube Short reviewed.',
        }) : { data: null, error: courtesyEvidenceError ?? new Error('courtesy publication target missing') }
      check('R17: agency-only courtesy release clears the review queue without fabricating approval and permits normal evidence-backed publication',
        !courtesyReady.error && !!browserCourtesy.error && !courtesy.error && !courtesyRetry.error
          && courtesy.data?.courtesy_release_id === courtesyRetry.data?.courtesy_release_id
          && !courtesyView.error && courtesyView.data?.status === 'approved'
          && courtesyView.data?.current_decision === null && courtesyView.data?.client_state === 'approved'
          && !courtesyApproval.error && courtesyApproval.data?.length === 0
          && !courtesyRows.error && courtesyRows.data?.length === 1 && courtesyRows.data[0]?.content_version === 1
          && !!browserCourtesyRows.error && !courtesySchedule.error && courtesySchedule.data?.destination === 'youtube'
          && !courtesyPublication.error && !courtesyPublicationWrite.error,
        courtesyReady.error?.message ?? browserCourtesy.error?.message ?? courtesy.error?.message
          ?? courtesyRetry.error?.message ?? courtesyView.error?.message ?? courtesyApproval.error?.message
          ?? courtesyRows.error?.message ?? browserCourtesyRows.error?.message ?? courtesySchedule.error?.message
          ?? courtesyPublication.error?.message ?? courtesyEvidenceError?.message ?? courtesyPublicationWrite.error?.message
          ?? JSON.stringify({ view: courtesyView.data, approvals: courtesyApproval.data, rows: courtesyRows.data }))

      const overrideContentId = `rls-agency-override-${RUN_ID}`
      const [overrideSync] = await sync([
        snapshot(bClientId, overrideContentId, 1, 'Agency override short', 'Agency-produced short body', 'youtube-short', {
          platforms: ['instagram'], producer: 'the_dot', fact_check_scope: 'not_applicable',
          fact_check_exemption: 'Agency-produced brand clip with no regulated claim.', fact_check_ledger: [],
        }),
      ])
      const overrideReady = await admin.rpc('mark_content_ready', {
        p_content_id: overrideSync.item_id, p_content_version: 1,
      })
      const implicitOverride = await admin.rpc('record_content_courtesy_release', {
        p_content_id: overrideSync.item_id, p_content_version: 1,
        p_reason: 'Publish without another client review.', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const explicitOverride = await admin.rpc('record_content_courtesy_release', {
        p_content_id: overrideSync.item_id, p_content_version: 1,
        p_reason: 'Agency override authorized by Anastasia: client declined another review of this exact revision.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const overrideApproval = await admin.from('approvals').select('id')
        .eq('content_id', overrideSync.item_id).eq('content_version', 1)
      const overrideDestinationKey = randomUUID()
      const overrideDestinationArgs = {
        p_content_id: overrideSync.item_id, p_content_version: 1, p_destination: 'youtube',
        p_reason: 'Agency override authorized by Anastasia: public provider reality includes this additional destination.',
        p_actor_key: 'thedot-admin', p_idempotency_key: overrideDestinationKey,
      }
      const browserOverrideDestination = await bClient.rpc('add_content_agency_override_destination', overrideDestinationArgs)
      const overrideDestination = await admin.rpc('add_content_agency_override_destination', overrideDestinationArgs)
      const overrideDestinationRetry = await admin.rpc('add_content_agency_override_destination', overrideDestinationArgs)
      const overrideTarget = await admin.from('content_publication_targets').select('id,destination')
        .eq('content_id', overrideSync.item_id).eq('content_version', 1).eq('destination', 'youtube').single()
      check('R18: The Dot content needs an explicit Anastasia override and never fabricates Maria approval',
        !overrideReady.error && !!implicitOverride.error && !explicitOverride.error
          && !overrideApproval.error && overrideApproval.data?.length === 0
          && !!browserOverrideDestination.error && !overrideDestination.error && !overrideDestinationRetry.error
          && overrideDestination.data?.schedule_target_id === overrideDestinationRetry.data?.schedule_target_id
          && !overrideTarget.error && overrideTarget.data?.destination === 'youtube',
        overrideReady.error?.message ?? implicitOverride.error?.message ?? explicitOverride.error?.message
          ?? overrideApproval.error?.message ?? browserOverrideDestination.error?.message
          ?? overrideDestination.error?.message ?? overrideDestinationRetry.error?.message ?? overrideTarget.error?.message
          ?? JSON.stringify({ approval: overrideApproval.data, target: overrideTarget.data }))

      // 0086: the release gate hangs on the named override, not on the producer value. A version
      // whose producer was never recorded used to be hard-blocked, because null matched neither
      // branch, so missing metadata presented itself as a conflict-of-interest stop. 34 of 164
      // live versions are in that state, and one of them had been public for eight days.
      const nullProducerId = `rls-null-producer-${RUN_ID}`
      const [nullProducerSync] = await sync([
        snapshot(bClientId, nullProducerId, 1, 'No producer recorded', 'Body with no producer declared', 'youtube-short', {
          platforms: ['instagram'], fact_check_scope: 'not_applicable',
          fact_check_exemption: 'Brand clip with no regulated claim.', fact_check_ledger: [],
        }),
      ])
      const nullProducerRow = await admin.from('content_item_versions').select('producer')
        .eq('content_item_id', nullProducerSync.item_id).eq('version', 1).single()
      const nullProducerReady = await admin.rpc('mark_content_ready', {
        p_content_id: nullProducerSync.item_id, p_content_version: 1,
      })
      // Widening must not become a free-for-all: with no producer AND no named override, refuse.
      const nullNoOverride = await admin.rpc('record_content_courtesy_release', {
        p_content_id: nullProducerSync.item_id, p_content_version: 1,
        p_reason: 'Publish without another client review.', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const nullWithOverride = await admin.rpc('record_content_courtesy_release', {
        p_content_id: nullProducerSync.item_id, p_content_version: 1,
        p_reason: 'Agency override authorized by Anastasia: this piece has been live for eight days '
          + 'and its producer was never recorded.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const nullApproval = await admin.from('approvals').select('id')
        .eq('content_id', nullProducerSync.item_id).eq('content_version', 1)
      check('R19: a version with no recorded producer releases on the named override, and only on it',
        nullProducerRow.data?.producer === null && !nullProducerReady.error
          && !!nullNoOverride.error
          && /studio content or an explicit Anastasia agency override/.test(nullNoOverride.error.message)
          && !nullWithOverride.error
          && !nullApproval.error && nullApproval.data?.length === 0,
        nullProducerRow.error?.message ?? nullProducerReady.error?.message
          ?? nullNoOverride.error?.message ?? nullWithOverride.error?.message
          ?? JSON.stringify({ producer: nullProducerRow.data?.producer, approvals: nullApproval.data }))
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
      const planDesign = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: 'rls-plan-only',
        p_canva_url: 'https://www.canva.com/design/PLANONLY/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-planonly-design-${RUN_ID}`,
      })
      if (planDesign.error) throw new Error(`plan-only design: ${planDesign.error.message}`)
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
      const placeholderId = `rls-plan-placeholder-${RUN_ID}`
      const placeholderCycle = await admin.rpc('agency_upsert_plan_cycle', {
        p_client_id: bClientId,
        p_cycle_key: `rls-placeholder-week-${RUN_ID}`,
        p_week_start: '2027-08-02',
        p_week_end: '2027-08-06',
        p_title: 'RLS placeholder week',
        p_direction_summary: 'A plan-only placeholder for the plan-date regression.',
        p_items: [{
          content_id: placeholderId,
          title: 'Plan-only placeholder without authored copy',
          format: 'carousel',
          pillar: 'employer',
          platforms: ['instagram', 'facebook'],
          producer: 'the_dot',
          planned_date: '2027-08-04',
          direction_note: 'Defer this placeholder.',
          position: 1,
        }],
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-placeholder-plan-${RUN_ID}`,
      })
      const cleared = await admin.rpc('agency_set_content_plan_date', {
        p_client_id: bClientId,
        p_content_id: placeholderId,
        p_planned_date: null,
        p_note: 'Deferred before authored copy existed.',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-placeholder-clear-${RUN_ID}`,
      })
      const placeholder = await admin.from('content_items')
        .select('planned_date,working_version,client_visible_version')
        .eq('client_id', bClientId).eq('content_id', placeholderId).single()
      check('T17: agency plan-date writer clears a plan-only placeholder without inventing a version',
        !placeholderCycle.error && !cleared.error
          && cleared.data?.outcome === 'cleared'
          && !placeholder.error && placeholder.data?.planned_date === null
          && placeholder.data?.working_version === null
          && placeholder.data?.client_visible_version === null,
        placeholderCycle.error?.message ?? cleared.error?.message ?? placeholder.error?.message
          ?? JSON.stringify({ cleared: cleared.data, placeholder: placeholder.data }))
    }

    {
      const multiPayload = snapshot(
        bClientId, 'rls-multi-target', 1, 'Multi-target fixture', 'Multi-target body', 'caption',
      )
      multiPayload.platforms = ['instagram', 'facebook']
      const [multiSync] = await sync([multiPayload])
      const multiDesign = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: 'rls-multi-target',
        p_canva_url: 'https://www.canva.com/design/MULTITARGET/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-multi-design-${RUN_ID}`,
      })
      if (multiDesign.error) throw new Error(`multi-target design: ${multiDesign.error.message}`)
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
      const unsafeDesign = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: 'rls-unsupported-target',
        p_canva_url: 'https://www.canva.com/design/UNSAFE/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-unsafe-design-${RUN_ID}`,
      })
      if (unsafeDesign.error) throw new Error(`unsupported-target design: ${unsafeDesign.error.message}`)
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
      // Publication is a terminal lock for this version. A client edit must be reconciled
      // before the agency can claim a destination is live, otherwise the client can be
      // stranded with a pending request that no longer has a safe revision path.
      const pendingPublicationEdit = await bClient.rpc('request_content_edit', {
        p_content_id: bItemId, p_content_version: 1, p_block_key: 'main',
        p_proposed_text: 'Client asks for a final copy correction before publication.',
        p_idempotency_key: randomUUID(),
      })
      const pendingPublicationRequestId = (pendingPublicationEdit.data as { id?: string } | null)?.id
      const blockedPublication = await admin.rpc('record_publication_observation', {
        ...observationArgs,
        p_observation_key: `rls-publication-blocked-${RUN_ID}`,
      })
      const resolvedPublicationEdit = pendingPublicationRequestId
        ? await admin.rpc('resolve_content_request', {
          p_request_id: pendingPublicationRequestId, p_status: 'rejected',
          p_reason: 'Disposable test closure after the publication block check.',
          p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
        })
        : { data: null, error: new Error('pending publication edit id missing') }
      check('P3b: a pending client edit blocks live confirmation until it is reconciled',
        !pendingPublicationEdit.error && !!blockedPublication.error
          && blockedPublication.error.message.includes('unresolved client edit')
          && !resolvedPublicationEdit.error,
        pendingPublicationEdit.error?.message ?? blockedPublication.error?.message
          ?? resolvedPublicationEdit.error?.message ?? 'NO ERROR')
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

      // The first-live block must not suppress later provider evidence. Once a piece is
      // already live, a newly submitted follow-up edit cannot erase an audited removal or
      // availability correction for that live version.
      const postLiveEdit = await bClient.rpc('request_content_edit', {
        p_content_id: bItemId, p_content_version: 1, p_block_key: 'main',
        p_proposed_text: 'Client requests a follow-up revision after publication.',
        p_idempotency_key: randomUUID(),
      })
      const postLiveRequestId = (postLiveEdit.data as { id?: string } | null)?.id
      const { data: currentTarget, error: currentTargetError } = await admin
        .from('content_publication_targets').select('current_observation_id').eq('id', publicationTarget.id).single()
      const unavailableAfterLive = currentTarget?.current_observation_id
        ? await admin.rpc('record_publication_observation', {
          ...observationArgs,
          p_provider_state: 'unavailable', p_live_url: null, p_published_at: null,
          p_provider_object_id: null, p_observed_title: 'RLS publication proof unavailable',
          p_observed_text: null, p_observation_key: `rls-publication-unavailable-${RUN_ID}`,
          p_supersedes_observation_id: currentTarget.current_observation_id,
          p_verification_note: 'The previously verified URL is unavailable during this check.',
        })
        : { data: null, error: new Error('current publication observation missing') }
      const closePostLiveEdit = postLiveRequestId
        ? await admin.rpc('resolve_content_request', {
          p_request_id: postLiveRequestId, p_status: 'rejected',
          p_reason: 'Disposable test closure after the later-evidence check.',
          p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
        })
        : { data: null, error: new Error('post-live request id missing') }
      check('P5b: a post-live edit does not block a later removal or availability observation',
        !postLiveEdit.error && !currentTargetError && !unavailableAfterLive.error && !closePostLiveEdit.error,
        postLiveEdit.error?.message ?? currentTargetError?.message ?? unavailableAfterLive.error?.message
          ?? closePostLiveEdit.error?.message ?? 'NO ERROR')
    }

    console.log('\n--- Version-bound comments ---')

    let plainCommentId: string | null = null
    {
      const plain = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'plain comment' })
      plainCommentId = typeof plain.data === 'string' ? plain.data : null
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
      const parentCommentId = plainCommentId
      if (!parentCommentId) throw new Error('plain comment id missing')
      const replyKey = randomUUID()
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const reply = await admin.rpc('add_agency_comment_reply', {
        p_parent_comment_id: parentCommentId,
        p_body: 'Dot reply to B',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: replyKey,
      })
      const retry = await admin.rpc('add_agency_comment_reply', {
        p_parent_comment_id: parentCommentId,
        p_body: 'Dot reply to B',
        p_actor_key: 'thedot-admin',
        p_idempotency_key: replyKey,
      })
      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const thread = await bClient.from('comments').select('author_type, body, content_version, reply_to_comment_id')
      const parent = await bClient.from('comments').select('resolved').eq('id', parentCommentId).single()
      const commentInbox = await admin.rpc('read_portal_inbox', {
        p_consumer_key: `rls-comment-inbox-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
      })
      const commentInboxRow = (commentInbox.data ?? []).find((row: PortalInboxRow) =>
        row.event_type === 'comment_added' && row.object_type === 'comment' && row.object_id === parentCommentId,
      )
      check('C8: agency reply RPC succeeds atomically', !reply.error, reply.error?.message ?? 'ok')
      check('C9: exact agency reply retry creates one activity event', !retry.error && !before.error && !after.error
        && (after.count ?? 0) - (before.count ?? 0) === 1,
      `before=${before.count} after=${after.count}`)
      check('C10: client sees a parent-linked reply and the original becomes answered', !thread.error && !parent.error
        && (thread.data ?? []).some((row) => row.author_type === 'anastasia'
          && row.body === 'Dot reply to B' && row.content_version === 1
          && row.reply_to_comment_id === parentCommentId)
        && parent.data?.resolved === true,
      thread.error?.message ?? parent.error?.message ?? `rows=${thread.data?.length ?? 0}`)
      const browserReply = await bClient.rpc('add_agency_comment_reply', {
        p_parent_comment_id: parentCommentId, p_body: 'forged browser reply',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('C11: browser cannot invoke the agency comment-reply writer', !!browserReply.error,
        browserReply.error?.message ?? 'NO ERROR')
      check('C12: client comment creates one durable reconciliation inbox event', !commentInbox.error
        && commentInboxRow?.payload?.comment_id === parentCommentId
        && commentInboxRow.requires_reconciliation === true,
      commentInbox.error?.message ?? JSON.stringify(commentInboxRow))
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
      check('C13: anon cannot read released portal content', !!anonRead.error || (anonRead.data ?? []).length === 0,
        anonRead.error?.message ?? `rows=${anonRead.data?.length ?? 0}`)
      check('C14: anon cannot call client comment RPC', !!anonComment.error, anonComment.error?.message ?? 'NO ERROR')
      check('C15: anon cannot call service sync RPC', !!anonSync.error, anonSync.error?.message ?? 'NO ERROR')
      check('C16: anon cannot call scheduling writers', !!anonSchedule.error,
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
      check('C17: client can comment on both released design links through the RPC',
        !links.error && !canva.error && !drive.error && !designRows.error
          && (designRows.data ?? []).length === 2
          && (designRows.data ?? []).every((row) => row.target_kind === 'design'),
        links.error?.message ?? canva.error?.message ?? drive.error?.message
          ?? designRows.error?.message ?? JSON.stringify(designRows.data))
      check('C18: design comments retain the exact safe target URLs',
        (designRows.data ?? []).some((row) => row.target_url === 'https://www.canva.com/design/RLSCOMMENT/view')
          && (designRows.data ?? []).some((row) => row.target_url === 'https://drive.google.com/file/d/RLSCOMMENT/view'),
        JSON.stringify(designRows.data))
      check('C19: design comment RPC remains tenant-scoped', !!cross.error,
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

      // 0041: ideas are shared discussion objects. Prove the client writer is tenant-bound and
      // idempotent, the agency reply is browser-denied, direct writes remain blocked, and a client
      // comment produces the durable inbox event plus exactly one outbox alert pair.
      if (!ideaId) throw new Error('idea id missing for comment test')
      const commentKey = randomUUID()
      const beforeActivity = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const comment = await bClient.rpc('add_idea_comment', {
        p_idea_id: ideaId, p_body: 'Could this answer an employer question?', p_idempotency_key: commentKey,
      })
      const commentId = (comment.data as { id?: string } | null)?.id
      const retry = await bClient.rpc('add_idea_comment', {
        p_idea_id: ideaId, p_body: 'Could this answer an employer question?', p_idempotency_key: commentKey,
      })
      const afterActivity = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const ownThread = await bClient.from('idea_comments').select('id,idea_id,author_type,body,resolved')
        .eq('idea_id', ideaId)
      const foreignThread = await kansetClient.from('idea_comments').select('id').eq('idea_id', ideaId)
      const directIdeaComment = await bClient.from('idea_comments').insert({
        client_id: bClientId, idea_id: ideaId, author_type: 'client', author_name: 'forged', body: 'forged',
        idempotency_key: randomUUID(), comment_fingerprint: 'a'.repeat(64),
      })
      const viewerIdeaComment = await bViewerClient.rpc('add_idea_comment', {
        p_idea_id: ideaId, p_body: 'forbidden viewer comment', p_idempotency_key: randomUUID(),
      })
      const browserAgencyReply = await bClient.rpc('add_agency_idea_comment_reply', {
        p_parent_comment_id: commentId ?? randomUUID(), p_body: 'forged browser reply',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const agencyReply = commentId ? await admin.rpc('add_agency_idea_comment_reply', {
        p_parent_comment_id: commentId, p_body: 'Yes. We will shape that angle before drafting.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      }) : { error: new Error('no comment id') }
      const resolvedParent = commentId ? await bClient.from('idea_comments').select('resolved').eq('id', commentId).single()
        : { error: new Error('no comment id'), data: null }
      const inbox = await admin.rpc('read_portal_inbox', {
        p_consumer_key: `rls-idea-comment-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
      })
      const inboxRow = (inbox.data ?? []).find((row: PortalInboxRow) =>
        row.event_type === 'idea_comment_added' && row.object_type === 'content_idea'
          && row.object_id === ideaId && row.payload?.comment_id === commentId,
      )
      const alerts = commentId ? await admin.from('notification_outbox').select('channel,recipient_kind,event_key')
        .like('event_key', `comment:${commentId}:%`) : { error: new Error('no comment id'), data: [] }
      const alertRows = alerts.data ?? []
      const agencyStart = await admin.rpc('add_agency_idea_comment', {
        p_idea_id: ideaId, p_body: 'Which audience should we prioritize for this?',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const threadAfterAgencyStart = await bClient.from('idea_comments').select('author_type,body,reply_to_comment_id')
        .eq('idea_id', ideaId)
      const clientAlert = await bClient.from('notification_outbox')
        .select('channel,recipient_kind,body').eq('body', 'Which audience should we prioritize for this?').maybeSingle()
      check('IC1: client idea comment is idempotent, tenant-scoped, and direct writes are denied',
        !comment.error && !retry.error && !ownThread.error && !foreignThread.error && !!directIdeaComment.error
          && !!viewerIdeaComment.error && !!browserAgencyReply.error
          && ownThread.data?.filter((row) => row.body === 'Could this answer an employer question?').length === 1
          && (foreignThread.data ?? []).length === 0
          && !beforeActivity.error && !afterActivity.error && (afterActivity.count ?? 0) - (beforeActivity.count ?? 0) === 1,
        comment.error?.message ?? retry.error?.message ?? ownThread.error?.message ?? foreignThread.error?.message
          ?? directIdeaComment.error?.message ?? viewerIdeaComment.error?.message ?? browserAgencyReply.error?.message
          ?? `activity delta=${(afterActivity.count ?? 0) - (beforeActivity.count ?? 0)}`)
      check('IC2: either side can start the discussion; replies, inbox events, and alerts stay durable',
        !agencyReply.error && !resolvedParent.error && resolvedParent.data?.resolved === true
          && !inbox.error && inboxRow?.requires_reconciliation === true
          && !alerts.error && alertRows.length === 2
          && alertRows.some((row) => row.channel === 'in_app' && row.recipient_kind === 'agency')
          && alertRows.some((row) => row.channel === 'email' && row.recipient_kind === 'agency')
          && !agencyStart.error
          && (threadAfterAgencyStart.data ?? []).some((row) => row.author_type === 'anastasia'
            && row.body === 'Which audience should we prioritize for this?' && row.reply_to_comment_id === null)
          && !clientAlert.error && clientAlert.data?.recipient_kind === 'client' && clientAlert.data?.channel === 'in_app',
        agencyReply.error?.message ?? resolvedParent.error?.message ?? inbox.error?.message ?? alerts.error?.message
          ?? agencyStart.error?.message ?? threadAfterAgencyStart.error?.message ?? clientAlert.error?.message
          ?? JSON.stringify({ inboxRow, alertRows, clientAlert: clientAlert.data }))
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
      // 0067 report receipts: each signed-in seat sees only its own receipt. A preview-seat
      // visit cannot dismiss the primary client's overview card, and direct writes stay denied.
      const reportKey = '2026-07'
      const beforeViewer = await bViewerClient.from('portal_report_views')
        .select('report_key,viewed_at').eq('client_id', bClientId).eq('report_key', reportKey)
      const marked = await bClient.rpc('mark_portal_report_viewed', {
        p_client_id: bClientId, p_report_key: reportKey,
      })
      const ownReceipt = await bClient.from('portal_report_views')
        .select('client_id,report_key,viewed_at').eq('client_id', bClientId).eq('report_key', reportKey).maybeSingle()
      const viewerStillEmpty = await bViewerClient.from('portal_report_views')
        .select('report_key,viewed_at').eq('client_id', bClientId).eq('report_key', reportKey)
      const crossTenant = await kansetClient.from('portal_report_views')
        .select('report_key').eq('client_id', bClientId).eq('report_key', reportKey)
      const foreignMark = await bClient.rpc('mark_portal_report_viewed', {
        p_client_id: kanset.id, p_report_key: reportKey,
      })
      const directInsert = await bClient.from('portal_report_views').insert({
        auth_user_id: bUserId, client_id: bClientId, report_key: '2026-08',
      })
      check('RV1: report receipts are durable, per-seat, tenant-scoped, and RPC-only',
        !beforeViewer.error && (beforeViewer.data ?? []).length === 0
          && !marked.error && !ownReceipt.error && !!ownReceipt.data?.viewed_at
          && !viewerStillEmpty.error && (viewerStillEmpty.data ?? []).length === 0
          && !crossTenant.error && (crossTenant.data ?? []).length === 0
          && !!foreignMark.error && !!directInsert.error,
        marked.error?.message ?? ownReceipt.error?.message ?? viewerStillEmpty.error?.message
          ?? crossTenant.error?.message ?? (!foreignMark.error ? 'foreign mark unexpectedly allowed' : null)
          ?? (!directInsert.error ? 'direct insert unexpectedly allowed' : null)
          ?? JSON.stringify({ ownReceipt: ownReceipt.data, viewer: viewerStillEmpty.data }))
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

      // 0065: volume monitoring is soft. The third email opens one agency-only Ops
      // task, while the fourth important direct reply still enters normal delivery.
      const volumeBodies = [1, 2, 3].map((index) => `client-volume-guard-${RUN_ID}-${index}`)
      const volumeReplies: Array<{ error: { message: string } | null }> = []
      for (const body of volumeBodies) {
        volumeReplies.push(await admin.rpc('add_agency_comment', {
          p_content_id: bItemId, p_body: body, p_author_name: 'The Dot',
        }))
      }
      const volumeRows = await admin.from('notification_outbox')
        .select('channel,status,last_error,body')
        .eq('client_id', bClientId)
        .in('body', volumeBodies)
      const volumeOps = await admin.from('ops_tasks')
        .select('title,status,trigger_note')
        .eq('client_id', bClientId)
        .eq('title', 'Review client notification volume')
      const volumeData = volumeRows.data ?? []
      check('N7: soft volume monitor warns at three without holding the fourth client email',
        volumeReplies.every((result) => !result.error)
          && !volumeRows.error && !volumeOps.error
          && volumeData.filter((row) => row.channel === 'in_app' && row.status === 'succeeded').length === 3
          && volumeData.filter((row) => row.channel === 'email' && row.status === 'pending').length === 3
          && !volumeData.some((row) => row.channel === 'email' && row.status === 'skipped')
          && (volumeOps.data ?? []).length === 1
          && volumeOps.data?.[0]?.status === 'open',
        volumeReplies.find((result) => result.error)?.error?.message
          ?? volumeRows.error?.message ?? volumeOps.error?.message
          ?? JSON.stringify({ volumeData, volumeOps: volumeOps.data }))
      const clientAuditDenied = await bClient.rpc('read_client_notification_audit', {
        p_client_id: bClientId, p_since: new Date(Date.now() - 86_400_000).toISOString(), p_limit: 100,
      })
      const serviceAudit = await admin.rpc('read_client_notification_audit', {
        p_client_id: bClientId, p_since: new Date(Date.now() - 86_400_000).toISOString(), p_limit: 1000,
      })
      const agencyAuditDenied = await bClient.rpc('read_notification_audit', {
        p_client_id: bClientId, p_since: new Date(Date.now() - 86_400_000).toISOString(), p_limit: 100,
      })
      const fullServiceAudit = await admin.rpc('read_notification_audit', {
        p_client_id: bClientId, p_since: new Date(Date.now() - 86_400_000).toISOString(), p_limit: 5000,
      })
      check('N8: notification trace is complete for service and unavailable to the client browser',
        !!clientAuditDenied.error && !!agencyAuditDenied.error && !serviceAudit.error && !fullServiceAudit.error
          && (serviceAudit.data ?? []).some((row: {
            status: string; activity_event_type: string | null; source_kind: string
          }) => row.status === 'pending'
            && row.activity_event_type === null && row.source_kind === 'comment')
          && (fullServiceAudit.data ?? []).some((row: {
            recipient_kind: string; template_key: string; related_url: string | null
          }) => row.recipient_kind === 'agency'
            && row.template_key === 'agency_piece_digest'
            && row.related_url === `https://www.thedotcreative.co/admin/portal/pieces/${B_BUNDLE_ID}`),
        clientAuditDenied.error?.message ?? agencyAuditDenied.error?.message
          ?? serviceAudit.error?.message ?? fullServiceAudit.error?.message
          ?? JSON.stringify(fullServiceAudit.data))
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
        .select('title, canva_url, drive_url').eq('content_id', B_CONTENT_ID).single()
      const checksumAfter = await admin.from('content_item_versions')
        .select('content_checksum').eq('content_item_id', itemId).eq('version', 1).single()
      const versionCount = await admin.from('content_item_versions')
        .select('id', { count: 'exact', head: true }).eq('content_item_id', itemId)
      const designAlerts = await admin.from('notification_outbox')
        .select('channel,recipient_kind,subject')
        .eq('client_id', bClientId)
        .eq('subject', `Design link updated: ${viewRow.data?.title ?? B_CONTENT_ID}`)
      const designAlertRows = designAlerts.data ?? []
      check('DL1: item-level design links render in the client view with the released checksum untouched',
        !!itemId && !setLinks.error
          && viewRow.data?.canva_url === 'https://www.canva.com/design/TESTDESIGN/view'
          && viewRow.data?.drive_url === 'https://drive.google.com/open?id=TESTFILE'
          && !checksumBefore.error && !checksumAfter.error
          && checksumBefore.data?.content_checksum === checksumAfter.data?.content_checksum
          && (versionCount.count ?? 0) === 1
          && !designAlerts.error
          && designAlertRows.some((row) => row.channel === 'in_app' && row.recipient_kind === 'client')
          && !designAlertRows.some((row) => row.channel === 'email' && row.recipient_kind === 'client'),
        setLinks.error?.message ?? viewRow.error?.message
          ?? designAlerts.error?.message
          ?? `view=${JSON.stringify(viewRow.data)} checksum=${checksumBefore.data?.content_checksum === checksumAfter.data?.content_checksum} versions=${versionCount.count} alerts=${JSON.stringify(designAlertRows)}`)

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

    console.log('\n--- 0073 podcast review packs ---')

    {
      const PODCAST_ID = `rls-podcast-${RUN_ID}`
      const podcastSnapshot = snapshot(
        bClientId, PODCAST_ID, 1, 'Podcast review fixture',
        'Complete podcast review fixture.', 'social-caption',
        { format: 'podcast', platforms: ['instagram', 'facebook', 'youtube'] },
      )
      podcastSnapshot.copy_blocks = [
        { key: 'social-caption', label: 'Instagram and Facebook caption', body: 'Social caption.' },
        { key: 'youtube-title', label: 'YouTube title', body: 'Podcast review fixture' },
        { key: 'youtube-description', label: 'YouTube description', body: 'YouTube description.' },
        { key: 'youtube-tags', label: 'YouTube tags', body: 'kanset, immigration' },
      ]
      const podcastSync = await sync([podcastSnapshot])
      const podcastItemId = podcastSync[0]?.item_id
      const podcastRelease = await admin.rpc('mark_content_ready', {
        p_content_id: podcastItemId, p_content_version: 1,
      })
      if (!podcastItemId || podcastRelease.error) {
        throw new Error(podcastRelease.error?.message ?? 'podcast fixture release failed')
      }

      const incompleteDecision = await bClient.rpc('record_content_decision', {
        p_content_id: podcastItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const directWrite = await bClient.from('content_review_assets').insert({
        client_id: bClientId, content_item_id: podcastItemId, content_version: 1,
        asset_key: 'forged', label: 'Forged', channel: 'social', asset_kind: 'cover',
        url: 'https://drive.google.com/open?id=FORGED', width_px: 1080, height_px: 1920,
      })
      const eventRead = await bClient.from('content_review_asset_events').select('id').limit(1)
      check('PR1: incomplete podcast approval fails closed and browser writes stay denied',
        !!incompleteDecision.error && !!directWrite.error && !!eventRead.error,
        incompleteDecision.error?.message ?? directWrite.error?.message
          ?? eventRead.error?.message ?? 'unexpected access')

      const reviewAssetInputs = [
        {
          assetKey: 'social-cover', label: 'Instagram and Facebook reel cover',
          channel: 'social', assetKind: 'cover', url: 'https://www.canva.com/design/PODCASTSOCIAL/view',
          widthPx: 1080, heightPx: 1920, captionStatus: 'not_applicable',
        },
        {
          assetKey: 'social-teaser', label: 'Captioned teaser video',
          channel: 'social', assetKind: 'video', url: 'https://drive.google.com/open?id=PODCASTTEASER',
          widthPx: 1080, heightPx: 1920, captionStatus: 'burned_in_verified',
        },
        {
          assetKey: 'youtube-cover', label: 'YouTube horizontal cover',
          channel: 'youtube', assetKind: 'cover', url: 'https://www.canva.com/design/PODCASTYOUTUBE/view',
          widthPx: 1280, heightPx: 720, captionStatus: 'not_applicable',
        },
      ] as const
      for (const asset of reviewAssetInputs) {
        const result = await admin.rpc('set_content_review_asset', {
          p_client_id: bClientId,
          p_content_id: PODCAST_ID,
          p_content_version: 1,
          p_asset_key: asset.assetKey,
          p_label: asset.label,
          p_channel: asset.channel,
          p_asset_kind: asset.assetKind,
          p_url: asset.url,
          p_width_px: asset.widthPx,
          p_height_px: asset.heightPx,
          p_caption_status: asset.captionStatus,
          p_review_note: null,
          p_actor_key: 'thedot-admin',
          p_idempotency_key: `rls-review-asset-${asset.assetKey}-${RUN_ID}`,
        })
        if (result.error) throw new Error(`set review asset: ${result.error.message}`)
      }

      const ownAssets = await bClient.from('content_review_assets')
        .select('asset_key,caption_status').eq('content_item_id', podcastItemId)
      const crossAssets = await kansetClient.from('content_review_assets')
        .select('asset_key').eq('content_item_id', podcastItemId)
      const assetComment = await bClient.rpc('add_design_comment', {
        p_content_id: podcastItemId,
        p_body: 'Please make the teaser opening warmer.',
        p_design_url: 'https://drive.google.com/open?id=PODCASTTEASER',
      })
      const approved = await bClient.rpc('record_content_decision', {
        p_content_id: podcastItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      check('PR2: Maria reads and comments on exact tenant assets, then approves the complete pack',
        !ownAssets.error && (ownAssets.data?.length ?? 0) === 3
          && !crossAssets.error && (crossAssets.data?.length ?? 0) === 0
          && !assetComment.error && !approved.error,
        ownAssets.error?.message ?? crossAssets.error?.message
          ?? assetComment.error?.message ?? approved.error?.message
          ?? `own=${ownAssets.data?.length} cross=${crossAssets.data?.length}`)

      const youtubeTarget = await admin.from('content_schedule_targets')
        .select('id').eq('client_id', bClientId).eq('content_id', podcastItemId)
        .eq('content_version', 1).eq('destination', 'youtube').single()
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const schedule = await admin.rpc('confirm_schedule_target', {
        p_schedule_target_id: youtubeTarget.data?.id,
        p_scheduled_at: scheduledAt,
        p_external_url: null,
        p_external_id: null,
        p_evidence_id: null,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-podcast-schedule-${RUN_ID}`,
      })
      const transcriptTasks = await admin.from('ops_tasks')
        .select('title,source,status').eq('idempotency_key', `podcast-transcript:${podcastItemId}:1`)
      check('PR3: a confirmed YouTube upload opens one transcript-proof task',
        !youtubeTarget.error && !schedule.error && !transcriptTasks.error
          && transcriptTasks.data?.length === 1
          && transcriptTasks.data[0]?.status === 'open'
          && transcriptTasks.data[0]?.source.includes('correct them in YouTube Studio'),
        youtubeTarget.error?.message ?? schedule.error?.message ?? transcriptTasks.error?.message
          ?? JSON.stringify(transcriptTasks.data))
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
      // with alias platforms (youtube_shorts + website), LinkedIn, AND an UNSUPPORTED one (tiktok),
      // the loaded StagePiece must carry only the canonical SUPPORTED destinations
      // (instagram + youtube + linkedin + squarespace) that content_schedule_targets /
      // content_publication_targets are stored under: the alias collapses correctly and
      // tiktok is DROPPED (no phantom destination). Also carries the tenant name (fix 2).
      const canonSync = await sync([snapshot(bClientId, 'rls-canon-piece', 1,
        'Canonicalization piece', 'body', 'main',
        { platforms: ['instagram', 'youtube_shorts', 'linkedin', 'tiktok', 'website'] })])
      const canonPiece = canonSync[0]?.item_id
        ? await loadAgencyStagePiece(admin, bClientId, 'rls-canon-piece') : null
      const canonNine = canonPiece ? renderStatusGatesBlock(canonPiece, '2026-07-21') : ''
      check('PG9: the loader canonicalizes to supported destinations and drops unsupported ones',
        canonPiece !== null
          && JSON.stringify(canonPiece.platforms) === JSON.stringify(['instagram', 'youtube', 'linkedin', 'squarespace'])
          && canonPiece.dests.every((d) => ['instagram', 'youtube', 'linkedin', 'squarespace'].includes(d.destination))
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
      // 0049: a premature future submission must not mask the nearest actionable plan.
      // The date writer must update that same nearest cycle, and closing the accidental
      // submission is an agency-only, stale-safe, idempotent audit event.
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
      })
      const parts = formatter.formatToParts(new Date())
      const part = (type: string) => parts.find((value) => value.type === type)?.value
      const today = `${part('year')}-${part('month')}-${part('day')}`
      const addDays = (value: string, days: number) => {
        const date = new Date(`${value}T12:00:00Z`)
        date.setUTCDate(date.getUTCDate() + days)
        return date.toISOString().slice(0, 10)
      }
      const thisMondayOffset = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
      const nearestStart = addDays(today, 7 - thisMondayOffset)
      const nearestEnd = addDays(nearestStart, 4)
      const laterStart = addDays(nearestStart, 7)
      const laterEnd = addDays(laterStart, 4)
      const prematureStart = addDays(nearestStart, 14)
      const prematureEnd = addDays(prematureStart, 4)
      const makeCycle = (key: string, start: string, end: string, title: string) => admin.rpc('agency_upsert_plan_cycle', {
        p_client_id: bClientId,
        p_cycle_key: key,
        p_week_start: start, p_week_end: end, p_title: title,
        p_direction_summary: 'RLS plan-cycle selection fixture.',
        p_items: [{
          content_id: B_CONTENT_ID, title: 'Visible main v1', format: 'caption',
          pillar: 'employer', platforms: ['instagram'], producer: 'the_dot',
          planned_date: start, direction_note: 'Selection fixture.', position: 1,
        }],
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-plan-selection-${key}-${RUN_ID}`,
      })
      const nearest = await makeCycle(`rls-nearest-${RUN_ID}`, nearestStart, nearestEnd, 'Nearest actionable plan')
      const later = await makeCycle(`rls-later-${RUN_ID}`, laterStart, laterEnd, 'Later actionable plan')
      const premature = await makeCycle(`rls-premature-${RUN_ID}`, prematureStart, prematureEnd, 'Premature plan')
      const planDate = await admin.rpc('agency_set_content_plan_date', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_planned_date: addDays(nearestStart, 1),
        p_note: 'Move the nearest actionable plan item.', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-nearest-plan-date-${RUN_ID}`,
      })
      const itemDates = await admin.from('plan_cycle_items').select('plan_cycle_id,planned_date')
        .eq('client_id', bClientId).eq('content_id', B_CONTENT_ID)
        .in('plan_cycle_id', [nearest.data, later.data, premature.data].filter(Boolean))
      const dateByCycle = new Map((itemDates.data ?? []).map((row) => [row.plan_cycle_id, row.planned_date]))
      const closeArgs = {
        p_client_id: bClientId, p_plan_cycle_id: premature.data, p_revision: 1,
        p_reason: 'Submitted two weeks too early.', p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-close-premature-${RUN_ID}`,
      }
      const clientClose = await bClient.rpc('agency_close_plan_cycle', closeArgs)
      const staleClose = premature.data
        ? await admin.rpc('agency_close_plan_cycle', { ...closeArgs, p_revision: 2, p_idempotency_key: `rls-close-stale-${RUN_ID}` })
        : { data: null, error: new Error('premature cycle missing') }
      const closed = premature.data
        ? await admin.rpc('agency_close_plan_cycle', closeArgs)
        : { data: null, error: new Error('premature cycle missing') }
      const exactRetry = premature.data
        ? await admin.rpc('agency_close_plan_cycle', closeArgs)
        : { data: null, error: new Error('premature cycle missing') }
      const closedCycle = premature.data
        ? await admin.from('plan_cycles').select('status').eq('id', premature.data).single()
        : { data: null, error: new Error('premature cycle missing') }
      const clientClosedRead = premature.data
        ? await bClient.from('plan_cycles_client').select('id').eq('id', premature.data)
        : { data: [], error: new Error('premature cycle missing') }
      check('PC2: nearest actionable plan wins, plan-date updates it, and premature close is agency-only/idempotent',
        !nearest.error && !later.error && !premature.error && !planDate.error && !itemDates.error
          && dateByCycle.get(nearest.data) === addDays(nearestStart, 1)
          && dateByCycle.get(later.data) === laterStart
          && dateByCycle.get(premature.data) === prematureStart
          && !!clientClose.error && !!staleClose.error && !closed.error && !exactRetry.error
          && !closedCycle.error && closedCycle.data?.status === 'closed'
          && !!(closed.data as { activity_event_id?: string } | null)?.activity_event_id
          && (closed.data as { activity_event_key?: string } | null)?.activity_event_key === `agency:plan-cycle-closed:${premature.data}:1`
          && (exactRetry.data as { activity_event_id?: string } | null)?.activity_event_id
            === (closed.data as { activity_event_id?: string } | null)?.activity_event_id
          && !clientClosedRead.error && (clientClosedRead.data ?? []).length === 0,
        nearest.error?.message ?? later.error?.message ?? premature.error?.message ?? planDate.error?.message
          ?? itemDates.error?.message
          ?? closed.error?.message ?? exactRetry.error?.message ?? closedCycle.error?.message
          ?? clientClosedRead.error?.message
          ?? `nearest=${dateByCycle.get(nearest.data)} later=${dateByCycle.get(later.data)} premature=${dateByCycle.get(premature.data)}`)

      // 0051: a closed, undecided premature cycle can return as a visible draft, not as
      // an approval request. The client may read the safe projection but cannot invoke
      // either the agency writer or a plan-decision RPC against its draft revision.
      const stageArgs = {
        p_client_id: bClientId, p_cycle_key: `rls-premature-${RUN_ID}`,
        p_week_start: prematureStart, p_week_end: prematureEnd, p_title: 'Coming up draft plan',
        p_direction_summary: 'Visible for planning, not yet submitted for approval.',
        p_items: [{
          content_id: B_CONTENT_ID, title: 'Visible main v1', format: 'caption',
          pillar: 'employer', platforms: ['instagram'], producer: 'the_dot',
          planned_date: prematureStart, direction_note: 'Draft plan fixture.', position: 1,
        }],
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-stage-plan-${RUN_ID}`,
      }
      const staged = await admin.rpc('agency_stage_plan_cycle', stageArgs)
      const stagedRetry = await admin.rpc('agency_stage_plan_cycle', stageArgs)
      const stagedCycle = premature.data
        ? await admin.from('plan_cycles').select('status,revision,approved_revision,decided_at').eq('id', premature.data).single()
        : { data: null, error: new Error('premature cycle missing') }
      const stagedClientRead = premature.data
        ? await bClient.from('plan_cycles_client').select('id,status,revision').eq('id', premature.data)
        : { data: [], error: new Error('premature cycle missing') }
      const stagedItemsRead = premature.data
        ? await bClient.from('plan_cycle_items_client').select('content_id,title').eq('plan_cycle_id', premature.data)
        : { data: [], error: new Error('premature cycle missing') }
      const stagedDecision = premature.data
        ? await bClient.rpc('record_plan_cycle_decision', {
          p_plan_cycle_id: premature.data, p_revision: 2, p_decision: 'approved', p_note: null,
        })
        : { data: null, error: new Error('premature cycle missing') }
      const stagedIdeaDecision = premature.data
        ? await bClient.rpc('record_content_idea_decision', {
          p_content_item_id: bItemId, p_plan_cycle_id: premature.data,
          p_plan_cycle_revision: 2, p_decision: 'approved', p_note: null,
        })
        : { data: null, error: new Error('premature cycle missing') }
      const stagedClientWriter = await bClient.rpc('agency_stage_plan_cycle', stageArgs)
      check('PD1: draft cycles are client-readable but cannot become a decision or client write',
        !staged.error && !stagedRetry.error && staged.data === premature.data && stagedRetry.data === premature.data
          && !stagedCycle.error && stagedCycle.data?.status === 'draft' && stagedCycle.data?.revision === 2
          && stagedCycle.data?.approved_revision === null && stagedCycle.data?.decided_at === null
          && !stagedClientRead.error && stagedClientRead.data?.[0]?.status === 'draft'
          && stagedClientRead.data?.[0]?.revision === 2
          && !stagedItemsRead.error && stagedItemsRead.data?.[0]?.content_id === B_CONTENT_ID
          && !!stagedDecision.error && !!stagedIdeaDecision.error && !!stagedClientWriter.error,
        staged.error?.message ?? stagedRetry.error?.message ?? stagedCycle.error?.message
          ?? stagedClientRead.error?.message ?? stagedDecision.error?.message ?? stagedIdeaDecision.error?.message
          ?? stagedItemsRead.error?.message ?? stagedClientWriter.error?.message
          ?? `stage=${staged.data} retry=${stagedRetry.data} row=${JSON.stringify(stagedCycle.data)}`)
    }

    {
      // 0053: proposals are a separate discussion/approval boundary. The browser can read
      // only its tenant's submitted document and can reply/decide only through the narrowed
      // RPCs. Direct table writes and agency writers remain unavailable to it.
      const proposalKey = `rls-proposal-${RUN_ID}`
      const draftArgs = {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_title: 'RLS proposal',
        p_summary: 'A client-safe proposal fixture.', p_blocks: [
          { kind: 'heading', title: 'Decision needed' },
          { kind: 'paragraph', body: 'Please review this client-safe proposal.' },
          { kind: 'callout', title: 'Choices', items: ['Approve the direction', 'Request changes'] },
        ], p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-draft-${RUN_ID}`,
      }
      const drafted = await admin.rpc('upsert_client_proposal_draft', draftArgs)
      const submitted = await admin.rpc('submit_client_proposal', {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-submit-${RUN_ID}`,
      })
      const clientProposalRevision = await bClient.rpc('revise_client_proposal_draft', {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-client-revise-${RUN_ID}`,
      })
      const revised = await admin.rpc('revise_client_proposal_draft', {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-revise-${RUN_ID}`,
      })
      const revisedRetry = await admin.rpc('revise_client_proposal_draft', {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-revise-${RUN_ID}`,
      })
      const redrafted = await admin.rpc('upsert_client_proposal_draft', {
        ...draftArgs, p_summary: 'A revised client-safe proposal fixture.', p_idempotency_key: `rls-proposal-redraft-${RUN_ID}`,
      })
      const resubmitted = await admin.rpc('submit_client_proposal', {
        p_client_id: bClientId, p_proposal_key: proposalKey, p_revision: 2,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-proposal-resubmit-${RUN_ID}`,
      })
      const ownProposal = await bClient.from('client_proposals_client').select('id,title,status,blocks')
        .eq('proposal_key', proposalKey).maybeSingle()
      const crossProposal = await kansetClient.from('client_proposals_client').select('id').eq('proposal_key', proposalKey)
      const directProposalWrite = await bClient.from('client_proposal_messages').insert({
        client_id: bClientId, proposal_id: (drafted.data as { id?: string } | null)?.id ?? null,
        author_type: 'client', author_name: 'forged', body: 'forged', idempotency_key: randomUUID(), message_fingerprint: '0'.repeat(64),
      })
      const agencyProposalWriter = await bClient.rpc('upsert_client_proposal_draft', draftArgs)
      const proposalId = ownProposal.data?.id
      const reply = proposalId ? await bClient.rpc('reply_to_client_proposal_as_client', {
        p_proposal_id: proposalId, p_body: 'Could we make the opening warmer?', p_idempotency_key: randomUUID(),
      }) : { data: null, error: new Error('proposal missing') }
      const decisionArgs = proposalId ? { p_proposal_id: proposalId, p_revision: 2, p_decision: 'approved',
        p_note: 'Approved for the RLS test.', p_idempotency_key: randomUUID() } : null
      const decision = decisionArgs ? await bClient.rpc('record_client_proposal_decision', decisionArgs) : { data: null, error: new Error('proposal missing') }
      const decisionRetry = decisionArgs && decision.data
        ? await bClient.rpc('record_client_proposal_decision', { ...decisionArgs, p_idempotency_key: decisionArgs.p_idempotency_key })
        : { data: null, error: new Error('proposal decision missing') }
      const decidedProposal = proposalId ? await bClient.from('client_proposals_client').select('status,decided_by_name')
        .eq('id', proposalId).maybeSingle() : { data: null, error: new Error('proposal missing') }
      const ownMessages = proposalId ? await bClient.from('client_proposal_messages_client').select('author_type,body')
        .eq('proposal_id', proposalId) : { data: [], error: new Error('proposal missing') }
      check('PR1: submitted proposal is tenant-scoped, browser-write-denied, revision-safe, and decision/reply writers are durable and idempotent',
        !drafted.error && !submitted.error && !!clientProposalRevision.error && !revised.error && !revisedRetry.error
          && !redrafted.error && !resubmitted.error && (revised.data as { revision?: number } | null)?.revision === 2
          && (revisedRetry.data as { revision?: number } | null)?.revision === 2
          && !ownProposal.error && ownProposal.data?.status === 'awaiting_decision'
          && !crossProposal.error && (crossProposal.data ?? []).length === 0 && !!directProposalWrite.error
          && !!agencyProposalWriter.error && !reply.error && !decision.error && !decisionRetry.error
          && !decidedProposal.error && decidedProposal.data?.status === 'approved'
          && !ownMessages.error && (ownMessages.data ?? []).some((row) => row.author_type === 'client'),
        drafted.error?.message ?? submitted.error?.message ?? revised.error?.message
          ?? revisedRetry.error?.message ?? redrafted.error?.message ?? resubmitted.error?.message ?? ownProposal.error?.message ?? crossProposal.error?.message
          ?? reply.error?.message ?? decision.error?.message ?? decisionRetry.error?.message
          ?? decidedProposal.error?.message ?? ownMessages.error?.message ?? JSON.stringify({ own: ownProposal.data, cross: crossProposal.data,
            directDenied: Boolean(directProposalWrite.error), agencyDenied: Boolean(agencyProposalWriter.error), clientRevisionDenied: Boolean(clientProposalRevision.error),
            revised: revised.data, revisedRetry: revisedRetry.data, redrafted: redrafted.data, resubmitted: resubmitted.data,
            reply: reply.data, decision: decision.data, retry: decisionRetry.data, decided: decidedProposal.data, messages: ownMessages.data }))
    }

    console.log('\n--- 0081 unified piece review bundles ---')

    {
      const announcementKey = 'piece_review_flow_2026_08'
      const acknowledged = await bClient.rpc('acknowledge_portal_announcement', {
        p_client_id: bClientId, p_announcement_key: announcementKey,
      })
      const ownAcknowledgment = await bClient.from('portal_announcement_acknowledgments')
        .select('client_id,announcement_key,acknowledged_at')
        .eq('client_id', bClientId).eq('announcement_key', announcementKey)
      const viewerAcknowledgment = await bViewerClient.from('portal_announcement_acknowledgments')
        .select('client_id,announcement_key,acknowledged_at')
        .eq('client_id', bClientId).eq('announcement_key', announcementKey)
      const crossAcknowledgment = await bClient.rpc('acknowledge_portal_announcement', {
        p_client_id: kansetClientId, p_announcement_key: announcementKey,
      })
      const directAcknowledgment = await bClient.from('portal_announcement_acknowledgments').insert({
        client_id: bClientId, auth_user_id: bUserId, announcement_key: 'forged_receipt',
      })
      check('UR0: review introduction receipt is durable per seat, tenant-scoped, and RPC-only',
        !acknowledged.error && !ownAcknowledgment.error && ownAcknowledgment.data?.length === 1
          && !viewerAcknowledgment.error && viewerAcknowledgment.data?.length === 0
          && !!crossAcknowledgment.error && !!directAcknowledgment.error,
        acknowledged.error?.message ?? ownAcknowledgment.error?.message
          ?? viewerAcknowledgment.error?.message ?? crossAcknowledgment.error?.message
          ?? directAcknowledgment.error?.message ?? JSON.stringify({ own: ownAcknowledgment.data,
            viewer: viewerAcknowledgment.data }))

      const reviewFlowId = `rls-review-flow-${RUN_ID}`
      const originalDesign = 'https://www.canva.com/design/REVIEWFLOW/view'
      const updatedDesign = 'https://www.canva.com/design/REVIEWFLOWUPDATED/view'
      const reviewPayload = snapshot(
        bClientId, reviewFlowId, 1, 'Unified review fixture',
        'Original review caption.', 'caption', { canva_url: originalDesign },
      )
      const reviewSync = await sync([reviewPayload])
      const reviewItemId = reviewSync[0]?.item_id
      const reviewRelease = await admin.rpc('mark_content_ready', {
        p_content_id: reviewItemId, p_content_version: 1,
      })
      if (!reviewItemId || reviewRelease.error) {
        throw new Error(reviewRelease.error?.message ?? 'unified review fixture release failed')
      }

      const bundleKey = randomUUID()
      const bundleArgs = {
        p_content_id: reviewItemId,
        p_content_version: 1,
        p_edits: [
          { target_kind: 'copy_block', target_key: 'caption', target_label: 'Instagram caption',
            proposed_text: 'Maria revised the review caption.', url_snapshot: null },
          { target_kind: 'design_link', target_key: 'canva', target_label: 'Canva design',
            proposed_text: 'Use the closed-mouth cover.', url_snapshot: originalDesign },
        ],
        p_note: null,
        p_idempotency_key: bundleKey,
      }
      const beforeActivity = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const bundle = await bClient.rpc('request_content_edit_bundle', bundleArgs)
      const retry = await bClient.rpc('request_content_edit_bundle', bundleArgs)
      const viewerBundle = await bViewerClient.rpc('request_content_edit_bundle', {
        ...bundleArgs, p_idempotency_key: randomUUID(),
      })
      const afterActivity = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      const requestIds = (bundle.data as { request_ids?: string[] } | null)?.request_ids ?? []
      const requests = requestIds.length ? await admin.from('content_change_requests')
        .select('id,status,payload').in('id', requestIds) : { data: [], error: new Error('bundle ids missing') }
      const bundleEvents = await admin.rpc('read_portal_inbox', {
        p_consumer_key: `rls-review-bundle-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
      })
      const matchingBundleEvents = (bundleEvents.data ?? []).filter((event) =>
        event.object_type === 'content_edit_review_bundle'
          && event.payload?.content_id === reviewItemId)
      check('UR1: one atomic retry-safe bundle records two binding targets and one notification event',
        !bundle.error && !retry.error && !!viewerBundle.error && requestIds.length === 2
          && (retry.data as { bundle_id?: string } | null)?.bundle_id
            === (bundle.data as { bundle_id?: string } | null)?.bundle_id
          && !requests.error && requests.data?.length === 2
          && (afterActivity.count ?? 0) - (beforeActivity.count ?? 0) === 1
          && !bundleEvents.error && matchingBundleEvents.length === 1,
        bundle.error?.message ?? retry.error?.message ?? requests.error?.message
          ?? bundleEvents.error?.message ?? JSON.stringify({ bundle: bundle.data, retry: retry.data,
            requestIds, activityDelta: (afterActivity.count ?? 0) - (beforeActivity.count ?? 0),
            events: matchingBundleEvents }))

      const blockedApproval = await bClient.rpc('record_content_decision', {
        p_content_id: reviewItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      check('UR2: an unresolved bundle blocks approval inside the decision RPC',
        !!blockedApproval.error && blockedApproval.error.message.includes('unresolved'),
        blockedApproval.error?.message ?? 'APPROVAL ACCEPTED')

      const visualRequest = requests.data?.find((row) => row.payload?.target_kind === 'design_link')
      const copyRequest = requests.data?.find((row) => row.payload?.target_kind === 'copy_block')
      const beginVisual = await admin.rpc('begin_visual_request_revision', {
        p_request_ids: visualRequest ? [visualRequest.id] : [], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const finalRequests = await admin.from('content_change_requests').select('id,status,canonical_version')
        .in('id', requestIds)
      check('UR3: a mixed bundle must start with copy so visual work joins one shared revision',
        !!visualRequest && !!copyRequest && !!beginVisual.error
          && beginVisual.error.message.includes('copy requests must start') && !finalRequests.error
          && finalRequests.data?.find((row) => row.id === visualRequest.id)?.status === 'pending'
          && finalRequests.data?.find((row) => row.id === copyRequest.id)?.status === 'pending',
        beginVisual.error?.message ?? finalRequests.error?.message
          ?? JSON.stringify(finalRequests.data))

      if (!visualRequest || !copyRequest) throw new Error('mixed review requests are unavailable')
      const sharedCandidate = await admin.rpc('upsert_content_request_review_candidate', {
        p_request_id: copyRequest.id,
        p_candidate_text: 'Maria revised the review caption.',
        p_change_summary: 'Accepted the requested caption exactly.',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const sharedCandidateApproval = await admin.rpc('approve_content_request_review_candidate', {
        p_request_id: copyRequest.id, p_expected_revision: 1,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const sharedStart = await admin.rpc('start_content_request_reconciliation', {
        p_request_id: copyRequest.id, p_requested_content_id: null, p_canonical_object_key: null,
        p_expected_base_commit: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const sharedBegin = await admin.rpc('begin_content_request_revision', {
        p_request_id: copyRequest.id, p_content_id: reviewItemId, p_content_version: 1,
      })
      const sharedCommit = '4'.repeat(40)
      const sharedV2 = snapshot(
        bClientId, reviewFlowId, 2, 'Unified review fixture v2',
        'Maria revised the review caption.', 'caption', { canva_url: updatedDesign },
      )
      sharedV2.source_commit_sha = sharedCommit
      const sharedSync = await sync([sharedV2])
      const sharedCopyPrepared = await admin.rpc('mark_content_request_prepared', {
        p_request_id: copyRequest.id, p_commit_sha: sharedCommit,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const sharedVisualBegin = await admin.rpc('begin_visual_request_revision', {
        p_request_ids: [visualRequest.id], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const sharedVisualReplacement = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: reviewFlowId, p_canva_url: updatedDesign,
        p_drive_url: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `shared-review-link-${RUN_ID}`,
      })
      const sharedVisualPrepared = await admin.rpc('mark_visual_request_revision_prepared', {
        p_request_ids: [visualRequest.id], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const sharedRelease = await admin.rpc('mark_content_ready', {
        p_content_id: reviewItemId, p_content_version: 2,
      })
      const sharedApplied = await admin.from('content_change_requests')
        .select('id,status,canonical_version').in('id', requestIds)
      const sharedApproval = await bClient.rpc('record_content_decision', {
        p_content_id: reviewItemId, p_content_version: 2,
        p_decision: 'approved', p_note: null,
      })
      const sharedFinalState = await bClient.from('content_with_state')
        .select('version,client_state,current_decision,revision_in_progress')
        .eq('id', reviewItemId).single()
      check('UR4: one mixed piece completes request, revision, re-release, and final client approval',
        !sharedCandidate.error && !sharedCandidateApproval.error
          && !sharedStart.error && !sharedBegin.error && sharedSync.length === 1
          && !sharedCopyPrepared.error && !sharedVisualBegin.error
          && !sharedVisualReplacement.error && !sharedVisualPrepared.error
          && !sharedRelease.error && !sharedApplied.error
          && sharedApplied.data?.length === 2
          && sharedApplied.data.every((row) => row.status === 'applied' && row.canonical_version === 2)
          && !sharedApproval.error && !sharedFinalState.error
          && sharedFinalState.data?.version === 2
          && sharedFinalState.data?.client_state === 'approved'
          && sharedFinalState.data?.current_decision === 'approved'
          && sharedFinalState.data?.revision_in_progress === false,
        sharedCandidate.error?.message ?? sharedCandidateApproval.error?.message
          ?? sharedStart.error?.message ?? sharedBegin.error?.message
          ?? sharedCopyPrepared.error?.message ?? sharedVisualBegin.error?.message
          ?? sharedVisualReplacement.error?.message ?? sharedVisualPrepared.error?.message
          ?? sharedRelease.error?.message ?? sharedApplied.error?.message
          ?? sharedApproval.error?.message ?? sharedFinalState.error?.message
          ?? JSON.stringify({ requests: sharedApplied.data, state: sharedFinalState.data }))

      const visualOnlyId = `rls-review-visual-${RUN_ID}`
      const visualOnlyOriginal = 'https://www.canva.com/design/VISUALONLY/view'
      const visualOnlyUpdated = 'https://www.canva.com/design/VISUALONLYUPDATED/view'
      const visualSync = await sync([snapshot(
        bClientId, visualOnlyId, 1, 'Visual-only review fixture',
        'Visual-only caption.', 'caption', { canva_url: visualOnlyOriginal },
      )])
      const visualItemId = visualSync[0]?.item_id
      const visualRelease = await admin.rpc('mark_content_ready', {
        p_content_id: visualItemId, p_content_version: 1,
      })
      if (!visualItemId || visualRelease.error) {
        throw new Error(visualRelease.error?.message ?? 'visual-only fixture release failed')
      }
      const visualBundle = await bClient.rpc('request_content_edit_bundle', {
        p_content_id: visualItemId, p_content_version: 1,
        p_edits: [{ target_kind: 'design_link', target_key: 'canva', target_label: 'Canva design',
          proposed_text: 'Use the approved closed-mouth cover.', url_snapshot: visualOnlyOriginal }],
        p_note: null, p_idempotency_key: randomUUID(),
      })
      const visualOnlyRequestId = (visualBundle.data as { request_ids?: string[] } | null)?.request_ids?.[0]
      const visualBegin = await admin.rpc('begin_visual_request_revision', {
        p_request_ids: visualOnlyRequestId ? [visualOnlyRequestId] : [], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const lateFollowUp = await bClient.rpc('request_content_edit_bundle', {
        p_content_id: visualItemId, p_content_version: 1,
        p_edits: [{ target_kind: 'copy_block', target_key: 'caption', target_label: 'Instagram caption',
          proposed_text: 'A late follow-up that must wait for re-review.', url_snapshot: null }],
        p_note: null, p_idempotency_key: randomUUID(),
      })
      const prematureReady = await admin.rpc('mark_visual_request_revision_prepared', {
        p_request_ids: visualOnlyRequestId ? [visualOnlyRequestId] : [], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const visualReplace = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: visualOnlyId, p_canva_url: visualOnlyUpdated,
        p_drive_url: null, p_actor_key: 'thedot-admin', p_idempotency_key: `visual-only-link-${RUN_ID}`,
      })
      const visualPrepared = await admin.rpc('mark_visual_request_revision_prepared', {
        p_request_ids: visualOnlyRequestId ? [visualOnlyRequestId] : [], p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      const visualFinalRelease = await admin.rpc('mark_content_ready', {
        p_content_id: visualItemId, p_content_version: 2,
      })
      const visualFinalRequest = visualOnlyRequestId
        ? await admin.from('content_change_requests').select('status,canonical_version')
          .eq('id', visualOnlyRequestId).single()
        : { data: null, error: new Error('visual request missing') }
      check('UR5: visual-only edits require a later replacement event and release as a new version',
        !visualBundle.error && !!visualOnlyRequestId && !visualBegin.error
          && !!lateFollowUp.error && lateFollowUp.error.message.includes('revision_already_in_progress')
          && !!prematureReady.error && prematureReady.error.message.includes('replacement')
          && !visualReplace.error && !visualPrepared.error && !visualFinalRelease.error
          && !visualFinalRequest.error && visualFinalRequest.data?.status === 'applied'
          && visualFinalRequest.data?.canonical_version === 2,
        visualBundle.error?.message ?? visualBegin.error?.message ?? visualReplace.error?.message
          ?? visualPrepared.error?.message ?? visualFinalRelease.error?.message
          ?? visualFinalRequest.error?.message ?? JSON.stringify({ premature: prematureReady.error?.message,
            request: visualFinalRequest.data }))
    }

    // 0084: discard_orphaned_working_version. A guarded removal of a working version that was
    // never client-visible. The dangerous failure is it removing something released or
    // referenced, so every guard is exercised as an attack, not just the happy path.
    {
      const dwvItem = await admin.from('content_items').select('id, working_version, client_visible_version')
        .eq('id', bItemId).maybeSingle()
      const releasedVersion = dwvItem.data?.client_visible_version ?? 1
      // Baseline taken BEFORE the attempts. Asserting only that rows still exist afterwards
      // would pass even if a guard had deleted one, which is the whole thing under test.
      const versionsBefore = await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
        .eq('content_item_id', bItemId)

      const notReachable = await bClient.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_version: 99,
        p_reason: 'authenticated must not reach this function', p_actor_key: 'attacker',
        p_idempotency_key: randomUUID(),
      })
      check('DWV1: authenticated cannot execute discard_orphaned_working_version', !!notReachable.error,
        notReachable.error?.message ?? 'NO ERROR')

      const releasedAttempt = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_version: releasedVersion,
        p_reason: 'attempt to discard a version the client has seen', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      check('DWV2: a released version cannot be discarded',
        !!releasedAttempt.error && /released and is permanent/.test(releasedAttempt.error.message),
        releasedAttempt.error?.message ?? 'NO ERROR')

      const notTip = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_version: releasedVersion + 5,
        p_reason: 'attempt to punch a hole in the version sequence', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      check('DWV3: only the working tip can be discarded',
        !!notTip.error && /not the working tip/.test(notTip.error.message),
        notTip.error?.message ?? 'NO ERROR')

      const shortReason = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: B_CONTENT_ID, p_version: releasedVersion + 1,
        p_reason: 'short', p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('DWV4: a reason is required', !!shortReason.error && /reason of at least/.test(shortReason.error.message),
        shortReason.error?.message ?? 'NO ERROR')

      const wrongTenant = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: randomUUID(), p_content_id: B_CONTENT_ID, p_version: releasedVersion + 1,
        p_reason: 'attempt to reach another tenant piece', p_actor_key: 'thedot-admin',
        p_idempotency_key: randomUUID(),
      })
      check('DWV5: the function is tenant-scoped', !!wrongTenant.error && /no content item/.test(wrongTenant.error.message),
        wrongTenant.error?.message ?? 'NO ERROR')

      const versionsAfter = await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
        .eq('content_item_id', bItemId)
      check('DWV6: no refused attempt removed a version row',
        (versionsBefore.count ?? 0) > 0 && versionsBefore.count === versionsAfter.count,
        `before=${versionsBefore.count} after=${versionsAfter.count}`)
    }

    // The reference guard and the happy path need a piece whose working tip is genuinely ahead
    // of what the client has seen, which is the shape the 2026-09-15 reconciliation failure left
    // behind. Two throwaway pieces are built here rather than reusing B_CONTENT_ID, so the
    // attacks above keep the state they asserted on.
    {
      async function orphanFixture(suffix: string): Promise<string> {
        const contentId = `rls-discard-${suffix}-${RUN_ID}`
        await sync([snapshot(bClientId!, contentId, 1, 'Discard fixture v1', 'Released body', 'main')])
        const item = await admin.from('content_items').select('id')
          .eq('client_id', bClientId!).eq('content_id', contentId).single()
        if (item.error || !item.data) throw new Error(`discard fixture ${suffix}: ${item.error?.message ?? 'missing'}`)
        const ready = await admin.rpc('mark_content_ready', { p_content_id: item.data.id, p_content_version: 1 })
        if (ready.error) throw new Error(`discard fixture ${suffix} release: ${ready.error.message}`)
        // A released piece will not accept a new version without an open revision. That guard is
        // the reason an orphaned tip is hard to clear, so the fixture has to go through it.
        const revision = await admin.rpc('begin_content_revision', {
          p_content_id: item.data.id, p_content_version: 1,
        })
        if (revision.error) throw new Error(`discard fixture ${suffix} revision: ${revision.error.message}`)
        await sync([snapshot(bClientId!, contentId, 2, 'Discard fixture v2', 'Orphaned working body', 'main')])
        return contentId
      }

      // Guard 3: a version carrying a review asset is work someone is looking at, not an orphan.
      const heldId = await orphanFixture('held')
      const heldItem = await admin.from('content_items').select('id').eq('client_id', bClientId)
        .eq('content_id', heldId).single()
      const assetAttached = await admin.rpc('set_content_review_asset', {
        p_client_id: bClientId, p_content_id: heldId, p_content_version: 2,
        p_asset_key: 'discard-guard-cover', p_label: 'Discard guard cover',
        p_channel: 'social', p_asset_kind: 'cover',
        p_url: 'https://www.canva.com/design/DISCARDGUARD/view',
        p_width_px: 1080, p_height_px: 1350, p_caption_status: 'not_applicable',
        p_review_note: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-discard-asset-${RUN_ID}`,
      })
      const heldAttempt = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: heldId, p_version: 2,
        p_reason: 'attempt to discard a version a reviewer is still looking at',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const heldStillThere = await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
        .eq('content_item_id', heldItem.data?.id).eq('version', 2)
      check('DWV7: a version with a review asset attached cannot be discarded',
        !assetAttached.error && !!heldAttempt.error && /review asset/.test(heldAttempt.error.message)
          && heldStillThere.count === 1,
        assetAttached.error?.message ?? heldAttempt.error?.message ?? `remaining=${heldStillThere.count}`)

      // The happy path: an unreferenced working tip the client never saw.
      const freeId = await orphanFixture('free')
      const freeItem = await admin.from('content_items').select('id').eq('client_id', bClientId)
        .eq('content_id', freeId).single()
      const freeItemId = freeItem.data?.id
      const beforeDiscard = await admin.from('content_items')
        .select('working_version, client_visible_version').eq('id', freeItemId).single()
      const discarded = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: freeId, p_version: 2,
        p_reason: 'orphaned by a failed reconciliation, never client-visible',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const afterDiscard = await admin.from('content_items')
        .select('working_version, client_visible_version').eq('id', freeItemId).single()
      const rowGone = await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
        .eq('content_item_id', freeItemId).eq('version', 2)
      const v1Survived = await admin.from('content_item_versions').select('id', { count: 'exact', head: true })
        .eq('content_item_id', freeItemId).eq('version', 1)
      check('DWV8: an unreferenced working tip is discarded and the tip moves back',
        !discarded.error && beforeDiscard.data?.working_version === 2
          && afterDiscard.data?.working_version === 1
          && afterDiscard.data?.client_visible_version === 1
          && rowGone.count === 0 && v1Survived.count === 1,
        discarded.error?.message ?? JSON.stringify({ before: beforeDiscard.data, after: afterDiscard.data,
          v2: rowGone.count, v1: v1Survived.count }))

      const logged = await bClient.from('activity_log')
        .select('event_type, content_version, summary, actor_type, actor_name')
        .eq('content_id', freeItemId).eq('event_type', 'working_version_discarded')
      check('DWV9: the removal is written to the activity log with its reason',
        !logged.error && logged.data?.length === 1 && logged.data[0].content_version === 2
          && logged.data[0].actor_type === 'anastasia'
          && /orphaned by a failed reconciliation/.test(String(logged.data[0].summary)),
        logged.error?.message ?? JSON.stringify(logged.data))

      // The actor gate: an unknown key cannot remove anything, whatever else is true.
      const unknownActor = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: heldId, p_version: 2,
        p_reason: 'unknown actor key must not be able to discard',
        p_actor_key: `ghost-${RUN_ID}`, p_idempotency_key: randomUUID(),
      })
      check('DWV9b: an unknown agency actor cannot discard',
        !!unknownActor.error && /unknown or inactive agency actor/.test(unknownActor.error.message),
        unknownActor.error?.message ?? 'NO ERROR')

      // The event must never reach her by email. It is absent from the email vocabulary, so
      // no client email row may exist for it.
      const mailed = await admin.from('notification_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId).eq('recipient_kind', 'client').eq('channel', 'email')
        .ilike('subject', '%Working version discarded%')
      check('DWV9c: discarding a working version sends the client no email',
        !mailed.error && mailed.count === 0, mailed.error?.message ?? `count=${mailed.count}`)

      // Re-running the same discard must not walk backwards into released history.
      const repeat = await admin.rpc('discard_orphaned_working_version', {
        p_client_id: bClientId, p_content_id: freeId, p_version: 2,
        p_reason: 'repeat of a completed discard must not cascade',
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const afterRepeat = await admin.from('content_items')
        .select('working_version, client_visible_version').eq('id', freeItemId).single()
      check('DWV10: repeating a completed discard refuses and never touches the released version',
        !!repeat.error && afterRepeat.data?.working_version === 1
          && afterRepeat.data?.client_visible_version === 1,
        repeat.error?.message ?? JSON.stringify(afterRepeat.data))

      // The point of the whole migration: the retry that used to die on "version 2 already
      // exists with a different checksum" has to succeed afterwards. The open revision is left
      // open on purpose, because the edit is still owed; begin_content_revision is a no-op in
      // that state, so the reconciler picks up exactly where it failed.
      const revisionStillOpen = await admin.from('content_items')
        .select('revision_in_progress, status').eq('id', freeItemId).single()
      const reBegin = await admin.rpc('begin_content_revision', { p_content_id: freeItemId, p_content_version: 1 })
      const reSync = await admin.rpc('sync_content_item_versions', {
        p_items: [snapshot(bClientId!, freeId, 2, 'Discard fixture v2 corrected', 'Corrected working body', 'main')],
      })
      const reSynced = await admin.from('content_items')
        .select('working_version, client_visible_version').eq('id', freeItemId).single()
      check('DWV11: after a discard the failed reconciliation can be retried and lands v2',
        revisionStillOpen.data?.revision_in_progress === true && !reBegin.error && !reSync.error
          && reSynced.data?.working_version === 2 && reSynced.data?.client_visible_version === 1,
        reBegin.error?.message ?? reSync.error?.message
          ?? JSON.stringify({ open: revisionStillOpen.data, after: reSynced.data }))
    }

    // 0085: record_agency_applied_release. Applying Maria's own edits and moving the piece
    // forward must never arm her review, and must never be able to email her. The dangerous
    // failures are the opposite of the discard's: not deleting too much, but notifying when it
    // must not, or suppressing a notification that a genuine release still owes.
    {
      async function releasableFixture(suffix: string): Promise<{ contentId: string; itemId: string }> {
        const contentId = `rls-applied-${suffix}-${RUN_ID}`
        await sync([snapshot(bClientId!, contentId, 1, 'Applied release v1', 'Released body', 'main',
          { producer: 'studio' })])
        const item = await admin.from('content_items').select('id')
          .eq('client_id', bClientId!).eq('content_id', contentId).single()
        if (item.error || !item.data) throw new Error(`applied fixture ${suffix}: ${item.error?.message ?? 'missing'}`)
        const ready = await admin.rpc('mark_content_ready', { p_content_id: item.data.id, p_content_version: 1 })
        if (ready.error) throw new Error(`applied fixture ${suffix} release: ${ready.error.message}`)
        const revision = await admin.rpc('begin_content_revision', {
          p_content_id: item.data.id, p_content_version: 1,
        })
        if (revision.error) throw new Error(`applied fixture ${suffix} revision: ${revision.error.message}`)
        await sync([snapshot(bClientId!, contentId, 2, 'Applied release v2', 'Body with her edits applied', 'main',
          { producer: 'studio' })])
        return { contentId, itemId: item.data.id }
      }
      const REASON = 'Agency override authorized by Anastasia: v2 applies the edits she submitted, '
        + 'so the piece moves forward instead of returning to her.'

      const target = await releasableFixture('ok')

      // The ordinary release path must still arm her review. If 0085 broke that, every genuine
      // review package would go out silently, which is worse than the bug it fixes.
      const armedOnV1 = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
        .eq('content_id', target.itemId).eq('content_version', 1).eq('event_type', 'needs_review')
      check('AAR0: an ordinary release still arms the client review', armedOnV1.count === 1,
        `needs_review rows on v1 = ${armedOnV1.count}`)

      const notReachable = await bClient.rpc('record_agency_applied_release', {
        p_content_id: target.itemId, p_content_version: 2,
        p_reason: REASON, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('AAR1: authenticated cannot execute record_agency_applied_release', !!notReachable.error,
        notReachable.error?.message ?? 'NO ERROR')

      const ghost = await admin.rpc('record_agency_applied_release', {
        p_content_id: target.itemId, p_content_version: 2,
        p_reason: REASON, p_actor_key: `ghost-${RUN_ID}`, p_idempotency_key: randomUUID(),
      })
      check('AAR2: an unknown agency actor cannot release',
        !!ghost.error && /unknown or inactive agency actor/.test(ghost.error.message),
        ghost.error?.message ?? 'NO ERROR')

      const backwards = await admin.rpc('record_agency_applied_release', {
        p_content_id: target.itemId, p_content_version: 1,
        p_reason: REASON, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('AAR3: a version at or below the released one cannot be re-released',
        !!backwards.error && /not ahead of the released version/.test(backwards.error.message),
        backwards.error?.message ?? 'NO ERROR')

      const mailBefore = await admin.from('notification_outbox').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId).eq('recipient_kind', 'client').eq('channel', 'email')
      const released = await admin.rpc('record_agency_applied_release', {
        p_content_id: target.itemId, p_content_version: 2,
        p_reason: REASON, p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const after = await admin.from('content_items')
        .select('status, working_version, client_visible_version, review_ready_at, revision_in_progress')
        .eq('id', target.itemId).single()
      check('AAR4: the piece lands on approved with v2 as the released version',
        !released.error && after.data?.status === 'approved'
          && after.data?.working_version === 2 && after.data?.client_visible_version === 2
          && after.data?.review_ready_at === null && after.data?.revision_in_progress === false,
        released.error?.message ?? JSON.stringify(after.data))

      const armedOnV2 = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
        .eq('content_id', target.itemId).eq('content_version', 2).eq('event_type', 'needs_review')
      check('AAR5: the agency release arms no client review', armedOnV2.count === 0,
        `needs_review rows on v2 = ${armedOnV2.count}`)

      const mailAfter = await admin.from('notification_outbox').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId).eq('recipient_kind', 'client').eq('channel', 'email')
      check('AAR6: the agency release sends the client no email',
        mailBefore.count === mailAfter.count, `before=${mailBefore.count} after=${mailAfter.count}`)

      const audit = await bClient.from('activity_log').select('event_type, actor_type')
        .eq('content_id', target.itemId).eq('content_version', 2).eq('event_type', 'courtesy_release_recorded')
      check('AAR7: the release is recorded for audit',
        !audit.error && audit.data?.length === 1 && audit.data[0].actor_type === 'anastasia',
        audit.error?.message ?? JSON.stringify(audit.data))

      // The suppression must not leak past its own transaction. A later ordinary release of a
      // different piece has to arm review exactly as before.
      const control = await releasableFixture('control')
      const controlArmed = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
        .eq('content_id', control.itemId).eq('content_version', 1).eq('event_type', 'needs_review')
      check('AAR8: review arming still works after an agency release in the same session',
        controlArmed.count === 1, `needs_review rows = ${controlArmed.count}`)
    }

    // 0087: record_agency_supersession. Replacing copy on a version the client has been shown but
    // has not decided on. The dangerous failures are notifying her a second time, and quietly
    // replacing something she HAS decided on.
    {
      async function shownFixture(suffix: string): Promise<{ contentId: string; itemId: string }> {
        const contentId = `rls-supersede-${suffix}-${RUN_ID}`
        await sync([snapshot(bClientId!, contentId, 1, 'Supersede v1', 'Copy she was shown', 'main',
          { producer: 'the_dot' })])
        const item = await admin.from('content_items').select('id')
          .eq('client_id', bClientId!).eq('content_id', contentId).single()
        if (item.error || !item.data) throw new Error(`supersede fixture ${suffix}: ${item.error?.message ?? 'missing'}`)
        const ready = await admin.rpc('mark_content_ready', { p_content_id: item.data.id, p_content_version: 1 })
        if (ready.error) throw new Error(`supersede fixture ${suffix} release: ${ready.error.message}`)
        const revision = await admin.rpc('begin_content_revision', {
          p_content_id: item.data.id, p_content_version: 1,
        })
        if (revision.error) throw new Error(`supersede fixture ${suffix} revision: ${revision.error.message}`)
        await sync([snapshot(bClientId!, contentId, 2, 'Supersede v2', 'Corrected copy before she decided', 'main',
          { producer: 'the_dot' })])
        return { contentId, itemId: item.data.id }
      }
      const REASON = 'Agency override authorized by Anastasia: captions rewritten before her review.'

      const target = await shownFixture('ok')

      const notReachable = await bClient.rpc('record_agency_supersession', {
        p_content_id: target.itemId, p_content_version: 2, p_reason: REASON,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('SUP1: authenticated cannot execute record_agency_supersession', !!notReachable.error,
        notReachable.error?.message ?? 'NO ERROR')

      const ghost = await admin.rpc('record_agency_supersession', {
        p_content_id: target.itemId, p_content_version: 2, p_reason: REASON,
        p_actor_key: `ghost-${RUN_ID}`, p_idempotency_key: randomUUID(),
      })
      check('SUP2: an unknown agency actor cannot supersede',
        !!ghost.error && /unknown or inactive agency actor/.test(ghost.error.message),
        ghost.error?.message ?? 'NO ERROR')

      const backwards = await admin.rpc('record_agency_supersession', {
        p_content_id: target.itemId, p_content_version: 1, p_reason: REASON,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      check('SUP3: the released version cannot supersede itself',
        !!backwards.error && /not ahead of the released version/.test(backwards.error.message),
        backwards.error?.message ?? 'NO ERROR')

      const mailBefore = await admin.from('notification_outbox').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId).eq('recipient_kind', 'client').eq('channel', 'email')
      const done = await admin.rpc('record_agency_supersession', {
        p_content_id: target.itemId, p_content_version: 2, p_reason: REASON,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const after = await admin.from('content_items')
        .select('status, working_version, client_visible_version, review_ready_at, revision_in_progress')
        .eq('id', target.itemId).single()
      const state = await admin.from('content_with_state').select('client_state')
        .eq('id', target.itemId).maybeSingle()
      check('SUP4: the new version becomes visible and the piece still awaits her review',
        !done.error && after.data?.client_visible_version === 2 && after.data?.status === 'draft'
          && after.data?.review_ready_at !== null && after.data?.revision_in_progress === false
          && state.data?.client_state === 'needs_review',
        done.error?.message ?? JSON.stringify({ item: after.data, state: state.data }))

      const armed = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
        .eq('content_id', target.itemId).eq('content_version', 2).eq('event_type', 'needs_review')
      check('SUP5: superseding arms no second review', armed.count === 0, `needs_review rows on v2 = ${armed.count}`)

      const mailAfter = await admin.from('notification_outbox').select('id', { count: 'exact', head: true })
        .eq('client_id', bClientId).eq('recipient_kind', 'client').eq('channel', 'email')
      check('SUP6: superseding sends the client no email',
        mailBefore.count === mailAfter.count, `before=${mailBefore.count} after=${mailAfter.count}`)

      // The precondition that makes silence honest: she has not decided. Once she has, refuse.
      // Built in the real order: release v1, she approves it, only then does a v2 appear.
      const decidedId = `rls-supersede-decided-${RUN_ID}`
      await sync([snapshot(bClientId!, decidedId, 1, 'Decided v1', 'Copy she approved', 'main',
        { producer: 'the_dot' })])
      const decidedItem = await admin.from('content_items').select('id')
        .eq('client_id', bClientId!).eq('content_id', decidedId).single()
      const decidedItemId = decidedItem.data!.id
      const decidedReady = await admin.rpc('mark_content_ready', {
        p_content_id: decidedItemId, p_content_version: 1,
      })
      if (decidedReady.error) throw new Error(`supersede decided release: ${decidedReady.error.message}`)
      // She cannot approve a package with no design link, so give it one before she decides.
      const decidedLink = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: decidedId,
        p_canva_url: 'https://www.canva.com/design/SUPERSEDEDECIDED/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `supersede-link-${RUN_ID}`,
      })
      if (decidedLink.error) throw new Error(`supersede decided link: ${decidedLink.error.message}`)
      const decision = await bClient.rpc('record_content_decision', {
        p_content_id: decidedItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const decidedRevision = await admin.rpc('begin_content_revision', {
        p_content_id: decidedItemId, p_content_version: 1,
      })
      if (decidedRevision.error) throw new Error(`supersede decided revision: ${decidedRevision.error.message}`)
      await sync([snapshot(bClientId!, decidedId, 2, 'Decided v2', 'Copy replacing what she approved', 'main',
        { producer: 'the_dot' })])
      const overDecision = await admin.rpc('record_agency_supersession', {
        p_content_id: decidedItemId, p_content_version: 2, p_reason: REASON,
        p_actor_key: 'thedot-admin', p_idempotency_key: randomUUID(),
      })
      const stillV1 = await admin.from('content_items').select('client_visible_version')
        .eq('id', decidedItemId).single()
      check('SUP7: a version she has already decided on cannot be superseded quietly',
        !decision.error && !!overDecision.error
          && /already carries a client decision/.test(overDecision.error.message)
          && stillV1.data?.client_visible_version === 1,
        decision.error?.message ?? overDecision.error?.message ?? JSON.stringify(stillV1.data))
    }

    // 0088: a client edit carries the whole rewritten block, and long-form blocks are far larger
    // than the caption-era 8,000 limit allowed. Maria could not edit a 15,483-character article
    // body, and the refusal was silent to the agency.
    {
      const LONG = `Long-form paragraph. ${'The article continues at length. '.repeat(600)}`
      const SHORT = 'A caption-sized edit.'
      check('LF0: the fixture text is genuinely past the old limit',
        LONG.length > 8000 && LONG.length < 50000, `${LONG.length} characters`)

      const longEdit = await bClient.rpc('request_content_edit', {
        p_content_id: bItemId, p_content_version: 1, p_block_key: 'main',
        p_proposed_text: LONG, p_idempotency_key: randomUUID(),
      })
      check('LF1: a long-form block can be edited by the client',
        !longEdit.error, longEdit.error?.message ?? 'accepted')

      // The bound still exists. A limit that quietly disappears is as bad as one set too small.
      const tooLong = await bClient.rpc('request_content_edit', {
        p_content_id: bItemId, p_content_version: 1, p_block_key: 'main',
        p_proposed_text: 'x'.repeat(50001), p_idempotency_key: randomUUID(),
      })
      check('LF2: text beyond the new limit is still refused', !!tooLong.error,
        tooLong.error?.message ?? 'NO ERROR')

      const empty = await bClient.rpc('request_content_edit', {
        p_content_id: bItemId, p_content_version: 1, p_block_key: 'main',
        p_proposed_text: '   ', p_idempotency_key: randomUUID(),
      })
      check('LF3: an empty edit is still refused', !!empty.error, empty.error?.message ?? 'NO ERROR')
      check('LF4: a caption-sized edit is unaffected', SHORT.length < 8000, `${SHORT.length} characters`)
    }

    // 0092: portal review previews. Private bucket with no client storage policy, row-level read
    // for the owning seat on the released version only, signed links from the server, full
    // episodes refused, retention on live-everywhere and on planned date + 7 days.
    {
      const previewDir = joinPath(tmpdir(), `kanset-rls-preview-${RUN_ID}`)
      await mkdir(previewDir, { recursive: true })
      const fixture = async (name: string, body: string) => {
        const file = joinPath(previewDir, name)
        await writeFile(file, body)
        return file
      }
      const video = await fixture('reel.mp4', `fake mp4 ${RUN_ID}`)
      const poster = await fixture('poster.jpg', `fake poster ${RUN_ID}`)
      const frameA = await fixture('frame-a.jpg', `frame a ${RUN_ID}`)
      const frameB = await fixture('frame-b.jpg', `frame b ${RUN_ID}`)
      const tools: PreviewTools = {
        probe: async () => ({ width: 1080, height: 1920, durationSeconds: 24 }),
        faststart: async (input) => input,
        extractPoster: async () => poster,
        readFile: (file) => readFile(file),
        statSize: async (file) => (await stat(file)).size,
      }
      const request = (contentId: string, frames: string[], previewKey = 'reel'): ReviewPreviewRequest => ({
        clientSlug: B_SLUG, contentId, contentVersion: 1, previewKey, reviewAssetKey: null,
        video, poster, frames: frames.map((file, index) => ({ path: file, label: `Frame ${index + 1}` })),
        pages: [], actorKey: 'thedot-admin',
      })
      const releasedPiece = async (contentId: string, extra: Record<string, unknown> = {}) => {
        const [synced] = await sync([snapshot(bClientId!, contentId, 1, `Preview ${contentId}`, 'Preview body', 'caption', extra)])
        const design = await admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: contentId,
          p_canva_url: `https://www.canva.com/design/${contentId.replace(/[^a-z0-9]/gi, '').toUpperCase()}/view`,
          p_drive_url: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-preview-design-${contentId}`,
        })
        if (design.error) throw new Error(`preview design ${contentId}: ${design.error.message}`)
        const ready = await admin.rpc('mark_content_ready', { p_content_id: synced.item_id, p_content_version: 1 })
        if (ready.error) throw new Error(`preview ready ${contentId}: ${ready.error.message}`)
        return synced.item_id
      }
      const registerArgs = (contentId: string, previewKey: string, overrides: Record<string, unknown> = {}) => ({
        p_client_id: bClientId, p_content_id: contentId, p_content_version: 1, p_preview_key: previewKey,
        p_review_asset_key: null, p_media_kind: 'video', p_object_prefix: '', p_video_path: null,
        p_poster_path: null, p_frames: [], p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 30,
        p_byte_total: 1000, p_source_sha256: 'a'.repeat(64), p_actor_key: 'thedot-admin', ...overrides,
      })

      try {
        const previewContentId = `rls-preview-${RUN_ID}`
        const previewItemId = await releasedPiece(previewContentId)
        const first = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: previewItemId, request: request(previewContentId, [frameA]),
        })
        const again = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: previewItemId, request: request(previewContentId, [frameA]),
        })
        const uploadLog = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .eq('content_id', previewItemId).eq('event_type', 'review_preview_uploaded')
        check('RP1: an identical re-upload is idempotent and logs one upload',
          first.outcome === 'registered' && again.outcome === 'unchanged' && again.previewId === first.previewId
            && !uploadLog.error && uploadLog.data?.length === 1,
          JSON.stringify({ first, again, log: uploadLog.data?.length, error: uploadLog.error?.message }))

        const own = await bClient.from('content_review_previews').select('id, video_path').eq('id', first.previewId)
        check('RP2: the owning client seat reads its released preview row',
          !own.error && own.data?.length === 1, own.error?.message ?? JSON.stringify(own.data))
        const cross = await kansetClient.from('content_review_previews').select('id').eq('id', first.previewId)
        check('RP3: another tenant seat cannot read the preview row',
          !cross.error && cross.data?.length === 0, cross.error?.message ?? JSON.stringify(cross.data))
        const anonRows = await anonClient.from('content_review_previews').select('id').eq('id', first.previewId)
        check('RP4: anon cannot read preview rows',
          !!anonRows.error || anonRows.data?.length === 0, anonRows.error?.message ?? JSON.stringify(anonRows.data))

        const hiddenContentId = `rls-preview-hidden-${RUN_ID}`
        const [hiddenSync] = await sync([snapshot(bClientId!, hiddenContentId, 1, 'Hidden preview', 'Hidden body', 'caption')])
        const hidden = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: hiddenSync.item_id, request: request(hiddenContentId, [frameA]),
        })
        const hiddenRead = await bClient.from('content_review_previews').select('id').eq('id', hidden.previewId)
        check('RP5: a preview of an unreleased version is invisible to the client seat',
          !hiddenRead.error && hiddenRead.data?.length === 0, hiddenRead.error?.message ?? JSON.stringify(hiddenRead.data))

        const videoPath = `${first.objectPrefix}video.mp4`
        const directDownload = await bClient.storage.from(REVIEW_PREVIEW_BUCKET).download(videoPath)
        const directSign = await bClient.storage.from(REVIEW_PREVIEW_BUCKET).createSignedUrl(videoPath, 60)
        const anonDownload = await anonClient.storage.from(REVIEW_PREVIEW_BUCKET).download(videoPath)
        const publicFetch = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${REVIEW_PREVIEW_BUCKET}/${videoPath}`)
        check('RP6: no seat and no anonymous caller can read preview objects directly',
          !!directDownload.error && !!directSign.error && !!anonDownload.error && publicFetch.status >= 400,
          JSON.stringify({ download: directDownload.error?.message, sign: directSign.error?.message,
            anon: anonDownload.error?.message, publicStatus: publicFetch.status }))

        const bucket = await admin.storage.getBucket(REVIEW_PREVIEW_BUCKET)
        check('RP7: the preview bucket is private', !bucket.error && bucket.data?.public === false,
          bucket.error?.message ?? JSON.stringify(bucket.data))

        const agencyRow = await admin.from('content_review_previews').select(REVIEW_PREVIEW_COLUMNS)
          .eq('id', first.previewId).single()
        const signed = agencyRow.data
          ? await signReviewPreview(admin.storage, agencyRow.data as unknown as ReviewPreviewRow) : null
        const served = signed?.videoUrl ? await fetch(signed.videoUrl) : null
        const servedBody = served?.ok ? await served.text() : null
        check('RP8: the server signs a short-lived link that serves the exact bytes',
          servedBody === `fake mp4 ${RUN_ID}`, agencyRow.error?.message ?? `status ${served?.status}`)

        const clientRegister = await bClient.rpc('agency_register_review_preview', registerArgs(previewContentId, 'forged'))
        const clientRetire = await bClient.rpc('agency_retire_review_previews', {
          p_now: new Date().toISOString(), p_content_item_id: null,
        })
        const clientComplete = await bClient.rpc('agency_complete_review_preview_removal', {
          p_removal_id: randomUUID(), p_error: null,
        })
        const clientRemovals = await bClient.from('content_review_preview_removals').select('id')
        check('RP9: client seats cannot call preview writers or read the removal queue',
          !!clientRegister.error && !!clientRetire.error && !!clientComplete.error
            && (!!clientRemovals.error || clientRemovals.data?.length === 0),
          JSON.stringify({ register: clientRegister.error?.message ?? 'WROTE', retire: clientRetire.error?.message ?? 'RAN',
            complete: clientComplete.error?.message ?? 'RAN', removals: clientRemovals.data?.length }))

        const podcastId = `rls-preview-podcast-${RUN_ID}`
        await sync([snapshot(bClientId!, podcastId, 1, 'Podcast episode', 'Episode body', 'caption', { format: 'podcast' })])
        const episode = await admin.rpc('agency_register_review_preview', registerArgs(podcastId, 'episode', { p_duration_seconds: 120 }))
        const [podcastItem] = (await admin.from('content_items').select('id').eq('client_id', bClientId!).eq('content_id', podcastId)).data ?? []
        const teaser = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: podcastItem.id, request: request(podcastId, [frameA], 'teaser'),
        })
        check('RP10: a full podcast episode is refused while its teaser is accepted',
          !!episode.error && /full podcast episodes/.test(episode.error.message) && teaser.outcome === 'registered',
          episode.error?.message ?? 'EPISODE ACCEPTED')

        const longCut = await admin.rpc('agency_register_review_preview',
          registerArgs(previewContentId, 'long-cut', { p_duration_seconds: 2213 }))
        check('RP11: a video longer than 240 seconds is refused',
          !!longCut.error && /240 seconds/.test(longCut.error.message), longCut.error?.message ?? 'ACCEPTED')

        const replaced = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: previewItemId, request: request(previewContentId, [frameA, frameB]),
        })
        const oldVideo = await admin.storage.from(REVIEW_PREVIEW_BUCKET).download(videoPath)
        const newVideo = await admin.storage.from(REVIEW_PREVIEW_BUCKET).download(`${replaced.objectPrefix}video.mp4`)
        const replacedLog = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .eq('content_id', previewItemId).eq('event_type', 'review_preview_deleted')
        check('RP12: a changed upload replaces the preview, deletes the old objects and logs it',
          replaced.outcome === 'replaced' && replaced.previewId !== first.previewId
            && !!oldVideo.error && !newVideo.error
            && (replacedLog.data ?? []).some((row: { id: string; summary: string | null }) => /new preview replaced/i.test(row.summary ?? '')),
          JSON.stringify({ replaced, old: oldVideo.error?.message ?? 'STILL THERE', log: replacedLog.data }))

        const datedId = `rls-preview-dated-${RUN_ID}`
        const datedItemId = await releasedPiece(datedId, { planned_date: '2027-07-21' })
        const dated = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: datedItemId, request: request(datedId, [frameA]),
        })
        const sevenDays = await runPreviewRetention(admin, { now: new Date('2027-07-28T16:00:00Z'), contentItemId: datedItemId })
        const keptRow = await admin.from('content_review_previews').select('id').eq('id', dated.previewId)
        check('RT1: a preview exactly 7 days past its planned date is kept',
          sevenDays.retired === 0 && keptRow.data?.length === 1, JSON.stringify({ sevenDays, rows: keptRow.data }))
        const eightDays = await runPreviewRetention(admin, { now: new Date('2027-07-29T16:00:00Z'), contentItemId: datedItemId })
        const goneRow = await admin.from('content_review_previews').select('id').eq('id', dated.previewId)
        const datedObject = await admin.storage.from(REVIEW_PREVIEW_BUCKET).download(`${dated.objectPrefix}video.mp4`)
        const datedLog = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .eq('content_id', datedItemId).eq('event_type', 'review_preview_deleted')
        check('RT2: past 7 days the sweep deletes the row and the objects and logs the deletion',
          eightDays.retired === 1 && eightDays.removed >= 1 && goneRow.data?.length === 0 && !!datedObject.error
            && datedLog.data?.length === 1 && /more than 7 days/.test(datedLog.data[0].summary ?? '')
            && datedLog.data[0].actor_type === 'agent',
          JSON.stringify({ eightDays, rows: goneRow.data, log: datedLog.data }))

        const liveId = `rls-preview-live-${RUN_ID}`
        const liveItemId = await releasedPiece(liveId, { platforms: ['instagram'] })
        const live = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: liveItemId, request: request(liveId, [frameA]),
        })
        const approved = await bClient.rpc('record_content_decision', {
          p_content_id: liveItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
        })
        if (approved.error) throw new Error(`preview live approval: ${approved.error.message}`)
        const beforeLive = await purgePreviewsAfterPublication(admin, liveItemId)
        check('RT3: a piece with a destination not yet live keeps its preview',
          beforeLive?.retired === 0, JSON.stringify(beforeLive))
        const target = await admin.from('content_publication_targets').select('id,current_observation_id')
          .eq('content_id', liveItemId).eq('content_version', 1).eq('destination', 'instagram').single()
        if (target.error || !target.data) throw new Error(`preview live target: ${target.error?.message ?? 'missing'}`)
        const evidence = await admin.rpc('register_publication_evidence', {
          p_client_id: bClientId, p_actor_key: 'thedot-admin', p_evidence_kind: 'reviewed_link',
          p_object_key: null, p_evidence_url: `https://www.instagram.com/reel/rlspreview${RUN_ID}/`,
          p_attestation_note: null, p_captured_at: new Date().toISOString(), p_sha256: null,
          p_mime_type: null, p_byte_length: null, p_idempotency_key: `rls-preview-evidence-${RUN_ID}`,
        })
        if (evidence.error || !evidence.data) throw new Error(`preview live evidence: ${evidence.error?.message ?? 'missing'}`)
        const observed = await admin.rpc('record_publication_observation', {
          p_publication_target_id: target.data.id, p_provider_state: 'live',
          p_live_url: `https://www.instagram.com/reel/rlspreview${RUN_ID}/`,
          p_published_at: new Date(Date.now() - 60_000).toISOString(), p_visibility: 'public',
          p_evidence_id: evidence.data, p_actor_key: 'thedot-admin', p_source_type: 'manual',
          p_reconciliation_status: 'verified', p_provider_object_id: `rlspreview${RUN_ID}`,
          p_observed_title: null, p_observed_text: null, p_observation_key: `rls-preview-live-${RUN_ID}`,
          p_supersedes_observation_id: target.data.current_observation_id,
          p_verification_note: 'Live reel reviewed for the preview retention test.',
        })
        const afterLive = await purgePreviewsAfterPublication(admin, liveItemId)
        const liveRow = await admin.from('content_review_previews').select('id').eq('id', live.previewId)
        const liveLog = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .eq('content_id', liveItemId).eq('event_type', 'review_preview_deleted')
        check('RT4: confirmed live on every destination deletes the preview and logs why',
          !observed.error && afterLive?.retired === 1 && liveRow.data?.length === 0
            && (liveLog.data ?? []).some((row: { id: string; summary: string | null }) => /Live on every destination/.test(row.summary ?? '')),
          observed.error?.message ?? JSON.stringify({ afterLive, rows: liveRow.data, log: liveLog.data }))

        // Amended 2026-10-03: housekeeping activity is flagged agency_internal, so neither the
        // uploads ('anastasia') nor the deletions ('agent') queue a row for Maria or the agency.
        const housekeeping = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .in('event_type', ['review_preview_uploaded', 'review_preview_deleted'])
          .in('content_id', [previewItemId, datedItemId, liveItemId])
        const housekeepingIds = (housekeeping.data ?? []).map((row: { id: string; summary: string | null }) => row.id as string)
        const housekeepingOutbox = housekeepingIds.length
          ? await admin.from('notification_outbox').select('recipient_kind, channel, event_key')
            .in('source_activity_id', housekeepingIds)
          : { data: [] as Array<{ recipient_kind: string }>, error: null }
        check('RT5: preview uploads and deletions queue no notification for the client or the agency',
          !housekeeping.error && housekeepingIds.length >= 4
            && !housekeepingOutbox.error && (housekeepingOutbox.data ?? []).length === 0,
          JSON.stringify({ activity: housekeepingIds.length, error: housekeepingOutbox.error?.message, outbox: housekeepingOutbox.data }))

        // Amended 2026-10-04 (Anastasia): a copy-only revision carries the review media forward.
        // v1 has a version-level review asset and a portal preview and nothing else (no design
        // link). After an agency copy revision to v2, v2 carries both, the release media guard
        // passes with no override, the client seat reads the v2 preview, and retiring the v1
        // preview leaves the shared objects in storage because the v2 row still uses them.
        const carryId = `rls-carry-${RUN_ID}`
        const [carrySync] = await sync([snapshot(bClientId!, carryId, 1, 'Carry v1', 'Carry body before edits', 'caption')])
        const carryItemId = carrySync.item_id
        const carryAsset = await rawAdmin.rpc('set_content_review_asset', {
          p_client_id: bClientId, p_content_id: carryId, p_content_version: 1,
          p_asset_key: 'carry-cover', p_label: 'Carry cover', p_channel: 'social', p_asset_kind: 'cover',
          p_url: 'https://www.canva.com/design/CARRYCOVER/view', p_width_px: 1080, p_height_px: 1920,
          p_caption_status: 'not_applicable', p_review_note: null, p_actor_key: 'thedot-admin',
          p_idempotency_key: `rls-carry-asset-${RUN_ID}`,
        })
        if (carryAsset.error) throw new Error(`carry asset: ${carryAsset.error.message}`)
        const carryPreview = await uploadReviewPreview(admin, tools, {
          clientId: bClientId!, contentItemId: carryItemId,
          request: { ...request(carryId, [frameA]), reviewAssetKey: 'carry-cover' },
        })
        const carryV1Ready = await rawAdmin.rpc('mark_content_ready', { p_content_id: carryItemId, p_content_version: 1 })
        if (carryV1Ready.error) throw new Error(`carry v1 release: ${carryV1Ready.error.message}`)
        const carryRevision = await rawAdmin.rpc('begin_content_revision', { p_content_id: carryItemId, p_content_version: 1 })
        if (carryRevision.error) throw new Error(`carry revision: ${carryRevision.error.message}`)
        const carryV2Snapshot = snapshot(bClientId!, carryId, 2, 'Carry v2', 'Carry body with her edits applied', 'caption')
        await sync([carryV2Snapshot])
        await sync([carryV2Snapshot])
        const v2Assets = await rawAdmin.from('content_review_assets').select('asset_key, url, asset_kind')
          .eq('content_item_id', carryItemId).eq('content_version', 2)
        const v2Previews = await rawAdmin.from('content_review_previews')
          .select('id, preview_key, review_asset_key, object_prefix, video_path, poster_path, frames, source_sha256')
          .eq('content_item_id', carryItemId).eq('content_version', 2)
        check('RC1: a copy revision carries the v1 review asset and preview to v2, once, on the same objects',
          !v2Assets.error && v2Assets.data?.length === 1 && v2Assets.data[0].asset_key === 'carry-cover'
            && v2Assets.data[0].url === 'https://www.canva.com/design/CARRYCOVER/view'
            && !v2Previews.error && v2Previews.data?.length === 1 && v2Previews.data[0].preview_key === 'reel'
            && v2Previews.data[0].review_asset_key === 'carry-cover'
            && v2Previews.data[0].object_prefix === carryPreview.objectPrefix
            && v2Previews.data[0].id !== carryPreview.previewId,
          JSON.stringify({ assets: v2Assets.data ?? v2Assets.error?.message, previews: v2Previews.data ?? v2Previews.error?.message }))

        const carryV2Ready = await rawAdmin.rpc('mark_content_ready', { p_content_id: carryItemId, p_content_version: 2 })
        const carryOverrides = await rawAdmin.from('content_release_media_overrides').select('id')
          .eq('content_item_id', carryItemId)
        const carryVisible = await rawAdmin.from('content_items').select('client_visible_version').eq('id', carryItemId).single()
        check('RC2: the edited version releases through the media guard with no override',
          !carryV2Ready.error && carryVisible.data?.client_visible_version === 2
            && !carryOverrides.error && carryOverrides.data?.length === 0,
          carryV2Ready.error?.message ?? JSON.stringify({ visible: carryVisible.data, overrides: carryOverrides.data ?? carryOverrides.error?.message }))

        const seatV2 = await bClient.from('content_review_previews').select('id, content_version, video_path')
          .eq('content_item_id', carryItemId)
        check('RC3: the client seat reads the carried v2 preview and no longer the v1 row',
          !seatV2.error && seatV2.data?.length === 1 && seatV2.data[0].content_version === 2
            && seatV2.data[0].video_path === v2Previews.data?.[0]?.video_path,
          JSON.stringify(seatV2.data ?? seatV2.error?.message))

        const carryRetention = await runPreviewRetention(admin, { contentItemId: carryItemId })
        const carryV1Row = await rawAdmin.from('content_review_previews').select('id').eq('id', carryPreview.previewId)
        const carryV2Row = await rawAdmin.from('content_review_previews').select('id').eq('content_item_id', carryItemId)
          .eq('content_version', 2)
        const carriedPaths = [
          v2Previews.data?.[0]?.video_path, v2Previews.data?.[0]?.poster_path,
          ...((v2Previews.data?.[0]?.frames ?? []) as Array<{ path: string }>).map((frame) => frame.path),
        ].filter((path): path is string => typeof path === 'string')
        const stillStored = await Promise.all(carriedPaths.map((path) =>
          admin.storage.from(REVIEW_PREVIEW_BUCKET).download(path)))
        check('RC4: retiring the superseded v1 preview leaves the objects the carried v2 row still uses',
          carryRetention.retired === 1 && carryV1Row.data?.length === 0 && carryV2Row.data?.length === 1
            && carriedPaths.length >= 3 && stillStored.every((result) => !result.error),
          JSON.stringify({ carryRetention, v1: carryV1Row.data, v2: carryV2Row.data, paths: carriedPaths,
            stored: stillStored.map((result) => result.error?.message ?? 'ok') }))

        // Amended 2026-10-04 (Anastasia): carry forward for copy-only changes. When an on-screen
        // block (reel-script, on-screen-copy, carousel-copy and the rest of the on-screen key set)
        // is added, removed or changed, the render must have changed too, so the new version gets
        // no carried media and its release is refused until fresh media is attached. A caption
        // change with the on-screen text untouched still carries.
        const twoBlocks = (contentId: string, version: number, caption: string, script: string) => ({
          ...snapshot(bClientId!, contentId, version, `${contentId} v${version}`, caption, 'caption'),
          copy_blocks: [
            { key: 'caption', label: 'Caption', body: caption },
            { key: 'reel-script', label: 'Reel script', body: script },
          ],
        })
        const carryCase = async (name: string, v2: { caption: string; script: string }) => {
          const contentId = `rls-carry-${name}-${RUN_ID}`
          const [first] = await sync([twoBlocks(contentId, 1, 'Caption before edits', 'Frame 1: Are you hiring?')])
          const itemId = first.item_id
          const asset = await rawAdmin.rpc('set_content_review_asset', {
            p_client_id: bClientId, p_content_id: contentId, p_content_version: 1,
            p_asset_key: 'reel-cover', p_label: 'Reel cover', p_channel: 'social', p_asset_kind: 'cover',
            p_url: `https://www.canva.com/design/CARRY${name.toUpperCase()}/view`, p_width_px: 1080, p_height_px: 1920,
            p_caption_status: 'not_applicable', p_review_note: null, p_actor_key: 'thedot-admin',
            p_idempotency_key: `rls-carry-${name}-asset-${RUN_ID}`,
          })
          if (asset.error) throw new Error(`carry ${name} asset: ${asset.error.message}`)
          await uploadReviewPreview(admin, tools, {
            clientId: bClientId!, contentItemId: itemId,
            request: { ...request(contentId, [frameA]), reviewAssetKey: 'reel-cover' },
          })
          const v1Ready = await rawAdmin.rpc('mark_content_ready', { p_content_id: itemId, p_content_version: 1 })
          if (v1Ready.error) throw new Error(`carry ${name} v1 release: ${v1Ready.error.message}`)
          const revision = await rawAdmin.rpc('begin_content_revision', { p_content_id: itemId, p_content_version: 1 })
          if (revision.error) throw new Error(`carry ${name} revision: ${revision.error.message}`)
          await sync([twoBlocks(contentId, 2, v2.caption, v2.script)])
          const assets = await rawAdmin.from('content_review_assets').select('asset_key')
            .eq('content_item_id', itemId).eq('content_version', 2)
          const previews = await rawAdmin.from('content_review_previews').select('id')
            .eq('content_item_id', itemId).eq('content_version', 2)
          const ready = await rawAdmin.rpc('mark_content_ready', { p_content_id: itemId, p_content_version: 2 })
          const visibleRow = await rawAdmin.from('content_items').select('client_visible_version').eq('id', itemId).single()
          return { assets, previews, ready, visible: visibleRow.data?.client_visible_version ?? null }
        }

        const scriptChanged = await carryCase('script', { caption: 'Caption before edits', script: 'Frame 1: Hiring this year?' })
        check('RC5: a version whose reel-script changed carries no asset or preview and its release is refused',
          !scriptChanged.assets.error && scriptChanged.assets.data?.length === 0
            && !scriptChanged.previews.error && scriptChanged.previews.data?.length === 0
            && !!scriptChanged.ready.error && /release_media_missing/.test(scriptChanged.ready.error.message)
            && scriptChanged.visible === 1,
          JSON.stringify({ assets: scriptChanged.assets.data, previews: scriptChanged.previews.data,
            ready: scriptChanged.ready.error?.message ?? 'released', visible: scriptChanged.visible }))

        const captionChanged = await carryCase('caption', { caption: 'Caption with her edits applied', script: 'Frame 1: Are you hiring?' })
        check('RC6: a caption-only change still carries the asset and preview and releases',
          !captionChanged.assets.error && captionChanged.assets.data?.length === 1
            && !captionChanged.previews.error && captionChanged.previews.data?.length === 1
            && !captionChanged.ready.error && captionChanged.visible === 2,
          JSON.stringify({ assets: captionChanged.assets.data, previews: captionChanged.previews.data,
            ready: captionChanged.ready.error?.message ?? 'released', visible: captionChanged.visible }))
      } finally {
        await rm(previewDir, { recursive: true, force: true })
      }
    }

    // 0092 (amended 2026-10-03): the release media guard. Every release of a version with no review
    // asset, no portal preview and no design link is refused unless an override for that exact
    // version starts "Approved by Anastasia:". Overrides are agency-only and notify nobody.
    {
      const rmId = (name: string) => `rls-media-${name}-${RUN_ID}`
      const rmSync = async (name: string) => {
        const [synced] = await sync([snapshot(bClientId!, rmId(name), 1, `Media ${name}`, 'Media guard body', 'caption')])
        return synced.item_id
      }
      const ready = (itemId: string) => rawAdmin.rpc('mark_content_ready', { p_content_id: itemId, p_content_version: 1 })
      const override = (name: string, reason: string) => rawAdmin.rpc('agency_record_release_media_override', {
        p_client_id: bClientId, p_content_id: rmId(name), p_content_version: 1, p_reason: reason,
        p_actor_key: 'thedot-admin',
      })
      const outcome = (result: { data: unknown }) => (result.data as { outcome?: string } | null)?.outcome
      const visible = async (itemId: string) => (await rawAdmin.from('content_items')
        .select('client_visible_version').eq('id', itemId).single()).data?.client_visible_version ?? null

      const bareId = await rmSync('bare')
      const bare = await ready(bareId)
      check('RM1: a version with no review asset, preview or design link is refused',
        !!bare.error && /release_media_missing/.test(bare.error.message) && (await visible(bareId)) === null,
        bare.error?.message ?? 'released without media')

      const designId = await rmSync('design')
      const design = await rawAdmin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: rmId('design'),
        p_canva_url: 'https://www.canva.com/design/MEDIAGUARD/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-media-design-${RUN_ID}`,
      })
      const assetId = await rmSync('asset')
      const asset = await rawAdmin.rpc('set_content_review_asset', {
        p_client_id: bClientId, p_content_id: rmId('asset'), p_content_version: 1,
        p_asset_key: 'media-guard-cover', p_label: 'Media guard cover', p_channel: 'social', p_asset_kind: 'cover',
        p_url: 'https://www.canva.com/design/MEDIAGUARDCOVER/view', p_width_px: 1080, p_height_px: 1350,
        p_caption_status: 'not_applicable', p_review_note: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-media-asset-${RUN_ID}`,
      })
      const previewItemId = await rmSync('preview')
      const sha = 'c'.repeat(64)
      const prefix = `${bClientId}/${previewItemId}/v1/reel/${sha.slice(0, 16)}/`
      const preview = await rawAdmin.rpc('agency_register_review_preview', {
        p_client_id: bClientId, p_content_id: rmId('preview'), p_content_version: 1, p_preview_key: 'reel',
        p_review_asset_key: null, p_media_kind: 'video', p_object_prefix: prefix,
        p_video_path: `${prefix}video.mp4`, p_poster_path: `${prefix}poster.jpg`, p_frames: [],
        p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 24, p_byte_total: 1000,
        p_source_sha256: sha, p_actor_key: 'thedot-admin',
      })
      const designReady = await ready(designId)
      const assetReady = await ready(assetId)
      const previewReady = await ready(previewItemId)
      check('RM2: a design link, a review asset or a portal preview each lets the release through',
        !design.error && !asset.error && !preview.error && !designReady.error && !assetReady.error && !previewReady.error
          && (await visible(designId)) === 1 && (await visible(assetId)) === 1 && (await visible(previewItemId)) === 1,
        JSON.stringify([design, asset, preview, designReady, assetReady, previewReady].map((r) => r.error?.message ?? 'ok')))

      const lower = await override('bare', 'approved by anastasia: lowercase prefix')
      const wrongWords = await override('bare', 'Agency override authorized by Anastasia: wrong words')
      const empty = await override('bare', 'Approved by Anastasia:')
      const stillRefused = await ready(bareId)
      check('RM3: an override without the exact "Approved by Anastasia:" prefix and a reason is refused',
        !!lower.error && !!wrongWords.error && !!empty.error
          && !!stillRefused.error && /release_media_missing/.test(stillRefused.error.message),
        JSON.stringify([lower, wrongWords, empty, stillRefused].map((r) => r.error?.message ?? 'NO ERROR')))

      const REASON = 'Approved by Anastasia: text-only fixture with nothing to preview.'
      const recorded = await override('bare', REASON)
      const repeated = await override('bare', REASON)
      const changed = await override('bare', 'Approved by Anastasia: a different reason for the same version.')
      const overridden = await ready(bareId)
      const bareLog = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
        .eq('content_id', bareId).eq('event_type', 'release_media_override')
      check('RM4: a valid override is recorded once, logged, and lets that exact version release',
        !recorded.error && outcome(recorded) === 'recorded' && outcome(repeated) === 'unchanged' && !!changed.error
          && !overridden.error && (await visible(bareId)) === 1
          && bareLog.data?.length === 1 && bareLog.data[0].summary === REASON && bareLog.data[0].actor_type === 'anastasia',
        JSON.stringify({ recorded: recorded.data ?? recorded.error?.message, repeated: repeated.data,
          changed: changed.error?.message, released: overridden.error?.message, log: bareLog.data }))

      // A courtesy release approves without promoting, so it carries its own check. Remove the
      // design link from the released piece, then try.
      const cleared = await rawAdmin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: rmId('design'), p_canva_url: null, p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-media-design-clear-${RUN_ID}`,
      })
      const courtesy = (key: string) => rawAdmin.rpc('record_content_courtesy_release', {
        p_content_id: designId, p_content_version: 1,
        p_reason: 'Agency override authorized by Anastasia: media guard courtesy test.',
        p_actor_key: 'thedot-admin', p_idempotency_key: key,
      })
      const courtesyRefused = await courtesy(randomUUID())
      const designOverride = await override('design', 'Approved by Anastasia: courtesy fixture after its link was removed.')
      const courtesyOk = await courtesy(randomUUID())
      check('RM5: a courtesy release of a version with no media is refused until an override is on file',
        !cleared.error && !!courtesyRefused.error && /release_media_missing/.test(courtesyRefused.error.message)
          && !designOverride.error && !courtesyOk.error,
        JSON.stringify([cleared, courtesyRefused, designOverride, courtesyOk].map((r) => r.error?.message ?? 'ok')))

      const overrideRows = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
        .in('content_id', [bareId, designId]).eq('event_type', 'release_media_override')
      const overrideIds = (overrideRows.data ?? []).map((row: { id: string; summary: string | null }) => row.id as string)
      const outbox = overrideIds.length
        ? await rawAdmin.from('notification_outbox').select('recipient_kind, channel').in('source_activity_id', overrideIds)
        : { data: [] as Array<{ recipient_kind: string }>, error: null }
      const clientRead = await bClient.from('content_release_media_overrides').select('reason')
      const clientStatus = await bClient.rpc('agency_release_media_status', { p_content_item_id: bareId, p_content_version: 1 })
      const clientOverride = await bClient.rpc('agency_record_release_media_override', {
        p_client_id: bClientId, p_content_id: rmId('asset'), p_content_version: 1,
        p_reason: 'Approved by Anastasia: a client trying to approve itself.', p_actor_key: 'thedot-admin',
      })
      check('RM6: overrides queue no notification for anyone, and a client can neither read nor write them',
        !overrideRows.error && overrideIds.length === 2 && !outbox.error && (outbox.data ?? []).length === 0
          && (!!clientRead.error || clientRead.data?.length === 0) && !!clientStatus.error && !!clientOverride.error,
        JSON.stringify({ ids: overrideIds.length, outbox: outbox.data, read: clientRead.data ?? clientRead.error?.message,
          status: clientStatus.error?.message ?? 'NO ERROR', write: clientOverride.error?.message ?? 'NO ERROR' }))
    }

    // 0092 (amended 2026-10-04): agency_internal activity is invisible to client seats at the
    // database, not only in the app feed. A seat reading activity_log with its own JWT gets none of
    // the housekeeping or override rows, and still reads its ordinary rows; the service-only
    // reader agency_internal_activity still returns them to the agency and refuses the seat.
    {
      const INTERNAL = ['review_preview_uploaded', 'review_preview_deleted', 'release_media_override']
      const seatInternal = await bClient.from('activity_log').select('id, event_type')
        .eq('client_id', bClientId!).in('event_type', INTERNAL)
      const seatOrdinary = await bClient.from('activity_log').select('id')
        .eq('client_id', bClientId!).eq('event_type', 'request_reopened')
      const agencyInternal = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
      const seatInternalViaReader = await bClient.rpc('agency_internal_activity', { p_client_id: bClientId })
      check('AI1: a client seat reads no agency_internal activity rows but keeps its ordinary rows',
        !agencyInternal.error && (agencyInternal.data?.length ?? 0) >= 1 && !!seatInternalViaReader.error
          && !seatInternal.error && seatInternal.data?.length === 0
          && !seatOrdinary.error && (seatOrdinary.data?.length ?? 0) >= 1,
        JSON.stringify({ agency: agencyInternal.data?.length ?? agencyInternal.error?.message,
          seatReader: seatInternalViaReader.error?.message ?? 'NO ERROR',
          internal: seatInternal.data?.map((row) => row.event_type) ?? seatInternal.error?.message,
          ordinary: seatOrdinary.data?.length ?? seatOrdinary.error?.message }))
    }

    // 0093: a send retried with an idempotency key that already landed returns the existing bundle
    // only for the same drafts. Reusing the key with a new unsent draft is refused, and that draft
    // stays unsent instead of being marked sent to a bundle it was never part of.
    {
      const idemId = `rls-drafts-idem-${RUN_ID}`
      const [synced] = await sync([snapshot(bClientId!, idemId, 1, 'Draft idempotency', 'Idempotency body', 'caption')])
      const release = await admin.rpc('mark_content_ready', { p_content_id: synced.item_id, p_content_version: 1 })
      const save = (body: string) => bClient.rpc('save_review_draft', {
        p_content_id: synced.item_id, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: body, p_saved_at: new Date().toISOString(),
      })
      const draftId = (result: { data: unknown }) => (result.data as { draft?: { id?: string } } | null)?.draft?.id
      const key = randomUUID()
      const send = (ids: (string | undefined)[]) => bClient.rpc('send_review_drafts', {
        p_content_id: synced.item_id, p_content_version: 1, p_draft_ids: ids, p_note: null,
        p_idempotency_key: key,
      })
      const first = await save('First edit')
      const firstId = draftId(first)
      const sent = await send([firstId])
      const second = await save('Second edit, written after the first send')
      const secondId = draftId(second)
      const reused = await send([secondId])
      const secondRow = await bClient.from('content_review_drafts').select('status').eq('id', secondId ?? '').maybeSingle()
      const retry = await send([firstId])
      const sentBundle = (sent.data as { bundle_id?: string } | null)?.bundle_id
      const retryData = retry.data as { bundle_id?: string; outcome?: string } | null
      check('DR-IDEM: reusing a send key with a new draft is refused and the draft stays unsent; a true retry returns the bundle',
        !release.error && !first.error && !sent.error && !!sentBundle && !second.error && !!secondId
          && secondId !== firstId
          && /idempotency key reused with different request/.test(reused.error?.message ?? '')
          && secondRow.data?.status === 'unsent'
          && !retry.error && retryData?.bundle_id === sentBundle && retryData?.outcome === 'unchanged',
        JSON.stringify({ release: release.error?.message, sent: sent.error?.message ?? sentBundle,
          reused: reused.error?.message ?? 'NO ERROR', secondStatus: secondRow.data?.status ?? secondRow.error?.message,
          retry: retry.error?.message ?? retryData }))
    }

    // 0093: durable review drafts. One unsent draft per seat, piece, target and frame; the seat
    // reads only its own rows; nobody writes the table directly; a send marks drafts sent in the
    // same transaction as the bundle; a release carries unsent drafts forward; a refused send
    // reaches the agency inbox; forgotten drafts near the planned date raise an alert.
    {
      const D_EMAIL = `rls-drafts-${RUN_ID}@example.com`
      const createdSeat = await admin.auth.admin.createUser({ email: D_EMAIL, email_confirm: true })
      if (createdSeat.error || !createdSeat.data.user) {
        throw new Error(`drafts seat: ${createdSeat.error?.message ?? 'missing'}`)
      }
      const dUserId = createdSeat.data.user.id
      const seatMembership = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: dUserId, p_email: D_EMAIL, p_name: 'RLS Drafts Seat',
        p_can_decide: false, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
        p_can_use_assistant: false, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-drafts-seat-${RUN_ID}`,
      })
      if (seatMembership.error) throw new Error(`drafts seat membership: ${seatMembership.error.message}`)
      const dClient = clientForToken(await tokenFor(D_EMAIL))

      const torontoDate = (offsetDays: number) => {
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date())
        const base = new Date(`${today}T12:00:00Z`)
        base.setUTCDate(base.getUTCDate() + offsetDays)
        return base.toISOString().slice(0, 10)
      }
      const sendId = `rls-drafts-send-${RUN_ID}`
      const carryId = `rls-drafts-carry-${RUN_ID}`
      const COVER = 'https://www.canva.com/design/DRAFTSCOVER/view'
      const sendSnap = snapshot(bClientId!, sendId, 1, 'Drafts send fixture', 'Caption base', 'caption')
      sendSnap.copy_blocks = [
        { key: 'caption', label: 'Caption', body: 'Caption base' },
        { key: 'script', label: 'Script', body: 'Script base' },
      ]
      const carrySnap = snapshot(bClientId!, carryId, 1, 'Drafts carry fixture', 'Carry caption base', 'caption',
        { planned_date: torontoDate(2) })
      const draftSync = await sync([sendSnap, carrySnap])
      const sendItemId = draftSync.find((row) => row.content_id === sendId)?.item_id
      const carryItemId = draftSync.find((row) => row.content_id === carryId)?.item_id
      if (!sendItemId || !carryItemId) throw new Error('draft fixtures did not sync')
      const cover = await admin.rpc('set_content_review_asset', {
        p_client_id: bClientId, p_content_id: sendId, p_content_version: 1,
        p_asset_key: 'reel-cover', p_label: 'Reel cover', p_channel: 'social', p_asset_kind: 'cover',
        p_url: COVER, p_width_px: 1080, p_height_px: 1920, p_caption_status: 'not_applicable',
        p_review_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-drafts-asset-${RUN_ID}`,
      })
      if (cover.error) throw new Error(`draft fixture asset: ${cover.error.message}`)
      for (const itemId of [sendItemId, carryItemId]) {
        const released = await admin.rpc('mark_content_ready', { p_content_id: itemId, p_content_version: 1 })
        if (released.error) throw new Error(`draft fixture release: ${released.error.message}`)
      }

      type DraftJson = {
        id: string; body: string; status: string; base_version: number
        carried_over_to_version: number | null; send_failed_at: string | null; last_send_error: string | null
      }
      const draftOf = (result: { data: unknown }) => (result.data as { draft?: DraftJson } | null)?.draft
      const outcomeOf = (result: { data: unknown }) => (result.data as { outcome?: string } | null)?.outcome
      const save = (client: SupabaseClient, overrides: Record<string, unknown> = {}) => client.rpc('save_review_draft', {
        p_content_id: sendItemId, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: 'Maria rewrote the caption.', p_saved_at: new Date().toISOString(),
        ...overrides,
      })
      const inboxRows = async () => {
        const inbox = await admin.rpc('read_portal_inbox', {
          p_consumer_key: `rls-drafts-${RUN_ID}`, p_client_id: bClientId, p_limit: 500,
        })
        if (inbox.error) throw new Error(`drafts inbox: ${inbox.error.message}`)
        return (inbox.data ?? []) as Array<PortalInboxRow & { event_key?: string }>
      }
      // agency_internal rows are read through the service-role reader, never activity_log directly.
      const internalActivity = async (itemId: string, eventType: string) => {
        const rows = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId, p_content_item_id: itemId })
        if (rows.error) throw new Error(`agency_internal_activity: ${rows.error.message}`)
        return { data: ((rows.data ?? []) as Array<{ id: string; event_type: string }>)
          .filter((row) => row.event_type === eventType) }
      }

      const first = await save(dClient)
      const firstDraft = draftOf(first)
      if (!firstDraft) throw new Error(`first draft: ${first.error?.message ?? JSON.stringify(first.data)}`)
      const own = await dClient.from('content_review_drafts').select('id, body, status').eq('id', firstDraft.id)
      const otherSeat = await bClient.from('content_review_drafts').select('id').eq('id', firstDraft.id)
      const otherTenant = await kansetClient.from('content_review_drafts').select('id').eq('id', firstDraft.id)
      const anonRead = await anonClient.from('content_review_drafts').select('id').eq('id', firstDraft.id)
      check('DR1: a seat saves a draft and only that seat reads it',
        outcomeOf(first) === 'saved' && !own.error && own.data?.length === 1
          && own.data[0].body === 'Maria rewrote the caption.' && own.data[0].status === 'unsent'
          && !otherSeat.error && otherSeat.data?.length === 0
          && !otherTenant.error && otherTenant.data?.length === 0
          && (!!anonRead.error || anonRead.data?.length === 0),
        own.error?.message ?? JSON.stringify({ own: own.data, otherSeat: otherSeat.data, otherTenant: otherTenant.data }))

      const directInsert = await dClient.from('content_review_drafts').insert({
        content_item_id: sendItemId, base_version: 1, target_kind: 'copy_block', target_key: 'script',
        target_label: 'Script', body: 'forged', saved_at: new Date().toISOString(),
      })
      const directUpdate = await dClient.from('content_review_drafts').update({ body: 'forged' })
        .eq('id', firstDraft.id).select('id')
      const directDelete = await dClient.from('content_review_drafts').delete().eq('id', firstDraft.id).select('id')
      const agencyRead = await admin.from('content_review_drafts').select('id, auth_user_id, body').eq('id', firstDraft.id)
      const agencyWrite = await admin.from('content_review_drafts').update({ body: 'agency overwrite' })
        .eq('id', firstDraft.id).select('id')
      const stillMine = await dClient.from('content_review_drafts').select('body').eq('id', firstDraft.id).single()
      check('DR2: nobody writes drafts directly; the agency reads them and cannot change them',
        !!directInsert.error && (!!directUpdate.error || directUpdate.data?.length === 0)
          && (!!directDelete.error || directDelete.data?.length === 0)
          && !agencyRead.error && agencyRead.data?.[0]?.auth_user_id === dUserId
          && !!agencyWrite.error && stillMine.data?.body === 'Maria rewrote the caption.',
        directInsert.error?.message ?? agencyRead.error?.message ?? JSON.stringify({ agencyWrite: agencyWrite.data, stillMine: stillMine.data }))

      const older = await save(dClient, { p_body: 'An older tab', p_saved_at: new Date(Date.now() - 60_000).toISOString() })
      const afterStale = await dClient.from('content_review_drafts').select('body').eq('id', firstDraft.id).single()
      check('DR3: an older save never overwrites a newer one',
        !older.error && outcomeOf(older) === 'stale' && draftOf(older)?.body === 'Maria rewrote the caption.'
          && afterStale.data?.body === 'Maria rewrote the caption.',
        older.error?.message ?? JSON.stringify({ older: older.data, after: afterStale.data }))

      const futureVersion = await save(dClient, { p_base_version: 9 })
      const unknownBlock = await save(dClient, { p_target_key: 'no-such-block' })
      const anchoredCopy = await save(dClient, { p_target_key: 'script', p_anchor: 'frame:2' })
      const viewerSave = await save(bViewerClient, { p_target_key: 'script' })
      const anonSave = await save(anonClient, { p_target_key: 'script' })
      check('DR4: drafts are refused for a future version, an unknown block, an anchored copy block, a viewer seat and anon',
        !!futureVersion.error && /review_draft_stale_version/.test(futureVersion.error.message)
          && !!unknownBlock.error && !!anchoredCopy.error && !!viewerSave.error && !!anonSave.error,
        JSON.stringify([futureVersion, unknownBlock, anchoredCopy, viewerSave, anonSave].map((r) => r.error?.message ?? 'NO ERROR')))

      const assetArgs = { p_target_kind: 'asset', p_target_key: 'reel-cover', p_target_label: 'Reel cover', p_url_snapshot: COVER }
      const general = draftOf(await save(dClient, { ...assetArgs, p_body: 'Use the closed-mouth cover.' }))
      const frameThree = draftOf(await save(dClient, {
        ...assetArgs, p_anchor: 'frame:3', p_anchor_label: 'Frame 3 (0:04)', p_body: 'Fix the typo in line two.',
      }))
      const frameOne = draftOf(await save(dClient, { ...assetArgs, p_anchor: 'frame:1', p_body: 'Brighter first frame.' }))
      const allIds = [firstDraft.id, general?.id, frameThree?.id, frameOne?.id].filter((id): id is string => !!id)
      check('DR5: one visual takes a general note and separate per-frame drafts',
        allIds.length === 4 && new Set(allIds).size === 4, JSON.stringify(allIds))

      const partial = await dClient.rpc('send_review_drafts', {
        p_content_id: sendItemId, p_content_version: 1, p_draft_ids: allIds.slice(1), p_note: null,
        p_idempotency_key: randomUUID(),
      })
      const stillUnsent = await dClient.from('content_review_drafts').select('id').in('id', allIds).eq('status', 'unsent')
      check('DR6: a send that leaves out an unsent draft is refused and nothing is sent',
        !!partial.error && /drafts_changed/.test(partial.error.message) && stillUnsent.data?.length === 4,
        partial.error?.message ?? 'NO ERROR')

      const sendKey = randomUUID()
      const sent = await dClient.rpc('send_review_drafts', {
        p_content_id: sendItemId, p_content_version: 1, p_draft_ids: allIds, p_note: null, p_idempotency_key: sendKey,
      })
      const sentData = sent.data as { bundle_id?: string; request_ids?: string[]; outcome?: string } | null
      const sentRows = await dClient.from('content_review_drafts').select('id, status').in('id', allIds)
      const sentRequests = await admin.from('content_change_requests').select('payload').in('id', sentData?.request_ids ?? [])
      const assetText = (sentRequests.data ?? [])
        .map((r) => r.payload as { target_kind?: string; proposed_text?: string })
        .find((payload) => payload.target_kind === 'asset')?.proposed_text
      check('DR7: one send turns every draft into one bundle and composes the frame notes in order',
        !sent.error && sentData?.outcome === 'created' && sentData.request_ids?.length === 2
          && sentRows.data?.length === 4 && sentRows.data.every((r) => r.status === 'sent')
          && assetText === 'General note: Use the closed-mouth cover.\n\nFrame 1: Brighter first frame.\n\nFrame 3 (0:04): Fix the typo in line two.',
        sent.error?.message ?? JSON.stringify({ sentData, assetText, rows: sentRows.data }))

      const retried = await dClient.rpc('send_review_drafts', {
        p_content_id: sendItemId, p_content_version: 1, p_draft_ids: allIds, p_note: null, p_idempotency_key: sendKey,
      })
      const retriedData = retried.data as { bundle_id?: string; outcome?: string } | null
      check('DR8: retrying a send that already landed answers with the same bundle',
        !retried.error && retriedData?.outcome === 'unchanged' && retriedData.bundle_id === sentData?.bundle_id,
        retried.error?.message ?? JSON.stringify(retriedData))

      const scriptDraft = draftOf(await save(dClient, {
        p_target_key: 'script', p_target_label: 'Script', p_body: 'Maria rewrote the script.',
      }))
      if (!scriptDraft) throw new Error('script draft was not saved')
      const attemptId = randomUUID()
      const failureRow = await admin.from('client_request_failures').insert({
        attempt_id: attemptId, client_id: bClientId, content_item_id: sendItemId, content_id: sendId,
        content_version: 1, target_kind: 'copy_block', target_key: 'script', target_label: 'Script',
        reason_code: 'network_unreachable', client_message: "Couldn't send. Retry",
        proposed_text: 'Maria rewrote the script.', proposed_length: 25,
        requested_by: dUserId, requester_name: 'RLS Drafts Seat',
      })
      if (failureRow.error) throw new Error(`failure fixture: ${failureRow.error.message}`)
      const recorded = await admin.rpc('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: [scriptDraft.id] })
      const recordedAgain = await admin.rpc('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: [scriptDraft.id] })
      const clientRecord = await dClient.rpc('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: [scriptDraft.id] })
      // review_send_failed is a client-visible row (decision 1), so the seat reads it; the service
      // role has no SELECT on activity_log.
      const failedActivity = await dClient.from('activity_log').select('id, actor_type')
        .eq('client_id', bClientId!).eq('event_type', 'review_send_failed').eq('content_id', sendItemId)
      const failedInbox = (await inboxRows()).filter((event) =>
        event.event_type === 'review_send_failed' && event.object_id === attemptId)
      const markedDraft = await dClient.from('content_review_drafts').select('send_failed_at, last_send_error')
        .eq('id', scriptDraft.id).single()
      check('DR9: a refused send reaches the agency inbox once and marks her draft failed but unsent',
        !recorded.error && (recorded.data as { drafts_marked?: number } | null)?.drafts_marked === 1
          && !recordedAgain.error && (recordedAgain.data as { drafts_marked?: number } | null)?.drafts_marked === 0
          && !!clientRecord.error
          && failedActivity.data?.length === 1 && failedActivity.data[0].actor_type === 'client'
          && failedInbox.length === 1 && failedInbox[0].requires_reconciliation
          && !!markedDraft.data?.send_failed_at && markedDraft.data.last_send_error === 'network_unreachable',
        recorded.error?.message ?? JSON.stringify({ activity: failedActivity.data, inbox: failedInbox.length, draft: markedDraft.data }))

      const retrySend = await dClient.rpc('send_review_drafts', {
        p_content_id: sendItemId, p_content_version: 1, p_draft_ids: [scriptDraft.id], p_note: null,
        p_idempotency_key: randomUUID(),
      })
      const resolvedFailure = await admin.from('client_request_failures').select('resolved_by')
        .eq('attempt_id', attemptId).single()
      const retryActivity = await internalActivity(sendItemId, 'review_send_retry_succeeded')
      check('DR10: a later successful send resolves the failure and logs the retry',
        !retrySend.error && resolvedFailure.data?.resolved_by === 'system:retry' && retryActivity.data?.length === 1,
        retrySend.error?.message ?? JSON.stringify({ resolved: resolvedFailure.data, activity: retryActivity.data }))

      const carryDraft = draftOf(await save(dClient, {
        p_content_id: carryItemId, p_body: 'Maria rewrote the carry caption.',
        p_saved_at: new Date(Date.now() - 30 * 3600_000).toISOString(),
      }))
      if (!carryDraft) throw new Error('carry draft was not saved')
      type AlertRow = { content_item_id: string; auth_user_id: string; seat_name: string; stale_count: number }
      const alertsNow = await admin.rpc('agency_unsent_review_draft_alerts', { p_now: new Date().toISOString() })
      const alertsEarly = await admin.rpc('agency_unsent_review_draft_alerts', {
        p_now: new Date(Date.now() - 3 * 86400_000).toISOString(),
      })
      const clientAlerts = await dClient.rpc('agency_unsent_review_draft_alerts', { p_now: new Date().toISOString() })
      const nowRows = (alertsNow.data ?? []) as AlertRow[]
      const nowRow = nowRows.find((r) => r.content_item_id === carryItemId && r.auth_user_id === dUserId)
      const earlyRow = ((alertsEarly.data ?? []) as AlertRow[]).find((r) => r.content_item_id === carryItemId)
      check('DR11: an unsent draft older than 24 hours on a piece due within 3 days raises an alert',
        !alertsNow.error && nowRow?.seat_name === 'RLS Drafts Seat' && nowRow.stale_count === 1
          && !alertsEarly.error && !earlyRow && !!clientAlerts.error
          && !nowRows.some((r) => r.content_item_id === sendItemId),
        alertsNow.error?.message ?? JSON.stringify({ nowRow, earlyRow, client: clientAlerts.error?.message ?? 'NO ERROR' }))

      const carryRevision = await admin.rpc('begin_content_revision', { p_content_id: carryItemId, p_content_version: 1 })
      if (carryRevision.error) throw new Error(`carry revision: ${carryRevision.error.message}`)
      const carryV2 = snapshot(bClientId!, carryId, 2, 'Drafts carry fixture v2', 'Carry caption v2', 'caption',
        { planned_date: torontoDate(2) })
      carryV2.source_commit_sha = '5'.repeat(40)
      await sync([carryV2])
      const carryRelease = await admin.rpc('mark_content_ready', { p_content_id: carryItemId, p_content_version: 2 })
      if (carryRelease.error) throw new Error(`carry release: ${carryRelease.error.message}`)
      const carried = await dClient.from('content_review_drafts')
        .select('status, base_version, carried_over_to_version, body').eq('id', carryDraft.id).single()
      const carryActivity = await internalActivity(carryItemId, 'review_drafts_carried_over')
      const carryInbox = (await inboxRows()).filter((event) =>
        event.event_type === 'review_drafts_carried_over' && event.object_id === carryItemId)
      check('DR12: releasing a new version carries her unsent draft forward instead of dropping it',
        carried.data?.status === 'unsent' && carried.data.base_version === 1
          && carried.data.carried_over_to_version === 2 && carried.data.body === 'Maria rewrote the carry caption.'
          && carryActivity.data?.length === 1 && carryInbox.length === 1,
        JSON.stringify({ carried: carried.data, activity: carryActivity.data, inbox: carryInbox.length }))

      const carriedSend = await dClient.rpc('send_review_drafts', {
        p_content_id: carryItemId, p_content_version: 2, p_draft_ids: [carryDraft.id], p_note: null,
        p_idempotency_key: randomUUID(),
      })
      const kept = await save(dClient, { p_content_id: carryItemId, p_base_version: 2, p_body: 'Maria rewrote the carry caption.' })
      check('DR13: a carried draft is kept before it is sent, and keeping rebases it onto the new version',
        !!carriedSend.error && /drafts_carried_over/.test(carriedSend.error.message)
          && !kept.error && draftOf(kept)?.id === carryDraft.id && draftOf(kept)?.base_version === 2
          && draftOf(kept)?.carried_over_to_version === null,
        carriedSend.error?.message ?? kept.error?.message ?? JSON.stringify(kept.data))

      const badReason = await dClient.rpc('discard_review_draft', {
        p_content_id: carryItemId, p_target_kind: 'copy_block', p_target_key: 'caption', p_anchor: '',
        p_reason: 'because', p_saved_at: new Date().toISOString(),
      })
      const discarded = await dClient.rpc('discard_review_draft', {
        p_content_id: carryItemId, p_target_kind: 'copy_block', p_target_key: 'caption', p_anchor: '',
        p_reason: 'client_discarded', p_saved_at: new Date(Date.now() + 1000).toISOString(),
      })
      const afterDiscard = await dClient.from('content_review_drafts').select('status, discard_reason')
        .eq('id', carryDraft.id).single()
      const alertsAfter = await admin.rpc('agency_unsent_review_draft_alerts', { p_now: new Date().toISOString() })
      check('DR14: an explicit discard keeps the row as discarded and clears the alert',
        !!badReason.error && !discarded.error && outcomeOf(discarded) === 'discarded'
          && afterDiscard.data?.status === 'discarded' && afterDiscard.data.discard_reason === 'client_discarded'
          && !((alertsAfter.data ?? []) as AlertRow[]).some((r) => r.content_item_id === carryItemId),
        discarded.error?.message ?? JSON.stringify(afterDiscard.data))

      const assertion = await admin.rpc('assert_portal_security')
      const clientAssertion = await dClient.rpc('assert_review_draft_security')
      check('DR15: the cumulative security assertion includes the draft guards and is agency-only',
        !assertion.error && !!clientAssertion.error, assertion.error?.message ?? 'client could run the assertion')

      // Amended 2026-10-03: a send-failure event must never freeze the agency inbox cursor. A fresh
      // tenant, so no other block's open reconciliation event can hold the ack.
      const inboxTenant = await admin.rpc('create_portal_client', {
        p_name: 'RLS Drafts Inbox', p_slug: `rls-drafts-inbox-${RUN_ID}`,
      })
      if (inboxTenant.error || !inboxTenant.data) throw new Error(`drafts inbox tenant: ${inboxTenant.error?.message ?? 'missing'}`)
      const inboxClientId = inboxTenant.data as string
      const inboxConsumer = `rls-drafts-inbox-${RUN_ID}`
      const inboxAttemptId = randomUUID()
      const inboxFailure = await admin.from('client_request_failures').insert({
        attempt_id: inboxAttemptId, client_id: inboxClientId, reason_code: 'write_failed',
        proposed_text: 'Her exact words.', proposed_length: 16, requester_name: 'RLS Drafts Seat',
      })
      if (inboxFailure.error) throw new Error(`drafts inbox failure row: ${inboxFailure.error.message}`)
      const inboxRecorded = await admin.rpc('agency_record_review_send_failure', { p_attempt_id: inboxAttemptId, p_draft_ids: [] })
      if (inboxRecorded.error) throw new Error(`drafts inbox record: ${inboxRecorded.error.message}`)
      const inboxRead = await admin.rpc('read_portal_inbox', { p_consumer_key: inboxConsumer, p_client_id: inboxClientId, p_limit: 50 })
      const failureEvent = ((inboxRead.data ?? []) as Array<{ seq: number; id: string; event_type: string; object_id: string }>)
        .find((event) => event.event_type === 'review_send_failed' && event.object_id === inboxAttemptId)
      if (!failureEvent) throw new Error(`drafts inbox event missing: ${inboxRead.error?.message ?? 'not listed'}`)
      const ackFailure = () => admin.rpc('ack_portal_inbox', {
        p_consumer_key: inboxConsumer, p_client_id: inboxClientId, p_seq: failureEvent.seq,
      })
      const ackBlocked = await ackFailure()
      const inboxResolved = await admin.from('client_request_failures').update({
        resolved_at: new Date().toISOString(), resolved_by: 'thedot-admin', resolution_note: 'Applied her text by hand.',
      }).eq('attempt_id', inboxAttemptId)
      const ackPassed = await ackFailure()
      check('DR16: an open send failure holds the inbox cursor, and once its rows are resolved the cursor moves past it',
        !!ackBlocked.error && /unresolved/.test(ackBlocked.error.message)
          && !inboxResolved.error && !ackPassed.error && Number(ackPassed.data) === Number(failureEvent.seq),
        `${ackBlocked.error?.message ?? 'NOT BLOCKED'} | ${inboxResolved.error?.message ?? ''} | ${ackPassed.error?.message ?? JSON.stringify(ackPassed.data)}`)

      // 0095 (review fix 2026-10-04): a send failure closes itself when her retry succeeds, so even the
      // service role cannot mark one handled, and no resolution row is written.
      const resolveFailure = await admin.rpc('agency_resolve_inbox_event', {
        p_event_id: failureEvent.id, p_note: null, p_actor_key: 'thedot-admin',
        p_idempotency_key: `rls-resolve-send-failure-${RUN_ID}`,
      })
      const failureResolutions = await admin.from('agency_inbox_resolutions').select('event_id').eq('event_id', failureEvent.id)
      check('SG12: agency_resolve_inbox_event refuses a send failure, even for the service role',
        !!resolveFailure.error && /send failures close themselves/.test(resolveFailure.error.message)
          && !failureResolutions.error && (failureResolutions.data ?? []).length === 0,
        `${resolveFailure.error?.message ?? 'NOT REFUSED'} | ${JSON.stringify(failureResolutions.data ?? failureResolutions.error?.message)}`)

      // Amended 2026-10-03: carry-over and retry success are agency_internal, so they queue no
      // notification row at all; a refused send may notify the agency but never the client.
      const housekeepingRows = [
        ...(await internalActivity(sendItemId, 'review_send_retry_succeeded')).data,
        ...(await internalActivity(carryItemId, 'review_drafts_carried_over')).data,
      ]
      const housekeeping = { data: housekeepingRows, error: null }
      const housekeepingIds = (housekeeping.data ?? []).map((row) => row.id as string)
      const housekeepingOutbox = housekeepingIds.length
        ? await admin.from('notification_outbox').select('recipient_kind, channel, event_key')
          .in('source_activity_id', housekeepingIds)
        : { data: [] as Array<{ recipient_kind: string }>, error: null }
      const failedIds = (failedActivity.data ?? []).map((row) => row.id as string)
      const failedOutbox = failedIds.length
        ? await admin.from('notification_outbox').select('recipient_kind').in('source_activity_id', failedIds)
        : { data: [] as Array<{ recipient_kind: string }>, error: null }
      check('DR17: carry-over and retry housekeeping queue no notification, and a refused send never notifies the client',
        !housekeeping.error && housekeepingIds.length === 2
          && !housekeepingOutbox.error && (housekeepingOutbox.data ?? []).length === 0
          && !failedOutbox.error && (failedOutbox.data ?? []).every((row) => row.recipient_kind === 'agency'),
        JSON.stringify({ activity: housekeeping.data, outbox: housekeepingOutbox.data, failed: failedOutbox.data }))
    }

    // 0094: review tab ticks (per seat, per version, own rows only, released version only) and
    // the approve guard (the approving seat's own unsent drafts block 'approved').
    {
      const T_EMAIL = `rls-ticks-${RUN_ID}@example.com`
      const createdSeat = await admin.auth.admin.createUser({ email: T_EMAIL, email_confirm: true })
      if (createdSeat.error || !createdSeat.data.user) {
        throw new Error(`ticks seat: ${createdSeat.error?.message ?? 'missing'}`)
      }
      const tUserId = createdSeat.data.user.id
      const seat = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: tUserId, p_email: T_EMAIL, p_name: 'RLS Ticks Seat',
        // A client has one primary decider (0013), so this seat ticks and drafts but the approve
        // guard below is exercised through the primary decider, bClient.
        p_can_decide: false, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
        p_can_use_assistant: false, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ticks-seat-${RUN_ID}`,
      })
      if (seat.error) throw new Error(`ticks seat membership: ${seat.error.message}`)
      const tClient = clientForToken(await tokenFor(T_EMAIL))

      const tickId = `rls-ticks-${RUN_ID}`
      const tickSync = await sync([snapshot(bClientId!, tickId, 1, 'Ticks fixture', 'Ticks caption', 'caption')])
      const tickItemId = tickSync.find((row) => row.content_id === tickId)?.item_id
      if (!tickItemId) throw new Error('ticks fixture did not sync')
      const design = await admin.rpc('set_content_design_links', {
        p_client_id: bClientId, p_content_id: tickId,
        p_canva_url: 'https://www.canva.com/design/TICKSDESIGN/view', p_drive_url: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ticks-design-${RUN_ID}`,
      })
      if (design.error) throw new Error(`ticks design: ${design.error.message}`)

      const early = await tClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['caption'],
      })
      const released = await admin.rpc('mark_content_ready', { p_content_id: tickItemId, p_content_version: 1 })
      if (released.error) throw new Error(`ticks release: ${released.error.message}`)

      const ticked = await tClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['caption', 'youtube', 'caption'],
      })
      const own = await tClient.from('content_review_tab_ticks').select('tab_key, content_version')
        .eq('content_item_id', tickItemId)
      const otherSeat = await bClient.from('content_review_tab_ticks').select('tab_key').eq('content_item_id', tickItemId)
      const otherTenant = await kansetClient.from('content_review_tab_ticks').select('tab_key').eq('content_item_id', tickItemId)
      const anonRead = await anonClient.from('content_review_tab_ticks').select('tab_key').eq('content_item_id', tickItemId)
      check('TK1: a seat ticks tabs on the released version and only that seat reads them',
        !!early.error && /review_tick_version_not_released/.test(early.error.message)
          && !ticked.error && ticked.data === 2
          && !own.error && own.data?.map((row) => row.tab_key).sort().join(',') === 'caption,youtube'
          && !otherSeat.error && otherSeat.data?.length === 0
          && !otherTenant.error && otherTenant.data?.length === 0
          && (!!anonRead.error || anonRead.data?.length === 0),
        JSON.stringify({ early: early.error?.message, ticked: ticked.data ?? ticked.error?.message, own: own.data }))

      const again = await tClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['caption'],
      })
      const directInsert = await tClient.from('content_review_tab_ticks').insert({
        content_item_id: tickItemId, content_version: 1, tab_key: 'forged',
      })
      const directDelete = await tClient.from('content_review_tab_ticks').delete()
        .eq('content_item_id', tickItemId).select('tab_key')
      check('TK2: re-ticking is a no-op and nobody writes or deletes ticks directly',
        !again.error && again.data === 0 && !!directInsert.error
          && (!!directDelete.error || directDelete.data?.length === 0),
        again.error?.message ?? directInsert.error?.message ?? JSON.stringify(directDelete.data))

      const badKey = await tClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['Not A Key'],
      })
      const futureVersion = await tClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 2, p_tab_keys: ['caption'],
      })
      const crossTenant = await kansetClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['caption'],
      })
      const anonTick = await anonClient.rpc('tick_review_tabs', {
        p_content_id: tickItemId, p_content_version: 1, p_tab_keys: ['caption'],
      })
      check('TK3: a bad key, an unreleased version, another tenant and anon are refused',
        !!badKey.error && !!futureVersion.error && !!crossTenant.error && !!anonTick.error,
        JSON.stringify([badKey, futureVersion, crossTenant, anonTick].map((r) => r.error?.message ?? 'NO ERROR')))

      const savedAt = new Date().toISOString()
      const draft = await bClient.rpc('save_review_draft', {
        p_content_id: tickItemId, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: 'A caption edit she has not sent.', p_saved_at: savedAt,
      })
      if (draft.error) throw new Error(`ticks draft: ${draft.error.message}`)
      const draftSavedAt = (draft.data as { draft?: { saved_at?: string } } | null)?.draft?.saved_at ?? savedAt
      const blocked = await bClient.rpc('record_content_decision', {
        p_content_id: tickItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const decisionAfterBlock = await bClient.from('content_with_state')
        .select('current_decision').eq('id', tickItemId).single()
      check('TK4: approval is refused while the approving seat has an unsent draft',
        !!blocked.error && /unsent_review_drafts/.test(blocked.error.message)
          && decisionAfterBlock.data?.current_decision === null,
        blocked.error?.message ?? `decision=${decisionAfterBlock.data?.current_decision}`)

      const discarded = await bClient.rpc('discard_review_draft', {
        p_content_id: tickItemId, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_reason: 'client_discarded', p_saved_at: draftSavedAt,
      })
      // Another seat's unsent draft is invisible to the approving seat and does not block her.
      const otherSeatDraft = await tClient.rpc('save_review_draft', {
        p_content_id: tickItemId, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: 'Another seat has not sent this.', p_saved_at: new Date().toISOString(),
      })
      const approved = await bClient.rpc('record_content_decision', {
        p_content_id: tickItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      check('TK5: once the draft is discarded the same seat can approve, despite another seat\'s unsent draft',
        !discarded.error && !otherSeatDraft.error && !approved.error,
        discarded.error?.message ?? otherSeatDraft.error?.message ?? approved.error?.message ?? '')
    }

    // 0094 (amended 2026-10-03): playback failure reports. A seat reports only for its own client's
    // released version of an existing preview, reads only its own reports, is rate-limited, and the
    // first report per preview per Toronto day reaches the agency, never the client.
    {
      const P_EMAIL = `rls-playback-${RUN_ID}@example.com`
      const createdSeat = await admin.auth.admin.createUser({ email: P_EMAIL, email_confirm: true })
      if (createdSeat.error || !createdSeat.data.user) {
        throw new Error(`playback seat: ${createdSeat.error?.message ?? 'missing'}`)
      }
      const seat = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: createdSeat.data.user.id, p_email: P_EMAIL, p_name: 'Paula Playback',
        // One primary decider per client (0013); reporting needs only a seat.
        p_can_decide: false, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
        p_can_use_assistant: false, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-playback-seat-${RUN_ID}`,
      })
      if (seat.error) throw new Error(`playback seat membership: ${seat.error.message}`)
      const pClient = clientForToken(await tokenFor(P_EMAIL))

      const playId = `rls-playback-${RUN_ID}`
      const playSync = await sync([snapshot(bClientId!, playId, 1, 'Playback fixture', 'Playback caption', 'caption')])
      const playItemId = playSync.find((row) => row.content_id === playId)?.item_id
      if (!playItemId) throw new Error('playback fixture did not sync')
      const sha = 'b'.repeat(64)
      const prefix = `${bClientId}/${playItemId}/v1/reel/${sha.slice(0, 16)}/`
      const registered = await admin.rpc('agency_register_review_preview', {
        p_client_id: bClientId, p_content_id: playId, p_content_version: 1, p_preview_key: 'reel',
        p_review_asset_key: null, p_media_kind: 'video', p_object_prefix: prefix,
        p_video_path: `${prefix}video.mp4`, p_poster_path: `${prefix}poster.jpg`, p_frames: [],
        p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 24, p_byte_total: 1000,
        p_source_sha256: sha, p_actor_key: 'thedot-admin',
      })
      if (registered.error) throw new Error(`playback preview: ${registered.error.message}`)
      const report = (client: SupabaseClient, overrides: Record<string, unknown> = {}) =>
        client.rpc('report_review_playback_failure', {
          p_content_id: playItemId, p_content_version: 1, p_preview_key: 'reel',
          p_error_code: 'media_err_network', p_device: 'iPhone', p_browser: 'Safari', ...overrides,
        })
      const outcome = (result: { data: unknown }) => (result.data as { outcome?: string } | null)?.outcome

      const early = await report(pClient)
      const released = await admin.rpc('mark_content_ready', { p_content_id: playItemId, p_content_version: 1 })
      if (released.error) throw new Error(`playback release: ${released.error.message}`)

      const first = await report(pClient)
      const own = await pClient.from('content_review_playback_failures').select('device, browser, error_code')
        .eq('content_item_id', playItemId)
      // review_playback_failed is not agency_internal, so the tenant's own seat reads the row.
      const activity = await bClient.from('activity_log').select('id, title, actor_type')
        .eq('content_id', playItemId).eq('event_type', 'review_playback_failed')
      const failureId = (first.data as { failure_id?: string } | null)?.failure_id
      const inboxEvent = failureId
        ? await admin.rpc('show_portal_inbox_event', { p_client_id: bClientId, p_event_id: failureId })
        : { data: null, error: new Error('no failure id') }
      const inboxRow = inboxEvent.data as {
        event_type?: string; payload?: { content_item_id?: string }; requires_reconciliation?: boolean
      } | null
      check('PB1: the first failure is recorded for the seat and reaches the agency once',
        !first.error && outcome(first) === 'notified'
          && own.data?.length === 1 && own.data[0].device === 'iPhone' && own.data[0].browser === 'Safari'
          && activity.data?.length === 1 && activity.data[0].title === "Paula's video didn't play: iPhone, Safari"
          && activity.data[0].actor_type === 'client'
          && !inboxEvent.error && inboxRow?.event_type === 'review_playback_failed'
          && inboxRow.payload?.content_item_id === playItemId && inboxRow.requires_reconciliation === false,
        JSON.stringify({ first: first.data ?? first.error?.message, own: own.data, activity: activity.data, inbox: inboxRow }))

      const again = await report(pClient, { p_error_code: 'stalled' })
      const ownAfter = await pClient.from('content_review_playback_failures').select('id').eq('content_item_id', playItemId)
      check('PB2: the same seat is rate-limited on the same preview for 10 minutes',
        !again.error && outcome(again) === 'rate_limited' && ownAfter.data?.length === 1,
        JSON.stringify({ again: again.data ?? again.error?.message, rows: ownAfter.data?.length }))

      const second = await report(bClient, { p_device: 'Mac', p_browser: 'Chrome' })
      const activityAfter = await bClient.from('activity_log').select('id')
        .eq('content_id', playItemId).eq('event_type', 'review_playback_failed')
      const bRows = await bClient.from('content_review_playback_failures').select('device').eq('content_item_id', playItemId)
      const otherTenant = await kansetClient.from('content_review_playback_failures').select('id').eq('content_item_id', playItemId)
      const anonRows = await anonClient.from('content_review_playback_failures').select('id').eq('content_item_id', playItemId)
      check('PB3: another seat is recorded without a second notice, and each seat reads only its own reports',
        !second.error && outcome(second) === 'recorded' && activityAfter.data?.length === 1
          && bRows.data?.map((row) => row.device).join(',') === 'Mac'
          && !otherTenant.error && otherTenant.data?.length === 0
          && (!!anonRows.error || anonRows.data?.length === 0),
        JSON.stringify({ second: second.data ?? second.error?.message, notices: activityAfter.data?.length,
          b: bRows.data, other: otherTenant.data, anon: anonRows.data ?? anonRows.error?.message }))

      const unknownPreview = await report(bClient, { p_preview_key: 'teaser' })
      const badDevice = await report(bClient, { p_device: 'Nokia 3310' })
      const crossTenant = await report(kansetClient)
      const anonReport = await report(anonClient)
      const directInsert = await pClient.from('content_review_playback_failures').insert({
        content_item_id: playItemId, content_version: 1, preview_key: 'reel', error_code: 'unknown',
        device: 'iPhone', browser: 'Safari',
      })
      check('PB4: unreleased versions, unknown previews, bad values, other tenants, anon and direct writes are refused',
        !!early.error && /review_playback_version_not_released/.test(early.error.message)
          && !!unknownPreview.error && /review_playback_preview_not_found/.test(unknownPreview.error.message)
          && !!badDevice.error && /invalid playback report/.test(badDevice.error.message)
          && !!crossTenant.error && !!anonReport.error && !!directInsert.error,
        JSON.stringify([early, unknownPreview, badDevice, crossTenant, anonReport, directInsert]
          .map((r) => r.error?.message ?? 'NO ERROR')))

      const outbox = await admin.from('notification_outbox').select('recipient_kind, channel')
        .in('source_activity_id', (activity.data ?? []).map((row) => row.id as string))
      check('PB5: the notice goes to the agency (email and in-app), never to the client',
        !outbox.error && (outbox.data ?? []).length >= 1
          && (outbox.data ?? []).every((row) => row.recipient_kind === 'agency')
          && (outbox.data ?? []).some((row) => row.channel === 'email'),
        JSON.stringify(outbox.data ?? outbox.error?.message))

      // 0095 (review fix): a feedback answer is private to the seat. The activity row that notifies
      // the agency carries no rating or comment, so a sibling seat reading activity_log learns nothing.
      const FB_COMMENT = `Private feedback note ${RUN_ID}`
      const fb = await pClient.rpc('submit_portal_feedback', {
        p_client_id: bClientId, p_prompt_key: `rls-fb-${RUN_ID}`, p_rating: 2,
        p_comment: FB_COMMENT, p_content_item_id: playItemId,
      })
      const fbOwn = await pClient.from('portal_feedback_responses').select('rating, comment')
        .eq('prompt_key', `rls-fb-${RUN_ID}`)
      const fbSibling = await bClient.from('activity_log')
        .select('id, title, summary, actor_type, actor_name, related_url, event_type')
        .eq('event_type', 'portal_feedback_submitted')
      const fbSiblingText = JSON.stringify(fbSibling.data ?? [])
      const fbOutbox = await admin.from('notification_outbox').select('recipient_kind, channel')
        .in('source_activity_id', (fbSibling.data ?? []).map((row) => row.id as string))
      check('FBP1: feedback stays with its seat; a sibling seat sees no rating or comment in activity_log',
        !fb.error && (fb.data as { outcome?: string } | null)?.outcome === 'submitted'
          && fbOwn.data?.length === 1 && fbOwn.data[0].rating === 2 && fbOwn.data[0].comment === FB_COMMENT
          && !fbSibling.error && fbSibling.data?.length === 1
          && !fbSiblingText.includes(FB_COMMENT) && !fbSiblingText.includes('Private feedback')
          && !/\b2 of 5\b/.test(fbSiblingText)
          && !fbOutbox.error && (fbOutbox.data ?? []).length >= 1
          && (fbOutbox.data ?? []).every((row) => row.recipient_kind === 'agency')
          && (fbOutbox.data ?? []).some((row) => row.channel === 'email'),
        JSON.stringify({ fb: fb.data ?? fb.error?.message, own: fbOwn.data, sibling: fbSibling.data ?? fbSibling.error?.message,
          outbox: fbOutbox.data ?? fbOutbox.error?.message }))
    }

    // 0095: feedback answers (one per seat, own-row read, RPC-only writes, agency-only notice) and
    // agency signal handling (open signals, Done, unsent-draft alert events). Builds on FBP1/FBP2
    // (answer private to the seat, switches honoured), DR16 (the send-failure cursor rule) and SG12
    // (Done refuses a send failure); none of those are repeated here.
    {
      const PROMPT = `rls_feedback_${RUN_ID}`.toLowerCase()
      const answer = (client: SupabaseClient, overrides: Record<string, unknown> = {}) => client.rpc('submit_portal_feedback', {
        p_client_id: bClientId, p_prompt_key: PROMPT, p_rating: 4, p_comment: 'Much easier on my phone.',
        p_content_item_id: null, ...overrides,
      })
      const outcome = (result: { data: unknown }) => (result.data as { outcome?: string } | null)?.outcome
      // activity_log is read through a client seat (client-visible rows); the inbox through agency RPCs.
      const feedbackActivity = async () => {
        const rows = await bClient.from('activity_log').select('id,actor_type,title,summary')
          .eq('event_type', 'portal_feedback_submitted')
        if (rows.error) throw new Error(`feedback activity: ${rows.error.message}`)
        return rows.data ?? []
      }
      const activityBefore = new Set((await feedbackActivity()).map((row) => row.id as string))

      const first = await answer(bClient)
      const second = await answer(bClient, { p_rating: 1, p_comment: 'Changed my mind.' })
      const own = await bClient.from('portal_feedback_responses')
        .select('client_id,prompt_key,rating,comment,created_at').eq('prompt_key', PROMPT)
      check('FB1: a seat answers once; a second answer changes nothing',
        !first.error && outcome(first) === 'submitted' && !second.error && outcome(second) === 'already_submitted'
          && own.data?.length === 1 && own.data[0].rating === 4 && own.data[0].comment === 'Much easier on my phone.',
        first.error?.message ?? second.error?.message ?? own.error?.message ?? JSON.stringify(own.data))

      const viewerSees = await bViewerClient.from('portal_feedback_responses').select('rating').eq('prompt_key', PROMPT)
      const kansetSees = await kansetClient.from('portal_feedback_responses').select('rating').eq('prompt_key', PROMPT)
      check('FB2: another seat of the same client and another tenant read none of it',
        !viewerSees.error && viewerSees.data?.length === 0 && !kansetSees.error && kansetSees.data?.length === 0,
        viewerSees.error?.message ?? kansetSees.error?.message ?? '')

      const hiddenColumns = await bClient.from('portal_feedback_responses').select('auth_user_id,seat_name').eq('prompt_key', PROMPT)
      check('FB3: the seat cannot read the hidden columns', Boolean(hiddenColumns.error),
        hiddenColumns.error?.message ?? JSON.stringify(hiddenColumns.data))

      const directInsert = await bClient.from('portal_feedback_responses').insert({
        client_id: bClientId, auth_user_id: bUserId, prompt_key: 'forged_answer', rating: 5, seat_name: 'Forged',
      })
      const directUpdate = await bClient.from('portal_feedback_responses').update({ rating: 1 }).eq('prompt_key', PROMPT).select('rating')
      check('FB4: no direct insert or update', Boolean(directInsert.error) && (Boolean(directUpdate.error) || directUpdate.data?.length === 0),
        `${directInsert.error?.message ?? 'INSERTED'} | ${directUpdate.error?.message ?? JSON.stringify(directUpdate.data)}`)

      const refused = await Promise.all([
        answer(bClient, { p_prompt_key: `${PROMPT}_a`, p_rating: 0 }),
        answer(bClient, { p_prompt_key: `${PROMPT}_b`, p_rating: 6 }),
        answer(bClient, { p_prompt_key: `${PROMPT}_c`, p_comment: 'x'.repeat(2001) }),
        answer(bClient, { p_prompt_key: `${PROMPT}_d`, p_comment: 'bell \u0007 here' }),
        answer(bClient, { p_prompt_key: `${PROMPT}_e`, p_client_id: kansetClientId }),
        answer(bClient, { p_prompt_key: `${PROMPT}_f`, p_content_item_id: kansetItemId }),
        answer(anonClient, { p_prompt_key: `${PROMPT}_g` }),
      ])
      check('FB5: bad rating, long or control-character comment, foreign tenant, foreign piece and anon are refused',
        refused.every((result) => Boolean(result.error)), refused.map((result) => result.error?.message ?? 'accepted').join(' | '))

      const viewerAnswer = await answer(bViewerClient, { p_rating: 5, p_comment: 'Line one\nLine two' })
      check('FB6: a second seat answers on its own row, newlines allowed', !viewerAnswer.error && outcome(viewerAnswer) === 'submitted',
        viewerAnswer.error?.message ?? '')

      const activity = (await feedbackActivity()).filter((row) => !activityBefore.has(row.id as string))
      const activityIds = activity.map((row) => row.id as string)
      const outbox = activityIds.length ? await admin.from('notification_outbox').select('source_activity_id,recipient_kind,channel')
        .in('source_activity_id', activityIds) : { data: [], error: null }
      const outboxRows = (outbox.data ?? []) as Array<{ source_activity_id: string; recipient_kind: string; channel: string }>
      check('FB7: each answer notifies the agency (email and in-app) and never the client',
        activity.length === 2 && activity.every((row) => row.actor_type === 'client')
          && !outbox.error && outboxRows.every((row) => row.recipient_kind === 'agency')
          && activityIds.every((id) => outboxRows.some((row) => row.source_activity_id === id && row.channel === 'email')
            && outboxRows.some((row) => row.source_activity_id === id && row.channel === 'in_app')),
        JSON.stringify({ activity, outbox: outbox.data ?? outbox.error?.message }))

      type SignalRow = { event_id: string; client_id: string; event_type: string; content_item_id: string | null
        payload: { prompt_key?: string; rating?: number; comment?: string | null } }
      const openSignals = async () => {
        const result = await admin.rpc('agency_open_client_signals', { p_limit: 500 })
        if (result.error) throw new Error(`open signals: ${result.error.message}`)
        return (result.data ?? []) as SignalRow[]
      }
      const bFeedbackSignals = (await openSignals()).filter((row) => row.client_id === bClientId
        && row.event_type === 'portal_feedback_submitted' && row.payload?.prompt_key === PROMPT)
      const feedbackEvents = await Promise.all(bFeedbackSignals.map((row) =>
        admin.rpc('show_portal_inbox_event', { p_client_id: bClientId, p_event_id: row.event_id })))
      const feedbackEventRows = feedbackEvents.map((result) => result.data as {
        requires_reconciliation?: boolean; object_type?: string } | null)
      check('FB8: one non-blocking inbox event per answer',
        bFeedbackSignals.length === 2 && feedbackEvents.every((result) => !result.error)
          && feedbackEventRows.every((row) => row?.requires_reconciliation === false
            && row.object_type === 'portal_feedback_response'),
        JSON.stringify(feedbackEventRows))

      const clientInbox = await bClient.from('portal_inbox_events').select('id').eq('client_id', bClientId)
      const ratings = bFeedbackSignals.map((row) => `${row.payload?.rating}:${row.payload?.comment ?? ''}`).sort()
      const activityText = JSON.stringify(activity)
      check('FB9: the answer reaches the agency in the inbox payload only; seats cannot read the inbox and the activity row carries no answer',
        ratings.join('|') === ['4:Much easier on my phone.', '5:Line one\nLine two'].join('|')
          && (Boolean(clientInbox.error) || clientInbox.data?.length === 0)
          && !activityText.includes('Much easier') && !activityText.includes('Line one'),
        JSON.stringify({ ratings, clientInbox: clientInbox.error?.message ?? clientInbox.data, activity }))

      check('SG1: open signals list each feedback answer', bFeedbackSignals.length === 2, JSON.stringify(bFeedbackSignals))

      const clientCalls = await Promise.all([
        bClient.rpc('agency_open_client_signals', { p_limit: 5 }),
        bClient.rpc('agency_resolve_inbox_event', { p_event_id: bFeedbackSignals[0]?.event_id, p_note: null,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-forged-${RUN_ID}` }),
        bClient.rpc('agency_raise_unsent_draft_alert_events', { p_now: null }),
        bClient.from('agency_inbox_resolutions').select('event_id'),
      ])
      check('SG2: client roles reach no agency signal function or table',
        clientCalls.slice(0, 3).every((result) => Boolean(result.error))
          && (Boolean(clientCalls[3].error) || (clientCalls[3].data ?? []).length === 0),
        clientCalls.map((result) => result.error?.message ?? 'ok').join(' | '))

      const target = bFeedbackSignals[0]?.event_id
      const resolveOnce = await admin.rpc('agency_resolve_inbox_event', { p_event_id: target, p_note: 'Read it.',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-1` })
      const resolveTwice = await admin.rpc('agency_resolve_inbox_event', { p_event_id: target, p_note: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-2` })
      const stillOpen = (await openSignals()).some((row) => row.event_id === target)
      const otherStillOpen = (await openSignals()).some((row) => row.event_id === bFeedbackSignals[1]?.event_id)
      check('SG3: Done closes one signal once; a second Done reports already_resolved; the other answer stays open',
        outcome(resolveOnce) === 'resolved' && outcome(resolveTwice) === 'already_resolved' && !stillOpen && otherStillOpen,
        resolveOnce.error?.message ?? resolveTwice.error?.message ?? JSON.stringify({ stillOpen, otherStillOpen }))

      const bInbox = await admin.rpc('read_portal_inbox', { p_consumer_key: `rls-sg-other-${RUN_ID}`, p_client_id: bClientId, p_limit: 50 })
      const SIGNAL_TYPES = ['portal_feedback_submitted', 'review_send_failed', 'review_drafts_carried_over',
        'review_unsent_drafts_due', 'review_playback_failed']
      const otherEvent = ((bInbox.data ?? []) as Array<{ id: string; event_type: string }>)
        .find((row) => !SIGNAL_TYPES.includes(row.event_type))
      const wrongType = otherEvent ? await admin.rpc('agency_resolve_inbox_event', { p_event_id: otherEvent.id,
        p_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-3` }) : { error: { message: 'no other event' } }
      check('SG4: only client signals can be marked Done', Boolean(wrongType.error) && /not a client signal/.test(wrongType.error?.message ?? ''),
        wrongType.error?.message ?? 'accepted')

      // A send failure is listed until her retry resolves its rows (DR16 proves the cursor rule and
      // SG12 that Done refuses it). A fresh tenant, so nothing else in its inbox can interfere.
      const createdC = await admin.rpc('create_portal_client', { p_name: 'RLS Ops Signals', p_slug: `rls-ops-${RUN_ID}` })
      if (createdC.error || !createdC.data) throw new Error(`ops tenant: ${createdC.error?.message ?? 'missing'}`)
      const cClientId = createdC.data as string
      const attemptId = randomUUID()
      const inserted = await admin.from('client_request_failures').insert({
        attempt_id: attemptId, client_id: cClientId, reason_code: 'write_failed',
        proposed_text: 'Her exact words.', proposed_length: 16, requester_name: 'RLS Seat',
      })
      if (inserted.error) throw new Error(`failure row: ${inserted.error.message}`)
      const recorded = await admin.rpc('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: [] })
      if (recorded.error) throw new Error(`record failure: ${recorded.error.message}`)
      const failureSignal = (await openSignals()).find((row) => row.client_id === cClientId && row.event_type === 'review_send_failed')
      check('SG5: an open send failure is listed under From Maria', Boolean(failureSignal), JSON.stringify(failureSignal ?? null))

      const resolvedRows = await admin.from('client_request_failures').update({
        resolved_at: new Date().toISOString(), resolved_by: 'system:retry', resolution_note: 'RLS retry',
      }).eq('attempt_id', attemptId)
      const listedAfter = (await openSignals()).some((row) => row.event_id === failureSignal?.event_id)
      const failureResolutions = await admin.from('agency_inbox_resolutions').select('event_id')
        .eq('event_id', failureSignal?.event_id ?? randomUUID())
      check('SG6: a send failure leaves the list on its own once a retry resolves its rows, with no Done row',
        !resolvedRows.error && !listedAfter && !failureResolutions.error && (failureResolutions.data ?? []).length === 0,
        resolvedRows.error?.message ?? JSON.stringify({ listedAfter, resolutions: failureResolutions.data }))

      const fold = await admin.rpc('assert_portal_security')
      const opsAssertion = await admin.rpc('assert_agency_ops_feedback_security')
      const clientAssertions = await Promise.all([
        bClient.rpc('assert_agency_ops_feedback_security'),
        bClient.rpc('assert_agency_media_signal_security'),
        anonClient.rpc('assert_agency_ops_feedback_security'),
      ])
      check('SG7: the cumulative security assertion runs the 0095 guards and is agency-only',
        !fold.error && !opsAssertion.error && clientAssertions.every((result) => Boolean(result.error)),
        fold.error?.message ?? opsAssertion.error?.message ?? clientAssertions.map((r) => r.error?.message ?? 'RAN').join(' | '))

      // Unsent-draft alert events: a dedicated seat so no other block's edit budget is used.
      const O_EMAIL = `rls-ops-${RUN_ID}@example.com`
      const createdSeat = await admin.auth.admin.createUser({ email: O_EMAIL, email_confirm: true })
      if (createdSeat.error || !createdSeat.data.user) throw new Error(`ops seat: ${createdSeat.error?.message ?? 'missing'}`)
      const seatMembership = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: createdSeat.data.user.id, p_email: O_EMAIL, p_name: 'RLS Ops Seat',
        // One primary decider per client (0013); saving drafts needs only request rights.
        p_can_decide: false, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
        p_can_use_assistant: false, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-ops-seat-${RUN_ID}`,
      })
      if (seatMembership.error) throw new Error(`ops seat membership: ${seatMembership.error.message}`)
      const oClient = clientForToken(await tokenFor(O_EMAIL))
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      const dueDate = new Date(`${today}T12:00:00Z`); dueDate.setUTCDate(dueDate.getUTCDate() + 2)
      const alertId = `rls-ops-alert-${RUN_ID}`
      const [alertRow] = await sync([snapshot(bClientId!, alertId, 1, 'Ops alert fixture', 'Alert caption base', 'caption',
        { planned_date: dueDate.toISOString().slice(0, 10) })])
      const released = await admin.rpc('mark_content_ready', { p_content_id: alertRow.item_id, p_content_version: 1 })
      if (released.error) throw new Error(`alert fixture release: ${released.error.message}`)
      const saved = await oClient.rpc('save_review_draft', {
        p_content_id: alertRow.item_id, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: 'An edit she forgot to send.', p_saved_at: new Date().toISOString(),
      })
      if (saved.error) throw new Error(`alert fixture draft: ${saved.error.message}`)
      // The service role cannot select portal_inbox_events; show_portal_inbox_event returns the
      // newest event whose object is this fixture, and the alert is the last event written for it.
      const latestForFixture = async () => {
        const shown = await admin.rpc('show_portal_inbox_event', { p_client_id: bClientId, p_event_id: alertRow.item_id })
        return shown.data as { event_type?: string; event_key?: string; requires_reconciliation?: boolean
          payload?: { unsent_count?: number } } | null
      }
      const later = new Date(Date.now() + 25 * 3600 * 1000).toISOString()
      const raisedNow = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: new Date().toISOString() })
      const eventNow = await latestForFixture()
      const raisedLater = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: later })
      const raisedAgain = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: later })
      const eventLater = await latestForFixture()
      const listedAsSignal = (await openSignals()).some((row) => row.event_type === 'review_unsent_drafts_due')
      check('SG8: a forgotten draft raises one non-blocking inbox event per day, only after 24 hours, never as a Done row',
        !raisedNow.error && eventNow?.event_type !== 'review_unsent_drafts_due'
          && (raisedLater.data as number) >= 1 && raisedAgain.data === 0
          && eventLater?.event_type === 'review_unsent_drafts_due' && eventLater.requires_reconciliation === false
          && eventLater.payload?.unsent_count === 1 && !listedAsSignal,
        JSON.stringify({ now: eventNow?.event_type ?? raisedNow.error?.message, later: raisedLater.data ?? raisedLater.error?.message,
          again: raisedAgain.data, event: eventLater }))
      console.log(`cleanup: disposable tenant rls-ops-${RUN_ID} and user ${O_EMAIL} remain until database reset`)
    }

    // 0095 (amended 2026-10-03): a failed play is a From Maria signal until Done; a piece in front of
    // Maria with no media is listed until media is attached, and an approved override silences it.
    {
      const signalRows = async () => {
        const result = await admin.rpc('agency_open_client_signals', { p_limit: 500 })
        if (result.error) throw new Error(`open signals: ${result.error.message}`)
        return (result.data ?? []) as Array<{ event_id: string; event_type: string; content_item_id: string | null }>
      }
      const mediaAlerts = async () => {
        const result = await admin.rpc('agency_release_media_alerts')
        if (result.error) throw new Error(`media alerts: ${result.error.message}`)
        return (result.data ?? []) as Array<{ content_item_id: string; override_reason: string | null }>
      }

      const playId = `rls-sg-playback-${RUN_ID}`
      const [playSynced] = await sync([snapshot(bClientId!, playId, 1, 'Signal playback', 'Signal playback body', 'caption')])
      const sha = 'd'.repeat(64)
      const prefix = `${bClientId}/${playSynced.item_id}/v1/reel/${sha.slice(0, 16)}/`
      const registered = await admin.rpc('agency_register_review_preview', {
        p_client_id: bClientId, p_content_id: playId, p_content_version: 1, p_preview_key: 'reel',
        p_review_asset_key: null, p_media_kind: 'video', p_object_prefix: prefix,
        p_video_path: `${prefix}video.mp4`, p_poster_path: `${prefix}poster.jpg`, p_frames: [],
        p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 24, p_byte_total: 1000,
        p_source_sha256: sha, p_actor_key: 'thedot-admin',
      })
      if (registered.error) throw new Error(`signal preview: ${registered.error.message}`)
      const playReady = await admin.rpc('mark_content_ready', { p_content_id: playSynced.item_id, p_content_version: 1 })
      if (playReady.error) throw new Error(`signal playback release: ${playReady.error.message}`)
      const reported = await bClient.rpc('report_review_playback_failure', {
        p_content_id: playSynced.item_id, p_content_version: 1, p_preview_key: 'reel',
        p_error_code: 'media_err_decode', p_device: 'iPhone', p_browser: 'Safari',
      })
      const listed = (await signalRows())
        .find((row) => row.event_type === 'review_playback_failed' && row.content_item_id === playSynced.item_id)
      const done = listed
        ? await admin.rpc('agency_resolve_inbox_event', {
          p_event_id: listed.event_id, p_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg9-${RUN_ID}`,
        })
        : null
      const stillListed = (await signalRows()).some((row) => row.event_id === listed?.event_id)
      check('SG9: a failed play shows under From Maria until Done',
        !reported.error && (reported.data as { outcome?: string } | null)?.outcome === 'notified'
          && !!listed && !!done && !done.error && !stillListed,
        JSON.stringify({ reported: reported.data ?? reported.error?.message, listed, done: done?.error?.message ?? 'ok', stillListed }))

      // A released piece that loses its media: release it with a design link, then remove the link.
      const lostMedia = async (name: string) => {
        const contentId = `rls-sg-media-${name}-${RUN_ID}`
        const [synced] = await sync([snapshot(bClientId!, contentId, 1, `Signal ${name}`, 'No media body', 'caption')])
        const design = (url: string | null, key: string) => admin.rpc('set_content_design_links', {
          p_client_id: bClientId, p_content_id: contentId, p_canva_url: url, p_drive_url: null,
          p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${name}-${key}-${RUN_ID}`,
        })
        const linked = await design(`https://www.canva.com/design/SIGNAL${name.toUpperCase()}/view`, 'link')
        if (linked.error) throw new Error(`signal ${name} design: ${linked.error.message}`)
        const ready = await admin.rpc('mark_content_ready', { p_content_id: synced.item_id, p_content_version: 1 })
        if (ready.error) throw new Error(`signal ${name} release: ${ready.error.message}`)
        const cleared = await design(null, 'clear')
        if (cleared.error) throw new Error(`signal ${name} clear: ${cleared.error.message}`)
        return { contentId, itemId: synced.item_id, relink: () => design(`https://www.canva.com/design/SIGNAL${name.toUpperCase()}2/view`, 'relink') }
      }

      const relinked = await lostMedia('relink')
      const before = (await mediaAlerts()).find((row) => row.content_item_id === relinked.itemId)
      const relink = await relinked.relink()
      const afterLink = (await mediaAlerts()).some((row) => row.content_item_id === relinked.itemId)
      const previewPiece = (await mediaAlerts()).some((row) => row.content_item_id === playSynced.item_id)
      const clientCall = await bClient.rpc('agency_release_media_alerts')
      check('SG10: a piece with Maria and no media is listed until media is attached; clients cannot read the list',
        !!before && before.override_reason === null && !relink.error && !afterLink && !previewPiece && !!clientCall.error,
        JSON.stringify({ before, relink: relink.error?.message ?? 'ok', afterLink, previewPiece,
          client: clientCall.error?.message ?? 'NO ERROR' }))

      // Anastasia, 2026-10-03: an approved no-media override on the released version silences the
      // alert. The override is the thing under test, written explicitly on a disposable fixture (as
      // RM2 does); no fixture helper ever writes one on its own.
      const overridden = await lostMedia('override')
      const listedBefore = (await mediaAlerts()).some((row) => row.content_item_id === overridden.itemId)
      const recorded = await admin.rpc('agency_record_release_media_override', {
        p_client_id: bClientId, p_content_id: overridden.contentId, p_content_version: 1,
        p_reason: 'Approved by Anastasia: signal test, nothing to preview.', p_actor_key: 'thedot-admin',
      })
      const listedAfter = (await mediaAlerts()).some((row) => row.content_item_id === overridden.itemId)
      check('SG11: an approved no-media override on the released version silences the alert',
        listedBefore && !recorded.error && !listedAfter,
        JSON.stringify({ listedBefore, recorded: recorded.error?.message ?? 'ok', listedAfter }))
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

      // 0095 (review fix): the feedback writer honours the launch and mutation switches.
      const fbStopped = await bViewerClient.rpc('submit_portal_feedback', {
        p_client_id: bClientId, p_prompt_key: `rls-fb-stop-${RUN_ID}`, p_rating: 4,
        p_comment: null, p_content_item_id: null,
      })
      const fbStoppedRows = await admin.from('portal_feedback_responses').select('id')
        .eq('prompt_key', `rls-fb-stop-${RUN_ID}`)
      check('FBP2: the tenant mutation kill switch refuses feedback before any write',
        !!fbStopped.error && /portal_action_not_allowed/.test(fbStopped.error.message)
          && !fbStoppedRows.error && fbStoppedRows.data?.length === 0,
        JSON.stringify({ err: fbStopped.error?.message ?? 'NO ERROR', rows: fbStoppedRows.data ?? fbStoppedRows.error?.message }))

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

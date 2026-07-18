// PostgREST integration proof for portal tenant isolation and the immutable released-version model.
// This script mutates the configured disposable database with a unique throwaway tenant/user.
// The complete tenant/Auth/data set remains until the required local/staging database reset: the
// approval audit FK intentionally prevents deleting a decision-maker independently.
// Run only after applying 0001..0006 to a disposable/staging database first.
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
      check('C11: anon cannot read released portal content', !!anonRead.error || (anonRead.data ?? []).length === 0,
        anonRead.error?.message ?? `rows=${anonRead.data?.length ?? 0}`)
      check('C12: anon cannot call client comment RPC', !!anonComment.error, anonComment.error?.message ?? 'NO ERROR')
      check('C13: anon cannot call service sync RPC', !!anonSync.error, anonSync.error?.message ?? 'NO ERROR')
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

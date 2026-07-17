// scripts/test-rls.ts
// Standalone tsx script that PROVES multi-tenant isolation, RPC authorization, and RPC idempotency
// for the client portal, using REAL user JWTs against PostgREST (the exact path the app uses), and
// cleans up after itself.
//
// It mutates the REAL database: it creates a throwaway tenant B (client + auth user + one content
// item), signs in as real users, runs read/RPC assertions, and deletes everything in a finally block.
//
// Run: npx tsx scripts/test-rls.ts
// Safe to re-run: it pre-deletes any leftover 'rls-test-*' client/user/content before setup, and it
// always cleans up (finally), even if an assertion or setup step throws. Exits non-zero on any failure.
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!rawUrl || !rawAnon || !rawService) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local',
  )
}
// After the guard these are guaranteed strings; capture them so closures below see `string`, not
// `string | undefined` (control-flow narrowing does not reliably reach into nested functions).
const SUPABASE_URL: string = rawUrl
const ANON_KEY: string = rawAnon
const SERVICE_KEY: string = rawService

// Fixed identifiers for the throwaway tenant B, so a leftover from a prior run is deterministically
// found and deleted at the start.
const B_SLUG = 'rls-test-tenant'
const B_EMAIL = 'rls-test-userb@example.com'
const B_CONTENT_ID = 'rls-test-piece'
const KANSET_SLUG = 'kanset'
const KANSET_EMAIL = 'info@thedotcreative.co'

// Admin (service-role) client. persistSession off: this is a one-shot script, not a browser session.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

let failures = 0
function check(name: string, passed: boolean, detail = ''): void {
  const suffix = detail ? ` (${detail})` : ''
  if (passed) {
    console.log(`PASS  ${name}${suffix}`)
  } else {
    failures++
    console.log(`FAIL  ${name}${suffix}`)
  }
}

// Mint a REAL user access token (JWT) without sending any email: generateLink returns a hashed_token
// server-side, verifyOtp exchanges it for a session. Same token_hash flow the portal callback uses.
async function tokenFor(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: e2 } = await anon.auth.verifyOtp({
    token_hash: (data.properties as { hashed_token: string }).hashed_token,
    type: 'magiclink',
  })
  if (e2 || !s.session) throw e2 ?? new Error(`no session for ${email}`)
  return s.session.access_token
}

// A per-user PostgREST client that sends the user's JWT, so every read/RPC runs under that user's RLS.
function clientForToken(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function findAuthUser(email: string) {
  const target = email.toLowerCase()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === target) ?? null
}

// Remove anything a prior run may have left behind, so the script is re-runnable.
async function preClean(): Promise<void> {
  // Deleting client B cascades its content_items / client_users / approvals / activity_log, so the
  // fresh per-tenant insert (unique on client_id, content_id, under a brand-new client uuid) cannot collide.
  const { error: dcErr } = await admin.from('clients').delete().eq('slug', B_SLUG)
  if (dcErr) throw new Error(`preClean delete client B: ${dcErr.message}`)
  // Defensive extra sweep of any test-named stray row (redundant with the cascade above now that
  // content_id is unique per client rather than globally, but harmless).
  const { error: diErr } = await admin.from('content_items').delete().eq('content_id', B_CONTENT_ID)
  if (diErr) throw new Error(`preClean delete content B: ${diErr.message}`)
  // Deleting the auth user cascades its client_users link.
  const stray = await findAuthUser(B_EMAIL)
  if (stray) {
    const { error } = await admin.auth.admin.deleteUser(stray.id)
    if (error) throw new Error(`preClean delete user B: ${error.message}`)
  }
}

async function main(): Promise<void> {
  let bClientId: string | null = null
  let bUserId: string | null = null
  try {
    // --- Kanset baseline, read via admin/service role (the "other tenant" the test isolates against) ---
    const { data: kClient, error: kErr } = await admin
      .from('clients').select('id').eq('slug', KANSET_SLUG).single()
    if (kErr || !kClient) throw new Error(`kanset client not found: ${kErr?.message ?? 'missing'}`)
    const kansetClientId = kClient.id as string

    const { data: kItems, error: kiErr } = await admin
      .from('content_items').select('id, content_id, version').eq('client_id', kansetClientId)
    if (kiErr) throw new Error(`kanset content_items: ${kiErr.message}`)
    if (!kItems || kItems.length === 0) throw new Error('kanset has no content_items to test against')
    const kansetContentIds = new Set(kItems.map((r) => r.content_id as string))
    const kansetItemId = kItems[0].id as string

    await preClean()

    // --- Setup throwaway tenant B (all via admin/service role) ---
    const { data: bClientRow, error: bcErr } = await admin
      .from('clients').insert({ name: 'RLS Test Co', slug: B_SLUG }).select('id').single()
    if (bcErr || !bClientRow) throw new Error(`insert client B: ${bcErr?.message ?? 'no row'}`)
    bClientId = bClientRow.id as string

    const { data: createdUser, error: cuErr } = await admin.auth.admin.createUser({
      email: B_EMAIL, email_confirm: true,
    })
    if (cuErr || !createdUser.user) throw new Error(`createUser B: ${cuErr?.message ?? 'no user'}`)
    bUserId = createdUser.user.id

    const { error: linkErr } = await admin.from('client_users').insert({
      client_id: bClientId, auth_user_id: bUserId, email: B_EMAIL, name: 'RLS Test B', role: 'client',
    })
    if (linkErr) throw new Error(`link client_users B: ${linkErr.message}`)

    const { data: bItemRow, error: biErr } = await admin.from('content_items').insert({
      content_id: B_CONTENT_ID, client_id: bClientId, title: 'Test piece B',
      platforms: [], status: 'draft', version: 1, client_body: 'test',
      copy_blocks: [{ label: 'Test', body: 'x' }], // phase-2: proven to ride along on B's own read (C8)
    }).select('id').single()
    if (biErr || !bItemRow) throw new Error(`insert content_items B: ${biErr?.message ?? 'no row'}`)
    const bItemId = bItemRow.id as string

    // A second B item in 'idea' status, to prove the RPC's transition guard rejects decisions on it.
    const { data: bIdeaRow, error: biErr2 } = await admin.from('content_items').insert({
      content_id: `${B_CONTENT_ID}-idea`, client_id: bClientId, title: 'Idea piece B',
      platforms: [], status: 'idea', version: 1, client_body: 'idea',
    }).select('id').single()
    if (biErr2 || !bIdeaRow) throw new Error(`insert idea content B: ${biErr2?.message ?? 'no row'}`)
    const bIdeaId = bIdeaRow.id as string

    // --- Real user JWTs + per-user PostgREST clients ---
    const kansetToken = await tokenFor(KANSET_EMAIL)
    const bToken = await tokenFor(B_EMAIL)
    const kansetClient = clientForToken(kansetToken)
    const bClient = clientForToken(bToken)

    console.log('\n--- Assertions ---')

    // A: kanset user sees kanset content (>= 1) via content_with_state and NOT rls-test-piece.
    {
      const { data, error } = await kansetClient.from('content_with_state').select('content_id')
      if (error) {
        check('A: kanset user reads content_with_state', false, error.message)
      } else {
        const ids = (data ?? []).map((r) => r.content_id as string)
        const seesOwn = ids.length >= 1 && ids.every((id) => kansetContentIds.has(id))
        const hidesB = !ids.includes(B_CONTENT_ID)
        check('A: kanset user sees own content (>=1) and NOT rls-test-piece', seesOwn && hidesB, `rows=${ids.length}`)
      }
    }

    // B: test user sees ONLY client B's item and NOT any kanset content_id.
    {
      const { data, error } = await bClient.from('content_with_state').select('content_id')
      if (error) {
        check('B: test user reads content_with_state', false, error.message)
      } else {
        const ids = (data ?? []).map((r) => r.content_id as string)
        const bContentIds = new Set([B_CONTENT_ID, `${B_CONTENT_ID}-idea`])
        const onlyB = ids.length >= 1 && ids.every((id) => bContentIds.has(id))
        const noKanset = !ids.some((id) => kansetContentIds.has(id))
        check('B: test user sees ONLY its own content and no kanset content', onlyB && noKanset, `rows=${ids.length}`)
      }
    }

    // B: activity_log shows 0 rows (B has no activity yet; kanset activity is invisible to B).
    {
      const { count, error } = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      if (error) check('B: test user reads activity_log (no kanset activity)', false, error.message)
      else check('B: test user activity_log has 0 rows', (count ?? -1) === 0, `count=${count ?? 'null'}`)
    }

    // B: calling the decision RPC on a KANSET content id is rejected (not a member of that tenant).
    {
      const { error } = await bClient.rpc('record_content_decision', {
        p_content_id: kansetItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      check('B: RPC on kanset content is NOT authorized (returns error)', !!error, error ? error.message : 'NO ERROR returned')
    }

    // Idempotency: two identical decisions on B's own item add exactly ONE activity_log row.
    {
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      if (before.error) throw new Error(`idempotency count before: ${before.error.message}`)

      const args = { p_content_id: bItemId, p_content_version: 1, p_decision: 'approved' }
      const r1 = await bClient.rpc('record_content_decision', args)
      check('Idempotency: first decision on B item succeeds', !r1.error, r1.error ? r1.error.message : 'ok')
      const r2 = await bClient.rpc('record_content_decision', args)
      check('Idempotency: second identical decision returns without error', !r2.error, r2.error ? r2.error.message : 'ok')

      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      if (after.error) throw new Error(`idempotency count after: ${after.error.message}`)
      const gained = (after.count ?? 0) - (before.count ?? 0)
      check('Idempotency: two identical calls add exactly ONE activity_log row', gained === 1, `gained=${gained}`)
    }

    // RPC business invariants: must be enforced in SQL, not only in the Server Action (the RPC is
    // granted to authenticated, so a direct rpc() call must not bypass these).
    {
      const { error } = await bClient.rpc('record_content_decision', {
        p_content_id: bItemId, p_content_version: 1, p_decision: 'change_requested', p_note: null,
      })
      check('RPC rejects change_requested with no note', !!error, error ? error.message : 'NO ERROR returned')
    }
    {
      const { error } = await bClient.rpc('record_content_decision', {
        p_content_id: bItemId, p_content_version: 1, p_decision: 'change_requested', p_note: 'x'.repeat(2001),
      })
      check('RPC rejects an over-long note (>2000)', !!error, error ? error.message : 'NO ERROR returned')
    }
    {
      const { error } = await bClient.rpc('record_content_decision', {
        p_content_id: bIdeaId, p_content_version: 1, p_decision: 'change_requested', p_note: 'please fix',
      })
      check('RPC rejects a decision on an idea-status piece', !!error, error ? error.message : 'NO ERROR returned')
    }

    // === Phase 2 surface: comments + add_comment RPC + copy_blocks ===
    // Comments B creates need NO explicit cleanup: comments.client_id -> clients(id) ON DELETE CASCADE,
    // so deleting client B in the finally block removes every comment (and its activity_log row) too.

    // C1: B can add a comment on B's OWN item, then reads back exactly that one comment.
    {
      const { error } = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'test comment' })
      check('C1: B adds a comment on its own item (no error)', !error, error ? error.message : 'ok')

      const { data, error: rErr } = await bClient.from('comments').select('id, body')
      if (rErr) {
        check('C1: B reads back its comment', false, rErr.message)
      } else {
        const rows = data ?? []
        const one = rows.length === 1 && rows[0].body === 'test comment'
        check('C1: B reads back exactly one comment with the right body', one, `rows=${rows.length}`)
      }
    }

    // C2: a single add_comment logs EXACTLY ONE 'comment_added' activity row (measured as a delta so
    // it is independent of C1's comment). Runs after C1's read so C1's "exactly one" stays valid.
    {
      const before = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      if (before.error) throw new Error(`comment activity count before: ${before.error.message}`)

      const { error } = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'second comment' })
      check('C2: second add_comment on B item succeeds', !error, error ? error.message : 'ok')

      const after = await bClient.from('activity_log').select('id', { count: 'exact', head: true })
      if (after.error) throw new Error(`comment activity count after: ${after.error.message}`)
      const gained = (after.count ?? 0) - (before.count ?? 0)
      check('C2: add_comment adds exactly ONE activity_log row', gained === 1, `gained=${gained}`)

      const { data: evRows, error: evErr } = await bClient
        .from('activity_log').select('event_type').eq('event_type', 'comment_added')
      check('C2: a comment_added activity row exists for B', !evErr && (evRows ?? []).length >= 1,
        evErr ? evErr.message : `rows=${(evRows ?? []).length}`)
    }

    // C3: B canNOT add_comment on a KANSET item (not a member of that tenant).
    {
      const { error } = await bClient.rpc('add_comment', { p_content_id: kansetItemId, p_body: 'x' })
      check('C3: add_comment on kanset content is NOT authorized (returns error)', !!error,
        error ? error.message : 'NO ERROR returned')
    }

    // C4: B reads ONLY its own comments; every visible row carries B's client_id, none kanset's.
    {
      const { data, error } = await bClient.from('comments').select('client_id')
      if (error) {
        check('C4: B reads comments', false, error.message)
      } else {
        const rows = data ?? []
        const allB = rows.length >= 1 && rows.every((r) => r.client_id === bClientId)
        const noKanset = !rows.some((r) => r.client_id === kansetClientId)
        check('C4: every comment B sees is B\'s own, none kanset\'s', allB && noKanset, `rows=${rows.length}`)
      }
    }

    // C5: authenticated has SELECT only on comments; a DIRECT insert must be rejected (privilege revoked,
    // so the add_comment RPC is the only authenticated write path).
    {
      const { error } = await bClient.from('comments').insert({
        content_id: bItemId, client_id: bClientId, author_type: 'client', author_name: 'x', body: 'y',
      })
      check('C5: direct INSERT into comments by authenticated is rejected', !!error,
        error ? error.message : 'NO ERROR returned')
    }

    // C6: a plain anon client (no JWT) is locked out of comments entirely, read AND write.
    {
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
      const sel = await anonClient.from('comments').select('id')
      const readBlocked = !!sel.error || (sel.data ?? []).length === 0
      check('C6: anon selecting comments returns zero rows or an error', readBlocked,
        sel.error ? sel.error.message : `rows=${(sel.data ?? []).length}`)

      const { error: rpcErr } = await anonClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'x' })
      check('C6: anon calling add_comment is rejected', !!rpcErr, rpcErr ? rpcErr.message : 'NO ERROR returned')
    }

    // C7: add_comment validation is enforced in SQL (not only in the Server Action), since the RPC is
    // granted to authenticated: empty body, body > 4000, and quoted_text > 2000 must each raise.
    {
      const empty = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: '   ' })
      check('C7: add_comment rejects an empty/whitespace body', !!empty.error,
        empty.error ? empty.error.message : 'NO ERROR returned')

      const tooLong = await bClient.rpc('add_comment', { p_content_id: bItemId, p_body: 'x'.repeat(4001) })
      check('C7: add_comment rejects a body over 4000 chars', !!tooLong.error,
        tooLong.error ? tooLong.error.message : 'NO ERROR returned')

      const badQuote = await bClient.rpc('add_comment', {
        p_content_id: bItemId, p_body: 'valid body', p_quoted_text: 'x'.repeat(2001),
      })
      check('C7: add_comment rejects quoted_text over 2000 chars', !!badQuote.error,
        badQuote.error ? badQuote.error.message : 'NO ERROR returned')
    }

    // C8: copy_blocks (set on B's item in setup) rides along on B's own content_with_state read. B not
    // surfacing any kanset content is already proven in assertion B; here we just confirm the array.
    {
      const { data, error } = await bClient
        .from('content_with_state').select('content_id, copy_blocks').eq('content_id', B_CONTENT_ID)
      if (error) {
        check('C8: B reads copy_blocks via content_with_state', false, error.message)
      } else {
        const rows = data ?? []
        const blocks = (rows[0]?.copy_blocks ?? []) as Array<{ label?: string; body?: string }>
        const hasBlock = rows.length === 1 && Array.isArray(blocks)
          && blocks.some((b) => b.label === 'Test' && b.body === 'x')
        check('C8: B\'s own item exposes its copy_blocks array', hasBlock, `blocks=${JSON.stringify(blocks)}`)
      }
    }
  } finally {
    // Cleanup (service role), always. Delete client B FIRST: it cascades content_items, client_users,
    // approvals, and activity_log. Only then delete the auth user (approvals.decided_by has no cascade,
    // so B's approval rows must be gone before the user can be removed).
    console.log('\n--- Cleanup ---')
    if (bClientId) {
      const { error } = await admin.from('clients').delete().eq('id', bClientId)
      if (error) console.log(`CLEANUP WARN: delete client B: ${error.message}`)
      else console.log('cleanup: deleted client B (cascaded content_items / client_users / approvals / activity_log)')
    }
    if (bUserId) {
      const { error } = await admin.auth.admin.deleteUser(bUserId)
      if (error) console.log(`CLEANUP WARN: deleteUser B: ${error.message}`)
      else console.log('cleanup: deleted auth user B')
    }
  }
}

main()
  .then(() => {
    console.log(`\n=== SUMMARY: ${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} FAILURE(S)`} ===`)
    process.exit(failures === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.error('\nFATAL:', e?.message ?? e)
    process.exit(1)
  })

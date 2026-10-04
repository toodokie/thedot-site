# Piece Page Plan 3 of 5: Durable Drafts Implementation Plan

**Approved spec; **plan approved by Anastasia 2026-10-03** with all seven Decisions as recommended, except decision 6: the offline line says "this device" on desktop and "this phone" on mobile. Production deploys by pushing feat/portal-audit-fixes-2026-09-15 (verified 2026-09-30 when ac03a60 deployed).** Not built yet.

> **Amended 2026-10-03 (cross-review from plan 5).**
> 1. **The send-failure event no longer freezes the agency inbox.** `review_send_failed` is written with `requires_reconciliation = true` and object type `client_request_failure_attempt`, but `ack_portal_inbox` (latest body 0014) only let `content_change_request` events through, so the first refused send would have blocked the inbox cursor for good. Plan 5 fixed this, but plan 3 ships first, so 0093 (Task 1) now re-creates `ack_portal_inbox` with one more terminal case (a send failure whose failure rows are all resolved, by a successful retry or by hand), asserts it in `assert_review_draft_security()`, and Task 11 adds `DR16` proving the cursor is held while the failure is open and moves past it once resolved. Plan 5 keeps this clause and adds only its own `agency_inbox_resolutions` case.
> 2. **Housekeeping activity queues no notification.** `review_drafts_carried_over` and `review_send_retry_succeeded` (actor `'agent'`) used to enqueue a client `in_app` row addressed to Maria (`portal_notification_recipient()` sends every non-client actor to the client); she never saw them, but `scripts/portal-notification-audit.ts` counted them. No `actor_type` value avoids that (`'client'` emails the agency), so 0093 adds `activity_event_types.agency_internal`, re-creates `portal_activity_notify` as 0078's body plus an early return for flagged types, and flags both event types. The block is shared verbatim with plan 2's 0092 and safe to run twice. `review_send_failed` stays a client-actor row that emails the agency (decision 1). Task 11 adds `DR17`.
> 3. **Deploy path corrected.** Task 14 no longer uses a direct `vercel --prod`. It is: frozen commit, `code-review` skill pass, Anastasia's go-ahead, apply 0093, push `feat/portal-audit-fixes-2026-09-15` (production deploys from it, verified 2026-09-30), verify the deployment.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every client edit durable: drafts autosave to the server per seat, per piece, per version, survive a new release, reconcile with the browser buffer on any device, and a failed send keeps them unsent, records the failure and raises it in Agency Ops.

**Architecture:** A new table `content_review_drafts` (migration 0093) holds one unsent draft per seat, piece, review target and frame or page anchor. RLS lets a seat read only its own rows; nobody writes the table directly; four SECURITY DEFINER RPCs do the work: `save_review_draft` (debounced autosave, newest `saved_at` wins), `discard_review_draft` (explicit, confirmed in the UI), `send_review_drafts` (composes the drafts into the existing 0081 bundle by calling `request_content_edit_bundle` in the same transaction, then marks them sent), and two agency functions (`agency_record_review_send_failure`, `agency_unsent_review_draft_alerts`). A trigger on `content_items.client_visible_version` carries unsent drafts forward when the agency releases a new version. In the app, `ReviewDraftProvider` keeps its interface but gains a server-sync mode: local storage stays the offline buffer, server and browser copies are reconciled on load (latest `saved_at` wins per target, nothing is silently deleted), saves are debounced 2 seconds and flushed on blur, hide and reconnect, and sends go through a new server action. Refusals keep flowing through the 0089 `client_request_failures` log, which now also writes an activity row and an agency inbox event and marks the drafts as failed.

**Tech Stack:** Supabase Postgres 15 (migration 0093, SECURITY DEFINER RPCs, RLS, trigger), Next.js 15 server actions, React 19 client context, Vitest 2 + Testing Library (jsdom), `scripts/test-rls.ts` (real-JWT, disposable local stack).

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md` section 6 (edits never disappear), section 3 (the 2026-08-14 review contract), section 8 (send failures, unsent drafts older than 24 hours on a piece due within 3 days, carry-over, activity log), section 12 (autosave, second-device restore, carry-over, send failure tests; RLS tests).

**Plans 1 and 2 for conventions:** `docs/superpowers/plans/2026-10-03-piece-page-plan-1-foundations.md`, `docs/superpowers/plans/2026-10-03-piece-page-plan-2-media-previews.md`.

**Out of scope (later plans):** the redesigned editor, track changes, the decision bar, the side-by-side "written against the previous version" view (plan 4 renders it from the data this plan provides); the Agency Ops panels that list failures, carried drafts and unsent-draft alerts (plan 5 renders them from the readers this plan provides). Plan 3 ships only the minimum UI needed so nothing it introduces can strand a draft: a sync status line, flush on blur, Keep and Discard (with a confirm step) for carried drafts, and a Retry label.

---

## Decisions for Anastasia (answer before Task 1; each has a recommendation)

1. **A refused send emails you straight away.** The failure writes an activity row with `actor_type = 'client'`; the existing trigger (`portal_activity_notify`, 0078) turns every client activity that is not `edit_requested` into an agency email plus an in-app row. That matches spec 8 ("send failures, immediately"). It never emails Maria. **Recommend: yes.** If you would rather have inbox only, add `'review_send_failed'` to the `agency_internal` update in Task 1 and the email stops. (Do not switch the actor to `'agent'`: a non-client actor routes an in-app row to Maria instead. Amended 2026-10-03.)
2. **What "due within 3 days" and "older than 24 hours" mean.** Due = `planned_date` on or before today + 3 (Toronto), which also catches overdue pieces that have not posted. Older than 24 hours = the draft was last saved more than 24 hours ago. **Recommend: as written.**
3. **Frame and page notes on one visual are sent as one edit.** The 0081 bundle allows one edit per target, so per-frame drafts on the same asset are composed into that asset's edit in order ("General note: ...", "Frame 1: ...", "Frame 3 (0:04): ..."). The reconciler and the review contract are unchanged. **Recommend: yes.**
4. **Carried drafts.** A draft written against the previous version stays unsent and blocks Approve until Maria keeps it (it is rebased onto the new version and sent with the rest) or discards it (confirm step). She can still send her other edits meanwhile. **Recommend: yes.**
5. **Sent and discarded drafts are kept as rows, not deleted.** The spec says a draft "is deleted" when sent or discarded. This plan marks the row `sent` or `discarded` instead, so the agency can always see what she discarded and a stale browser copy cannot resurrect a sent draft. She never sees them again. **Recommend: keep rows.**
6. **Status wording.** The spec's offline line says "Saved on this phone · will sync when online". It shows on desktop too in plan 3. **Recommend: keep the spec wording now; plan 4 can say "this device" on desktop.**
7. **Server-side approval guard (not in this plan).** Approve is still gated in the browser, which now knows about drafts from every device. Refusing an approval in the database while the seat has unsent drafts would change `record_content_decision`, which the spec puts out of scope. **Recommend: revisit in plan 4.**

---

## Ground rules for whoever executes this

- **Playbook section 12 governs this build** (`~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`): one editor owns the slice; review a frozen commit; unit tests, build and real-JWT RLS tests; migration applied to production before any code that queries `content_review_drafts`; production runbook with captured assertion output; push the reviewed branch. There is **no Codex lane** (Anastasia, 2026-09-21): the frozen hash is reviewed with the `code-review` skill.
- **One editor owns** `src/app/client/[slug]/piece/[contentId]/`, `src/app/client/[slug]/draft-actions.ts`, `src/lib/portal/refusal-log.ts`, `src/lib/portal/edit-drafts.ts` and `scripts/test-rls.ts` while this runs. Plan 2 also edits `scripts/test-rls.ts` and `src/lib/portal/data.ts`; do not run both at once.
- **Migration number and the renumber rule.** This plan uses `0093`, assuming plan 2's `0092_review_media_previews.sql` lands first. If plan 3 lands first, rename the file to `0092_durable_review_drafts.sql` and change the `0093` mentions inside it and in Task 12's docs. The fold in this migration renames whatever `assert_portal_security()` currently is (the 0081 pattern), so it is order-independent; **but plan 2's migration replaces `assert_portal_security()` with a fixed body, so if plan 3 lands first, plan 2's final fold must switch to the same rename pattern** or it silently drops `assert_review_draft_security()` from the fold. Nothing else depends on the number.
- **`.env.local` points at production.** Every database command runs with the local-stack override from Task 0 step 3. `scripts/test-rls.ts` refuses the production host by construction.
- **Nothing here emails Maria.** No new event type is in `portal_client_activity_email_required`, and client alerts are off since 2026-09-21. Agency email on a refused send is decision 1.
- **Host-resource discipline (`~/Kanset/CLAUDE.md`):** one worktree, removed after the reviewed branch is pushed and production is verified; the local Supabase stack is the only disposable database; one full `next build`, in Task 13; no dev server left running.
- **Never `git add -A` or `git add .`;** add only the files each task names. Commits are local until Task 14.
- **No em dashes** in any file this plan creates or edits (Kanset hard rule).

**Test commands (from the worktree root):**
- One file: `pnpm exec vitest run <path>`
- Full unit suite: `pnpm test`
- Types for your files only: `pnpm exec tsc --noEmit 2>&1 | grep -E '<your files>' || echo clean` (the repo has pre-existing errors in marketing routes)
- RLS: `pnpm test:rls:seed-local && pnpm test:rls`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0093_durable_review_drafts.sql` | Create | Table, RLS, save/discard/send RPCs, carry-over trigger, failure event RPC, unsent-draft alerts, two new refusal reasons, three activity event types, `agency_internal` notification routing (shared with 0092), widened `ack_portal_inbox`, `assert_review_draft_security()`, fold |
| `src/lib/portal/edit-drafts.ts` | Modify | Anchor-aware local key, piece prefix, key parser |
| `src/lib/portal/edit-drafts.test.ts` | Modify | Key and parser tests |
| `src/lib/portal/review-drafts-core.ts` | Create | Pure, browser-safe: types, identity, server/local mapping, reconcile, sync state, status text, alert line |
| `src/lib/portal/review-drafts-core.test.ts` | Create | Unit tests |
| `src/lib/portal/review-drafts-local.ts` | Create | Browser buffer: read across versions, write under base version, remove by identity |
| `src/lib/portal/review-drafts-local.test.ts` | Create | Unit tests |
| `src/lib/portal/refusal-log.ts` | Modify | Two reasons, `draftIds`, raise the attempt through `agency_record_review_send_failure` |
| `src/lib/portal/refusal-log.test.ts` | Modify | Event and draft id tests |
| `src/app/client/[slug]/draft-actions.ts` | Create | Server actions: save, discard, send, report a network failure |
| `src/app/client/[slug]/draft-actions.test.ts` | Create | Unit tests with mocked session, data and Supabase |
| `src/lib/portal/refusal-logging.test.ts` | Modify | Same "every refusal is logged" guard for `sendReviewDrafts`; reason codes checked against 0089 + 0093 |
| `src/lib/portal/review-drafts.ts` | Create | Server-only readers: the seat's own drafts (RLS), agency drafts, unsent-draft alerts (plan 5 surfaces) |
| `src/lib/portal/review-drafts.test.ts` | Create | Reader tests |
| `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.tsx` | Rewrite | Same interface plus server sync, reconcile, autosave, flush, carry-over, send, retry, status |
| `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.test.tsx` | Create | Provider tests (second-device restore, autosave, offline, carry-over, send failure) |
| `src/app/client/[slug]/piece/[contentId]/SuggestEditForm.tsx` | Modify | Status line, flush on blur, carried note with Keep, discard confirm |
| `src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx` | Modify | Mocks, blur flush, discard confirm |
| `src/app/client/[slug]/piece/[contentId]/ReviewVerdict.tsx` | Modify | Send through the provider, Retry label, carried Keep and Discard with confirm, status line |
| `src/app/client/[slug]/piece/[contentId]/ReviewVerdict.test.tsx` | Modify | Mocks, carried and retry tests |
| `src/app/client/[slug]/piece/[contentId]/ReviewAssets.test.tsx` | Modify | Mocks only |
| `src/app/client/[slug]/piece/[contentId]/PieceReviewScreen.tsx` | Modify | Pass `serverDrafts` to the provider |
| `src/app/client/[slug]/piece/[contentId]/page.tsx` | Modify | Load the seat's drafts |
| `src/lib/portal/data.ts` | Modify | Keep the three new event types out of the client feed |
| `scripts/test-rls.ts` | Modify | DR1 to DR17 against the local stack |
| `docs/PORTAL-AGENT-MANUAL.md` | Modify | Ledger row, recipe |
| `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` | Modify (workspace doc, outside git) | Section 9 rows |

---

### Task 0: Workspace and local database

**Files:** none changed.

- [ ] **Step 1: Create the one worktree for this slice**

Branch from the newest commit that carries the latest migration on disk. If plan 2 is merged, that commit carries `0092_review_media_previews.sql`; otherwise it carries `0091_statcan_research_source_host.sql` (then apply the renumber rule).

```bash
git -C ~/thedot-site log --oneline -1 -- supabase/migrations/
git -C ~/thedot-site worktree add ~/worktrees/kanset-durable-drafts -b feat/piece-page-durable-drafts <hash printed above>
cd ~/worktrees/kanset-durable-drafts && pnpm install --frozen-lockfile
ls supabase/migrations | tail -2
```

Expected: the worktree is created, install finishes with no lockfile change, and the last migration listed is `0092_review_media_previews.sql` (or `0091_...`, in which case use `0092` for this plan's file).

Cleanup condition: remove this worktree in Task 14 after the reviewed branch is pushed and production is verified.

- [ ] **Step 2: Start the local stack and replay every migration**

```bash
cd ~/worktrees/kanset-durable-drafts && supabase start && supabase db reset
```

Expected: `Finished supabase db reset` with no `ERROR`.

- [ ] **Step 3: Export the provably-local environment for this shell**

Run this in every new shell before any `pnpm test:rls` or `tsx` command in this plan:

```bash
cd ~/worktrees/kanset-durable-drafts
eval "$(supabase status -o env | awk -F= '
  /^API_URL=/{print "export NEXT_PUBLIC_SUPABASE_URL=" $2}
  /^ANON_KEY=/{print "export NEXT_PUBLIC_SUPABASE_ANON_KEY=" $2}
  /^SERVICE_ROLE_KEY=/{print "export SUPABASE_SERVICE_ROLE_KEY=" $2}')"
node -e 'const u=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); if(!["127.0.0.1","localhost"].includes(u.hostname)) {console.error("NOT LOCAL", u.hostname); process.exit(1)} console.log("local", u.host)'
```

Expected: `local 127.0.0.1:54321`.

---

### Task 1: Migration 0093, durable review drafts

**Files:**
- Create: `supabase/migrations/0093_durable_review_drafts.sql`

The in-migration assertion is the first failing test: the migration aborts if any grant, policy, function flag, trigger or reason code is wrong. Behaviour is proven with real JWTs in Task 11.

- [ ] **Step 1: Write the migration**

Before writing it, confirm the two bodies this migration re-creates are still the ones it copies (amended 2026-10-03):

```bash
grep -l "function public.portal_activity_notify" supabase/migrations/*.sql | tail -1
grep -l "function public.ack_portal_inbox" supabase/migrations/*.sql | tail -1
```

Expected: `0078_agency_piece_edit_digests.sql` (or plan 2's `0092_review_media_previews.sql`, whose `portal_activity_notify` block is identical to the one below) and `0014_content_requests.sql`. If any other file prints, merge its extra conditions into the matching body below (and, for `portal_activity_notify`, into plan 2's copy) before writing.

Create `supabase/migrations/0093_durable_review_drafts.sql` with exactly this content:

```sql
-- Durable review drafts (piece page redesign, spec 2026-10-03 section 6, "Edits never disappear").
--
-- Until now a client's unsent edits lived only in one browser, on one device, scoped by version.
-- Maria now reviews on her phone and her desktop, and edits have been lost or refused silently
-- (the ep3 article, 0088 and 0089). This makes a draft a server record:
--
--   * One unsent draft per seat, piece, review target and frame or page anchor. Autosave writes it
--     a few seconds after typing stops; the newest saved_at always wins, so an older tab can never
--     overwrite a newer edit from another device.
--   * A seat reads only its own rows (RLS). Nobody writes the table directly; every write is a
--     SECURITY DEFINER RPC. The agency reads through service_role and cannot change a draft.
--   * Sending composes the drafts into the existing 0081 bundle by calling
--     request_content_edit_bundle in the same transaction, then marks them sent. If the bundle is
--     refused, the transaction rolls back and every draft stays unsent. Per-frame notes on one
--     visual are composed into that visual's single edit, so the bundle contract is unchanged.
--   * Releasing a new version never drops a draft: a trigger marks unsent drafts carried over,
--     keeping their original base version, and raises an agency inbox event.
--   * A refused send is still written to client_request_failures (0089). The new agency function
--     adds an activity row and an inbox event for the attempt and marks her drafts as failed, so
--     every device shows "Couldn't send. Retry". A later successful send resolves the failure.
--   * agency_unsent_review_draft_alerts finds unsent drafts older than 24 hours on a piece due
--     within 3 days, for Agency Ops (plan 5).
--
-- Sent and discarded drafts are kept as rows. She never sees them again; the agency can, and a
-- stale browser copy cannot resurrect a draft that was already sent.
--
-- Amended 2026-10-03 (cross-review):
--   * ack_portal_inbox gains one terminal case, so a review_send_failed event (which requires
--     reconciliation) stops holding the agency inbox cursor once its failure rows are resolved.
--   * Carry-over and retry-success activity is agency housekeeping: flagged agency_internal so
--     portal_activity_notify queues no in-app row or email for anyone.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)') is null
     or pg_catalog.to_regclass('public.content_edit_review_bundles') is null
     or pg_catalog.to_regclass('public.client_request_failures') is null
     or pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0093 requires the review bundle (0081), request failures (0089) and the portal security fold';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type references activity_event_types (0008); without these rows the first
-- carry-over or failure would roll back the release or the refusal log.
insert into public.activity_event_types (event_type)
values ('review_drafts_carried_over'), ('review_send_failed'), ('review_send_retry_succeeded')
on conflict (event_type) do nothing;

-- Agency housekeeping raises no notification (cross-review 2026-10-03). Every activity row runs
-- portal_activity_notify (latest body 0078), and portal_notification_recipient() (0015) sends every
-- non-client actor ('anastasia', 'agent') to the client: an in_app outbox row addressed to Maria
-- that she never sees but scripts/portal-notification-audit.ts counts. No actor_type avoids it
-- ('client' instead emails the agency), so the routing is per event type: activity_event_types
-- gains agency_internal, and the trigger returns before enqueueing anything for a flagged type.
-- The activity row itself is still written, so the audit trail is unchanged. This block is
-- identical in 0092 and 0093 and safe to run twice, so either plan may land first.
alter table public.activity_event_types
  add column if not exists agency_internal boolean not null default false;

-- 0078's body, verbatim, plus the agency_internal early return.
create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_block_key text;
  v_target_label text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  -- Agency housekeeping: the activity row is the record; no in-app row and no email for anyone.
  if exists (select 1 from public.activity_event_types t
             where t.event_type = new.event_type and t.agency_internal) then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);

  if v_recipient = 'agency' and new.event_type = 'edit_requested' and new.content_id is not null then
    select r.payload->>'block_key' into v_block_key
    from public.content_change_requests r
    where r.client_id = new.client_id
      and 'content-request:' || r.id::text = new.event_key;
    select e.value->>'label' into v_target_label
    from public.content_item_versions cv
    cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
    where cv.content_item_id = new.content_id
      and cv.client_id = new.client_id
      and cv.version = new.content_version
      and e.value->>'key' = v_block_key;
    perform public.portal_enqueue_agency_piece_digest(
      new.client_id, new.content_id, 'activity', new.id, new.actor_name, 'edit',
      coalesce(v_target_label, pg_catalog.initcap(pg_catalog.replace(v_block_key, '-', ' ')), 'Copy')
    );
  elsif v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts')
     and public.portal_client_activity_email_required(new.event_type) then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;
revoke all on function public.portal_activity_notify() from public, anon, authenticated, service_role;

-- Carry-over and retry success are records for the agency, not news for anyone. review_send_failed
-- is deliberately NOT flagged: it is a client-actor row that emails the agency (decision 1).
update public.activity_event_types set agency_internal = true
  where event_type in ('review_drafts_carried_over', 'review_send_retry_succeeded');

-- Two refusal reasons the durable send path adds: drafts changed on another device between load
-- and send, and a send that never reached the server (reported when the connection returns).
alter table public.client_request_failures
  drop constraint client_request_failures_reason_code_check;
alter table public.client_request_failures
  add constraint client_request_failures_reason_code_check check (reason_code in (
    'cannot_submit_requests',
    'expired_review',
    'empty_bundle',
    'draft_too_long',
    'draft_invalid',
    'url_invalid',
    'note_too_long',
    'piece_unavailable',
    'version_stale',
    'revision_in_progress',
    'stale_or_locked',
    'rate_limited',
    'write_failed',
    'drafts_changed',
    'network_unreachable'
  ));

create table public.content_review_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- No cascade on purpose: removing a login must never silently remove her unsent words.
  auth_user_id uuid not null references auth.users(id),
  content_item_id uuid not null,
  -- The version the draft was written against. It stays the original version when the draft is
  -- carried over, and moves only when she keeps or edits the draft on the new version.
  base_version int not null check (base_version > 0),
  target_kind text not null check (target_kind in ('copy_block','asset','design_link')),
  target_key text not null check (target_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- '' is the whole block or a general note on the whole visual; 'frame:3' or 'page:2' is one
  -- frame or page of a visual.
  anchor text not null default '' check (anchor = '' or anchor ~ '^(frame|page):[1-9][0-9]{0,2}$'),
  anchor_label text check (anchor_label is null or (
    pg_catalog.char_length(anchor_label) between 1 and 80 and anchor_label !~ '[[:cntrl:]]')),
  target_label text not null check (pg_catalog.char_length(target_label) between 1 and 120),
  url_snapshot text check (url_snapshot is null or (
    url_snapshot ~ '^https://[^[:space:]]+$' and pg_catalog.char_length(url_snapshot) <= 2048)),
  quoted_text text check (quoted_text is null or pg_catalog.char_length(quoted_text) <= 50000),
  -- Kept well above the 50,000 a send allows, so an over-long draft is still SAVED; the send then
  -- refuses it with a reason and her text survives.
  body text not null check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 200000),
  status text not null default 'unsent' check (status in ('unsent','sent','discarded')),
  -- The device's save time, clamped to at most five minutes ahead of the server. Newest wins.
  saved_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  carried_over_at timestamptz,
  carried_over_to_version int,
  sent_at timestamptz,
  sent_bundle_id uuid references public.content_edit_review_bundles(id),
  discarded_at timestamptz,
  discard_reason text check (discard_reason is null
    or discard_reason in ('client_discarded','reverted','emptied')),
  send_failed_at timestamptz,
  last_send_error text check (last_send_error is null or pg_catalog.char_length(last_send_error) <= 64),
  last_send_attempt_id uuid,
  send_attempts int not null default 0 check (send_attempts >= 0),
  foreign key (content_item_id, client_id, base_version)
    references public.content_item_versions(content_item_id, client_id, version),
  check ((status = 'sent') = (sent_at is not null and sent_bundle_id is not null)),
  check ((status = 'discarded') = (discarded_at is not null and discard_reason is not null)),
  check ((carried_over_at is null) = (carried_over_to_version is null)),
  check (carried_over_to_version is null or carried_over_to_version > base_version),
  check (anchor = '' or target_kind = 'asset')
);

create unique index content_review_drafts_one_unsent
  on public.content_review_drafts (client_id, auth_user_id, content_item_id, target_kind, target_key, anchor)
  where status = 'unsent';
create index content_review_drafts_unsent_by_item
  on public.content_review_drafts (content_item_id, saved_at) where status = 'unsent';
create index content_review_drafts_by_seat_item
  on public.content_review_drafts (auth_user_id, content_item_id, saved_at desc);

alter table public.content_review_drafts enable row level security;
create policy content_review_drafts_seat_read on public.content_review_drafts
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.content_review_drafts from public, anon, authenticated, service_role;
grant select (
  id, content_item_id, base_version, target_kind, target_key, anchor, anchor_label, target_label,
  url_snapshot, quoted_text, body, status, saved_at, created_at, updated_at, carried_over_at,
  carried_over_to_version, sent_at, discarded_at, discard_reason, send_failed_at, last_send_error,
  send_attempts
) on public.content_review_drafts to authenticated;
grant select on public.content_review_drafts to service_role;

create function public.portal_review_draft_json(p public.content_review_drafts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p.id, 'content_item_id', p.content_item_id, 'base_version', p.base_version,
    'target_kind', p.target_kind, 'target_key', p.target_key, 'anchor', p.anchor,
    'anchor_label', p.anchor_label, 'target_label', p.target_label, 'url_snapshot', p.url_snapshot,
    'quoted_text', p.quoted_text, 'body', p.body, 'status', p.status, 'saved_at', p.saved_at,
    'updated_at', p.updated_at, 'carried_over_at', p.carried_over_at,
    'carried_over_to_version', p.carried_over_to_version, 'send_failed_at', p.send_failed_at,
    'last_send_error', p.last_send_error)
$$;
revoke all on function public.portal_review_draft_json(public.content_review_drafts)
  from public, anon, authenticated, service_role;

-- Autosave. A base version below the released one is accepted and stored as carried over, so an
-- edit typed offline before a release still reaches the server instead of being refused.
create function public.save_review_draft(
  p_content_id uuid,
  p_base_version int,
  p_target_kind text,
  p_target_key text,
  p_anchor text,
  p_anchor_label text,
  p_target_label text,
  p_url_snapshot text,
  p_quoted_text text,
  p_body text,
  p_saved_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_blocks jsonb;
  v_kind text := pg_catalog.btrim(p_target_kind);
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_target_key));
  v_anchor text := coalesce(pg_catalog.lower(pg_catalog.btrim(p_anchor)), '');
  v_anchor_label text := nullif(pg_catalog.btrim(p_anchor_label), '');
  v_label text := pg_catalog.btrim(p_target_label);
  v_url text := nullif(pg_catalog.btrim(p_url_snapshot), '');
  v_saved timestamptz := least(coalesce(p_saved_at, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');
  v_row public.content_review_drafts%rowtype;
  v_carried boolean;
  v_count int;
begin
  if v_uid is null or p_content_id is null or p_base_version is null or p_base_version < 1 then
    raise exception 'invalid review draft';
  end if;
  -- FOR SHARE serialises against a release, which takes the row FOR UPDATE, so a draft is either
  -- saved before the release (and carried by the trigger) or after it (and carried here).
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id for share;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  if not v_item.client_visible or v_item.client_visible_version is null
     or v_item.archived_at is not null or v_item.publication_locked_version is not null
     or v_item.status = 'posted' then
    raise exception 'review_draft_locked';
  end if;
  if p_base_version > v_item.client_visible_version then
    raise exception 'review_draft_stale_version';
  end if;
  if v_kind is null or v_kind not in ('copy_block','asset','design_link')
     or v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or v_label is null or pg_catalog.char_length(v_label) not between 1 and 120
     or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 200000
     or (p_quoted_text is not null and pg_catalog.char_length(p_quoted_text) > 50000)
     or (v_anchor <> '' and (v_kind <> 'asset' or v_anchor !~ '^(frame|page):[1-9][0-9]{0,2}$'))
     or (v_anchor_label is not null and (
       pg_catalog.char_length(v_anchor_label) > 80 or v_anchor_label ~ '[[:cntrl:]]'))
     or (v_url is not null and (
       v_url !~ '^https://[^[:space:]]+$' or pg_catalog.char_length(v_url) > 2048))
     or (v_kind = 'design_link' and v_key not in ('canva','drive')) then
    raise exception 'invalid review draft';
  end if;

  select cv.copy_blocks into v_blocks from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
      and cv.version = p_base_version;
  if not found then raise exception 'review_draft_target_not_found'; end if;
  if v_kind = 'copy_block' and not exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_blocks, '[]'::jsonb)) b(value)
    where b.value->>'key' = v_key
  ) then
    raise exception 'review_draft_target_not_found';
  end if;
  if v_kind = 'asset' and not exists (
    select 1 from public.content_review_assets a
    where a.client_id = v_item.client_id and a.content_item_id = v_item.id
      and a.content_version = p_base_version and a.asset_key = v_key
  ) then
    raise exception 'review_draft_target_not_found';
  end if;

  v_carried := p_base_version < v_item.client_visible_version;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));
  select d.* into v_row from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.target_kind = v_kind and d.target_key = v_key
      and d.anchor = v_anchor and d.status = 'unsent'
    for update;
  if found then
    if v_row.saved_at > v_saved then
      return pg_catalog.jsonb_build_object(
        'outcome', 'stale', 'draft', public.portal_review_draft_json(v_row));
    end if;
    update public.content_review_drafts d set
      base_version = p_base_version,
      anchor_label = v_anchor_label,
      target_label = v_label,
      url_snapshot = v_url,
      quoted_text = p_quoted_text,
      body = p_body,
      saved_at = v_saved,
      updated_at = pg_catalog.now(),
      carried_over_at = case when v_carried then coalesce(d.carried_over_at, pg_catalog.now()) end,
      carried_over_to_version = case when v_carried then v_item.client_visible_version end
    where d.id = v_row.id
    returning d.* into v_row;
  else
    select pg_catalog.count(*) into v_count from public.content_review_drafts d
      where d.client_id = v_item.client_id and d.auth_user_id = v_uid
        and d.content_item_id = v_item.id and d.status = 'unsent';
    if v_count >= 100 then raise exception 'too_many_review_drafts'; end if;
    insert into public.content_review_drafts (
      client_id, auth_user_id, content_item_id, base_version, target_kind, target_key, anchor,
      anchor_label, target_label, url_snapshot, quoted_text, body, saved_at,
      carried_over_at, carried_over_to_version
    ) values (
      v_item.client_id, v_uid, v_item.id, p_base_version, v_kind, v_key, v_anchor,
      v_anchor_label, v_label, v_url, p_quoted_text, p_body, v_saved,
      case when v_carried then pg_catalog.now() end,
      case when v_carried then v_item.client_visible_version end
    ) returning * into v_row;
  end if;
  return pg_catalog.jsonb_build_object('outcome', 'saved', 'draft', public.portal_review_draft_json(v_row));
end;
$$;
revoke all on function public.save_review_draft(
  uuid,integer,text,text,text,text,text,text,text,text,timestamptz
) from public, anon, service_role;
grant execute on function public.save_review_draft(
  uuid,integer,text,text,text,text,text,text,text,text,timestamptz
) to authenticated;

-- Explicit discard (confirmed in the UI), or the editor clearing a draft that went back to the
-- original text or to nothing. A discard older than the stored draft is refused as stale, so a
-- discard on one device never throws away a newer edit made on another.
create function public.discard_review_draft(
  p_content_id uuid,
  p_target_kind text,
  p_target_key text,
  p_anchor text,
  p_reason text,
  p_saved_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_row public.content_review_drafts%rowtype;
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_target_key));
  v_anchor text := coalesce(pg_catalog.lower(pg_catalog.btrim(p_anchor)), '');
  v_saved timestamptz := least(coalesce(p_saved_at, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');
begin
  if v_uid is null or p_content_id is null or p_reason is null
     or p_reason not in ('client_discarded','reverted','emptied') then
    raise exception 'invalid review draft discard';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));
  select d.* into v_row from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.target_kind = p_target_kind
      and d.target_key = v_key and d.anchor = v_anchor and d.status = 'unsent'
    for update;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.saved_at > v_saved then
    return pg_catalog.jsonb_build_object(
      'outcome', 'stale', 'draft', public.portal_review_draft_json(v_row));
  end if;
  update public.content_review_drafts d set
    status = 'discarded', discarded_at = pg_catalog.now(), discard_reason = p_reason,
    updated_at = pg_catalog.now()
  where d.id = v_row.id
  returning d.* into v_row;
  return pg_catalog.jsonb_build_object(
    'outcome', 'discarded', 'draft', public.portal_review_draft_json(v_row));
end;
$$;
revoke all on function public.discard_review_draft(uuid,text,text,text,text,timestamptz)
  from public, anon, service_role;
grant execute on function public.discard_review_draft(uuid,text,text,text,text,timestamptz)
  to authenticated;

-- Send. Every unsent draft of this seat on the released version must be included, so a draft
-- added on another device cannot be silently left behind. The bundle itself is the unchanged
-- 0081 function: if it raises, this whole transaction rolls back and nothing is marked sent.
create function public.send_review_drafts(
  p_content_id uuid,
  p_content_version int,
  p_draft_ids uuid[],
  p_note text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_ids uuid[];
  v_found int;
  v_existing public.content_edit_review_bundles%rowtype;
  v_edits jsonb;
  v_result jsonb;
  v_bundle_id uuid;
  v_retried int;
  v_title text;
begin
  select pg_catalog.array_agg(distinct x) into v_ids
    from pg_catalog.unnest(p_draft_ids) as u(x) where x is not null;
  if v_uid is null or p_content_id is null or p_idempotency_key is null
     or p_content_version is null or p_content_version < 1
     or coalesce(pg_catalog.cardinality(v_ids), 0) not between 1 and 50
     or pg_catalog.cardinality(v_ids) <> pg_catalog.cardinality(p_draft_ids) then
    raise exception 'invalid review draft send';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));

  -- A retry of a send that already landed (the answer was lost on the way back to her phone).
  select b.* into v_existing from public.content_edit_review_bundles b
    where b.client_id = v_item.client_id and b.requested_by = v_uid
      and b.idempotency_key = p_idempotency_key;
  if found then
    if exists (
      select 1 from public.content_review_drafts d
      where d.id = any(v_ids) and (
        d.auth_user_id <> v_uid or d.content_item_id <> v_item.id or d.status = 'discarded'
        or (d.status = 'sent' and d.sent_bundle_id <> v_existing.id))
    ) then
      raise exception 'idempotency key reused with different request';
    end if;
    update public.content_review_drafts d set
      status = 'sent', sent_at = pg_catalog.now(), sent_bundle_id = v_existing.id,
      updated_at = pg_catalog.now()
    where d.id = any(v_ids) and d.status = 'unsent';
    return pg_catalog.jsonb_build_object('bundle_id', v_existing.id,
      'request_ids', v_existing.request_ids, 'outcome', 'unchanged',
      'sent_draft_ids', pg_catalog.to_jsonb(v_ids));
  end if;

  select pg_catalog.count(*) into v_found from public.content_review_drafts d
    where d.id = any(v_ids) and d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.status = 'unsent';
  if v_found <> pg_catalog.cardinality(v_ids) then raise exception 'drafts_changed'; end if;
  perform 1 from public.content_review_drafts d where d.id = any(v_ids) for update;
  if exists (
    select 1 from public.content_review_drafts d
    where d.id = any(v_ids) and d.base_version <> p_content_version
  ) then
    raise exception 'drafts_carried_over';
  end if;
  if exists (
    select 1 from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.status = 'unsent'
      and d.base_version = p_content_version and not (d.id = any(v_ids))
  ) then
    raise exception 'drafts_changed';
  end if;

  select pg_catalog.jsonb_agg(g.edit order by g.first_created, g.target_kind, g.target_key)
    into v_edits
  from (
    select d.target_kind, d.target_key, pg_catalog.min(d.created_at) as first_created,
      pg_catalog.jsonb_build_object(
        'target_kind', d.target_kind,
        'target_key', d.target_key,
        'target_label', (pg_catalog.array_agg(d.target_label order by (d.anchor <> ''), d.created_at))[1],
        'url_snapshot', (pg_catalog.array_agg(d.url_snapshot order by d.saved_at desc))[1],
        'proposed_text', case
          when pg_catalog.count(*) = 1 and pg_catalog.bool_and(d.anchor = '') then pg_catalog.min(d.body)
          else pg_catalog.string_agg(
            case when d.anchor = '' then 'General note: '
              else coalesce(d.anchor_label,
                pg_catalog.initcap(pg_catalog.split_part(d.anchor, ':', 1)) || ' '
                  || pg_catalog.split_part(d.anchor, ':', 2)) || ': '
            end || pg_catalog.btrim(d.body),
            E'\n\n'
            order by (d.anchor <> ''), pg_catalog.split_part(d.anchor, ':', 1),
              (nullif(pg_catalog.split_part(d.anchor, ':', 2), ''))::int)
        end) as edit
    from public.content_review_drafts d
    where d.id = any(v_ids)
    group by d.target_kind, d.target_key
  ) g;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_edits) e(value)
    where pg_catalog.char_length(pg_catalog.btrim(e.value->>'proposed_text')) > 50000
  ) then
    raise exception 'review_draft_too_long';
  end if;

  v_result := public.request_content_edit_bundle(
    v_item.id, p_content_version, v_edits, p_note, p_idempotency_key);
  v_bundle_id := (v_result->>'bundle_id')::uuid;

  select pg_catalog.count(*) into v_retried from public.content_review_drafts d
    where d.id = any(v_ids) and d.send_failed_at is not null;
  update public.content_review_drafts d set
    status = 'sent', sent_at = pg_catalog.now(), sent_bundle_id = v_bundle_id,
    updated_at = pg_catalog.now()
  where d.id = any(v_ids);

  if v_retried > 0 then
    update public.client_request_failures f set
      resolved_at = pg_catalog.now(), resolved_by = 'system:retry',
      resolution_note = 'Sent on retry in review bundle ' || v_bundle_id::text
    where f.client_id = v_item.client_id and f.content_item_id = v_item.id
      and f.requested_by = v_uid and f.resolved_at is null
      and exists (
        select 1 from public.content_review_drafts d
        where d.id = any(v_ids) and d.target_kind = f.target_kind and d.target_key = f.target_key);
    select cv.title into v_title from public.content_item_versions cv
      where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
        and cv.version = p_content_version;
    insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
      title, summary, actor_type, actor_name)
    values (v_item.client_id, v_item.id, p_content_version, 'review_send_retry_succeeded',
      'review-send-retry:' || v_bundle_id::text,
      'Edits sent after a failed attempt: ' || coalesce(v_title, v_item.content_id),
      pg_catalog.format('%s of the edits in this send had failed before. They are now with The Dot.', v_retried),
      'agent', 'Review drafts')
    on conflict do nothing;
  end if;

  return v_result || pg_catalog.jsonb_build_object('sent_draft_ids', pg_catalog.to_jsonb(v_ids));
end;
$$;
revoke all on function public.send_review_drafts(uuid,integer,uuid[],text,uuid)
  from public, anon, service_role;
grant execute on function public.send_review_drafts(uuid,integer,uuid[],text,uuid) to authenticated;

-- Carry-over (spec 6.2). Fires on every path that moves the released pointer: portal-admin ready,
-- courtesy-release, applied-release, re-share.
create function public.portal_review_drafts_carry_over()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groups jsonb;
  v_group jsonb;
  v_title text;
  v_count int;
  v_key text;
begin
  if new.client_visible_version is null
     or new.client_visible_version is not distinct from old.client_visible_version then
    return null;
  end if;
  with moved as (
    update public.content_review_drafts d set
      carried_over_at = pg_catalog.now(),
      carried_over_to_version = new.client_visible_version,
      updated_at = pg_catalog.now()
    where d.content_item_id = new.id and d.client_id = new.client_id and d.status = 'unsent'
      and d.base_version < new.client_visible_version
      and d.carried_over_to_version is distinct from new.client_visible_version
    returning d.auth_user_id, d.id, d.base_version
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'auth_user_id', g.auth_user_id, 'n', g.n, 'from_version', g.from_version, 'ids', g.ids)),
    '[]'::jsonb)
  into v_groups
  from (
    select m.auth_user_id, pg_catalog.count(*)::int as n, pg_catalog.min(m.base_version) as from_version,
      pg_catalog.array_agg(m.id order by m.id) as ids
    from moved m group by m.auth_user_id
  ) g;
  if pg_catalog.jsonb_array_length(v_groups) = 0 then return null; end if;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = new.id and cv.client_id = new.client_id
      and cv.version = new.client_visible_version;
  for v_group in select value from pg_catalog.jsonb_array_elements(v_groups) loop
    v_count := (v_group->>'n')::int;
    v_key := 'review-drafts-carried:' || new.id::text || ':v' || new.client_visible_version::text
      || ':' || (v_group->>'auth_user_id');
    insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
      title, summary, actor_type, actor_name)
    values (new.client_id, new.id, new.client_visible_version, 'review_drafts_carried_over', v_key,
      'Unsent edits carried over: ' || coalesce(v_title, new.content_id),
      pg_catalog.format('%s unsent %s written against version %s kept for review against version %s.',
        v_count, case when v_count = 1 then 'edit' else 'edits' end,
        v_group->>'from_version', new.client_visible_version),
      'agent', 'Review drafts')
    on conflict do nothing;
    insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation)
    values (new.client_id, v_key, 'review_drafts_carried_over', 'content_item', new.id,
      'system', 'Review drafts',
      pg_catalog.jsonb_build_object('content_id', new.id,
        'from_version', (v_group->>'from_version')::int,
        'to_version', new.client_visible_version,
        'auth_user_id', v_group->>'auth_user_id',
        'draft_ids', v_group->'ids', 'draft_count', v_count),
      false)
    on conflict (client_id, event_key) do nothing;
  end loop;
  return null;
end;
$$;
revoke all on function public.portal_review_drafts_carry_over()
  from public, anon, authenticated, service_role;
create trigger content_items_review_drafts_carry_over
  after update of client_visible_version on public.content_items
  for each row
  when (new.client_visible_version is distinct from old.client_visible_version)
  execute function public.portal_review_drafts_carry_over();

-- Raise a refused send in Agency Ops (spec 6.3, 8). Called by the app right after it writes the
-- 0089 failure rows for an attempt. Idempotent per attempt.
create function public.agency_record_review_send_failure(
  p_attempt_id uuid,
  p_draft_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first public.client_request_failures%rowtype;
  v_count int;
  v_title text;
  v_content_key text;
  v_piece text;
  v_marked int := 0;
  v_key text := 'review-send-failed:' || p_attempt_id::text;
begin
  if p_attempt_id is null then raise exception 'invalid send failure'; end if;
  select f.* into v_first from public.client_request_failures f
    where f.attempt_id = p_attempt_id order by f.created_at, f.id limit 1;
  if not found then raise exception 'send failure attempt not found'; end if;
  select (pg_catalog.count(*) filter (where f.proposed_text is not null))::int into v_count
    from public.client_request_failures f where f.attempt_id = p_attempt_id;
  if v_first.content_item_id is not null then
    select ci.content_id, cv.title into v_content_key, v_title
    from public.content_items ci
    left join public.content_item_versions cv
      on cv.content_item_id = ci.id and cv.client_id = ci.client_id
     and cv.version = coalesce(v_first.content_version, ci.client_visible_version)
    where ci.id = v_first.content_item_id and ci.client_id = v_first.client_id;
  end if;
  v_piece := coalesce(v_content_key, v_first.content_id);

  insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name, related_url)
  values (v_first.client_id, v_first.content_item_id,
    case when v_first.content_item_id is null then null else v_first.content_version end,
    'review_send_failed', v_key,
    'Edits not sent: ' || coalesce(v_title, v_piece, 'a piece'),
    pg_catalog.format('%s could not send %s (%s). The text is saved in the portal and in the failure log.',
      coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'The client'),
      case when v_count = 0 then 'an edit' when v_count = 1 then 'one edit' else v_count || ' edits' end,
      v_first.reason_code),
    'client', coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'Client'),
    case when v_piece is not null
      then 'https://www.thedotcreative.co/admin/portal/pieces/' || v_piece end)
  on conflict do nothing;

  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (v_first.client_id, v_key, 'review_send_failed', 'client_request_failure_attempt',
    p_attempt_id, 'client', coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'Client'),
    pg_catalog.jsonb_build_object('content_id', v_first.content_item_id, 'content_key', v_piece,
      'base_version', v_first.content_version, 'reason_code', v_first.reason_code,
      'edit_count', v_count, 'draft_ids', pg_catalog.to_jsonb(coalesce(p_draft_ids, '{}'::uuid[]))),
    true)
  on conflict (client_id, event_key) do nothing;

  if v_first.requested_by is not null and coalesce(pg_catalog.cardinality(p_draft_ids), 0) > 0 then
    update public.content_review_drafts d set
      send_failed_at = pg_catalog.now(), last_send_error = v_first.reason_code,
      last_send_attempt_id = p_attempt_id, send_attempts = d.send_attempts + 1,
      updated_at = pg_catalog.now()
    where d.id = any(p_draft_ids) and d.client_id = v_first.client_id
      and d.auth_user_id = v_first.requested_by and d.status = 'unsent'
      and d.last_send_attempt_id is distinct from p_attempt_id;
    get diagnostics v_marked = row_count;
  end if;
  return pg_catalog.jsonb_build_object('attempt_id', p_attempt_id, 'drafts_marked', v_marked);
end;
$$;
revoke all on function public.agency_record_review_send_failure(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.agency_record_review_send_failure(uuid,uuid[]) to service_role;

-- The agency inbox cursor (amended 2026-10-03). ack_portal_inbox (latest body 0014) refuses to move
-- past any requires_reconciliation event except a content_change_request in a terminal status, so
-- the review_send_failed event above would freeze the inbox for every consumer from the first
-- refused send. Same body as 0014 plus one terminal case: a send failure whose failure rows are all
-- resolved (send_review_drafts resolves them on a successful retry; the agency sets resolved_at by
-- hand when it applies her text, as 0089 records). Plan 5 widens this again for
-- agency_inbox_resolutions and must keep this clause; assert_review_draft_security checks it.
create or replace function public.ack_portal_inbox(
  p_consumer_key text, p_client_id uuid, p_seq bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_current bigint;
begin
  if not exists(select 1 from public.portal_inbox_events e
    where e.client_id = p_client_id and e.seq = p_seq) then
    raise exception 'event does not belong to client'; end if;
  if exists(select 1 from public.portal_inbox_events e
    where e.client_id = p_client_id and e.seq <= p_seq and e.requires_reconciliation
      and not (e.object_type = 'content_change_request' and exists(
        select 1 from public.content_change_requests r where r.id = e.object_id and r.client_id = e.client_id
          and r.status in ('applied','conflicted','rejected','superseded')))
      and not (e.object_type = 'client_request_failure_attempt' and not exists(
        select 1 from public.client_request_failures f
        where f.client_id = e.client_id and f.attempt_id = e.object_id and f.resolved_at is null)))
  then raise exception 'unresolved reconciliation events cannot be cursor-acknowledged'; end if;
  update public.portal_inbox_consumers set last_ack_seq = greatest(last_ack_seq, p_seq),
    updated_at = pg_catalog.now() where consumer_key = p_consumer_key and client_id = p_client_id
    returning last_ack_seq into v_current;
  if not found then raise exception 'unknown inbox consumer'; end if;
  return v_current;
end;
$$;
revoke all on function public.ack_portal_inbox(text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.ack_portal_inbox(text,uuid,bigint) to service_role;

-- Spec 8: "Maria has 2 unsent edits on X". One row per seat and piece that has at least one
-- unsent draft last saved more than 24 hours ago, on an unposted piece whose planned date is on or
-- before today + 3 (Toronto), overdue pieces included.
create function public.agency_unsent_review_draft_alerts(p_now timestamptz default null)
returns table (
  client_id uuid,
  content_item_id uuid,
  content_id text,
  title text,
  planned_date date,
  auth_user_id uuid,
  seat_name text,
  unsent_count int,
  stale_count int,
  carried_count int,
  oldest_saved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.client_id, ci.id, ci.content_id, coalesce(cv.title, ci.content_id), ci.planned_date,
    d.auth_user_id, coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client'),
    pg_catalog.count(*)::int,
    (pg_catalog.count(*) filter (
      where d.saved_at < coalesce(p_now, pg_catalog.now()) - interval '24 hours'))::int,
    (pg_catalog.count(*) filter (where d.carried_over_at is not null))::int,
    pg_catalog.min(d.saved_at)
  from public.content_review_drafts d
  join public.content_items ci on ci.id = d.content_item_id and ci.client_id = d.client_id
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  left join public.client_users cu on cu.client_id = d.client_id and cu.auth_user_id = d.auth_user_id
  where d.status = 'unsent'
    and ci.archived_at is null and ci.publication_locked_version is null and ci.status <> 'posted'
    and ci.planned_date is not null
    and ci.planned_date <= (coalesce(p_now, pg_catalog.now()) at time zone 'America/Toronto')::date + 3
  group by d.client_id, ci.id, ci.content_id, cv.title, ci.planned_date, d.auth_user_id, cu.name
  having pg_catalog.count(*) filter (
    where d.saved_at < coalesce(p_now, pg_catalog.now()) - interval '24 hours') > 0
  order by ci.planned_date, ci.content_id
$$;
revoke all on function public.agency_unsent_review_draft_alerts(timestamptz)
  from public, anon, authenticated;
grant execute on function public.agency_unsent_review_draft_alerts(timestamptz) to service_role;

create function public.assert_review_draft_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text;
  v_def text;
  v_constraint text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_drafts'::pg_catalog.regclass) then
    raise exception 'content_review_drafts RLS is disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'content_review_drafts') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_review_drafts'
         and p.policyname = 'content_review_drafts_seat_read' and p.cmd = 'SELECT'
         and p.roles = array['authenticated']::name[]
         and p.qual like '%auth.uid()%' and p.qual like '%my_client_ids()%') then
    raise exception 'content_review_drafts must carry exactly the seat read policy';
  end if;
  if pg_catalog.has_any_column_privilege('anon', 'public.content_review_drafts', 'SELECT')
     or not pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_drafts', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.content_review_drafts', 'auth_user_id', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.content_review_drafts', 'last_send_attempt_id', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'DELETE') then
    raise exception 'review draft table privileges are unsafe';
  end if;

  foreach v_fn in array array[
    'public.save_review_draft(uuid,integer,text,text,text,text,text,text,text,text,timestamptz)',
    'public.discard_review_draft(uuid,text,text,text,text,timestamptz)',
    'public.send_review_drafts(uuid,integer,uuid[],text,uuid)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review draft function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'review draft client function grants are unsafe: %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.agency_record_review_send_failure(uuid,uuid[])',
    'public.agency_unsent_review_draft_alerts(timestamptz)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review draft agency function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'review draft agency function grants are unsafe: %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.portal_review_draft_json(public.content_review_drafts)',
    'public.portal_review_drafts_carry_over()'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'review draft internal function is exposed: %', v_fn;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.send_review_drafts(uuid,integer,uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  -- The send must go through the one reviewed bundle path and keep both refusal guards.
  if v_def not like '%public.request_content_edit_bundle(%'
     or v_def not like '%drafts_changed%' or v_def not like '%drafts_carried_over%' then
    raise exception 'review draft send guards drifted';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.save_review_draft(uuid,integer,text,text,text,text,text,text,text,text,timestamptz)'::pg_catalog.regprocedure)
    into v_def;
  if v_def not like '%can_submit_requests%' or v_def not like '%review_draft_locked%'
     or v_def not like '%v_row.saved_at > v_saved%' then
    raise exception 'review draft save guards drifted';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_items'::pg_catalog.regclass
      and t.tgname = 'content_items_review_drafts_carry_over' and not t.tgisinternal
  ) then
    raise exception 'review draft carry-over trigger is missing';
  end if;
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_drafts_carried_over','review_send_failed',
        'review_send_retry_succeeded')) <> 3 then
    raise exception 'review draft activity event types are missing';
  end if;
  -- Amended 2026-10-03: housekeeping stays out of every notification path, and the inbox cursor
  -- can move past a resolved send failure.
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_drafts_carried_over','review_send_retry_succeeded')
        and t.agency_internal) <> 2
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%' then
    raise exception 'review draft housekeeping would notify';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure) into v_def;
  if v_def not like '%content_change_request%'
     or v_def not like '%client_request_failure_attempt%'
     or v_def not like '%f.resolved_at is null%' then
    raise exception 'ack_portal_inbox would freeze on a send failure';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE') then
    raise exception 'ack_portal_inbox grants changed';
  end if;
  select pg_catalog.pg_get_constraintdef(con.oid) into v_constraint
  from pg_catalog.pg_constraint con
  where con.conrelid = 'public.client_request_failures'::pg_catalog.regclass
    and con.conname = 'client_request_failures_reason_code_check';
  if coalesce(v_constraint, '') not like '%network_unreachable%'
     or coalesce(v_constraint, '') not like '%drafts_changed%'
     or coalesce(v_constraint, '') not like '%write_failed%' then
    raise exception 'client request failure reasons are missing the durable draft codes';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_review_draft_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_review_draft_security()', 'EXECUTE') then
    raise exception 'review draft assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_review_draft_security() from public, anon, authenticated;
grant execute on function public.assert_review_draft_security() to service_role;

select public.assert_review_draft_security();

-- Cumulative fold, the 0081 rename pattern: whatever assert_portal_security() is now (0092's
-- slice91 + review previews, or 0090's fold if plan 2 has not landed) keeps running under a new
-- name, and the review draft assertion joins it.
alter function public.assert_portal_security() rename to assert_portal_pre_review_drafts_security;
revoke all on function public.assert_portal_pre_review_drafts_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_drafts_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_review_drafts_security();
  perform public.assert_review_draft_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
```

- [ ] **Step 2: Fresh replay**

```bash
cd ~/worktrees/kanset-durable-drafts && supabase db reset
```

Expected: completes with no `ERROR`. A failure names the broken guard (for example `review draft table privileges are unsafe`); fix the SQL and rerun.

- [ ] **Step 3: Upgrade replay (the path production takes)**

```bash
cd ~/worktrees/kanset-durable-drafts && supabase db reset --version 0092 && supabase migration up --local
```

(Use `--version 0091` if plan 2 has not landed and this file is `0092`.)

Expected: the reset stops at the previous migration, then `Applying migration 0093_durable_review_drafts.sql...` and no error.

- [ ] **Step 4: Prove the fold and the trigger**

```bash
DB_URL="$(supabase status -o env | awk -F= '/^DB_URL=/{gsub(/"/,"",$2); print $2}')"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -c "select public.assert_portal_security();" \
  -c "select tgname from pg_trigger where tgrelid = 'public.content_items'::regclass and tgname = 'content_items_review_drafts_carry_over';" \
  -c "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_review_draft_security' as folded;"
```

Expected: the assertion returns one empty row; one trigger row; `folded = t`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add supabase/migrations/0093_durable_review_drafts.sql
git -C ~/worktrees/kanset-durable-drafts commit -m "Store client review drafts on the server with carry-over and send failure events (0093)"
```

---

### Task 2: Anchor-aware browser keys

**Files:**
- Modify: `src/lib/portal/edit-drafts.ts`
- Modify: `src/lib/portal/edit-drafts.test.ts`

Existing keys must not change (tests and real browsers already hold them); a frame or page anchor is appended only when present.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('portal edit drafts', ...)` in `src/lib/portal/edit-drafts.test.ts`, and extend the import to `import { editDraftKey, editDraftPiecePrefix, editDraftPrefix, hasUnsentEditDrafts, parseEditDraftKey } from './edit-drafts'`:

```ts
  it('keeps the existing key for a whole-block draft and appends a frame anchor only when present', () => {
    const block = editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption')
    expect(block).toBe('portal-edit-draft:maria-user:kanset:piece-one:v2:copy_block:caption')
    const frame = editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'asset', 'reel-cover', 'frame:3')
    expect(frame).toBe('portal-edit-draft:maria-user:kanset:piece-one:v2:asset:reel-cover:frame%3A3')
  })

  it('shares one piece prefix across versions', () => {
    const prefix = editDraftPiecePrefix('maria-user', 'kanset', 'piece-one')
    expect(editDraftPrefix('maria-user', 'kanset', 'piece-one', 2).startsWith(prefix)).toBe(true)
    expect(editDraftPrefix('maria-user', 'kanset', 'piece-one', 3).startsWith(prefix)).toBe(true)
  })

  it('parses a key back into its version, target and anchor', () => {
    const prefix = editDraftPiecePrefix('maria-user', 'kanset', 'piece-one')
    expect(parseEditDraftKey(prefix, editDraftKey('maria-user', 'kanset', 'piece-one', 4, 'asset', 'reel-cover', 'page:2')))
      .toEqual({ version: 4, targetKind: 'asset', targetKey: 'reel-cover', anchor: 'page:2' })
    expect(parseEditDraftKey(prefix, editDraftKey('maria-user', 'kanset', 'piece-one', 1, 'copy_block', 'caption')))
      .toEqual({ version: 1, targetKind: 'copy_block', targetKey: 'caption', anchor: '' })
    expect(parseEditDraftKey(prefix, 'portal-edit-draft:maria-user:kanset:piece-two:v1:copy_block:caption')).toBeNull()
    expect(parseEditDraftKey(prefix, `${prefix}garbage`)).toBeNull()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/edit-drafts.test.ts`
Expected: FAIL, `editDraftPiecePrefix` and `parseEditDraftKey` are not exported.

- [ ] **Step 3: Implement**

Replace the whole of `src/lib/portal/edit-drafts.ts` with:

```ts
// Browser keys for unsent review drafts. Since migration 0093 the browser copy is an offline
// buffer for the server draft, not the only copy. Whole-block keys are unchanged from before so
// drafts already sitting in a browser are still found; a frame or page anchor is appended only
// when present.

export function editDraftPiecePrefix(scope: string, slug: string, contentId: string): string {
  return `portal-edit-draft:${encodeURIComponent(scope)}:${encodeURIComponent(slug)}:${encodeURIComponent(contentId)}:`
}

export function editDraftPrefix(scope: string, slug: string, contentId: string, version: number): string {
  return `${editDraftPiecePrefix(scope, slug, contentId)}v${version}:`
}

export function editDraftKey(
  scope: string,
  slug: string,
  contentId: string,
  version: number,
  targetKind: string,
  targetKey: string,
  anchor = '',
): string {
  const base = `${editDraftPrefix(scope, slug, contentId, version)}${encodeURIComponent(targetKind)}:${encodeURIComponent(targetKey)}`
  return anchor ? `${base}:${encodeURIComponent(anchor)}` : base
}

export type ParsedEditDraftKey = { version: number; targetKind: string; targetKey: string; anchor: string }

export function parseEditDraftKey(piecePrefix: string, key: string): ParsedEditDraftKey | null {
  if (!key.startsWith(piecePrefix)) return null
  const match = /^v(\d+):([^:]+):([^:]+)(?::([^:]+))?$/.exec(key.slice(piecePrefix.length))
  if (!match) return null
  try {
    return {
      version: Number(match[1]),
      targetKind: decodeURIComponent(match[2]),
      targetKey: decodeURIComponent(match[3]),
      anchor: match[4] ? decodeURIComponent(match[4]) : '',
    }
  } catch {
    return null
  }
}

export function hasUnsentEditDrafts(storage: Storage, prefix: string): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(prefix) && (storage.getItem(key) ?? '').trim()) return true
  }
  return false
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/edit-drafts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/edit-drafts.ts src/lib/portal/edit-drafts.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Add frame anchors and a piece prefix to browser draft keys"
```

---

### Task 3: Durable draft core (pure)

**Files:**
- Create: `src/lib/portal/review-drafts-core.ts`
- Create: `src/lib/portal/review-drafts-core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-drafts-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DRAFT_STATUS_TEXT, deriveSyncState, draftIdentity, humanizeDraftKey, localEntryToDraft,
  reconcileDrafts, serverRowToDraft, unsentDraftAlertLine, type LocalDraftEntry, type ServerDraftRow,
} from './review-drafts-core'

function row(overrides: Partial<ServerDraftRow> = {}): ServerDraftRow {
  return {
    id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item-1', base_version: 2,
    target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null,
    target_label: 'Caption', url_snapshot: null, quoted_text: null, body: 'Server text',
    status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
    carried_over_at: null, carried_over_to_version: null, send_failed_at: null, last_send_error: null,
    ...overrides,
  }
}

function entry(overrides: Partial<LocalDraftEntry> = {}): LocalDraftEntry {
  return {
    version: 2, targetKind: 'copy_block', targetKey: 'caption', anchor: '', proposedText: 'Local text',
    quotedText: null, savedAt: '2026-10-03T09:00:00.000Z', label: 'Caption', urlSnapshot: null,
    anchorLabel: null, serverId: null, syncedAt: null,
    ...overrides,
  }
}

describe('draft identity', () => {
  it('separates frames of one visual and treats a missing anchor as the whole target', () => {
    expect(draftIdentity({ kind: 'asset', key: 'reel', anchor: 'frame:3' })).toBe('asset:reel:frame:3')
    expect(draftIdentity({ kind: 'copy_block', key: 'caption' })).toBe('copy_block:caption:')
  })

  it('humanises a key when a stored draft has no label', () => {
    expect(humanizeDraftKey('article-body')).toBe('Article body')
    expect(humanizeDraftKey('')).toBe('Edit')
  })
})

describe('mapping', () => {
  it('marks a server draft from an earlier version as carried', () => {
    const draft = serverRowToDraft(row({ base_version: 1, carried_over_to_version: 2, carried_over_at: 'x' }), 2)
    expect(draft).toMatchObject({ baseVersion: 1, carriedFromVersion: 1, serverId: row().id, syncedAt: row().saved_at })
  })

  it('gives a legacy browser draft with no timestamp the oldest possible time', () => {
    const draft = localEntryToDraft(entry({ savedAt: null, label: null, targetKey: 'article-body' }), 2)
    expect(draft.savedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(draft.label).toBe('Article body')
    expect(draft.carriedFromVersion).toBeNull()
  })
})

describe('reconciling the browser buffer with the server', () => {
  it('keeps the newer server text and pushes nothing', () => {
    const result = reconcileDrafts([entry()], [row()], 2)
    expect(Object.values(result.drafts).map((d) => d.proposedText)).toEqual(['Server text'])
    expect(result.push).toEqual([])
    expect(result.dropLocal).toEqual([])
  })

  it('keeps the newer browser text and queues it for the server', () => {
    const result = reconcileDrafts([entry({ savedAt: '2026-10-03T11:00:00.000Z' })], [row()], 2)
    expect(result.drafts['copy_block:caption:']).toMatchObject({ proposedText: 'Local text', serverId: row().id, syncedAt: null })
    expect(result.push).toEqual(['copy_block:caption:'])
  })

  it('lets the server win a tie', () => {
    const result = reconcileDrafts([entry({ savedAt: row().saved_at })], [row()], 2)
    expect(result.drafts['copy_block:caption:'].proposedText).toBe('Server text')
  })

  it('drops a browser copy only when the server already sent or discarded a newer one', () => {
    const sent = reconcileDrafts([entry()], [row({ status: 'sent' })], 2)
    expect(sent.drafts).toEqual({})
    expect(sent.dropLocal).toEqual([{ kind: 'copy_block', key: 'caption', anchor: '' }])
    const newer = reconcileDrafts([entry({ savedAt: '2026-10-03T12:00:00.000Z' })], [row({ status: 'discarded' })], 2)
    expect(newer.drafts['copy_block:caption:'].proposedText).toBe('Local text')
    expect(newer.drafts['copy_block:caption:'].serverId).toBeNull()
    expect(newer.push).toEqual(['copy_block:caption:'])
  })

  it('never loses a browser draft the server has not seen, even from an old version', () => {
    const result = reconcileDrafts([entry({ version: 1, savedAt: null })], [], 2)
    expect(result.drafts['copy_block:caption:']).toMatchObject({ baseVersion: 1, carriedFromVersion: 1 })
    expect(result.push).toEqual(['copy_block:caption:'])
  })

  it('keeps the newest of several browser copies of the same target', () => {
    const result = reconcileDrafts([
      entry({ version: 1, proposedText: 'Old', savedAt: '2026-10-03T08:00:00.000Z' }),
      entry({ version: 2, proposedText: 'New', savedAt: '2026-10-03T08:30:00.000Z' }),
    ], [], 2)
    expect(result.drafts['copy_block:caption:'].proposedText).toBe('New')
  })
})

describe('sync state and wording', () => {
  it('uses the spec wording', () => {
    expect(DRAFT_STATUS_TEXT).toEqual({
      saving: 'Saving…',
      saved: 'Saved · not sent yet',
      offline: 'Saved on this phone · will sync when online',
      send_failed: "Couldn't send. Retry",
    })
  })

  it('derives one state from the provider counters', () => {
    const base = { draftCount: 1, pending: 0, inFlight: false, online: true, sendFailed: false }
    expect(deriveSyncState({ ...base, draftCount: 0 })).toBe('idle')
    expect(deriveSyncState(base)).toBe('saved')
    expect(deriveSyncState({ ...base, pending: 1 })).toBe('saving')
    expect(deriveSyncState({ ...base, inFlight: true })).toBe('saving')
    expect(deriveSyncState({ ...base, pending: 1, online: false })).toBe('offline')
    expect(deriveSyncState({ ...base, sendFailed: true, pending: 1 })).toBe('send_failed')
  })

  it('writes the agency alert line with the first name', () => {
    expect(unsentDraftAlertLine({ seat_name: 'Maria Guerts', unsent_count: 2, title: 'LMIA decoder' }))
      .toBe('Maria has 2 unsent edits on LMIA decoder')
    expect(unsentDraftAlertLine({ seat_name: '', unsent_count: 1, title: 'X' })).toBe('The client has 1 unsent edit on X')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/review-drafts-core.test.ts`
Expected: FAIL, cannot resolve `./review-drafts-core`.

- [ ] **Step 3: Implement**

Create `src/lib/portal/review-drafts-core.ts`:

```ts
// Durable review drafts (spec 2026-10-03 section 6, migration 0093). Pure and browser-safe:
// shared by ReviewDraftProvider, the draft server actions and the agency readers.

export type DraftTargetKind = 'copy_block' | 'asset' | 'design_link'
export type DraftDiscardReason = 'client_discarded' | 'reverted' | 'emptied'
export type DraftSyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'send_failed'

// "Written a few seconds after typing stops" (spec 6.1).
export const DRAFT_AUTOSAVE_DELAY_MS = 2000
export const DRAFT_ANCHOR_PATTERN = /^(frame|page):[1-9][0-9]{0,2}$/

export const DRAFT_STATUS_TEXT: Record<Exclude<DraftSyncState, 'idle'>, string> = {
  saving: 'Saving…',
  saved: 'Saved · not sent yet',
  offline: 'Saved on this phone · will sync when online',
  send_failed: "Couldn't send. Retry",
}

// Exactly the columns migration 0093 grants to a client seat.
export const SERVER_DRAFT_COLUMNS = 'id, content_item_id, base_version, target_kind, target_key, anchor, '
  + 'anchor_label, target_label, url_snapshot, quoted_text, body, status, saved_at, updated_at, '
  + 'carried_over_at, carried_over_to_version, send_failed_at, last_send_error'

export type ServerDraftRow = {
  id: string
  content_item_id: string
  base_version: number
  target_kind: DraftTargetKind
  target_key: string
  anchor: string
  anchor_label: string | null
  target_label: string
  url_snapshot: string | null
  quoted_text: string | null
  body: string
  status: 'unsent' | 'sent' | 'discarded'
  saved_at: string
  updated_at: string
  carried_over_at: string | null
  carried_over_to_version: number | null
  send_failed_at: string | null
  last_send_error: string | null
}

export type LocalDraftEntry = {
  version: number
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  proposedText: string
  quotedText: string | null
  savedAt: string | null
  label: string | null
  urlSnapshot: string | null
  anchorLabel: string | null
  serverId: string | null
  syncedAt: string | null
}

export type DurableDraft = {
  kind: DraftTargetKind
  key: string
  anchor: string
  anchorLabel: string | null
  label: string
  urlSnapshot: string | null
  proposedText: string
  quotedText: string | null
  baseVersion: number
  savedAt: string
  // The version a carried draft was written against; null when it belongs to the current version.
  carriedFromVersion: number | null
  serverId: string | null
  // The savedAt the server last confirmed. Equal to savedAt when the server holds this exact text.
  syncedAt: string | null
  sendFailedAt: string | null
}

export type DraftIdentityParts = { kind: string; key: string; anchor?: string | null }

export function draftIdentity(parts: DraftIdentityParts): string {
  return `${parts.kind}:${parts.key}:${parts.anchor ?? ''}`
}

export function humanizeDraftKey(key: string): string {
  const words = key.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Edit'
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

export function serverRowToDraft(row: ServerDraftRow, currentVersion: number): DurableDraft {
  return {
    kind: row.target_kind,
    key: row.target_key,
    anchor: row.anchor ?? '',
    anchorLabel: row.anchor_label,
    label: row.target_label,
    urlSnapshot: row.url_snapshot,
    proposedText: row.body,
    quotedText: row.quoted_text,
    baseVersion: row.base_version,
    savedAt: row.saved_at,
    carriedFromVersion: row.base_version < currentVersion ? row.base_version : null,
    serverId: row.id,
    syncedAt: row.saved_at,
    sendFailedAt: row.send_failed_at,
  }
}

export function localEntryToDraft(entry: LocalDraftEntry, currentVersion: number): DurableDraft {
  return {
    kind: entry.targetKind,
    key: entry.targetKey,
    anchor: entry.anchor,
    anchorLabel: entry.anchorLabel,
    label: entry.label ?? humanizeDraftKey(entry.targetKey),
    urlSnapshot: entry.urlSnapshot,
    proposedText: entry.proposedText,
    quotedText: entry.quotedText,
    baseVersion: entry.version,
    savedAt: entry.savedAt ?? new Date(0).toISOString(),
    carriedFromVersion: entry.version < currentVersion ? entry.version : null,
    serverId: entry.serverId,
    syncedAt: entry.syncedAt,
    sendFailedAt: null,
  }
}

export type ReconcileResult = {
  drafts: Record<string, DurableDraft>
  // Identities whose browser copy is newer than the server and must be saved.
  push: string[]
  // Browser copies the server has already sent or discarded at a later time. Removing these loses
  // nothing: the same or a newer decision already exists on the server.
  dropLocal: DraftIdentityParts[]
}

// Spec 6.1: latest saved_at wins per target, and nothing is silently deleted.
export function reconcileDrafts(
  local: LocalDraftEntry[],
  server: ServerDraftRow[],
  currentVersion: number,
): ReconcileResult {
  const unsent = new Map<string, ServerDraftRow>()
  const closedAt = new Map<string, number>()
  for (const row of server) {
    const id = draftIdentity({ kind: row.target_kind, key: row.target_key, anchor: row.anchor })
    if (row.status === 'unsent') unsent.set(id, row)
    else closedAt.set(id, Math.max(closedAt.get(id) ?? 0, time(row.saved_at)))
  }
  const newestLocal = new Map<string, LocalDraftEntry>()
  for (const entry of local) {
    const id = draftIdentity({ kind: entry.targetKind, key: entry.targetKey, anchor: entry.anchor })
    const seen = newestLocal.get(id)
    if (!seen || time(entry.savedAt) > time(seen.savedAt)
        || (time(entry.savedAt) === time(seen.savedAt) && entry.version > seen.version)) {
      newestLocal.set(id, entry)
    }
  }
  const drafts: Record<string, DurableDraft> = {}
  const push: string[] = []
  const dropLocal: DraftIdentityParts[] = []
  for (const id of new Set([...unsent.keys(), ...newestLocal.keys()])) {
    const row = unsent.get(id)
    const entry = newestLocal.get(id)
    if (entry && (!row || time(entry.savedAt) > time(row.saved_at))) {
      if (!row && closedAt.has(id) && time(entry.savedAt) <= (closedAt.get(id) ?? 0)) {
        dropLocal.push({ kind: entry.targetKind, key: entry.targetKey, anchor: entry.anchor })
        continue
      }
      drafts[id] = { ...localEntryToDraft(entry, currentVersion), serverId: row?.id ?? null, syncedAt: null }
      push.push(id)
      continue
    }
    if (row) drafts[id] = serverRowToDraft(row, currentVersion)
  }
  return { drafts, push, dropLocal }
}

export function deriveSyncState(input: {
  draftCount: number
  pending: number
  inFlight: boolean
  online: boolean
  sendFailed: boolean
}): DraftSyncState {
  if (input.sendFailed && input.draftCount > 0) return 'send_failed'
  if (input.draftCount === 0 && input.pending === 0 && !input.inFlight) return 'idle'
  if (!input.online && (input.pending > 0 || input.inFlight)) return 'offline'
  if (input.pending > 0 || input.inFlight) return 'saving'
  return input.draftCount > 0 ? 'saved' : 'idle'
}

// One row of agency_unsent_review_draft_alerts (migration 0093). Plan 5 renders these.
export type UnsentDraftAlert = {
  client_id: string
  content_item_id: string
  content_id: string
  title: string
  planned_date: string
  auth_user_id: string
  seat_name: string
  unsent_count: number
  stale_count: number
  carried_count: number
  oldest_saved_at: string
}

export function unsentDraftAlertLine(alert: Pick<UnsentDraftAlert, 'seat_name' | 'unsent_count' | 'title'>): string {
  const first = alert.seat_name.trim().split(/\s+/)[0] || 'The client'
  return `${first} has ${alert.unsent_count} unsent ${alert.unsent_count === 1 ? 'edit' : 'edits'} on ${alert.title}`
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/review-drafts-core.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/review-drafts-core.ts src/lib/portal/review-drafts-core.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Add the pure durable draft core: reconcile, sync state, alert line"
```

---

### Task 4: Browser buffer

**Files:**
- Create: `src/lib/portal/review-drafts-local.ts`
- Create: `src/lib/portal/review-drafts-local.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-drafts-local.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { editDraftKey, editDraftPiecePrefix } from './edit-drafts'
import { readLocalDrafts, removeLocalDraft, writeLocalDraft } from './review-drafts-local'
import type { DurableDraft } from './review-drafts-core'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

const SCOPE = { scope: 'maria', slug: 'kanset', contentId: 'piece' }
const PREFIX = editDraftPiecePrefix('maria', 'kanset', 'piece')

function draft(overrides: Partial<DurableDraft> = {}): DurableDraft {
  return {
    kind: 'copy_block', key: 'caption', anchor: '', anchorLabel: null, label: 'Caption', urlSnapshot: null,
    proposedText: 'Typed', quotedText: null, baseVersion: 2, savedAt: '2026-10-03T10:00:00.000Z',
    carriedFromVersion: null, serverId: null, syncedAt: null, sendFailedAt: null, ...overrides,
  }
}

describe('browser draft buffer', () => {
  it('reads drafts of every version of this piece, including legacy entries', () => {
    const storage = memoryStorage()
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Legacy' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'asset', 'reel', 'frame:3'),
      JSON.stringify({ proposedText: 'Frame note', savedAt: '2026-10-03T10:00:00.000Z', anchorLabel: 'Frame 3', serverId: 'abc' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'other', 2, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Other piece' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'blank'), JSON.stringify({ proposedText: '   ' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'raw'), 'not json')
    const entries = readLocalDrafts(storage, PREFIX)
    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual(expect.objectContaining({ version: 1, targetKey: 'caption', proposedText: 'Legacy', savedAt: null }))
    expect(entries).toContainEqual(expect.objectContaining({ version: 2, targetKind: 'asset', anchor: 'frame:3', anchorLabel: 'Frame 3', serverId: 'abc' }))
  })

  it('writes under the base version and replaces the same target at any other version', () => {
    const storage = memoryStorage()
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Carried' }))
    writeLocalDraft(storage, SCOPE, draft({ proposedText: 'Kept on v2' }))
    expect(storage.getItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'))).toBeNull()
    expect(JSON.parse(storage.getItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'caption')) ?? '{}'))
      .toMatchObject({ proposedText: 'Kept on v2', savedAt: '2026-10-03T10:00:00.000Z', label: 'Caption' })
  })

  it('removes only the named target and frame', () => {
    const storage = memoryStorage()
    writeLocalDraft(storage, SCOPE, draft({ kind: 'asset', key: 'reel', anchor: 'frame:1' }))
    writeLocalDraft(storage, SCOPE, draft({ kind: 'asset', key: 'reel', anchor: 'frame:2' }))
    removeLocalDraft(storage, PREFIX, { kind: 'asset', key: 'reel', anchor: 'frame:1' })
    expect(readLocalDrafts(storage, PREFIX).map((entry) => entry.anchor)).toEqual(['frame:2'])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/review-drafts-local.test.ts`
Expected: FAIL, cannot resolve `./review-drafts-local`.

- [ ] **Step 3: Implement**

Create `src/lib/portal/review-drafts-local.ts`:

```ts
// The browser copy of review drafts: an offline buffer since migration 0093. Every function here
// may throw when storage is blocked; ReviewDraftProvider catches and carries on with the server.
import { editDraftKey, editDraftPiecePrefix, parseEditDraftKey } from './edit-drafts'
import type { DraftIdentityParts, DraftTargetKind, DurableDraft, LocalDraftEntry } from './review-drafts-core'

const KINDS = new Set<string>(['copy_block', 'asset', 'design_link'])

export type LocalScope = { scope: string; slug: string; contentId: string }

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function readLocalDrafts(storage: Storage, piecePrefix: string): LocalDraftEntry[] {
  const entries: LocalDraftEntry[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    const parsed = parseEditDraftKey(piecePrefix, key)
    if (!parsed || !KINDS.has(parsed.targetKind)) continue
    let value: Record<string, unknown>
    try {
      const raw: unknown = JSON.parse(storage.getItem(key) ?? '')
      if (!raw || typeof raw !== 'object') continue
      value = raw as Record<string, unknown>
    } catch {
      continue
    }
    const proposedText = text(value.proposedText)
    if (!proposedText || !proposedText.trim()) continue
    entries.push({
      version: parsed.version,
      targetKind: parsed.targetKind as DraftTargetKind,
      targetKey: parsed.targetKey,
      anchor: parsed.anchor,
      proposedText,
      quotedText: text(value.quotedText),
      savedAt: text(value.savedAt),
      label: text(value.label),
      urlSnapshot: text(value.urlSnapshot),
      anchorLabel: text(value.anchorLabel),
      serverId: text(value.serverId),
      syncedAt: text(value.syncedAt),
    })
  }
  return entries
}

export function removeLocalDraft(storage: Storage, piecePrefix: string, target: DraftIdentityParts): void {
  const doomed: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    const parsed = parseEditDraftKey(piecePrefix, key)
    if (parsed && parsed.targetKind === target.kind && parsed.targetKey === target.key
        && parsed.anchor === (target.anchor ?? '')) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
}

export function writeLocalDraft(storage: Storage, where: LocalScope, draft: DurableDraft): void {
  removeLocalDraft(storage, editDraftPiecePrefix(where.scope, where.slug, where.contentId), draft)
  storage.setItem(
    editDraftKey(where.scope, where.slug, where.contentId, draft.baseVersion, draft.kind, draft.key, draft.anchor),
    JSON.stringify({
      proposedText: draft.proposedText,
      quotedText: draft.quotedText,
      savedAt: draft.savedAt,
      label: draft.label,
      urlSnapshot: draft.urlSnapshot,
      anchorLabel: draft.anchorLabel,
      serverId: draft.serverId,
      syncedAt: draft.syncedAt,
    }),
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/review-drafts-local.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/review-drafts-local.ts src/lib/portal/review-drafts-local.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Keep the browser draft copy as an offline buffer across versions"
```

---

### Task 5: Raise refused sends in Agency Ops

**Files:**
- Modify: `src/lib/portal/refusal-log.ts`
- Modify: `src/lib/portal/refusal-log.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/portal/refusal-log.test.ts` replace the mock block at the top:

```ts
const insert = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert }) }),
}))
```

with:

```ts
const insert = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert }), rpc }),
}))
```

replace the `beforeEach` line with:

```ts
  beforeEach(() => {
    insert.mockReset(); insert.mockResolvedValue({ error: null })
    rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null })
  })
```

and append inside the `describe`:

```ts
  it('raises the attempt in Agency Ops with her draft ids (migration 0093)', async () => {
    await recordRefusal({ ...base, draftIds: ['d1', 'd2'], drafts: [{ targetKey: 'caption', proposedText: 'x' }] })
    const attemptId = insert.mock.calls[0][0][0].attempt_id
    expect(rpc).toHaveBeenCalledWith('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: ['d1', 'd2'] })
  })

  it('does not raise an event when the failure row itself could not be written', async () => {
    insert.mockResolvedValue({ error: { message: 'boom' } })
    await recordRefusal({ ...base })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never throws when raising the event fails', async () => {
    rpc.mockRejectedValue(new Error('down'))
    await expect(recordRefusal({ ...base, reason: 'network_unreachable' })).resolves.toBeUndefined()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/refusal-log.test.ts`
Expected: FAIL, `rpc` never called and `'network_unreachable'` is not a `RefusalReason` (type error is not a runtime failure; the first new test is the one that fails).

- [ ] **Step 3: Implement**

In `src/lib/portal/refusal-log.ts`:

Replace

```ts
  | 'rate_limited'
  | 'write_failed'
```

with

```ts
  | 'rate_limited'
  | 'write_failed'
  // Migration 0093: drafts changed on another device between load and send, and a send that
  // never reached the server (reported by the browser when the connection returns).
  | 'drafts_changed'
  | 'network_unreachable'
```

Replace

```ts
  requesterName?: string | null
  drafts?: RefusedDraft[]
}
```

(the end of `RefusalRecord`) with

```ts
  requesterName?: string | null
  drafts?: RefusedDraft[]
  // Server draft ids (migration 0093) to mark as failed, so every device shows "Couldn't send".
  draftIds?: string[]
}
```

Replace

```ts
    const { error } = await createSupabaseAdmin().from('client_request_failures').insert(rows)
    if (error) console.error('refusal log write failed:', error.message)
```

with

```ts
    const admin = createSupabaseAdmin()
    const { error } = await admin.from('client_request_failures').insert(rows)
    if (error) {
      console.error('refusal log write failed:', error.message)
      return
    }
    // Spec 6.3 and 8: raise it in Agency Ops straight away (activity, inbox event, agency email)
    // and mark her drafts as failed. Migration 0093.
    const { error: eventError } = await admin.rpc('agency_record_review_send_failure', {
      p_attempt_id: attemptId,
      p_draft_ids: record.draftIds ?? [],
    })
    if (eventError) console.error('refusal event write failed:', eventError.message)
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/refusal-log.test.ts src/lib/portal/refusal-logging.test.ts`
Expected: PASS (7 + existing refusal-logging tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/refusal-log.ts src/lib/portal/refusal-log.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Raise every refused client edit in Agency Ops and mark its drafts failed"
```

---

### Task 6: Draft server actions

**Files:**
- Create: `src/app/client/[slug]/draft-actions.ts`
- Create: `src/app/client/[slug]/draft-actions.test.ts`
- Modify: `src/lib/portal/refusal-logging.test.ts`

Autosave and discard never redirect (a redirect mid-typing would yank Maria off the page); they answer with an error and the browser keeps the text. Send redirects to login like every other client action. Every send refusal goes through `refuse()`, which logs her words.

- [ ] **Step 1: Write the failing tests**

Create `src/app/client/[slug]/draft-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getContentItem: vi.fn(),
  rpc: vi.fn(),
  draftRows: vi.fn(),
  recordRefusal: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/portal/refusal-log', () => ({ recordRefusal: mocks.recordRefusal }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ in: mocks.draftRows }) }),
  }),
}))

import { discardReviewDraft, reportReviewSendFailure, saveReviewDraft, sendReviewDrafts } from './draft-actions'

const SESSION = {
  userId: 'user-1', email: 'maria@kanset.com', name: 'Maria Guerts', clientId: 'client-1', clientSlug: 'kanset',
  role: 'client', canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true, canUseAssistant: false,
}
const DRAFT_A = '11111111-1111-4111-8111-111111111111'
const DRAFT_B = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'
const SAVE = {
  slug: 'kanset', contentId: 'piece', baseVersion: 2, targetKind: 'copy_block' as const, targetKey: 'caption',
  anchor: '', anchorLabel: null, targetLabel: 'Caption', urlSnapshot: null, quotedText: null,
  body: 'Maria rewrote it.', savedAt: '2026-10-03T10:00:00.000Z',
}
const SEND = { slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [DRAFT_A, DRAFT_B], note: '', idempotencyKey: KEY }

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.getClientSession.mockResolvedValue(SESSION)
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', content_id: 'piece', version: 2 })
  mocks.draftRows.mockResolvedValue({ data: [
    { target_kind: 'copy_block', target_key: 'caption', target_label: 'Caption', anchor_label: null, body: 'Her caption' },
    { target_kind: 'asset', target_key: 'reel', target_label: 'Reel', anchor_label: 'Frame 3', body: 'Her frame note' },
  ], error: null })
})

describe('saveReviewDraft', () => {
  it('saves through the seat session', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'saved', draft: { id: DRAFT_A } }, error: null })
    const result = await saveReviewDraft(SAVE)
    expect(mocks.rpc).toHaveBeenCalledWith('save_review_draft', {
      p_content_id: 'item-1', p_base_version: 2, p_target_kind: 'copy_block', p_target_key: 'caption',
      p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
      p_quoted_text: null, p_body: 'Maria rewrote it.', p_saved_at: '2026-10-03T10:00:00.000Z',
    })
    expect(result).toEqual({ outcome: 'saved', draft: { id: DRAFT_A } })
  })

  it('tells the browser to keep its copy and stop retrying when the version moved', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_draft_stale_version' } })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
  })

  it('asks the browser to retry an unexplained failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: true })
  })

  it('does not redirect or write when the session has ended', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses a seat that cannot submit edits without calling the database', async () => {
    mocks.getClientSession.mockResolvedValue({ ...SESSION, canSubmitRequests: false })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('discardReviewDraft', () => {
  it('passes the reason and the time of the text being discarded', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'discarded' }, error: null })
    await discardReviewDraft({ slug: 'kanset', contentId: 'piece', targetKind: 'asset', targetKey: 'reel',
      anchor: 'frame:3', reason: 'client_discarded', savedAt: SAVE.savedAt })
    expect(mocks.rpc).toHaveBeenCalledWith('discard_review_draft', {
      p_content_id: 'item-1', p_target_kind: 'asset', p_target_key: 'reel', p_anchor: 'frame:3',
      p_reason: 'client_discarded', p_saved_at: SAVE.savedAt,
    })
  })

  it('refuses an unknown reason before reaching the database', async () => {
    const result = await discardReviewDraft({ slug: 'kanset', contentId: 'piece', targetKind: 'copy_block',
      targetKey: 'caption', anchor: '', reason: 'because' as never, savedAt: SAVE.savedAt })
    expect(result).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('sendReviewDrafts', () => {
  it('sends the saved drafts by id and revalidates the piece', async () => {
    mocks.rpc.mockResolvedValue({ data: { bundle_id: 'b1', request_ids: ['r1', 'r2'], outcome: 'created',
      sent_draft_ids: [DRAFT_A, DRAFT_B] }, error: null })
    const result = await sendReviewDrafts({ ...SEND, note: ' Thanks ' })
    expect(mocks.rpc).toHaveBeenCalledWith('send_review_drafts', {
      p_content_id: 'item-1', p_content_version: 2, p_draft_ids: [DRAFT_A, DRAFT_B], p_note: 'Thanks',
      p_idempotency_key: KEY,
    })
    expect(result).toEqual({ success: 'Your 2 edits were sent to The Dot.', requestIds: ['r1', 'r2'],
      sentDraftIds: [DRAFT_A, DRAFT_B] })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client/kanset/piece/piece')
    expect(mocks.recordRefusal).not.toHaveBeenCalled()
  })

  it('logs her words with the draft ids when drafts changed on another device', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'drafts_changed' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/another device/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'drafts_changed', clientId: 'client-1', contentItemId: 'item-1', draftIds: [DRAFT_A, DRAFT_B],
      drafts: [
        { targetKind: 'copy_block', targetKey: 'caption', targetLabel: 'Caption', proposedText: 'Her caption' },
        { targetKind: 'asset', targetKey: 'reel', targetLabel: 'Reel · Frame 3', proposedText: 'Her frame note' },
      ],
    }))
  })

  it('asks her to keep or discard carried drafts first', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'drafts_carried_over' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/previous version/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'version_stale' }))
  })

  it('says her text is kept on an unexplained failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toBe('Your edits could not be sent. They are still saved, and we have your text.')
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'write_failed' }))
  })

  it('refuses an empty or duplicated draft list and still logs the attempt', async () => {
    await sendReviewDrafts({ ...SEND, draftIds: [] })
    await sendReviewDrafts({ ...SEND, draftIds: [DRAFT_A, DRAFT_A] })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.recordRefusal).toHaveBeenCalledTimes(2)
    expect(mocks.recordRefusal.mock.calls.every(([record]) => record.reason === 'empty_bundle')).toBe(true)
  })

  it('refuses a page that is behind the released version', async () => {
    mocks.getContentItem.mockResolvedValue({ id: 'item-1', content_id: 'piece', version: 3 })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/newer version/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'version_stale' }))
  })
})

describe('reportReviewSendFailure', () => {
  it('records a send that never reached the server, with her text', async () => {
    await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [DRAFT_A, 'nope'],
      drafts: [{ targetKind: 'copy_block', targetKey: 'caption', targetLabel: 'Caption', proposedText: 'Typed on the train' }] })
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'network_unreachable', clientMessage: "Couldn't send. Retry", contentItemId: 'item-1',
      draftIds: [DRAFT_A], drafts: [expect.objectContaining({ proposedText: 'Typed on the train' })],
    }))
  })

  it('records nothing for a seat that cannot submit edits', async () => {
    mocks.getClientSession.mockResolvedValue({ ...SESSION, canSubmitRequests: false })
    await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [], drafts: [] })
    expect(mocks.recordRefusal).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Extend the static refusal guard**

In `src/lib/portal/refusal-logging.test.ts`, append at the end of the file:

```ts
describe('the durable send path logs every refusal too (migration 0093)', () => {
  const DRAFT_SOURCE = readFileSync(resolve(process.cwd(), 'src/app/client/[slug]/draft-actions.ts'), 'utf8')

  it('sendReviewDrafts never returns a bare error', () => {
    const start = DRAFT_SOURCE.indexOf('export async function sendReviewDrafts(')
    expect(start).toBeGreaterThan(-1)
    const next = DRAFT_SOURCE.indexOf('\nexport async function ', start + 1)
    const body = DRAFT_SOURCE.slice(start, next === -1 ? DRAFT_SOURCE.length : next)
    expect([...body.matchAll(/return \{ error:[^}]*\}/g)].map((m) => m[0])).toEqual([])
    expect(body).toMatch(/too long \(\$\{MAX_PROPOSED_TEXT/)
    expect(body).toContain('We have your text')
  })

  it('uses only reason codes the database accepts after 0093', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0093_durable_review_drafts.sql'), 'utf8')
    const marker = migration.indexOf('add constraint client_request_failures_reason_code_check')
    const constraint = migration.slice(migration.indexOf('reason_code in (', marker))
    const dbCodes = new Set([...constraint.slice(0, constraint.indexOf('))')).matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1]))
    const used = new Set([...DRAFT_SOURCE.matchAll(/'([a-z_]+)',\s+(?:await withText|context)/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(5)
    for (const code of used) expect(dbCodes, `reason "${code}" is not in the 0093 constraint`).toContain(code)
  })
})
```

If plan 3 shipped as `0092`, change the migration filename in this test accordingly.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/draft-actions.test.ts' src/lib/portal/refusal-logging.test.ts`
Expected: FAIL, cannot resolve `./draft-actions` and ENOENT for `draft-actions.ts`.

- [ ] **Step 4: Implement**

Create `src/app/client/[slug]/draft-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'
import { recordRefusal, type RefusalReason, type RefusedDraft } from '@/lib/portal/refusal-log'
import type { DraftDiscardReason, DraftTargetKind, ServerDraftRow } from '@/lib/portal/review-drafts-core'

// Durable review drafts (spec 2026-10-03 section 6, migration 0093). Autosave and discard never
// redirect: a redirect in the middle of typing would take Maria off the page. They answer with an
// error and the browser keeps her text. Send behaves like every other client action.

// Must stay in step with request-actions.ts and migration 0088.
const MAX_PROPOSED_TEXT = 50000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEPT = 'It is still saved on this device.'

export type DraftWriteResult =
  | { outcome: 'saved' | 'stale' | 'discarded' | 'not_found'; draft?: ServerDraftRow }
  | { error: string; retryable: boolean }

export type SendDraftsResult = { error?: string; success?: string; requestIds?: string[]; sentDraftIds?: string[] }

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>

type RefusalContext = {
  clientId: string
  contentItemId?: string | null
  contentId?: string | null
  contentVersion?: number | null
  requestedBy?: string | null
  requesterName?: string | null
  drafts?: RefusedDraft[]
  draftIds?: string[]
}

async function refuse(message: string, reason: RefusalReason, context: RefusalContext): Promise<SendDraftsResult> {
  await recordRefusal({ ...context, reason, clientMessage: message })
  return { error: message }
}

function writeResult(data: unknown): DraftWriteResult {
  const value = data && typeof data === 'object' ? data as { outcome?: unknown; draft?: unknown } : {}
  const outcome = value.outcome
  if (outcome === 'saved' || outcome === 'stale' || outcome === 'discarded' || outcome === 'not_found') {
    const draft = value.draft && typeof value.draft === 'object' ? value.draft as ServerDraftRow : undefined
    return draft ? { outcome, draft } : { outcome }
  }
  return { error: `Could not save your edit to the portal. ${KEPT}`, retryable: true }
}

// Her words for the failure log, read from her own saved drafts through her own session.
async function draftTexts(supabase: Supabase, ids: string[]): Promise<RefusedDraft[]> {
  if (!ids.length) return []
  try {
    const { data } = await supabase.from('content_review_drafts')
      .select('target_kind, target_key, target_label, anchor_label, body').in('id', ids)
    return ((data ?? []) as Array<{ target_kind: string; target_key: string; target_label: string;
      anchor_label: string | null; body: string }>).map((row) => ({
      targetKind: row.target_kind,
      targetKey: row.target_key,
      targetLabel: row.anchor_label ? `${row.target_label} · ${row.anchor_label}` : row.target_label,
      proposedText: row.body,
    }))
  } catch {
    return []
  }
}

export async function saveReviewDraft(input: {
  slug: string
  contentId: string
  baseVersion: number
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  anchorLabel: string | null
  targetLabel: string
  urlSnapshot: string | null
  quotedText: string | null
  body: string
  savedAt: string
}): Promise<DraftWriteResult> {
  const session = await getClientSession(input.slug)
  if (!session) return { error: `Your session ended. ${KEPT}`, retryable: false }
  if (!session.canSubmitRequests) return { error: 'Your account cannot edit this piece.', retryable: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return { error: `That piece is no longer available. ${KEPT}`, retryable: false }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('save_review_draft', {
    p_content_id: item.id,
    p_base_version: input.baseVersion,
    p_target_kind: input.targetKind,
    p_target_key: input.targetKey,
    p_anchor: input.anchor ?? '',
    p_anchor_label: input.anchorLabel ?? null,
    p_target_label: input.targetLabel,
    p_url_snapshot: input.urlSnapshot ?? null,
    p_quoted_text: input.quotedText ?? null,
    p_body: input.body,
    p_saved_at: input.savedAt,
  })
  if (error) {
    if (error.message.includes('review_draft_stale_version') || error.message.includes('review_draft_locked')) {
      return { error: `This piece changed. ${KEPT} Reload to see the current version.`, retryable: false }
    }
    if (error.message.includes('invalid review draft') || error.message.includes('review_draft_target_not_found')
        || error.message.includes('too_many_review_drafts')) {
      return { error: `This edit could not be saved to the portal. ${KEPT}`, retryable: false }
    }
    return { error: `Could not save your edit to the portal. ${KEPT}`, retryable: true }
  }
  return writeResult(data)
}

export async function discardReviewDraft(input: {
  slug: string
  contentId: string
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  reason: DraftDiscardReason
  savedAt: string
}): Promise<DraftWriteResult> {
  if (!['client_discarded', 'reverted', 'emptied'].includes(input.reason)) {
    return { error: 'That edit could not be discarded.', retryable: false }
  }
  const session = await getClientSession(input.slug)
  if (!session) return { error: 'Your session ended.', retryable: false }
  if (!session.canSubmitRequests) return { error: 'Your account cannot edit this piece.', retryable: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return { error: 'That piece is no longer available.', retryable: false }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('discard_review_draft', {
    p_content_id: item.id,
    p_target_kind: input.targetKind,
    p_target_key: input.targetKey,
    p_anchor: input.anchor ?? '',
    p_reason: input.reason,
    p_saved_at: input.savedAt,
  })
  if (error) return { error: 'Could not discard the edit on the portal.', retryable: !error.message.includes('invalid') }
  return writeResult(data)
}

export async function sendReviewDrafts(input: {
  slug: string
  contentId: string
  contentVersion: number
  draftIds: string[]
  note?: string
  idempotencyKey: string
}): Promise<SendDraftsResult> {
  const session = await getClientSession(input.slug)
  if (!session) redirect('/client/login')
  const supabase = await createSupabaseServer()
  const given = Array.isArray(input.draftIds) ? input.draftIds : []
  const draftIds = given.filter((id) => typeof id === 'string' && UUID.test(id))
  const context: RefusalContext = {
    clientId: session.clientId,
    contentId: input.contentId,
    contentVersion: Number.isInteger(input.contentVersion) ? input.contentVersion : null,
    requestedBy: session.userId,
    requesterName: session.name,
    draftIds,
  }
  const withText = async (extra: Partial<RefusalContext> = {}): Promise<RefusalContext> =>
    ({ ...context, ...extra, drafts: await draftTexts(supabase, draftIds) })

  if (!session.canSubmitRequests) {
    return refuse('Your account cannot send edits.', 'cannot_submit_requests', await withText())
  }
  if (!UUID.test(input.idempotencyKey ?? '') || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) {
    return refuse('This review expired. Reload the page and try again.', 'expired_review', await withText())
  }
  if (draftIds.length < 1 || draftIds.length > 50 || draftIds.length !== given.length
      || new Set(draftIds).size !== draftIds.length) {
    return refuse('Add at least one edit before sending.', 'empty_bundle', await withText())
  }
  const note = input.note?.trim() ?? ''
  if (note.length > 2000) {
    return refuse('The overall note is too long (2,000 characters max).', 'note_too_long', await withText())
  }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return refuse('That piece is no longer available.', 'piece_unavailable', await withText())
  if (item.version !== input.contentVersion) {
    return refuse('A newer version is ready. Reload the page before sending edits.', 'version_stale',
      await withText({ contentItemId: item.id }))
  }
  const { data, error } = await supabase.rpc('send_review_drafts', {
    p_content_id: item.id,
    p_content_version: input.contentVersion,
    p_draft_ids: draftIds,
    p_note: note || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) {
    const failed = { contentItemId: item.id }
    if (error.message.includes('drafts_carried_over')) {
      return refuse('Some of your edits were written against the previous version. Keep or discard them, then send.',
        'version_stale', await withText(failed))
    }
    if (error.message.includes('drafts_changed')) {
      return refuse('Your edits changed on another device. Reload to see all of them, then send.',
        'drafts_changed', await withText(failed))
    }
    if (error.message.includes('review_draft_too_long')) {
      return refuse(`One of the edits is too long (${MAX_PROPOSED_TEXT.toLocaleString('en-CA')} characters max). `
        + 'We have your text and will be in touch.', 'draft_too_long', await withText(failed))
    }
    if (error.message.includes('revision_already_in_progress')) {
      return refuse('The Dot has started this revision. Your saved edits were not sent. Please review the updated version when it returns.',
        'revision_in_progress', await withText(failed))
    }
    if (error.message.includes('stale') || error.message.includes('locked')) {
      return refuse('This version changed while you were reviewing it. Reload to see the current package.',
        'stale_or_locked', await withText(failed))
    }
    if (error.message.includes('rate_limited')) {
      return refuse('Too many requests were submitted. Please try again in an hour.', 'rate_limited',
        await withText(failed))
    }
    return refuse('Your edits could not be sent. They are still saved, and we have your text.', 'write_failed',
      await withText(failed))
  }
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  revalidatePath(`/client/${input.slug}`)
  revalidatePath(`/client/${input.slug}/requests`)
  revalidatePath(`/client/${input.slug}/piece/${input.contentId}`)
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : []
  return {
    success: draftIds.length === 1 ? 'Your edit was sent to The Dot.' : `Your ${draftIds.length} edits were sent to The Dot.`,
    requestIds: strings(result.request_ids),
    sentDraftIds: Array.isArray(result.sent_draft_ids) ? strings(result.sent_draft_ids) : draftIds,
  }
}

// A send that never reached the server (offline, or the request died on the way). The browser
// calls this when the connection returns, so the failure is still written down with her text.
export async function reportReviewSendFailure(input: {
  slug: string
  contentId: string
  contentVersion: number
  draftIds: string[]
  drafts: RefusedDraft[]
}): Promise<void> {
  const session = await getClientSession(input.slug)
  if (!session || !session.canSubmitRequests) return
  const str = (value: unknown) => (typeof value === 'string' ? value : null)
  const drafts = (Array.isArray(input.drafts) ? input.drafts : []).slice(0, 50).map((draft) => ({
    targetKind: str(draft?.targetKind),
    targetKey: str(draft?.targetKey),
    targetLabel: str(draft?.targetLabel)?.slice(0, 120) ?? null,
    proposedText: str(draft?.proposedText),
  }))
  const draftIds = (Array.isArray(input.draftIds) ? input.draftIds : [])
    .filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 50)
  const item = await getContentItem(session.clientId, input.contentId).catch(() => null)
  await recordRefusal({
    clientId: session.clientId,
    contentItemId: item?.id ?? null,
    contentId: input.contentId,
    contentVersion: Number.isInteger(input.contentVersion) ? input.contentVersion : null,
    requestedBy: session.userId,
    requesterName: session.name,
    reason: 'network_unreachable',
    clientMessage: "Couldn't send. Retry",
    drafts,
    draftIds,
  })
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/client/[slug]/draft-actions.test.ts' src/lib/portal/refusal-logging.test.ts`
Expected: PASS (15 draft-action tests, refusal-logging suite green including the two new tests).

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add 'src/app/client/[slug]/draft-actions.ts' 'src/app/client/[slug]/draft-actions.test.ts' src/lib/portal/refusal-logging.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Add server actions to save, discard and send durable review drafts"
```

---

### Task 7: Server readers (seat drafts, agency drafts, unsent-draft alerts)

**Files:**
- Create: `src/lib/portal/review-drafts.ts`
- Create: `src/lib/portal/review-drafts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-drafts.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ seatQuery: vi.fn(), adminQuery: vi.fn(), adminRpc: vi.fn() }))
function chain(result: () => Promise<unknown>) {
  const query = {
    select: () => query, eq: () => query, order: () => query,
    limit: () => result(),
  }
  return query
}
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({ from: () => chain(mocks.seatQuery) }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => chain(mocks.adminQuery), rpc: mocks.adminRpc }),
}))

import { getAgencyReviewDrafts, getMyReviewDrafts, getUnsentDraftAlerts } from './review-drafts'

beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset() })

describe('review draft readers', () => {
  it('returns the seat drafts read under RLS', async () => {
    mocks.seatQuery.mockResolvedValue({ data: [{ id: 'd1' }], error: null })
    expect(await getMyReviewDrafts('item-1')).toEqual([{ id: 'd1' }])
  })

  it('returns null instead of failing the page when drafts cannot be read', async () => {
    mocks.seatQuery.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } })
    expect(await getMyReviewDrafts('item-1')).toBeNull()
    mocks.seatQuery.mockRejectedValue(new Error('down'))
    expect(await getMyReviewDrafts('item-1')).toBeNull()
  })

  it('reads every seat draft of a piece for the agency', async () => {
    mocks.adminQuery.mockResolvedValue({ data: [{ id: 'd1', auth_user_id: 'u1' }], error: null })
    expect(await getAgencyReviewDrafts('item-1')).toEqual([{ id: 'd1', auth_user_id: 'u1' }])
  })

  it('asks the database for alerts as of the given time', async () => {
    mocks.adminRpc.mockResolvedValue({ data: [{ content_id: 'x' }], error: null })
    const now = new Date('2026-10-03T12:00:00.000Z')
    expect(await getUnsentDraftAlerts(now)).toEqual([{ content_id: 'x' }])
    expect(mocks.adminRpc).toHaveBeenCalledWith('agency_unsent_review_draft_alerts', { p_now: now.toISOString() })
  })

  it('surfaces an agency read failure instead of showing an empty, reassuring list', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getUnsentDraftAlerts()).rejects.toThrow(/boom/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/review-drafts.test.ts`
Expected: FAIL, cannot resolve `./review-drafts`.

- [ ] **Step 3: Implement**

Create `src/lib/portal/review-drafts.ts`:

```ts
import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SERVER_DRAFT_COLUMNS, type ServerDraftRow, type UnsentDraftAlert } from './review-drafts-core'

// Readers for durable review drafts (migration 0093).

// The signed-in seat's drafts on one piece, every status, so the browser can tell a draft that is
// still waiting from one another device already sent or discarded. RLS limits this to her own rows.
// Returns null on any failure: the page then falls back to browser-only drafts instead of breaking.
export async function getMyReviewDrafts(contentItemId: string): Promise<ServerDraftRow[] | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.from('content_review_drafts').select(SERVER_DRAFT_COLUMNS)
      .eq('content_item_id', contentItemId).order('saved_at', { ascending: false }).limit(500)
    if (error) {
      console.error('review drafts read failed:', error.message)
      return null
    }
    return (data ?? []) as ServerDraftRow[]
  } catch (error) {
    console.error('review drafts read threw:', error instanceof Error ? error.message : String(error))
    return null
  }
}

export type AgencyReviewDraftRow = ServerDraftRow & {
  client_id: string
  auth_user_id: string
  sent_at: string | null
  discarded_at: string | null
  discard_reason: string | null
  send_attempts: number
}

export const AGENCY_DRAFT_COLUMNS = `${SERVER_DRAFT_COLUMNS}, client_id, auth_user_id, sent_at, discarded_at, discard_reason, send_attempts`

// Agency Ops (plan 5): every seat's drafts on one piece, read-only through service_role.
export async function getAgencyReviewDrafts(contentItemId: string): Promise<AgencyReviewDraftRow[]> {
  const { data, error } = await createSupabaseAdmin().from('content_review_drafts').select(AGENCY_DRAFT_COLUMNS)
    .eq('content_item_id', contentItemId).order('saved_at', { ascending: false }).limit(500)
  if (error) throw new Error(`review drafts unavailable: ${error.message}`)
  return (data ?? []) as AgencyReviewDraftRow[]
}

// Agency Ops (plan 5): unsent drafts older than 24 hours on a piece due within 3 days.
export async function getUnsentDraftAlerts(now: Date = new Date()): Promise<UnsentDraftAlert[]> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_unsent_review_draft_alerts', {
    p_now: now.toISOString(),
  })
  if (error) throw new Error(`unsent draft alerts unavailable: ${error.message}`)
  return (data ?? []) as UnsentDraftAlert[]
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/review-drafts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/review-drafts.ts src/lib/portal/review-drafts.test.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Add readers for seat drafts, agency drafts and unsent-draft alerts"
```

---

### Task 8: ReviewDraftProvider with server sync

**Files:**
- Rewrite: `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx`, `ReviewAssets.test.tsx`, `ReviewVerdict.test.tsx` (module mocks only in this task)

The interface plan 4 consumes stays: `drafts`, `readDraft`, `saveDraft`, `removeDraft`, `clearDrafts`, `storageAvailable`, `ready`. New members: `currentDrafts`, `carriedDrafts`, `keepCarriedDraft`, `flush`, `send`, `syncState`, `statusText`, `sendError`, `serverSync`. Targets gain optional `anchor` and `anchorLabel` for frame and page notes. With `serverSync` off (the default, used by the admin "View as Maria" preview), behaviour is the browser-only behaviour of today; with it on, the browser copy is the offline buffer.

- [ ] **Step 1: Add module mocks to the three existing component tests**

The provider now imports `../../draft-actions` (and already imports `../../request-actions` for the browser-only send). Keep server modules out of jsdom.

In `ReviewVerdict.test.tsx`, after the line `vi.mock('../../actions', () => ({ decide }))`, add:

```ts
vi.mock('../../draft-actions', () => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
```

In `SuggestEditForm.test.tsx` and `ReviewAssets.test.tsx`, after the imports, add:

```ts
vi.mock('../../draft-actions', () => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../request-actions', () => ({ sendReviewBundle: vi.fn() }))
```

and make sure each file imports `vi` from `vitest` (`ReviewAssets.test.tsx` currently imports only `describe, expect, it`; change it to `import { describe, expect, it, vi } from 'vitest'`).

- [ ] **Step 2: Write the failing provider tests**

Create `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewDraftProvider, { useReviewDrafts } from './ReviewDraftProvider'
import { editDraftKey } from '@/lib/portal/edit-drafts'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'

const actions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(),
  discardReviewDraft: vi.fn(),
  sendReviewDrafts: vi.fn(),
  reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => actions)
vi.mock('../../request-actions', () => ({ sendReviewBundle: vi.fn() }))

const SERVER_ID = '11111111-1111-4111-8111-111111111111'
const caption = { kind: 'copy_block' as const, key: 'caption', label: 'Caption', currentText: 'Old caption' }
const KEY = (version: number, key = 'caption', kind = 'copy_block', anchor = '') =>
  editDraftKey('maria', 'kanset', 'piece', version, kind, key, anchor)

let api: ReturnType<typeof useReviewDrafts>
function Probe() {
  api = useReviewDrafts()
  return <output data-testid="status">{api.statusText ?? ''}</output>
}

function row(overrides: Partial<ServerDraftRow> = {}): ServerDraftRow {
  return {
    id: SERVER_ID, content_item_id: 'item-1', base_version: 2, target_kind: 'copy_block', target_key: 'caption',
    anchor: '', anchor_label: null, target_label: 'Caption', url_snapshot: null, quoted_text: null,
    body: 'Server text', status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
    carried_over_at: null, carried_over_to_version: null, send_failed_at: null, last_send_error: null,
    ...overrides,
  }
}

function mount(serverRows: ServerDraftRow[] = []) {
  return render(<ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={2}
    serverSync initialServerDrafts={serverRows}><Probe /></ReviewDraftProvider>)
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return values.size }, clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  } })
  setOnline(true)
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.saveReviewDraft.mockImplementation(async (input: {
    body: string; savedAt: string; baseVersion: number; targetKey: string
  }) => ({ outcome: 'saved', draft: row({ id: '22222222-2222-4222-8222-222222222222', body: input.body,
    saved_at: input.savedAt, base_version: input.baseVersion, target_key: input.targetKey }) }))
  actions.discardReviewDraft.mockResolvedValue({ outcome: 'discarded' })
  actions.reportReviewSendFailure.mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })

describe('restoring drafts on any device', () => {
  it('shows the newer server draft over an older copy on this phone', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Old phone text', savedAt: '2026-10-03T09:00:00.000Z' }))
    mount([row()])
    expect(api.ready).toBe(true)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Server text'])
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Server text')
  })

  it('pushes a newer copy from this phone to the server', async () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Typed offline', savedAt: '2026-10-03T11:00:00.000Z' }))
    mount([row()])
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', baseVersion: 2, targetKey: 'caption', body: 'Typed offline',
      savedAt: '2026-10-03T11:00:00.000Z',
    }))
    expect(api.drafts[0].proposedText).toBe('Typed offline')
  })

  it('drops a copy on this phone that another device already sent', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Sent elsewhere', savedAt: '2026-10-03T09:00:00.000Z' }))
    mount([row({ status: 'sent' })])
    expect(api.drafts).toEqual([])
    expect(window.localStorage.getItem(KEY(2))).toBeNull()
  })

  it('never drops a copy the server has never seen, even a legacy one', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Only on this phone' }))
    mount([])
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Only on this phone'])
  })
})

describe('autosave', () => {
  it('saves a few seconds after typing stops and then says it is not sent yet', async () => {
    vi.useFakeTimers()
    mount()
    act(() => api.saveDraft(caption, 'New caption'))
    expect(screen.getByTestId('status')).toHaveTextContent('Saving…')
    expect(actions.saveReviewDraft).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    // Wait for the save the timer started to finish before reading the status.
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('Saved · not sent yet')
  })

  it('keeps the draft on this phone while offline and syncs when the connection returns', async () => {
    setOnline(false)
    mount()
    act(() => api.saveDraft(caption, 'Typed on the train'))
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).not.toHaveBeenCalled()
    expect(screen.getByTestId('status')).toHaveTextContent('Saved on this phone · will sync when online')
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Typed on the train')
    setOnline(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1))
  })

  it('adopts newer text another device saved instead of overwriting it', async () => {
    actions.saveReviewDraft.mockResolvedValue({ outcome: 'stale',
      draft: row({ body: 'Desktop text', saved_at: '2099-01-01T00:00:00.000Z' }) })
    mount()
    act(() => api.saveDraft(caption, 'Phone text'))
    await act(async () => { await api.flush() })
    expect(api.drafts[0].proposedText).toBe('Desktop text')
  })

  it('keeps frame notes on one visual apart', () => {
    mount()
    const reel = { kind: 'asset' as const, key: 'reel', label: 'Reel', urlSnapshot: 'https://www.canva.com/design/R/view' }
    act(() => {
      api.saveDraft({ ...reel, anchor: 'frame:3', anchorLabel: 'Frame 3' }, 'Fix the typo')
      api.saveDraft(reel, 'Use the closed-mouth cover')
    })
    expect(api.drafts).toHaveLength(2)
    expect(window.localStorage.getItem(KEY(2, 'reel', 'asset', 'frame:3'))).not.toBeNull()
    expect(window.localStorage.getItem(KEY(2, 'reel', 'asset'))).not.toBeNull()
  })
})

describe('discarding', () => {
  it('discards only when asked and tells the server which text it was', async () => {
    mount([row()])
    act(() => api.removeDraft(caption))
    await act(async () => { await api.flush() })
    expect(actions.discardReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetKind: 'copy_block', targetKey: 'caption', anchor: '', reason: 'client_discarded',
      savedAt: '2026-10-03T10:00:00.000Z',
    }))
    expect(api.drafts).toEqual([])
  })

  it('records going back to the original text as reverted', async () => {
    mount([row()])
    act(() => api.saveDraft(caption, 'Old caption'))
    await act(async () => { await api.flush() })
    expect(actions.discardReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ reason: 'reverted' }))
  })
})

describe('carry-over', () => {
  it('shows a draft from the previous version and rebases it when kept', async () => {
    mount([row({ base_version: 1, carried_over_at: '2026-10-03T10:05:00.000Z', carried_over_to_version: 2 })])
    expect(api.carriedDrafts).toHaveLength(1)
    expect(api.carriedDrafts[0].carriedFromVersion).toBe(1)
    expect(api.currentDrafts).toHaveLength(0)
    act(() => api.keepCarriedDraft(api.carriedDrafts[0]))
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 2, body: 'Server text' }))
    expect(api.carriedDrafts).toHaveLength(0)
    expect(api.currentDrafts).toHaveLength(1)
  })
})

describe('sending', () => {
  it('sends saved drafts by id and clears them only after the server accepts', async () => {
    actions.sendReviewDrafts.mockResolvedValue({ success: 'Your edit was sent to The Dot.', requestIds: ['r1'], sentDraftIds: [SERVER_ID] })
    mount([row()])
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await api.send('Thanks') })
    expect(actions.sendReviewDrafts).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [SERVER_ID], note: 'Thanks',
    }))
    expect(outcome).toEqual({ ok: true, message: 'Your edit was sent to The Dot.' })
    expect(api.drafts).toEqual([])
    expect(window.localStorage.getItem(KEY(2))).toBeNull()
  })

  it('keeps every draft and retries with the same key after a refusal', async () => {
    actions.sendReviewDrafts
      .mockResolvedValueOnce({ error: 'Your edits could not be sent. They are still saved, and we have your text.' })
      .mockResolvedValueOnce({ success: 'Your edit was sent to The Dot.' })
    mount([row()])
    let first: { ok: boolean; message: string } | undefined
    await act(async () => { first = await api.send('') })
    expect(first?.ok).toBe(false)
    expect(api.drafts).toHaveLength(1)
    expect(screen.getByTestId('status')).toHaveTextContent("Couldn't send. Retry")
    await act(async () => { await api.send('') })
    const keys = actions.sendReviewDrafts.mock.calls.map(([input]) => input.idempotencyKey)
    expect(keys[0]).toBe(keys[1])
    expect(api.drafts).toEqual([])
    // The server action already recorded the refusal; the browser does not report it twice.
    expect(actions.reportReviewSendFailure).not.toHaveBeenCalled()
  })

  it('records a send that never reached the server and keeps the drafts', async () => {
    actions.sendReviewDrafts.mockRejectedValue(new TypeError('Failed to fetch'))
    mount([row()])
    await act(async () => { await api.send('') })
    expect(api.drafts).toHaveLength(1)
    await waitFor(() => expect(actions.reportReviewSendFailure).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [SERVER_ID],
      drafts: [expect.objectContaining({ proposedText: 'Server text' })],
    })))
  })

  it('does not send while a draft has not reached the server', async () => {
    setOnline(false)
    mount()
    act(() => api.saveDraft(caption, 'Offline edit'))
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await api.send('') })
    expect(actions.sendReviewDrafts).not.toHaveBeenCalled()
    expect(outcome?.ok).toBe(false)
    expect(api.drafts).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.test.tsx'`
Expected: FAIL: `serverSync` is not a prop, `flush` and `send` are undefined.

- [ ] **Step 4: Rewrite the provider**

Replace the whole of `src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.tsx` with:

```tsx
'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react'
import { editDraftPiecePrefix } from '@/lib/portal/edit-drafts'
import { readLocalDrafts, removeLocalDraft, writeLocalDraft, type LocalScope } from '@/lib/portal/review-drafts-local'
import {
  DRAFT_AUTOSAVE_DELAY_MS, DRAFT_STATUS_TEXT, deriveSyncState, draftIdentity, localEntryToDraft,
  reconcileDrafts, serverRowToDraft, type DraftDiscardReason, type DraftIdentityParts,
  type DraftSyncState, type DraftTargetKind, type DurableDraft, type LocalDraftEntry, type ServerDraftRow,
} from '@/lib/portal/review-drafts-core'
import { discardReviewDraft, reportReviewSendFailure, saveReviewDraft, sendReviewDrafts } from '../../draft-actions'
import { sendReviewBundle } from '../../request-actions'

// Unsent review drafts (spec 2026-10-03 section 6). With serverSync on, every edit autosaves to the
// server a few seconds after typing stops and on blur, hide and reconnect; the browser copy is the
// offline buffer; the two are reconciled once per page load (newest wins, nothing silently lost).
// With serverSync off (the admin "View as Maria" preview), drafts stay in this browser as before.

export type ReviewTargetKind = DraftTargetKind
export type ReviewTarget = {
  kind: ReviewTargetKind
  key: string
  label: string
  currentText?: string
  urlSnapshot?: string | null
  // 'frame:3' or 'page:2' for a note on one frame or page of a visual; '' or absent otherwise.
  anchor?: string
  anchorLabel?: string | null
}
export type ReviewDraft = DurableDraft & { currentText?: string }
export type SendOutcome = { ok: boolean; message: string }

type PendingOp =
  | { op: 'save' }
  | { op: 'discard'; reason: DraftDiscardReason; savedAt: string; draft: DurableDraft }
type FailureReport = Parameters<typeof reportReviewSendFailure>[0]

type ReviewDraftContextValue = {
  drafts: ReviewDraft[]
  currentDrafts: ReviewDraft[]
  carriedDrafts: ReviewDraft[]
  readDraft: (target: ReviewTarget) => ReviewDraft | null
  saveDraft: (target: ReviewTarget, proposedText: string, quotedText?: string | null) => void
  removeDraft: (target: ReviewTarget) => void
  keepCarriedDraft: (draft: ReviewDraft) => void
  clearDrafts: () => void
  flush: () => Promise<boolean>
  send: (note: string) => Promise<SendOutcome>
  syncState: DraftSyncState
  statusText: string | null
  sendError: string | null
  serverSync: boolean
  storageAvailable: boolean
  ready: boolean
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null)

function nextSavedAt(previous?: string | null): string {
  const before = previous ? Date.parse(previous) : 0
  return new Date(Math.max(Date.now(), (Number.isNaN(before) ? 0 : before) + 1)).toISOString()
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export default function ReviewDraftProvider({
  children,
  draftScope,
  slug,
  contentId,
  version,
  serverSync = false,
  initialServerDrafts = null,
}: {
  children: React.ReactNode
  draftScope: string
  slug: string
  contentId: string
  version: number
  serverSync?: boolean
  initialServerDrafts?: ServerDraftRow[] | null
}) {
  const storeRef = useRef<Record<string, ReviewDraft>>({})
  const targetsRef = useRef<Record<string, ReviewTarget>>({})
  const pendingRef = useRef<Map<string, PendingOp>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const sendKeyRef = useRef<string | null>(null)
  const failureReportRef = useRef<FailureReport | null>(null)
  const [revision, bump] = useReducer((count: number) => count + 1, 0)
  const [pendingCount, setPendingCount] = useState(0)
  const [inFlight, setInFlight] = useState(false)
  const [online, setOnline] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [ready, setReady] = useState(false)

  const scope = useMemo<LocalScope>(() => ({ scope: draftScope, slug, contentId }), [contentId, draftScope, slug])
  const piecePrefix = useMemo(() => editDraftPiecePrefix(draftScope, slug, contentId), [contentId, draftScope, slug])

  const withStorage = useCallback((write: (storage: Storage) => void) => {
    try { write(window.localStorage) } catch { setStorageAvailable(false) }
  }, [])

  const putDraft = useCallback((draft: ReviewDraft) => {
    storeRef.current = { ...storeRef.current, [draftIdentity(draft)]: draft }
    withStorage((storage) => writeLocalDraft(storage, scope, draft))
    bump()
  }, [scope, withStorage])

  const dropDraft = useCallback((draft: DraftIdentityParts) => {
    const next = { ...storeRef.current }
    delete next[draftIdentity(draft)]
    storeRef.current = next
    withStorage((storage) => removeLocalDraft(storage, piecePrefix, draft))
    bump()
  }, [piecePrefix, withStorage])

  const pushOne = useCallback(async (id: string, op: PendingOp): Promise<'ok' | 'retry' | 'give_up'> => {
    try {
      if (op.op === 'discard') {
        const result = await discardReviewDraft({
          slug, contentId, targetKind: op.draft.kind, targetKey: op.draft.key, anchor: op.draft.anchor,
          reason: op.reason, savedAt: op.savedAt,
        })
        if ('error' in result) return result.retryable ? 'retry' : 'give_up'
        // Another device saved newer text after this one was discarded: newest wins, it comes back.
        if (result.outcome === 'stale' && result.draft) putDraft(serverRowToDraft(result.draft, version))
        return 'ok'
      }
      const draft = storeRef.current[id]
      if (!draft) return 'ok'
      const result = await saveReviewDraft({
        slug, contentId, baseVersion: draft.baseVersion, targetKind: draft.kind, targetKey: draft.key,
        anchor: draft.anchor, anchorLabel: draft.anchorLabel, targetLabel: draft.label,
        urlSnapshot: draft.urlSnapshot, quotedText: draft.quotedText, body: draft.proposedText,
        savedAt: draft.savedAt,
      })
      if ('error' in result) return result.retryable ? 'retry' : 'give_up'
      if (!result.draft) return 'retry'
      if (result.outcome === 'stale') {
        putDraft(serverRowToDraft(result.draft, version))
        return 'ok'
      }
      const latest = storeRef.current[id]
      if (latest && latest.savedAt !== draft.savedAt) {
        // She typed again while this save was in flight. Her newer text is already queued.
        storeRef.current = { ...storeRef.current, [id]: { ...latest, serverId: result.draft.id } }
        return 'ok'
      }
      putDraft({
        ...(latest ?? draft),
        serverId: result.draft.id,
        syncedAt: draft.savedAt,
        baseVersion: result.draft.base_version,
        carriedFromVersion: result.draft.base_version < version ? result.draft.base_version : null,
        sendFailedAt: result.draft.send_failed_at,
      })
      return 'ok'
    } catch {
      return 'retry'
    }
  }, [contentId, putDraft, slug, version])

  const flush = useCallback(async (): Promise<boolean> => {
    if (!serverSync) return true
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (inFlightRef.current) await inFlightRef.current
    if (!pendingRef.current.size) return true
    if (!isOnline()) { setOnline(false); return false }
    const run = (async () => {
      let ok = true
      while (ok && pendingRef.current.size) {
        const batch = [...pendingRef.current.entries()]
        pendingRef.current.clear()
        setPendingCount(0)
        for (const [id, op] of batch) {
          const outcome = await pushOne(id, op)
          if (outcome === 'retry' && !pendingRef.current.has(id)) pendingRef.current.set(id, op)
          if (outcome !== 'ok') ok = false
        }
        setPendingCount(pendingRef.current.size)
      }
      return ok
    })()
    inFlightRef.current = run
    setInFlight(true)
    try { return await run } finally { inFlightRef.current = null; setInFlight(false) }
  }, [pushOne, serverSync])

  const schedule = useCallback(() => {
    if (!serverSync) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; void flush() }, DRAFT_AUTOSAVE_DELAY_MS)
  }, [flush, serverSync])

  const markPending = useCallback((id: string, op: PendingOp) => {
    // Any change to the drafts makes a new send: a retry may reuse its key only if nothing changed.
    sendKeyRef.current = null
    if (!serverSync) return
    pendingRef.current.set(id, op)
    setPendingCount(pendingRef.current.size)
    schedule()
  }, [schedule, serverSync])

  const discardInternal = useCallback((target: DraftIdentityParts, reason: DraftDiscardReason) => {
    const id = draftIdentity(target)
    const existing = storeRef.current[id]
    if (!existing) return
    dropDraft(existing)
    markPending(id, { op: 'discard', reason, savedAt: existing.savedAt, draft: existing })
  }, [dropDraft, markPending])

  const saveDraft = useCallback((target: ReviewTarget, proposedText: string, quotedText?: string | null) => {
    const anchor = target.anchor ?? ''
    const id = draftIdentity({ kind: target.kind, key: target.key, anchor })
    targetsRef.current[id] = target
    const trimmed = proposedText.trim()
    if (!trimmed || (target.kind === 'copy_block' && anchor === '' && trimmed === target.currentText?.trim())) {
      discardInternal({ kind: target.kind, key: target.key, anchor }, trimmed ? 'reverted' : 'emptied')
      return
    }
    const existing = storeRef.current[id]
    putDraft({
      kind: target.kind,
      key: target.key,
      anchor,
      anchorLabel: target.anchorLabel ?? existing?.anchorLabel ?? null,
      label: target.label,
      urlSnapshot: target.urlSnapshot ?? null,
      currentText: target.currentText,
      proposedText,
      quotedText: quotedText ?? null,
      // Editing a carried draft is the "adjust" in spec 6.2: it now belongs to this version.
      baseVersion: version,
      carriedFromVersion: null,
      savedAt: nextSavedAt(existing?.savedAt),
      serverId: existing?.serverId ?? null,
      syncedAt: existing?.syncedAt ?? null,
      sendFailedAt: existing?.sendFailedAt ?? null,
    })
    markPending(id, { op: 'save' })
  }, [discardInternal, markPending, putDraft, version])

  const removeDraft = useCallback((target: ReviewTarget) => {
    // The caller has already asked Maria to confirm (spec 6.1).
    discardInternal({ kind: target.kind, key: target.key, anchor: target.anchor ?? '' }, 'client_discarded')
  }, [discardInternal])

  const keepCarriedDraft = useCallback((draft: ReviewDraft) => {
    const target = targetsRef.current[draftIdentity(draft)]
    saveDraft({
      kind: draft.kind, key: draft.key, label: target?.label ?? draft.label, currentText: target?.currentText,
      urlSnapshot: target?.urlSnapshot ?? draft.urlSnapshot, anchor: draft.anchor, anchorLabel: draft.anchorLabel,
    }, draft.proposedText, draft.quotedText)
  }, [saveDraft])

  const clearDrafts = useCallback(() => {
    for (const draft of Object.values(storeRef.current)) dropDraft(draft)
  }, [dropDraft])

  const readDraft = useCallback((target: ReviewTarget): ReviewDraft | null => {
    const id = draftIdentity({ kind: target.kind, key: target.key, anchor: target.anchor ?? '' })
    targetsRef.current[id] = target
    const draft = storeRef.current[id]
    return draft ? { ...draft, label: target.label, currentText: target.currentText } : null
    // `revision` gives readers a new function whenever the store changes, so restore effects rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  const deliverFailureReport = useCallback(async () => {
    const report = failureReportRef.current
    if (!report) return
    try {
      await reportReviewSendFailure(report)
      failureReportRef.current = null
    } catch {
      // Stays queued until the connection returns.
    }
  }, [])

  const send = useCallback(async (note: string): Promise<SendOutcome> => {
    const isCurrent = (draft: ReviewDraft) => draft.baseVersion === version
    if (!Object.values(storeRef.current).some(isCurrent)) {
      return { ok: false, message: 'Add at least one edit before sending.' }
    }
    if (!serverSync) {
      const current = Object.values(storeRef.current).filter(isCurrent)
      const key = sendKeyRef.current ?? (sendKeyRef.current = crypto.randomUUID())
      const result = await sendReviewBundle({
        slug, contentId, contentVersion: version, note, idempotencyKey: key,
        drafts: current.map((draft) => ({
          targetKind: draft.kind, targetKey: draft.key, targetLabel: draft.label,
          proposedText: draft.proposedText, urlSnapshot: draft.urlSnapshot,
        })),
      })
      if (result.error) {
        setSendError(result.error)
        return { ok: false, message: result.error }
      }
      for (const draft of current) dropDraft(draft)
      sendKeyRef.current = null
      setSendError(null)
      return { ok: true, message: result.success ?? 'Your edits were sent to The Dot.' }
    }

    const flushed = await flush()
    const current = Object.values(storeRef.current).filter(isCurrent)
    const fail = (message: string, report: boolean): SendOutcome => {
      const stamp = new Date().toISOString()
      const next = { ...storeRef.current }
      for (const draft of current) next[draftIdentity(draft)] = { ...draft, sendFailedAt: stamp }
      storeRef.current = next
      bump()
      setSendError(message)
      if (report) {
        failureReportRef.current = {
          slug, contentId, contentVersion: version,
          draftIds: current.flatMap((draft) => (draft.serverId ? [draft.serverId] : [])),
          drafts: current.map((draft) => ({
            targetKind: draft.kind, targetKey: draft.key, targetLabel: draft.label, proposedText: draft.proposedText,
          })),
        }
        if (isOnline()) void deliverFailureReport()
      }
      return { ok: false, message }
    }
    if (!flushed || current.some((draft) => !draft.serverId || draft.syncedAt !== draft.savedAt)) {
      return fail(isOnline() ? DRAFT_STATUS_TEXT.send_failed : DRAFT_STATUS_TEXT.offline, true)
    }
    const key = sendKeyRef.current ?? (sendKeyRef.current = crypto.randomUUID())
    let result: Awaited<ReturnType<typeof sendReviewDrafts>>
    try {
      result = await sendReviewDrafts({
        slug, contentId, contentVersion: version, note, idempotencyKey: key,
        draftIds: current.map((draft) => draft.serverId as string),
      })
    } catch {
      return fail(DRAFT_STATUS_TEXT.send_failed, true)
    }
    // The server action has already written a refusal down; the browser does not report it again.
    if (result.error) return fail(result.error, false)
    for (const draft of current) dropDraft(draft)
    sendKeyRef.current = null
    setSendError(null)
    return { ok: true, message: result.success ?? 'Your edits were sent to The Dot.' }
  }, [contentId, deliverFailureReport, dropDraft, flush, serverSync, slug, version])

  // Reconcile the browser buffer with the server once per page load.
  useEffect(() => {
    let entries: LocalDraftEntry[] = []
    try { entries = readLocalDrafts(window.localStorage, piecePrefix) } catch { setStorageAvailable(false) }
    if (!serverSync) {
      storeRef.current = Object.fromEntries(entries.filter((entry) => entry.version === version).map((entry) => {
        const draft = localEntryToDraft(entry, version)
        return [draftIdentity(draft), draft]
      }))
    } else {
      const result = reconcileDrafts(entries, initialServerDrafts ?? [], version)
      storeRef.current = result.drafts
      withStorage((storage) => {
        for (const gone of result.dropLocal) removeLocalDraft(storage, piecePrefix, gone)
        for (const draft of Object.values(result.drafts)) writeLocalDraft(storage, scope, draft)
      })
      for (const id of result.push) pendingRef.current.set(id, { op: 'save' })
      setPendingCount(pendingRef.current.size)
      if (pendingRef.current.size) schedule()
    }
    bump()
    setReady(true)
    // Mount only: the server snapshot and the browser buffer are reconciled once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!serverSync) return
    setOnline(isOnline())
    const goOnline = () => { setOnline(true); void flush(); void deliverFailureReport() }
    const goOffline = () => setOnline(false)
    const hide = () => { if (document.visibilityState === 'hidden') void flush() }
    const leave = () => { void flush() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leave)
    }
  }, [deliverFailureReport, flush, serverSync])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const drafts = useMemo(() => Object.values(storeRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision])
  const currentDrafts = useMemo(() => drafts.filter((draft) => draft.baseVersion === version), [drafts, version])
  const carriedDrafts = useMemo(() => drafts.filter((draft) => draft.baseVersion < version), [drafts, version])
  const syncState = deriveSyncState({
    draftCount: drafts.length, pending: pendingCount, inFlight, online, sendFailed: sendError !== null,
  })
  const statusText = serverSync && syncState !== 'idle' ? DRAFT_STATUS_TEXT[syncState] : null

  const value = useMemo<ReviewDraftContextValue>(() => ({
    drafts, currentDrafts, carriedDrafts, readDraft, saveDraft, removeDraft, keepCarriedDraft, clearDrafts,
    flush, send, syncState, statusText, sendError, serverSync, storageAvailable, ready,
  }), [carriedDrafts, clearDrafts, currentDrafts, drafts, flush, keepCarriedDraft, readDraft, ready, removeDraft,
    saveDraft, send, sendError, serverSync, statusText, storageAvailable, syncState])

  return <ReviewDraftContext.Provider value={value}>{children}</ReviewDraftContext.Provider>
}

export function useReviewDrafts(): ReviewDraftContextValue {
  const value = useContext(ReviewDraftContext)
  if (!value) throw new Error('Review edit controls must be inside ReviewDraftProvider')
  return value
}
```

- [ ] **Step 5: Run the provider tests and the existing component tests**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/'`
Expected: `ReviewDraftProvider.test.tsx` PASS (15 tests). `ReviewVerdict.test.tsx` still imports `sendReviewBundle` directly in the component, so it still passes against the unchanged component; `SuggestEditForm.test.tsx` and `ReviewAssets.test.tsx` PASS (their localStorage keys are unchanged).

If the "offline" test reports `Saving…` instead of the offline line, the provider's `online` state was not lowered: check that `flush` calls `setOnline(false)` before returning when `navigator.onLine` is false.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add 'src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.tsx' \
  'src/app/client/[slug]/piece/[contentId]/ReviewDraftProvider.test.tsx' \
  'src/app/client/[slug]/piece/[contentId]/ReviewVerdict.test.tsx' \
  'src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx' \
  'src/app/client/[slug]/piece/[contentId]/ReviewAssets.test.tsx'
git -C ~/worktrees/kanset-durable-drafts commit -m "Sync review drafts to the server with a browser buffer, carry-over and retry"
```

---

### Task 9: Wire the client page (minimum UI so no draft can be stranded)

**Files:**
- Modify: `src/app/client/[slug]/piece/[contentId]/page.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/PieceReviewScreen.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/SuggestEditForm.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/ReviewVerdict.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/ReviewVerdict.test.tsx`

Plan 4 replaces these surfaces with the redesigned editor and decision bar. Plan 3 adds only what the durable drafts need to be usable and safe: the status line, flush on blur, a confirm step on discard, Keep and Discard for carried drafts, and Retry.

- [ ] **Step 1: Write the failing component tests**

In `SuggestEditForm.test.tsx`, add `import { act } from '@testing-library/react'` to the testing-library import (`import { act, fireEvent, render, screen } from '@testing-library/react'`), replace the two `vi.mock(...)` calls added in Task 8 with this hoisted version so the test can control the save action:

```ts
const draftActions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => draftActions)
vi.mock('../../request-actions', () => ({ sendReviewBundle: vi.fn() }))
```

and append inside `describe('SuggestEditForm draft recovery', ...)`:

```tsx
  it('asks before discarding a saved edit', () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A rewrite to throw away.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard edit' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    expect(screen.getByDisplayValue('A rewrite to throw away.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByDisplayValue('A rewrite to throw away.')).not.toBeInTheDocument()
  })

  it('saves to the server when the editor loses focus', async () => {
    draftActions.saveReviewDraft.mockImplementation(async (input: { body: string; savedAt: string }) => ({
      outcome: 'saved', draft: { id: '11111111-1111-4111-8111-111111111111', base_version: 3, saved_at: input.savedAt,
        send_failed_at: null } }))
    render(<ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}
      serverSync initialServerDrafts={[]}>
      <SuggestEditForm targetKind="copy_block" targetKey="article-body"
        targetLabel="Article body" currentText="Current article." />
    </ReviewDraftProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    const field = screen.getByLabelText('Edit Article body')
    fireEvent.change(field, { target: { value: 'Saved on blur.' } })
    await act(async () => { fireEvent.blur(field) })
    expect(draftActions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ body: 'Saved on blur.' }))
    expect(await screen.findByText('Saved · not sent yet')).toBeVisible()
  })

  it('marks an edit written against the previous version and lets her keep it', async () => {
    draftActions.saveReviewDraft.mockImplementation(async (input: { body: string; savedAt: string; baseVersion: number }) => ({
      outcome: 'saved', draft: { id: '11111111-1111-4111-8111-111111111111', base_version: input.baseVersion,
        saved_at: input.savedAt, send_failed_at: null } }))
    render(<ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}
      serverSync initialServerDrafts={[{
        id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 2,
        target_kind: 'copy_block', target_key: 'article-body', anchor: '', anchor_label: null,
        target_label: 'Article body', url_snapshot: null, quoted_text: null, body: 'Written on version 2.',
        status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
        carried_over_at: '2026-10-03T11:00:00.000Z', carried_over_to_version: 3, send_failed_at: null, last_send_error: null,
      }]}>
      <SuggestEditForm targetKind="copy_block" targetKey="article-body"
        targetLabel="Article body" currentText="Current article." />
    </ReviewDraftProvider>)
    expect(await screen.findByText(/Written against version 2/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep this edit' }))
    expect(screen.queryByText(/Written against version 2/)).not.toBeInTheDocument()
  })
```

In `ReviewVerdict.test.tsx`, replace the `vi.mock('../../draft-actions', ...)` call added in Task 8 with a hoisted handle:

```ts
const draftActions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => draftActions)
```

and append inside `describe('ReviewVerdict resolver', ...)`:

```tsx
  function serverSubject(rows: Array<Record<string, unknown>>) {
    return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={4}
      serverSync initialServerDrafts={rows as never}>
      <ReviewVerdict slug="kanset" contentId="piece" contentVersion={4} isPublished={false} needsReview
        packageReady missing={[]} sentEdits={[]} revisionStarted={false} canDecide />
    </ReviewDraftProvider>
  }
  const serverRow = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 4,
    target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null, target_label: 'Instagram caption',
    url_snapshot: null, quoted_text: null, body: 'Saved on the server', status: 'unsent',
    saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z', carried_over_at: null,
    carried_over_to_version: null, send_failed_at: null, last_send_error: null, ...overrides,
  })

  it('blocks approval while a carried edit waits, and asks before discarding it', () => {
    render(serverSubject([serverRow({ base_version: 3, carried_over_at: '2026-10-03T11:00:00.000Z', carried_over_to_version: 4 })]))
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
    expect(screen.getByText('Written against the previous version')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByRole('button', { name: 'Approve package' })).toBeVisible()
  })

  it('offers a retry and keeps the edit when sending fails', async () => {
    draftActions.sendReviewDrafts.mockResolvedValue({ error: 'Your edits could not be sent. They are still saved, and we have your text.' })
    render(serverSubject([serverRow()]))
    fireEvent.click(screen.getByRole('button', { name: 'Send my edits (1)' }))
    expect(await screen.findByText('Your edits could not be sent. They are still saved, and we have your text.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry sending (1)' })).toBeVisible()
    expect(screen.getByText("Couldn't send. Retry")).toBeVisible()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx' 'src/app/client/[slug]/piece/[contentId]/ReviewVerdict.test.tsx'`
Expected: FAIL on the five new tests (no confirm step, no blur save, no carried note, no carried list, no retry label).

- [ ] **Step 3: Update `SuggestEditForm.tsx`**

Replace the whole file with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Text, Textarea } from '@thedot/design-system'
import { DRAFT_STATUS_TEXT } from '@/lib/portal/review-drafts-core'
import { useReviewDrafts, type ReviewTarget } from './ReviewDraftProvider'
import styles from './piece-review.module.css'

export default function SuggestEditForm({
  targetKind,
  targetKey,
  targetLabel,
  currentText,
  urlSnapshot,
  selectedText,
  openSignal = 0,
}: {
  targetKind: ReviewTarget['kind']
  targetKey: string
  targetLabel: string
  currentText?: string
  urlSnapshot?: string | null
  selectedText?: string | null
  openSignal?: number
}) {
  const target = useMemo<ReviewTarget>(() => ({
    kind: targetKind,
    key: targetKey,
    label: targetLabel,
    currentText,
    urlSnapshot,
  }), [currentText, targetKey, targetKind, targetLabel, urlSnapshot])
  const {
    readDraft, saveDraft, removeDraft, keepCarriedDraft, flush, storageAvailable, serverSync, statusText, ready,
  } = useReviewDrafts()
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [value, setValue] = useState(currentText ?? '')
  const [quote, setQuote] = useState<string | null>(null)
  const restoredRef = useRef(false)
  const draft = loaded ? readDraft(target) : null

  useEffect(() => {
    if (!ready) return
    const restored = readDraft(target)
    if (restored) {
      setValue((current) => (current === restored.proposedText ? current : restored.proposedText))
      setQuote(restored.quotedText ?? null)
      // Open a restored draft once, on load; never reopen an editor she closed.
      if (!restoredRef.current) setOpen(true)
    }
    restoredRef.current = true
    setLoaded(true)
  }, [readDraft, ready, target])

  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    if (selectedText) setQuote(selectedText)
  }, [openSignal, selectedText])

  function update(next: string) {
    setValue(next)
    saveDraft(target, next, quote)
  }

  function discard() {
    removeDraft(target)
    setValue(currentText ?? '')
    setQuote(null)
    setConfirmingDiscard(false)
    setOpen(false)
  }

  function reviewAndSend() {
    setOpen(false)
    void flush()
    document.getElementById('review-decision')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!open) {
    return <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
      {targetKind === 'copy_block' ? 'Suggest edit' : 'Request a change'}
    </Button>
  }

  const fieldLabel = targetKind === 'copy_block'
    ? `Edit ${targetLabel}`
    : `What should change in ${targetLabel}?`
  const status = serverSync
    ? (draft ? statusText ?? DRAFT_STATUS_TEXT.saved : 'Your edits save automatically and stay unsent until you send them.')
    : (draft
      ? 'Draft saved in this browser. It has not been sent yet.'
      : 'Make a change here. Your draft will stay in this browser until you send all edits.')
  return <div className={styles.editComposer}>
    {quote && <div className={styles.selectionQuote}>
      <span>Selected text</span>
      <blockquote>{quote}</blockquote>
    </div>}
    {draft?.carriedFromVersion != null && <div className={styles.verdictStatus}>
      <Text as="div" size="sm" tone="graphite">
        Written against version {draft.carriedFromVersion}. Compare it with the current text before you send.
      </Text>
      <Button as="button" type="button" variant="ghost" size="sm" onClick={() => keepCarriedDraft(draft)}>
        Keep this edit
      </Button>
    </div>}
    <Textarea id={`review-edit-${targetKind}-${targetKey}`} label={fieldLabel}
      rows={targetKind === 'copy_block' ? 18 : 4} maxLength={50000}
      value={value} onChange={(event) => update(event.target.value)} onBlur={() => { void flush() }}
      placeholder={targetKind === 'copy_block' ? undefined : 'Describe the visual change'} />
    <Text as="div" size="sm" tone="grey">
      {status}
      {!storageAvailable && !serverSync ? ' Browser storage is unavailable, so keep this tab open.' : ''}
    </Text>
    {confirmingDiscard
      ? <div className={styles.editComposerActions}>
        <Text as="span" size="sm" tone="graphite">Discard this edit? It cannot be recovered.</Text>
        <Button as="button" type="button" variant="black" size="sm" onClick={discard}>Yes, discard</Button>
        <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirmingDiscard(false)}>
          Keep editing
        </Button>
      </div>
      : <div className={styles.editComposerActions}>
        {draft && <Button as="button" type="button" variant="ghost" size="sm"
          onClick={() => setConfirmingDiscard(true)}>Discard edit</Button>}
        <Button as="button" type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); void flush() }}>
          {draft ? 'Save and close' : 'Close editor'}
        </Button>
        {draft && <Button as="button" type="button" variant="black" size="sm" onClick={reviewAndSend}>
          Review and send edits
        </Button>}
      </div>}
  </div>
}
```

- [ ] **Step 4: Update `ReviewVerdict.tsx`**

Replace the imports and the body down to (not including) `if (isPublished) return null` with:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button, Heading, Text, Textarea } from '@thedot/design-system'
import { draftIdentity } from '@/lib/portal/review-drafts-core'
import { decide } from '../../actions'
import { useReviewDrafts } from './ReviewDraftProvider'
import CopyBlock from './CopyBlock'
import styles from './piece-review.module.css'

export type SentEditSummary = { id: string; label: string; status: string; proposedText: string }

export default function ReviewVerdict({
  slug,
  contentId,
  contentVersion,
  isPublished,
  needsReview,
  packageReady,
  missing,
  sentEdits,
  revisionStarted,
  canDecide,
}: {
  slug: string
  contentId: string
  contentVersion: number
  isPublished: boolean
  needsReview: boolean
  packageReady: boolean
  missing: string[]
  sentEdits: SentEditSummary[]
  revisionStarted: boolean
  canDecide: boolean
}) {
  const {
    drafts, currentDrafts, carriedDrafts, ready, send, statusText, sendError, keepCarriedDraft, removeDraft,
  } = useReviewDrafts()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hasSent = sentEdits.length > 0
  // contentVersion is still passed by PieceReviewScreen; the provider owns the version since 0093.
  void contentVersion

  function sendEdits() {
    setMessage(null)
    startTransition(async () => {
      const result = await send(note)
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.message })
        return
      }
      setNote('')
      setMessage({ kind: 'success', text: result.message })
    })
  }

  function approve() {
    setMessage(null)
    startTransition(async () => {
      const form = new FormData()
      form.set('slug', slug)
      form.set('contentId', contentId)
      form.set('decision', 'approved')
      form.set('note', note)
      const result = await decide(form)
      if (result?.error) setMessage({ kind: 'error', text: result.error })
    })
  }
```

Then, in the JSX, replace the block that starts `{ready && drafts.length > 0 && !revisionStarted && <>` and ends with its closing `</>}` (the one containing `bundle-note`) with:

```tsx
    {ready && drafts.length > 0 && !revisionStarted && <>
      <Text tone="graphite">You changed {drafts.length} {drafts.length === 1 ? 'block' : 'blocks'}, so this version cannot be approved as is.</Text>
      {currentDrafts.length > 0 && <ul className={styles.draftSummary}>
        {currentDrafts.map((draft) => <li key={draftIdentity(draft)}>
          {draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label}
        </li>)}
      </ul>}
      {carriedDrafts.length > 0 && <div className={styles.verdictStatus}>
        <strong>Written against the previous version</strong>
        <p>Keep an edit to send it with this version, or discard it.</p>
        <ul>{carriedDrafts.map((draft) => {
          const id = draftIdentity(draft)
          return <li key={id}>
            {draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label} (version {draft.carriedFromVersion}){' '}
            {confirmingDiscard === id
              ? <>
                <span>Discard this edit? It cannot be recovered.</span>{' '}
                <Button as="button" type="button" variant="black" size="sm"
                  onClick={() => { removeDraft(draft); setConfirmingDiscard(null) }}>Yes, discard</Button>{' '}
                <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirmingDiscard(null)}>Cancel</Button>
              </>
              : <>
                <Button as="button" type="button" variant="ghost" size="sm" onClick={() => keepCarriedDraft(draft)}>Keep</Button>{' '}
                <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirmingDiscard(id)}>Discard</Button>
              </>}
          </li>
        })}</ul>
      </div>}
      <Textarea id="bundle-note" label="Anything else about this version? (optional)" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
      {currentDrafts.length > 0 && <Button as="button" type="button" variant="black" disabled={pending} onClick={sendEdits}>
        {pending ? 'Sending…'
          : sendError ? `Retry sending (${currentDrafts.length})`
          : hasSent ? `Send additional edits (${currentDrafts.length})`
          : `Send my edits (${currentDrafts.length})`}
      </Button>}
      {statusText && <Text tone="grey">{statusText}</Text>}
    </>}
```

The tray at the top (`{drafts.length} unsent ... saved` and "Review and send"), the sent-edits block, the incomplete-package block, the approve block (still gated on `drafts.length === 0`) and the message line stay as they are.

- [ ] **Step 5: Pass server drafts from the page**

In `PieceReviewScreen.tsx`, add the import after `import ReviewDraftProvider from './ReviewDraftProvider'`:

```tsx
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
```

add `serverDrafts = null,` after `showReviewIntro,` in the destructured props, and `serverDrafts?: ServerDraftRow[] | null` after `showReviewIntro: boolean` in the props type. Replace:

```tsx
      <ReviewDraftProvider draftScope={draftScope} slug={slug} contentId={item.content_id} version={item.version}>
```

with:

```tsx
      <ReviewDraftProvider draftScope={draftScope} slug={slug} contentId={item.content_id} version={item.version}
        serverSync={Array.isArray(serverDrafts)} initialServerDrafts={serverDrafts}>
```

The admin "View as Maria" preview does not pass `serverDrafts`, so it stays browser-only and read-only.

In `page.tsx`, add the import:

```tsx
import { getMyReviewDrafts } from '@/lib/portal/review-drafts'
```

replace

```tsx
  const [comments, schedule, publication, requests, reviewAssets, acknowledgment] = await Promise.all([
```

with

```tsx
  const [comments, schedule, publication, requests, reviewAssets, acknowledgment, serverDrafts] = await Promise.all([
```

add as the last element of that `Promise.all` array (after the `portal_announcement_acknowledgments` query):

```tsx
    // A seat that cannot send edits has no drafts to sync. null keeps the page browser-only.
    session.canSubmitRequests ? getMyReviewDrafts(item.id) : Promise.resolve(null),
```

and pass `serverDrafts={serverDrafts}` to `<PieceReviewScreen ... />` after `showReviewIntro={!acknowledgment.data}`.

- [ ] **Step 6: Run the piece folder suite**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/'`
Expected: PASS, including the five new tests and every existing test in the folder (the browser-only path still sends through `sendReviewBundle`, which the existing "clears drafts only after a confirmed bundle send" test asserts).

- [ ] **Step 7: Type check the touched files**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E "piece/\[contentId\]|draft-actions|review-drafts|refusal-log|edit-drafts" || echo clean`
Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add 'src/app/client/[slug]/piece/[contentId]/page.tsx' \
  'src/app/client/[slug]/piece/[contentId]/PieceReviewScreen.tsx' \
  'src/app/client/[slug]/piece/[contentId]/SuggestEditForm.tsx' \
  'src/app/client/[slug]/piece/[contentId]/SuggestEditForm.test.tsx' \
  'src/app/client/[slug]/piece/[contentId]/ReviewVerdict.tsx' \
  'src/app/client/[slug]/piece/[contentId]/ReviewVerdict.test.tsx'
git -C ~/worktrees/kanset-durable-drafts commit -m "Show draft sync status, confirm discards and keep carried edits on the piece page"
```

---

### Task 10: Keep draft housekeeping out of the client feed

**Files:**
- Modify: `src/lib/portal/data.ts`

- [ ] **Step 1: Extend the exclusion list**

Append these three names to the `CLIENT_FEED_EXCLUDED_EVENTS` array (after `'agency_draft_archived'`, or after `'review_preview_deleted'` if plan 2 has landed) and add the comment line above the constant:

```ts
// 'review_drafts_carried_over', 'review_send_failed' and 'review_send_retry_succeeded' (0093) are
// agency signals about her drafts. She sees the carried edit and the failed send on the piece page
// itself; a feed line would only repeat it.
```

```ts
  'review_drafts_carried_over', 'review_send_failed', 'review_send_retry_succeeded']
```

(the closing `]` moves to the end of this new line).

- [ ] **Step 2: Run the unit suite**

Run: `pnpm test`
Expected: all suites pass.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add src/lib/portal/data.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Keep review draft events out of the client feed"
```

Note for reviewers: `portal_activity_notify` (0078) enqueues an in-app row for every activity. `review_drafts_carried_over` and `review_send_retry_succeeded` are written as `agent`, so they go to the client's in-app queue, which no client surface renders, and none of the three is in `portal_client_activity_email_required`, so nothing reaches Maria. `review_send_failed` is written as `client`, so it goes to the agency (email + in-app): decision 1.

---

### Task 11: Real-JWT RLS and behaviour tests

**Files:**
- Modify: `scripts/test-rls.ts`

These run only against the disposable local stack (the script refuses the production host and any non-loopback host). A dedicated drafts seat is created so the existing seats' hourly edit budget (20 per hour, `portal_consume_request_rate_limit`) is not consumed.

- [ ] **Step 1: Insert the DR block**

In `scripts/test-rls.ts`, find the block that starts the tenant kill-switch test (unique text `p_reason: 'Exercise emergency tenant stop'`). Insert the block below immediately **before** the `    {` line that opens that block, i.e. after the closing `    }` of the block before it (the 0088 long-form block, or plan 2's 0092 block if it has landed):

```ts

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
      const failedActivity = await admin.from('activity_log').select('id, actor_type')
        .eq('client_id', bClientId).eq('event_key', `review-send-failed:${attemptId}`)
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
      const retryActivity = await admin.from('activity_log').select('id')
        .eq('client_id', bClientId).eq('event_type', 'review_send_retry_succeeded').eq('content_id', sendItemId)
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
      const carryActivity = await admin.from('activity_log').select('id')
        .eq('client_id', bClientId).eq('event_type', 'review_drafts_carried_over').eq('content_id', carryItemId)
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
      const failureEvent = ((inboxRead.data ?? []) as Array<{ seq: number; event_type: string; object_id: string }>)
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

      // Amended 2026-10-03: carry-over and retry success are agency_internal, so they queue no
      // notification row at all; a refused send may notify the agency but never the client.
      const housekeeping = await admin.from('activity_log').select('id, event_type')
        .eq('client_id', bClientId).in('event_type', ['review_drafts_carried_over', 'review_send_retry_succeeded'])
        .in('content_id', [sendItemId, carryItemId])
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
```

- [ ] **Step 2: Run against a fresh local database**

```bash
cd ~/worktrees/kanset-durable-drafts && supabase db reset && pnpm test:rls:seed-local \
  && pnpm test:rls 2>&1 | tee "$TMPDIR/kanset-rls-0093.log" | grep -E "^(FAIL|PASS  DR)|SUMMARY"
```

Expected: `PASS  DR1` through `PASS  DR17`, no `FAIL` lines, and `=== SUMMARY: ALL ASSERTIONS PASSED ===`. If a pre-existing check fails, compare against a run on the base commit before blaming this slice. Fixture adjustments are allowed (for example a different `source_commit_sha` if `mark_content_ready` refuses v2); weakening a guard to make a test pass is not. Delete `$TMPDIR/kanset-rls-0093.log` after recording the summary in the review handoff.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-durable-drafts add scripts/test-rls.ts
git -C ~/worktrees/kanset-durable-drafts commit -m "Prove durable review drafts with real JWTs: isolation, send, carry-over, failures, alerts"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify: `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` (workspace doc, outside git)

- [ ] **Step 1: Manual, migration ledger**

In `docs/PORTAL-AGENT-MANUAL.md`, after the ledger row for the newest migration (`0092_review_media_previews` if plan 2 landed, otherwise `0081_unified_piece_review_bundles`), add:

```markdown
| `0093_durable_review_drafts` | n/a | Client review drafts autosave to `content_review_drafts` (one unsent draft per seat, piece, target and frame or page; seat-only RLS; RPC-only writes; agency read-only). `send_review_drafts` composes them into the 0081 bundle in one transaction and marks them sent; a release carries unsent drafts forward (`review_drafts_carried_over` activity + inbox event); a refused send writes `client_request_failures` (new reasons `drafts_changed`, `network_unreachable`), a `review_send_failed` activity (agency email) and inbox event, and marks the drafts failed; a later send resolves it (`review_send_retry_succeeded`). `ack_portal_inbox` lets the cursor past a `review_send_failed` event once its failure rows are resolved. Carry-over and retry success are `activity_event_types.agency_internal` (shared with 0092), so they queue no notification. `agency_unsent_review_draft_alerts` lists unsent drafts older than 24 hours on unposted pieces due within 3 days. |
```

- [ ] **Step 2: Manual, recipe**

In section 18, after the paragraph that starts with `**Attach a podcast review asset:**` (or after plan 2's `**Attach a review preview` paragraph if present), add:

```markdown
**Maria's unsent drafts (durable since 0093):** her edits autosave to the portal per seat, piece and
version; nothing about them reaches you until she sends, except three signals: a refused send
(`review_send_failed`, inbox + email to the agency, her text is in `client_request_failures`), drafts
carried over by a new release (`review_drafts_carried_over`, inbox only), and the unsent-draft alert
(`agency_unsent_review_draft_alerts`, read with `getUnsentDraftAlerts` in
`src/lib/portal/review-drafts.ts`). Read a piece's drafts read-only with `getAgencyReviewDrafts`.
Never write `content_review_drafts` directly; there is no agency write path by design. Applying her
text from a refused send follows the normal request route; resolving the failure row by hand is only
for a refusal no send will ever retry. Until its failure rows are resolved, a `review_send_failed`
event holds the inbox cursor (it requires reconciliation), so resolve them once her text is handled.
```

- [ ] **Step 3: Playbook, which commands email Maria**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`, section 9 table "Which commands email Maria, and which are portal-only", after the row `` | `portal-write review-asset` | no | `` add:

```markdown
| Maria's draft autosave, carry-over on a release, a refused send | no. A refused send emails the agency, never Maria |
```

This file is mirrored to Notion under the Kanset job hub; update its Notion twin with the same row if one exists.

- [ ] **Step 4: Commit the manual**

```bash
git -C ~/worktrees/kanset-durable-drafts add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-durable-drafts commit -m "Document durable review drafts in the portal manual"
```

---

### Task 13: Full verification and freeze

**Files:** none changed.

- [ ] **Step 1: Run everything once**

```bash
cd ~/worktrees/kanset-durable-drafts
pnpm test
pnpm exec tsc --noEmit -p . 2>&1 | grep -E "piece/\[contentId\]|draft-actions|review-drafts|refusal-log|edit-drafts|data\.ts" || echo "clean for this slice"
pnpm exec next build
```

Expected: vitest all green; `clean for this slice`; `next build` succeeds. Remove `.next/` afterwards if disk is tight (`rm -rf ~/worktrees/kanset-durable-drafts/.next`).

- [ ] **Step 2: Phone-width smoke on the local stack (one check, then stop)**

Plan 4 owns the real-JWT phone-width checks of the redesigned page. Here, confirm only that the existing page still loads and autosaves for a seeded local seat at 375 px: start `pnpm exec next dev` against the local stack env from Task 0 step 3, sign in as the seeded local client through the existing magic-link flow, open a released piece, type in one block, wait 3 seconds, reload on a second browser profile and see the draft restored. Stop the dev server immediately afterwards (`Ctrl+C`); no dev server may be left running.

- [ ] **Step 3: Freeze**

```bash
git -C ~/worktrees/kanset-durable-drafts rev-parse HEAD
```

Record the printed hash: it is the frozen commit for review (playbook section 12, step 2). Stop the local stack (`supabase stop`) unless Task 14 needs it.

---

### Task 14: Review and rollout (needs Anastasia; not done by the executing agent alone)

**Files:** none changed.

- [ ] **Step 1: Code-review pass on the frozen hash** with the `code-review` skill (no Codex lane), migration first (manual section 15, tier 1). Hand over: the hash, the replay outputs from Task 1 steps 2 to 4, and the `test:rls` summary from Task 11 step 2. Fix findings in new commits, rerun Tasks 11 and 13, and freeze a new hash.
- [ ] **Step 2: Anastasia's go-ahead.** Show her the frozen hash, the review outcome and the `test:rls` summary. Nothing below touches production until she says go.
- [ ] **Step 3: Apply 0093 to production** through the same runbook used for 0090 to 0092 (manual section 15, tier 1: back up first, apply in order, capture the migration output and `select public.assert_portal_security()`). Plan 2's 0092 must already be live, or this file is 0092 per the renumber rule. The migration must be live before any code that queries `content_review_drafts` deploys (playbook section 12, step 4).
- [ ] **Step 4: Deploy by pushing the production branch.** Production deploys from `feat/portal-audit-fixes-2026-09-15` (verified 2026-09-30 when ac03a60 deployed); there is no direct `vercel --prod` step.

```bash
git -C ~/thedot-site status --short | grep -v '^??' || echo "tracked tree clean"
git -C ~/thedot-site checkout feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site pull --ff-only origin feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site merge --ff-only feat/piece-page-durable-drafts
git -C ~/thedot-site rev-parse HEAD
git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15
```

Expected: `tracked tree clean`, and the printed HEAD is the reviewed frozen hash. If the fast-forward fails because the production branch moved, rebase `feat/piece-page-durable-drafts` onto it, rerun Tasks 11 and 13, re-review the new hash, get the go-ahead again, then repeat.
- [ ] **Step 5: Verify the deployment.** Watch the Vercel deployment for the pushed commit reach Ready and confirm its commit is the frozen hash. Then, read-only: `select public.assert_portal_security()` succeeds; `select count(*) from public.content_review_drafts` returns a number (the table exists); in Maria's live portal nothing changes visibly until she edits. Use the preview seat (`toodokie@gmail.com`, admin-minted link per the "test the portal as a client seat" rule), never Maria's account, to type one edit on a released piece, reload on a second device and see it restored, then discard it with the confirm step. `scripts/portal-notification-audit.ts kanset --days 1` shows no new client notification rows from this slice.
- [ ] **Step 6: Clean up**

```bash
git -C ~/thedot-site worktree remove ~/worktrees/kanset-durable-drafts
git -C ~/thedot-site branch -d feat/piece-page-durable-drafts
```

Cleanup condition met: no worktree, no `.next` build output, no dev server, no browser process left by this slice; the local Supabase stack is stopped.

---

## Self-review

**Spec coverage**
- 6.1 server-side autosave per seat, per piece, per version, restored on any device: table + `save_review_draft` (Task 1), debounced autosave and flush on blur, hide and reconnect (Task 8), page loads the seat's drafts (Task 9), restore on a second device proven in provider tests and DR1.
- 6.1 automatic, no Save button, status "Saving…", "Saved · not sent yet", "Saved on this phone · will sync when online": `DRAFT_STATUS_TEXT` and `deriveSyncState` (Task 3), rendered in the editor and verdict (Task 9), tested (Tasks 3, 8, 9).
- 6.1 local storage stays as offline buffer; reconcile on load, latest `saved_at` wins per block, never silently delete: Tasks 2 to 4 and 8; the only removal of a browser copy is one the server already sent or discarded later (tested).
- 6.1 a draft leaves only when sent or explicitly discarded with a confirm step: `send_review_drafts` and `discard_review_draft` (Task 1), confirm steps (Task 9), rows kept as `sent` or `discarded` (decision 5), DR7 and DR14.
- 6.2 drafts survive a new version, marked with their original base version: carry-over trigger (Task 1), `carriedDrafts` and Keep (Tasks 8, 9), DR12 and DR13; plan 4 renders the side-by-side view.
- 6.3 a refused send keeps drafts unsent, records the failure (0089), raises it in Agency Ops, offers Retry: Tasks 1, 5, 6, 8, 9; DR9 and DR10; network failures reported on reconnect (`reportReviewSendFailure`).
- 3 contract: one atomic bundle (the unchanged 0081 function inside one transaction), no per-block send, all current drafts required (`drafts_changed`), Approve only with no drafts (carried included), unsent state explicit, revision started still hides editing (unchanged `canEditBlocks` and verdict gates).
- 8 agency: send failures immediately (activity + inbox + agency email), unsent drafts older than 24 hours on a piece due within 3 days (`agency_unsent_review_draft_alerts`, `getUnsentDraftAlerts`, `unsentDraftAlertLine`), carried drafts (inbox), activity log for carry-over, send failure and retry success (carry-over and retry success queue no notification, DR17; a send failure never freezes the inbox cursor, DR16). Plan 5 renders them.
- 12 tests: unit (Tasks 2 to 7), provider (Task 8), component (Task 9), real-JWT RLS (Task 11), migration replay fresh and upgrade (Task 1).

- Brief item "RPCs to upsert, list, discard and mark-sent": upsert, discard and send are RPCs; "list" is a plain RLS-scoped select (`getMyReviewDrafts`, proven by DR1), which needs no definer code; mark-sent happens inside `send_review_drafts` in the same transaction as the bundle, so it cannot drift from a successful submit.
- Reconcile key: the spec says "latest updated_at wins"; this plan compares `saved_at`, the time the words were typed on the device (clamped to 5 minutes ahead of the server), because `updated_at` also moves on agency-side bookkeeping such as marking a send failed.

**Placeholder scan:** every code step carries its code; the only conditional instructions are the migration renumber rule and the insertion anchor in `test-rls.ts`, both with exact text.

**Type consistency:** `ServerDraftRow`, `LocalDraftEntry`, `DurableDraft`, `DraftIdentityParts`, `DraftDiscardReason`, `DraftSyncState`, `UnsentDraftAlert` are defined in Task 3 and used unchanged in Tasks 4, 6 to 9. Server action names and inputs (`saveReviewDraft`, `discardReviewDraft`, `sendReviewDrafts`, `reportReviewSendFailure`) match between Task 6, the provider (Task 8) and the mocks. RPC names and parameter lists in TypeScript match the SQL signatures (`save_review_draft` 11 parameters, `discard_review_draft` 6, `send_review_drafts` 5, `agency_record_review_send_failure(p_attempt_id, p_draft_ids)`, `agency_unsent_review_draft_alerts(p_now)`). `SERVER_DRAFT_COLUMNS` lists exactly the columns 0093 grants to `authenticated`.

**Known risks for the executor**
- `begin_content_revision` followed by `mark_content_ready` on v2 is the release path DR12 relies on; if a release rule refuses the fixture, adjust only the fixture (commit sha, ledger), never the guard.
- `portal_normalize_client_copy` runs inside the bundle; if it changes the composed asset text, DR7's exact string comparison shows the diff. Fix the composition, not the normaliser.
- The provider reconciles once per page load. Two devices editing the same block at the same time converge on the newest save, and the older device adopts the newer text at its next save (the `stale` answer); a merge of the two texts is out of scope.
- `reportReviewSendFailure` has no rate limit; only a seat with `can_submit_requests` can call it. If abuse ever shows up, add it to `portal_consume_request_rate_limit`.

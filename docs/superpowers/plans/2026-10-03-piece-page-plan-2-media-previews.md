# Piece Page Plan 2 of 5: Media Previews Implementation Plan

**Approved by Anastasia 2026-10-03** ("aok"). Not built yet.

> **Amended 2026-10-03 (cross-review from plan 5).** (1) Preview housekeeping no longer queues a notification. Both `review_preview_uploaded` (actor `'anastasia'`) and `review_preview_deleted` (actor `'agent'`) used to enqueue a client `in_app` row addressed to Maria through `portal_activity_notify` (0078) and `portal_notification_recipient()` (0015), which sends every non-client actor to the client; she never saw them, but `scripts/portal-notification-audit.ts` counted them. No `actor_type` value avoids that (`'client'` emails the agency instead), so Task 1 now adds `activity_event_types.agency_internal`, re-creates `portal_activity_notify` as 0078's body plus an early return for flagged types, flags both preview event types, and asserts all of it. The block is shared verbatim with plan 3's migration and safe to run twice, so either plan may land first. (2) Task 12 gains `RT5`, proving no notification row (client or agency) is created by preview uploads or deletions. (3) Task 15's deploy no longer uses the display-plane recipe or pushes a feature branch: frozen commit, `code-review` skill pass, Anastasia's go-ahead, apply 0092, fast-forward and push `feat/portal-audit-fixes-2026-09-15`, verify the Vercel deployment for that commit, clean up (now steps 2 to 7).

> **Amended 2026-10-03 (media guard).** Anastasia approved a release guard so no agent can put a version in front of Maria with nothing to look at. New tasks carry letter suffixes so no existing task moves; run them where they sit. **Task 1a** adds to 0092 a database check in `mark_content_ready` (the one promotion behind `portal-admin ready`, `update-portal --re-share` and `--quiet`, `portal-write applied-release` and `supersede`) and in `record_content_courtesy_release` (`portal-write courtesy-release`): a version with no review asset, no portal preview and no design link is refused unless an override for that exact version is on file. The override is recorded only by `agency_record_release_media_override`, its reason must start `Approved by Anastasia:`, and it writes a `release_media_override` activity row flagged `agency_internal` (no notification for anyone), shown in Ops by plan 5. There is no silent exemption: formats with nothing to preview use the override too. **Task 1b** keeps the existing fixtures releasing (a fixture-only wrapper in `scripts/test-rls.ts`, design links in `seed-rls-local.ts` and `update-portal-harness.ts`). **Task 9a** adds the friendly pre-check, which names what is missing, and the explicit `--no-media "<reason>"` flag (payload `noMediaReason`) to `portal-admin ready`, `update-portal --re-share`, `portal-write courtesy-release` / `applied-release` / `supersede` and `portal-ship`; `update-portal` exits 6. **Task 11a** keeps the override out of Maria's feed. **Task 12a** adds RM1 to RM6 (real JWT: refusal without media, success with each kind of media, success with a valid override, refusal without the prefix, no notification rows, no client access). **Task 13a** documents it and adds a read-only rollout query that Task 15 step 4 now runs.

> **Amended 2026-10-04 (agency_internal rows hidden at the database).** `act_read` (0001) let a client seat read every activity row of its tenant with its own JWT, including a no-media override's reason. 0092 now re-creates `act_read` with the tenant condition plus `event_type not in (select public.portal_agency_internal_event_types())` (a definer helper, since seats cannot read `activity_event_types`), adds the service-only reader `agency_internal_activity(p_client_id, p_content_item_id)` for the agency, and folds `assert_agency_internal_activity_security()` into `assert_portal_security()`. Plan 3's 0093 flags its own housekeeping types `agency_internal`, so its tests must read those rows through the same reader, not through a client seat.

> **Amended 2026-10-04 (copy revisions carry the review media forward, Anastasia).** When a new version exists only because the words changed (applying Maria's copy edits, an agency copy re-share, a quiet supersession, an applied release, the agency sync that bumps the working version), it now inherits the previous version's media. Every one of those paths creates the snapshot in one place, the `version_inserted` branch of `portal_core_evaluate_content_item_version` (reached through `sync_content_item_versions`); `begin_content_revision`, `begin_content_request_revision`, `record_agency_applied_release`, `record_agency_supersession` and `supersede_content_request_with_released_version` only move pointers. 0092 rewrites that branch (drift-guarded, grants unchanged) to copy the old working version's `content_review_assets` rows (0081's insert-select) and its live `content_review_previews` rows (same object prefix and paths, new version number), both `on conflict do nothing`. `begin_visual_request_revision` is unchanged. Retention needs no change: the drain already skips any path a current preview's prefix covers, so retiring the superseded row leaves the shared objects. `assert_copy_revision_media_carry_security()` joins the fold, and `RC1` to `RC4` in `scripts/test-rls.ts` prove the carry, the guard passing without an override, the seat reading the new preview, and the objects surviving retirement. **Copy-only changes only (final review, 2026-10-04, Anastasia's decision "carry forward for copy-only changes"):** both inserts run only when `portal_on_screen_copy_unchanged(previous copy_blocks, new copy_blocks)` is true, meaning every block whose key is in the on-screen key set (the nine keys of `ON_SCREEN_TEXT_BLOCK_KEYS` in `src/lib/portal/on-screen-text-rule.ts`, including `reel-script`, `on-screen-copy` and `carousel-copy`) has the same body on both versions and none was added or removed. If the on-screen words changed, the render must have changed, so the new version carries nothing and the media guard refuses its release (`release_media_missing`) until fresh media is attached; otherwise Maria could approve new on-screen words while looking at the old video, the 2026-10-02 failure. Caption, YouTube and other block changes still carry. `RC5` (reel-script changed: no carried asset or preview, release refused) and `RC6` (caption-only: carries and releases) prove it, the assertion checks both inserts call the comparison and spot-checks its verdicts, a unit test keeps the SQL key list equal to the TypeScript one, and 0092 now sets `lock_timeout = '5s'` after `begin`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host private, short-lived, client-scoped previews of each piece's final render (MP4 plus frame or page images) in Supabase Storage, so the redesigned piece page (plan 4) can play and page through media inline instead of sending Maria to Drive.

**Architecture:** A new private bucket `portal-review-previews` with **no** `storage.objects` policy for any client role (the same fail-closed model migration 0009 uses for publication evidence, and the existing `assert_portal_security()` fold already forbids such policies). Access control lives on a new metadata table `content_review_previews` whose RLS lets only the owning client seat read the row for the released version; the server reads the row with the seat's own JWT and only then signs the object paths with the service role for 10 minutes. Uploads go through a new agency command `portal-write review-preview` (content-addressed object paths, size and duration limits, podcast full episodes refused in the database). Retention is a database function that retires previews (live on every destination, planned date more than 7 days past, superseded version, archived piece) into a removal queue that the app drains against Storage; it runs after every publication confirmation and nightly from a Vercel cron. Every upload and every completed deletion writes an activity row that the client feed excludes and that queues no notification for anyone (the event types are flagged `agency_internal`, amended 2026-10-03).

**Tech Stack:** Supabase Postgres 15 (migration 0092, SECURITY DEFINER RPCs, RLS), Supabase Storage (`@supabase/supabase-js` 2.110), Next.js 15 route handlers, Vercel Cron, Vitest + Testing Library, `scripts/test-rls.ts` (real-JWT, disposable local stack), ffmpeg/ffprobe on Anastasia's Mac for the upload command.

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md`, section 7 (media previews), section 4.2 (media area: frame strip, horizontal episodes play the trailer only), section 8 (activity log records preview upload and deletion), section 12 (RLS and retention tests).


> **Deploy correction 2026-10-04 (overrides every deploy step below).** Pushing `feat/portal-audit-fixes-2026-09-15` builds a Vercel **Preview only**; production is NOT deployed by a push (found when plan 1 shipped: commit a942714 built as Preview, production unchanged). Production deploys with the Vercel CLI from the clean frozen checkout: `cp -R ~/thedot-site/.vercel <worktree>/.vercel && cd <worktree> && npx vercel --prod --yes`, after the push so git and production match. Agents cannot run the push or the deploy (Claude Code's auto-mode blocks production deploys): hand Anastasia both commands, then confirm the new `target: production` deployment is READY (Vercel `list_deployments`) and verify live with a browser user agent (plain curl gets 403).

---

## Ground rules for whoever executes this

- **Drive stays the master and the delivery copy.** A preview is a separate, temporary, portal-hosted copy made from the same local render file Anastasia delivers to Drive. This plan never creates, shares, edits or guesses a Drive link, and never replaces a `drive_url` or a `content_review_assets.url`. The CLAUDE.md rule "Anastasia supplies every Google Drive link that goes into the portal" is unchanged: when no preview exists the page falls back to the Drive button exactly as today (spec 7).
- **Nothing here is client-visible yet.** No page imports the new component or readers in this plan; plan 4 wires them. The upload command emails nobody (Maria's `client_alerts` switch is off since 2026-09-21, and these event types are not in `portal_client_activity_email_required` anyway).
- **Visual craft gate still applies to real pieces.** Uploading a preview for a real Kanset piece is a portal write; do it only for renders Anastasia has already approved (CLAUDE.md "visual work is reviewed by Anastasia before the portal"). The tests in this plan use synthetic fixtures only.
- **Playbook section 12 governs this build:** one editor owns the slice, frozen commit for review, unit tests + build + real-JWT RLS tests, migration applied before any code that queries it, a code-review pass (the `code-review` skill) on the frozen migration hash before production (no Codex lane, Anastasia 2026-09-21), push the reviewed branch.
- **Host-resource discipline (CLAUDE.md):** one worktree, removed after the reviewed branch is pushed and production is verified; the local Supabase stack is the only disposable database; run the full `next build` once, in Task 14; no dev server left running.
- **`.env.local` points at production.** Every database command in this plan runs with the local-stack override from Task 0, step 3. `scripts/test-rls.ts` refuses the production host by construction; keep it that way.
- **No em dashes** in any file this plan creates (Kanset hard rule).
- **Migration number:** this plan assumes `0092` is the next free number (latest on disk is `0091_statcan_research_source_host.sql`). If another plan in this series lands a migration first, rename the file to the next free number and change the `0092` mentions inside it; nothing else depends on the number.

## Supabase plan and limits (confirm before rollout)

- Storage pricing, verified 2026-10-03 (from the spec): **Free plan 1 GB included; Pro plan 100 GB included, then $0.0213 per GB-month.**
- Expected footprint: about 3 previewed pieces a week at 20 to 40 MB per reel plus about 3 MB of frames, held only while under review (typically under 2 weeks, hard ceiling planned date + 7 days). Steady state is well under 1 GB.
- **Confirmed by Anastasia 2026-10-03: the production project (organization "The Dot Creative Agency") is on the Free plan** (1 GB storage, 5 GB egress a month, 50 MB per-file upload cap). Previews auto-delete, so storage stays well under 1 GB; reels are 1 to 15 MB, so egress from Maria's reviews is small. Still to read in the dashboard before Task 15: which plan the production project `ltotkkpytvtcgelrgdkg` is on; the project's global "upload file size limit" (the bucket's 50 MiB limit cannot exceed it); and the plan's egress allowance, since each inline play of a reel downloads the MP4 again.
- The bucket limit (50 MiB per object) equals the local stack's `[storage] file_size_limit = "50MiB"` in `supabase/config.toml`, so local and production behave the same.

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0092_review_media_previews.sql` | Create | Bucket, `content_review_previews`, removal queue + trigger, register/retire/pending/complete RPCs, activity event types, `assert_review_preview_security()`, fold into `assert_portal_security()` |
| `src/lib/portal/review-preview-core.ts` | Create | Pure, browser-safe: bucket name, limits, TTL, path builders, content types, row/signed types, `signReviewPreview` |
| `src/lib/portal/review-preview-core.test.ts` | Create | Unit tests for the core |
| `src/lib/portal/review-preview-retention.ts` | Create | `retireReviewPreviews`, `drainReviewPreviewRemovals`, `runPreviewRetention`, `purgePreviewsAfterPublication` |
| `src/lib/portal/review-preview-retention.test.ts` | Create | Unit tests with a fake Supabase client |
| `src/lib/portal/review-preview-upload.ts` | Create | Payload parsing, hashing, ffprobe/ffmpeg tools, upload + register, cleanup on failure |
| `src/lib/portal/review-preview-upload.test.ts` | Create | Unit tests with fake tools and a fake Supabase client |
| `src/lib/portal/review-previews.ts` | Create | Server-only readers: client (RLS read, then sign) and agency (service role) |
| `src/lib/portal/review-previews.test.ts` | Create | Reader tests with mocked Supabase factories |
| `src/app/api/client/[slug]/review-previews/[previewId]/route.ts` | Create | Client refresh endpoint returning fresh signed links |
| `src/app/api/client/[slug]/review-previews/[previewId]/route.test.ts` | Create | Route tests |
| `src/app/api/admin/portal/review-previews/[previewId]/route.ts` | Create | Agency refresh endpoint |
| `src/app/api/admin/portal/review-previews/[previewId]/route.test.ts` | Create | Route tests |
| `src/app/api/cron/portal-preview-retention/route.ts` | Create | Nightly retention sweep |
| `src/app/api/cron/portal-preview-retention/route.test.ts` | Create | Cron auth + call tests |
| `vercel.json` | Modify | Register the nightly cron |
| `src/components/portal/ReviewPreviewMedia.tsx` | Create | Minimal `<video>` with poster + 4-across frame grid / page grid, one link refresh per expiry |
| `src/components/portal/ReviewPreviewMedia.module.css` | Create | Styles on existing The Dot tokens |
| `src/components/portal/ReviewPreviewMedia.test.tsx` | Create | Component tests |
| `scripts/portal-write.ts` | Modify | New `review-preview` command; preview purge after `publication-confirm` |
| `src/app/api/admin/portal/operation/route.ts` | Modify | Preview purge after the admin UI confirms a publication live |
| `src/lib/portal/data.ts` | Modify | Exclude the two new event types from the client activity feed |
| `scripts/test-rls.ts` | Modify | RP1 to RP12 (isolation, privacy, guards) and RT1 to RT4 (retention) against the local stack |
| `docs/PORTAL-AGENT-MANUAL.md` | Modify | Ledger row for 0092, recipe "Attach a review preview", env/cron note |
| `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` | Modify (workspace doc, not in git) | Section 9 table row: `review-preview` emails nobody |
| `supabase/migrations/0092_review_media_previews.sql` (Task 1a) | Modify | Release media guard: `content_release_media_overrides`, `agency_release_media_status`, `agency_record_release_media_override`, `portal_assert_release_media` inside `mark_content_ready` and `record_content_courtesy_release`, `assert_release_media_guard_security()` in the fold |
| `scripts/seed-rls-local.ts`, `scripts/update-portal-harness.ts` (Task 1b) | Modify | Fixtures carry a design link so they still release |
| `src/lib/portal/release-media-guard.ts` (+ `.test.ts`, `release-media-wiring.test.ts`) (Task 9a) | Create | Shared pre-check, refusal message, `--no-media` reason rule, override recording |
| `scripts/portal-admin.ts`, `scripts/update-portal.ts`, `scripts/portal-ship.ts` (Task 9a) | Modify | Pre-check and `--no-media "Approved by Anastasia: <why>"` on every release path |

---

### Task 0: Workspace and local database

**Files:** none changed.

- [ ] **Step 1: Create the one worktree for this slice**

The working checkout is on `feat/portal-audit-fixes-2026-09-15` with unrelated local changes (`.gitignore`, `.pnpm-store/`, `.tmp-portal-session/`). Branch from the commit that contains 0091.

```bash
git -C ~/thedot-site log --oneline -1 -- supabase/migrations/0091_statcan_research_source_host.sql
git -C ~/thedot-site worktree add ~/worktrees/kanset-media-previews -b feat/piece-page-media-previews ac03a60
cd ~/worktrees/kanset-media-previews && pnpm install --frozen-lockfile
```

Expected: the log line shows `ac03a60 Accept Statistics Canada as a reviewed research source`; the worktree is created; install finishes without lockfile changes. If `ac03a60` is no longer the newest commit carrying the latest migration, use the hash the first command prints.

Cleanup condition: remove this worktree in Task 15 after the reviewed branch is pushed and production is verified (`git -C ~/thedot-site worktree remove ~/worktrees/kanset-media-previews`).

- [ ] **Step 2: Start the local stack and replay every migration**

```bash
cd ~/worktrees/kanset-media-previews && supabase start && supabase db reset
```

Expected: `Finished supabase db reset on branch ...` with no `ERROR`. This proves 0001 to 0091 replay cleanly before you add anything.

- [ ] **Step 3: Export the provably-local environment for this shell**

Run this in every new shell before any `pnpm test:rls`, `pnpm portal-write` or `tsx` command in this plan:

```bash
cd ~/worktrees/kanset-media-previews
eval "$(supabase status -o env | awk -F= '
  /^API_URL=/{print "export NEXT_PUBLIC_SUPABASE_URL=" $2}
  /^ANON_KEY=/{print "export NEXT_PUBLIC_SUPABASE_ANON_KEY=" $2}
  /^SERVICE_ROLE_KEY=/{print "export SUPABASE_SERVICE_ROLE_KEY=" $2}')"
node -e 'const u=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); if(!["127.0.0.1","localhost"].includes(u.hostname)) {console.error("NOT LOCAL", u.hostname); process.exit(1)} console.log("local", u.host)'
```

Expected: `local 127.0.0.1:54321`. `@next/env` does not override variables already set in the process, so `.env.local` (production) is ignored by every script while these are exported.

---

### Task 1: Migration 0092, review previews schema and security

**Files:**
- Create: `supabase/migrations/0092_review_media_previews.sql`

The in-migration assertion is the failing test here: it runs at the end of the migration and the migration aborts if any grant, policy, bucket setting or guard is wrong. The behavioural tests (RLS, storage privacy, retention) come in Task 12.

- [ ] **Step 1: Write the migration**

Before writing it, confirm the trigger body this migration re-creates is still 0078's: `grep -l "function public.portal_activity_notify" supabase/migrations/*.sql | tail -1` must print `0078_agency_piece_edit_digests.sql` (or plan 3's `0093_durable_review_drafts.sql` / `0092_durable_review_drafts.sql`, whose block is identical). If any other file prints, merge its extra conditions into the `portal_activity_notify` body below, and make the same change in plan 3's copy.

Create `supabase/migrations/0092_review_media_previews.sql` with exactly this content:

```sql
-- Portal-hosted review previews (piece page redesign, spec 2026-10-03 section 7).
--
-- Maria cannot see what she approves. Videos, carousels and PDFs are buttons that open Drive, and
-- Drive video playback has failed for her since about 2026-09-07. On 2026-10-02 she approved a
-- reel's copy without seeing its on-screen text. The fix is to play the final render inside the
-- portal.
--
-- Drive stays the master and the delivery copy. A preview is a temporary second copy of the same
-- local render, uploaded by the agency for one exact content version, read through short-lived
-- signed links and deleted again once the piece is live everywhere or its planned date is more
-- than 7 days past. Anastasia still supplies every Drive link; nothing here creates or changes one.
--
-- Security model, the same fail-closed shape 0009 uses for publication evidence:
--   * The bucket is private and storage.objects gets NO policy for anon or authenticated. The
--     cumulative assertion already refuses any such policy, because policies are OR-combined and
--     one broad policy would expose every private bucket.
--   * Access is decided on the metadata row instead. content_review_previews has RLS: a client
--     seat reads only its own tenant's rows, only for the released version of a visible,
--     unarchived piece. The server reads the row with the seat's own JWT and only then signs the
--     object paths with the service role.
--   * All writes are SECURITY DEFINER RPCs callable by service_role only.
--
-- Full podcast episodes are never uploaded (spec 7): videos are capped at 240 seconds and a
-- podcast-format piece accepts only a teaser, trailer or cut key.
--
-- Deleting a preview row (retention, replacement, or a cascade from a removed version) queues its
-- object paths in content_review_preview_removals. Postgres cannot delete Storage objects itself,
-- so the app drains the queue through the Storage API and completes each removal, which writes the
-- 'review_preview_deleted' activity row. Uploads write 'review_preview_uploaded'. Both are agency
-- housekeeping: excluded from the client feed in src/lib/portal/data.ts, and flagged
-- agency_internal so portal_activity_notify queues no in-app row or email for anyone.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.content_publication_targets') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_slice89_security()') is null
     or pg_catalog.to_regprocedure('public.assert_archive_unreleased_draft_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0092 requires review assets (0073), publication targets (0009) and the 0090 security fold';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type has a foreign key to activity_event_types (0008); without these rows the
-- first upload would roll back (the lesson 0084 and 0090 record).
insert into public.activity_event_types (event_type)
values ('review_preview_uploaded'), ('review_preview_deleted')
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

update public.activity_event_types set agency_internal = true
  where event_type in ('review_preview_uploaded', 'review_preview_deleted');

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('portal-review-previews', 'portal-review-previews', false, 52428800,
      array['video/mp4','image/jpeg','image/png','image/webp']::text[])
    on conflict (id) do update set public = false, file_size_limit = 52428800,
      allowed_mime_types = excluded.allowed_mime_types;
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.roles && array['public','anon','authenticated']::name[]
    ) then
      raise exception 'review existing authenticated storage.objects policies before creating the review preview bucket';
    end if;
  end if;
end;
$$;

create function public.portal_review_preview_path_valid(p_path text, p_prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null and p_prefix is not null
    and pg_catalog.starts_with(p_path, p_prefix)
    and p_path <> p_prefix
    and pg_catalog.char_length(p_path) <= 300
    and p_path ~ '^[a-z0-9/_.-]+$'
    and pg_catalog.strpos(p_path, '..') = 0
$$;
revoke all on function public.portal_review_preview_path_valid(text, text)
  from public, anon, authenticated, service_role;

create table public.content_review_previews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  preview_key text not null check (preview_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- Optional link to the review asset this render previews (0073). The asset row carries the
  -- Drive or Canva link Anastasia supplied; the preview never replaces it.
  review_asset_key text,
  media_kind text not null check (media_kind in ('video','pages')),
  object_prefix text not null check (pg_catalog.char_length(object_prefix) between 1 and 300),
  video_path text,
  poster_path text,
  frames jsonb not null default '[]'::jsonb,
  width_px int not null check (width_px between 100 and 10000),
  height_px int not null check (height_px between 100 and 10000),
  duration_seconds numeric(7,2)
    check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 240)),
  byte_total bigint not null check (byte_total between 1 and 138412032),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, content_item_id, content_version, preview_key),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  foreign key (client_id, content_item_id, content_version, review_asset_key)
    references public.content_review_assets(client_id, content_item_id, content_version, asset_key)
    on delete set null (review_asset_key),
  check (pg_catalog.jsonb_typeof(frames) = 'array' and pg_catalog.jsonb_array_length(frames) <= 40),
  check (
    (media_kind = 'video' and video_path is not null and poster_path is not null
      and duration_seconds is not null)
    or (media_kind = 'pages' and video_path is null and poster_path is null
      and duration_seconds is null and pg_catalog.jsonb_array_length(frames) >= 1)
  )
);

alter table public.content_review_previews enable row level security;
create policy content_review_previews_client_read on public.content_review_previews
  for select to authenticated
  using (
    content_review_previews.client_id in (select public.my_client_ids())
    and exists (
      select 1 from public.content_items ci
      where ci.id = content_review_previews.content_item_id
        and ci.client_id = content_review_previews.client_id
        and ci.client_visible
        and ci.archived_at is null
        and ci.client_visible_version = content_review_previews.content_version
    )
  );

revoke all on public.content_review_previews from public, anon, authenticated, service_role;
grant select (
  id, client_id, content_item_id, content_version, preview_key, review_asset_key, media_kind,
  object_prefix, video_path, poster_path, frames, width_px, height_px, duration_seconds, created_at
) on public.content_review_previews to authenticated;
grant select on public.content_review_previews to service_role;

-- Removal queue. No foreign keys on purpose: a row must survive the cascade that created it (a
-- discarded version, a deleted client) until its Storage objects are actually gone.
create table public.content_review_preview_removals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  content_item_id uuid not null,
  content_version int not null,
  preview_key text not null,
  preview_id uuid not null,
  object_paths text[] not null check (pg_catalog.cardinality(object_paths) between 1 and 42),
  reason text not null check (reason in (
    'live_everywhere','planned_date_past','superseded','archived','replaced','cascade'
  )),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 500),
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);
create index content_review_preview_removals_pending
  on public.content_review_preview_removals (created_at) where completed_at is null;

alter table public.content_review_preview_removals enable row level security;
-- Deliberately no policies: agency-only. service_role bypasses RLS; client roles get nothing.
revoke all on public.content_review_preview_removals from public, anon, authenticated, service_role;
grant select on public.content_review_preview_removals to service_role;

create function public.portal_review_preview_queue_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := coalesce(
    nullif(pg_catalog.current_setting('portal.review_preview_removal_reason', true), ''),
    'cascade'
  );
  v_paths text[];
begin
  if v_reason not in ('live_everywhere','planned_date_past','superseded','archived','replaced','cascade') then
    v_reason := 'cascade';
  end if;
  select pg_catalog.array_remove(array[old.video_path, old.poster_path], null)
      || coalesce(pg_catalog.array_agg(f.value->>'path' order by f.ordinality), array[]::text[])
    into v_paths
  from pg_catalog.jsonb_array_elements(old.frames) with ordinality as f(value, ordinality);
  if pg_catalog.cardinality(v_paths) > 0 then
    insert into public.content_review_preview_removals (
      client_id, content_item_id, content_version, preview_key, preview_id, object_paths, reason
    ) values (
      old.client_id, old.content_item_id, old.content_version, old.preview_key, old.id, v_paths, v_reason
    );
  end if;
  return old;
end;
$$;
revoke all on function public.portal_review_preview_queue_removal()
  from public, anon, authenticated, service_role;
create trigger content_review_previews_queue_removal
  after delete on public.content_review_previews
  for each row execute function public.portal_review_preview_queue_removal();

create function public.agency_register_review_preview(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
  p_preview_key text,
  p_review_asset_key text,
  p_media_kind text,
  p_object_prefix text,
  p_video_path text,
  p_poster_path text,
  p_frames jsonb,
  p_width_px int,
  p_height_px int,
  p_duration_seconds numeric,
  p_byte_total bigint,
  p_source_sha256 text,
  p_actor_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_preview_key));
  v_asset_key text := nullif(pg_catalog.lower(pg_catalog.btrim(p_review_asset_key)), '');
  v_format text;
  v_title text;
  v_prefix text;
  v_path text;
  v_frame jsonb;
  v_existing public.content_review_previews%rowtype;
  v_outcome text := 'registered';
  v_id uuid;
  v_count int;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if v_item.archived_at is not null then raise exception 'archived pieces take no previews'; end if;
  if p_content_version is null or p_content_version not in (
    v_item.working_version, coalesce(v_item.client_visible_version, v_item.working_version)
  ) then
    raise exception 'preview version is not the current working or released version';
  end if;
  select cv.format, cv.title into v_format, v_title
  from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = p_client_id and cv.version = p_content_version;
  if not found then raise exception 'content version not found'; end if;

  if v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception 'invalid preview key'; end if;
  if v_asset_key is not null and not exists (
    select 1 from public.content_review_assets a
    where a.client_id = p_client_id and a.content_item_id = v_item.id
      and a.content_version = p_content_version and a.asset_key = v_asset_key
  ) then
    raise exception 'review asset % is not attached to this version', v_asset_key;
  end if;
  if p_media_kind is null or p_media_kind not in ('video','pages') then
    raise exception 'invalid preview media kind';
  end if;
  if p_media_kind = 'video' and v_format = 'podcast'
     and not (v_key = 'social-teaser' or v_key ~ '^(teaser|trailer|cut)([_-][a-z0-9_-]*)?$') then
    raise exception 'full podcast episodes are not uploaded as previews; upload the teaser or a cut';
  end if;
  if p_media_kind = 'video' and (
    p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 240
  ) then
    raise exception 'preview video must be longer than 0 and at most 240 seconds; full episodes are never uploaded';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid source checksum';
  end if;

  v_prefix := p_client_id::text || '/' || v_item.id::text || '/v' || p_content_version::text
    || '/' || v_key || '/' || pg_catalog.left(p_source_sha256, 16) || '/';
  if p_object_prefix is distinct from v_prefix then
    raise exception 'object prefix does not match this preview';
  end if;
  if p_media_kind = 'video' and (p_video_path is null or p_poster_path is null) then
    raise exception 'a video preview needs a video and a poster';
  end if;
  if p_media_kind = 'pages' and (
    p_video_path is not null or p_poster_path is not null or p_duration_seconds is not null
  ) then
    raise exception 'a page preview has no video, poster or duration';
  end if;
  foreach v_path in array pg_catalog.array_remove(array[p_video_path, p_poster_path], null) loop
    if not public.portal_review_preview_path_valid(v_path, v_prefix) then
      raise exception 'invalid preview object path';
    end if;
  end loop;
  if p_frames is null or pg_catalog.jsonb_typeof(p_frames) <> 'array'
     or pg_catalog.jsonb_array_length(p_frames) > 40 then
    raise exception 'invalid preview frames';
  end if;
  if p_media_kind = 'pages' and pg_catalog.jsonb_array_length(p_frames) = 0 then
    raise exception 'a page preview needs at least one page';
  end if;
  for v_frame in select f.value from pg_catalog.jsonb_array_elements(p_frames) f loop
    if pg_catalog.jsonb_typeof(v_frame) <> 'object'
       or not public.portal_review_preview_path_valid(v_frame->>'path', v_prefix)
       or (v_frame->>'label') is null
       or pg_catalog.char_length(v_frame->>'label') not between 1 and 80
       or (v_frame->>'label') ~ '[[:cntrl:]]' then
      raise exception 'invalid preview frame';
    end if;
  end loop;
  if p_width_px is null or p_height_px is null
     or p_width_px not between 100 and 10000 or p_height_px not between 100 and 10000 then
    raise exception 'invalid preview dimensions';
  end if;
  if p_byte_total is null or p_byte_total not between 1 and 138412032 then
    raise exception 'preview exceeds the size limit';
  end if;

  select * into v_existing from public.content_review_previews p
    where p.client_id = p_client_id and p.content_item_id = v_item.id
      and p.content_version = p_content_version and p.preview_key = v_key
    for update;
  if found then
    if v_existing.source_sha256 = p_source_sha256 then
      return pg_catalog.jsonb_build_object(
        'preview_id', v_existing.id, 'outcome', 'unchanged', 'object_prefix', v_existing.object_prefix);
    end if;
    perform pg_catalog.set_config('portal.review_preview_removal_reason', 'replaced', true);
    delete from public.content_review_previews where id = v_existing.id;
    perform pg_catalog.set_config('portal.review_preview_removal_reason', '', true);
    v_outcome := 'replaced';
  end if;

  insert into public.content_review_previews (
    client_id, content_item_id, content_version, preview_key, review_asset_key, media_kind,
    object_prefix, video_path, poster_path, frames, width_px, height_px, duration_seconds,
    byte_total, source_sha256
  ) values (
    p_client_id, v_item.id, p_content_version, v_key, v_asset_key, p_media_kind,
    v_prefix, p_video_path, p_poster_path, p_frames, p_width_px, p_height_px, p_duration_seconds,
    p_byte_total, p_source_sha256
  ) returning id into v_id;

  v_count := pg_catalog.jsonb_array_length(p_frames);
  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_content_version, 'review_preview_uploaded',
    'Preview uploaded: ' || coalesce(v_title, v_item.content_id),
    case when v_outcome = 'replaced' then 'Replaced the previous preview. ' else '' end
      || case when p_media_kind = 'video'
           then pg_catalog.format('Video preview for version %s with %s frames.', p_content_version, v_count)
           else pg_catalog.format('Page preview for version %s with %s pages.', p_content_version, v_count)
         end,
    'anastasia', v_actor.display_name, 'review-preview-upload:' || v_id::text);

  return pg_catalog.jsonb_build_object('preview_id', v_id, 'outcome', v_outcome, 'object_prefix', v_prefix);
end;
$$;
revoke all on function public.agency_register_review_preview(
  uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.agency_register_review_preview(
  uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text
) to service_role;

-- Retention (spec 7): a preview is retired when the piece is confirmed live on every required
-- destination, when its version is no longer working or released, when the piece is archived, or
-- when its planned date is more than 7 days past (Toronto calendar date). p_now exists so the
-- nightly sweep and the tests can ask "as of when".
create function public.agency_retire_review_previews(
  p_now timestamptz,
  p_content_item_id uuid default null
) returns table (preview_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (coalesce(p_now, pg_catalog.now()) at time zone 'America/Toronto')::date;
  v_row record;
begin
  for v_row in
    select c.id, c.reason from (
      select p.id,
        case
          when ci.archived_at is not null then 'archived'
          when ci.client_visible_version is not null
            and p.content_version <= ci.client_visible_version
            and exists (
              select 1 from public.content_publication_targets t
              where t.client_id = ci.client_id and t.content_id = ci.id
                and t.content_version = ci.client_visible_version and t.required)
            and not exists (
              select 1 from public.content_publication_targets t
              where t.client_id = ci.client_id and t.content_id = ci.id
                and t.content_version = ci.client_visible_version and t.required
                and not (t.status = 'live' and t.reconciliation_status = 'verified'))
            then 'live_everywhere'
          when p.content_version <> ci.working_version
            and p.content_version is distinct from ci.client_visible_version then 'superseded'
          when ci.planned_date is not null and ci.planned_date < v_today - 7 then 'planned_date_past'
        end as reason
      from public.content_review_previews p
      join public.content_items ci on ci.id = p.content_item_id and ci.client_id = p.client_id
      where p_content_item_id is null or p.content_item_id = p_content_item_id
    ) c
    where c.reason is not null
    order by c.id
  loop
    perform pg_catalog.set_config('portal.review_preview_removal_reason', v_row.reason, true);
    delete from public.content_review_previews where id = v_row.id;
    preview_id := v_row.id;
    reason := v_row.reason;
    return next;
  end loop;
  perform pg_catalog.set_config('portal.review_preview_removal_reason', '', true);
end;
$$;
revoke all on function public.agency_retire_review_previews(timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.agency_retire_review_previews(timestamptz, uuid) to service_role;

-- Pending removals, with any path that a CURRENT preview still uses filtered out, so an identical
-- re-upload (same content-addressed prefix) is never deleted by an older queued removal.
create function public.agency_pending_review_preview_removals(p_limit int)
returns table (id uuid, object_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
    array(
      select x.object_path from pg_catalog.unnest(r.object_paths) as x(object_path)
      where not exists (
        select 1 from public.content_review_previews p
        where pg_catalog.starts_with(x.object_path, p.object_prefix))
    )
  from public.content_review_preview_removals r
  where r.completed_at is null and r.attempts < 10
  order by r.created_at, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.agency_pending_review_preview_removals(integer)
  from public, anon, authenticated;
grant execute on function public.agency_pending_review_preview_removals(integer) to service_role;

create function public.agency_complete_review_preview_removal(
  p_removal_id uuid,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.content_review_preview_removals%rowtype;
  v_title text;
  v_summary text;
begin
  select * into v_row from public.content_review_preview_removals where id = p_removal_id for update;
  if not found then raise exception 'preview removal not found'; end if;
  if v_row.completed_at is not null then
    return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'already_completed');
  end if;
  if p_error is not null then
    update public.content_review_preview_removals
      set attempts = attempts + 1, last_error = pg_catalog.left(p_error, 500)
      where id = v_row.id;
    return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'failed');
  end if;

  update public.content_review_preview_removals
    set attempts = attempts + 1, last_error = null, completed_at = pg_catalog.now()
    where id = v_row.id;

  if exists (select 1 from public.clients c where c.id = v_row.client_id) then
    select cv.title into v_title from public.content_item_versions cv
      where cv.content_item_id = v_row.content_item_id and cv.client_id = v_row.client_id
        and cv.version = v_row.content_version;
    v_summary := case v_row.reason
      when 'live_everywhere' then 'Live on every destination, so the portal copy was deleted. Drive keeps the master.'
      when 'planned_date_past' then 'The planned date is more than 7 days past, so the portal copy was deleted. Drive keeps the master.'
      when 'superseded' then 'A newer version replaced this one, so its portal copy was deleted.'
      when 'archived' then 'The piece was archived, so its portal copy was deleted.'
      when 'replaced' then 'A new preview replaced this one.'
      else 'The version was removed, so its portal copy was deleted.'
    end;
    insert into public.activity_log (client_id, content_id, content_version, event_type,
      title, summary, actor_type, actor_name, event_key)
    values (v_row.client_id, v_row.content_item_id, v_row.content_version, 'review_preview_deleted',
      'Preview removed: ' || coalesce(v_title, v_row.preview_key), v_summary,
      'agent', 'Preview retention', 'review-preview-removed:' || v_row.id::text)
    on conflict do nothing;
  end if;
  return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'completed');
end;
$$;
revoke all on function public.agency_complete_review_preview_removal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.agency_complete_review_preview_removal(uuid, text) to service_role;

create function public.assert_review_preview_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text;
  v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_previews'::pg_catalog.regclass) then
    raise exception 'content_review_previews RLS is disabled';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_preview_removals'::pg_catalog.regclass) then
    raise exception 'content_review_preview_removals RLS is disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'content_review_previews') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_review_previews'
         and p.policyname = 'content_review_previews_client_read'
         and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[]) then
    raise exception 'content_review_previews must carry exactly the client read policy';
  end if;
  if exists (select 1 from pg_catalog.pg_policies p
             where p.schemaname = 'public' and p.tablename = 'content_review_preview_removals') then
    raise exception 'content_review_preview_removals is agency-only and takes no policies';
  end if;

  if pg_catalog.has_any_column_privilege('anon', 'public.content_review_previews', 'SELECT')
     or not pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_previews', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'DELETE')
     or pg_catalog.has_any_column_privilege('anon', 'public.content_review_preview_removals', 'SELECT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_preview_removals', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'DELETE') then
    raise exception 'review preview table privileges are unsafe';
  end if;

  if pg_catalog.to_regclass('storage.buckets') is not null then
    if not exists (
      select 1 from storage.buckets b
      where b.id = 'portal-review-previews' and b.public = false
        and b.file_size_limit = 52428800
        and b.allowed_mime_types = array['video/mp4','image/jpeg','image/png','image/webp']::text[]
    ) then
      raise exception 'review preview bucket is missing, public, or misconfigured';
    end if;
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.roles && array['public','anon','authenticated']::name[]
    ) then
      raise exception 'an authenticated storage policy could expose review previews';
    end if;
  end if;

  foreach v_fn in array array[
    'public.agency_register_review_preview(uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text)',
    'public.agency_retire_review_previews(timestamptz,uuid)',
    'public.agency_pending_review_preview_removals(integer)',
    'public.agency_complete_review_preview_removal(uuid,text)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review preview function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'review preview function grants are unsafe: %', v_fn;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.agency_register_review_preview(uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  -- The podcast refusal and the 240-second cap are what keep full episodes out of storage.
  if v_def not ilike '%full podcast episodes are not uploaded%'
     or v_def not ilike '%p_duration_seconds > 240%'
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%review_preview_uploaded%' then
    raise exception 'review preview registration guards drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_review_previews'::pg_catalog.regclass
      and t.tgname = 'content_review_previews_queue_removal' and not t.tgisinternal
  ) then
    raise exception 'review preview removal trigger is missing';
  end if;
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_preview_uploaded','review_preview_deleted')) <> 2 then
    raise exception 'review preview activity event types are missing';
  end if;
  -- Housekeeping must stay out of every notification path (amended 2026-10-03).
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_preview_uploaded','review_preview_deleted') and t.agency_internal) <> 2
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%' then
    raise exception 'review preview housekeeping would notify';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_review_preview_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_review_preview_security()', 'EXECUTE') then
    raise exception 'review preview assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_review_preview_security() from public, anon, authenticated;
grant execute on function public.assert_review_preview_security() to service_role;

select public.assert_review_preview_security();

-- Cumulative fold. 0090 made assert_portal_security() = slice89 + archive guard; that pair becomes
-- slice91 (0091 changed only an assertion already inside the fold), and the review preview
-- assertion joins it.
create or replace function public.assert_portal_slice91_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice89_security();
  perform public.assert_archive_unreleased_draft_security();
end;
$$;
revoke all on function public.assert_portal_slice91_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice91_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice91_security();
  perform public.assert_review_preview_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
```

- [ ] **Step 2: Fresh replay, 0001 to 0092**

```bash
cd ~/worktrees/kanset-media-previews && supabase db reset
```

Expected: completes with no `ERROR`. If it fails, the message names the broken guard (for example `review preview table privileges are unsafe`); fix the SQL, rerun.

- [ ] **Step 3: Upgrade replay, 0001 to 0091 then 0092 alone**

```bash
cd ~/worktrees/kanset-media-previews && supabase db reset --version 0091 && supabase migration up --local
```

Expected: the reset stops at 0091, then `Applying migration 0092_review_media_previews.sql...` and no error. This is the path production takes.

- [ ] **Step 4: Prove the fold runs the new assertion**

```bash
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{gsub(/"/,"",$2); print $2}')" -v ON_ERROR_STOP=1 \
  -c "select public.assert_portal_security();" \
  -c "select id, public, file_size_limit from storage.buckets where id = 'portal-review-previews';"
```

Expected: the assertion returns one empty row; the bucket row shows `public = f`, `file_size_limit = 52428800`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add supabase/migrations/0092_review_media_previews.sql
git -C ~/worktrees/kanset-media-previews commit -m "Add private portal review previews with retention queue (0092)"
```

---

### Task 1a: Release media guard in 0092 (amended 2026-10-03)

**Files:**
- Modify: `supabase/migrations/0092_review_media_previews.sql`

Anastasia's rule (2026-10-03): no version reaches Maria with nothing for her to look at. The database refuses every release of a version that has no review asset (0073), no portal preview (this migration) and no design link (0020 item link or a link sealed in the version), unless an override is on file for that exact version with a reason that starts `Approved by Anastasia:`. Enforcing it in the database covers every path: `mark_content_ready` is the one promotion that `portal-admin ready`, `update-portal --re-share` (and `--quiet`, through `record_agency_supersession`, 0087), `portal-write applied-release` (`record_agency_applied_release`, 0085) and `portal-write supersede` all reach, and `record_content_courtesy_release` (0043) is the one approval that does not promote. Both are rewritten in place against their live definitions with a drift guard, the 0085/0086 pattern, adding one `perform` each and changing nothing else. Formats that never carry media (an article, a text-only post) use the override as well: there is no silent exemption.

The in-migration assertion is the first failing test; behaviour is proven with real JWTs in Task 12a.

- [ ] **Step 1: Confirm the two bodies this task rewrites are still the expected ones**

```bash
cd ~/worktrees/kanset-media-previews
grep -l "function public.mark_content_ready" supabase/migrations/*.sql | tail -1
grep -l "courtesy release requires studio content or an explicit Anastasia agency override" supabase/migrations/*.sql | tail -1
```

Expected: `supabase/migrations/0081_unified_piece_review_bundles.sql` and `supabase/migrations/0086_release_gate_on_override_not_producer.sql`. If a later file prints, read its body and confirm the two anchor lines in Step 2 still appear verbatim; the drift guards refuse otherwise, so the migration cannot rewrite a body it does not recognise.

- [ ] **Step 2: Insert the guard block**

In `supabase/migrations/0092_review_media_previews.sql`, insert the block below immediately **before** the line:

```sql
-- Cumulative fold. 0090 made assert_portal_security() = slice89 + archive guard; that pair becomes
```

Block to insert:

```sql
-- ---------------------------------------------------------------------------------------------
-- Release media guard (amended 2026-10-03, Anastasia). An agent released a version to Maria with
-- nothing for her to look at. Releasing now needs, for that exact version, at least one of: a
-- review asset (0073), a portal preview (this migration) or a design link (the 0020 item link, or a
-- link sealed in the version). The only way past it is an override recorded for that exact version
-- whose reason starts "Approved by Anastasia:". Formats that never carry media use the override
-- too; there is no silent exemption.
--
-- mark_content_ready is the one promotion every release reaches (portal-admin ready, update-portal
-- --re-share, the --quiet supersession 0087, the applied release 0085), and
-- record_content_courtesy_release (0043) is the one approval that does not promote. Both get one
-- perform, rewritten against the live definition with a drift guard (the 0085/0086 pattern).
-- The override writes an agency_internal activity row: recorded, shown in Ops, never notified.

insert into public.activity_event_types (event_type)
values ('release_media_override')
on conflict (event_type) do nothing;
update public.activity_event_types set agency_internal = true
  where event_type = 'release_media_override';

create table public.content_release_media_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  reason text not null check (
    pg_catalog.starts_with(reason, 'Approved by Anastasia:')
    and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.substr(reason, 23))) >= 3
    and pg_catalog.char_length(reason) <= 500
    and reason !~ '[[:cntrl:]]'
  ),
  recorded_by_actor_id uuid not null references public.agency_actors(id),
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (client_id, content_item_id, content_version),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
alter table public.content_release_media_overrides enable row level security;
-- Deliberately no policies: agency-only. Written only by agency_record_release_media_override.
revoke all on public.content_release_media_overrides from public, anon, authenticated, service_role;
grant select on public.content_release_media_overrides to service_role;

-- What the exact version carries. Used by the guard, the CLI pre-check and the Ops alert (0095).
create function public.agency_release_media_status(p_content_item_id uuid, p_content_version int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'review_assets', (select pg_catalog.count(*)::int from public.content_review_assets a
      where a.content_item_id = p_content_item_id and a.content_version = p_content_version),
    'previews', (select pg_catalog.count(*)::int from public.content_review_previews p
      where p.content_item_id = p_content_item_id and p.content_version = p_content_version),
    'design_link', exists (
        select 1 from public.content_design_links dl
        where dl.content_item_id = p_content_item_id
          and (dl.canva_url is not null or dl.drive_url is not null))
      or exists (
        select 1 from public.content_item_versions v
        where v.content_item_id = p_content_item_id and v.version = p_content_version
          and (nullif(pg_catalog.btrim(v.canva_url), '') is not null
            or nullif(pg_catalog.btrim(v.drive_url), '') is not null)),
    'override_reason', (select o.reason from public.content_release_media_overrides o
      where o.content_item_id = p_content_item_id and o.content_version = p_content_version)
  )
$$;
revoke all on function public.agency_release_media_status(uuid, integer) from public, anon, authenticated;
grant execute on function public.agency_release_media_status(uuid, integer) to service_role;

-- The guard. Reachable only from inside the release functions (owner privileges), never directly.
create function public.portal_assert_release_media(p_content_item_id uuid, p_content_version int)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status jsonb := public.agency_release_media_status(p_content_item_id, p_content_version);
begin
  if coalesce((v_status->>'review_assets')::int, 0) > 0
     or coalesce((v_status->>'previews')::int, 0) > 0
     or coalesce((v_status->>'design_link')::boolean, false)
     or (v_status->>'override_reason') is not null then
    return;
  end if;
  raise exception 'release_media_missing: v% has no review asset, no portal preview and no design link. Attach one, or record a no-media override whose reason starts "Approved by Anastasia:".',
    p_content_version using errcode = '23514';
end;
$$;
revoke all on function public.portal_assert_release_media(uuid, integer)
  from public, anon, authenticated, service_role;

create function public.agency_record_release_media_override(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
  p_reason text,
  p_actor_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_existing public.content_release_media_overrides%rowtype;
  v_title text;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if v_reason is null or not pg_catalog.starts_with(v_reason, 'Approved by Anastasia:')
     or pg_catalog.char_length(pg_catalog.btrim(pg_catalog.substr(v_reason, 23))) < 3
     or pg_catalog.char_length(v_reason) > 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'a no-media override reason must start "Approved by Anastasia:" and say why';
  end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = p_client_id and cv.version = p_content_version;
  if not found then raise exception 'content version not found'; end if;

  select * into v_existing from public.content_release_media_overrides o
    where o.client_id = p_client_id and o.content_item_id = v_item.id
      and o.content_version = p_content_version;
  if found then
    if v_existing.reason = v_reason then
      return pg_catalog.jsonb_build_object('override_id', v_existing.id, 'outcome', 'unchanged');
    end if;
    raise exception 'v% already has a no-media override with a different reason', p_content_version;
  end if;

  insert into public.content_release_media_overrides (
    client_id, content_item_id, content_version, reason, recorded_by_actor_id)
  values (p_client_id, v_item.id, p_content_version, v_reason, v_actor.id)
  returning id into v_id;

  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_content_version, 'release_media_override',
    'Released without media: ' || coalesce(v_title, v_item.content_id), v_reason,
    'anastasia', v_actor.display_name, 'release-media-override:' || v_id::text);

  return pg_catalog.jsonb_build_object('override_id', v_id, 'outcome', 'recorded');
end;
$$;
revoke all on function public.agency_record_release_media_override(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.agency_record_release_media_override(uuid, text, integer, text, text)
  to service_role;

-- Promotion: one perform before the wrapped core (0081's wrapper, unchanged otherwise).
do $rewrite$
declare
  v_def text;
  v_old text := $old$  perform public.portal_core_review_flow_mark_content_ready(p_content_id,p_content_version);$old$;
  v_new text := $new$  -- 0092 release media guard: no promotion without media or a named override.
  perform public.portal_assert_release_media(v_item.id, p_content_version);
  perform public.portal_core_review_flow_mark_content_ready(p_content_id,p_content_version);$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_ready(uuid,integer)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'mark_content_ready drifted; 0092 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.mark_content_ready(uuid,integer) from public, anon, authenticated;
grant execute on function public.mark_content_ready(uuid,integer) to service_role;

-- Courtesy release: the same check right after the 0086 override guard, before anything is written.
do $rewrite$
declare
  v_def text;
  v_old text := $old$    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;$old$;
  v_new text := $new$    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;
  -- 0092 release media guard: an agency approval of a version Maria cannot see is refused too.
  perform public.portal_assert_release_media(v_item.id, p_content_version);$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'courtesy release body drifted; 0092 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  to service_role;

create function public.assert_release_media_guard_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text;
  v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_release_media_overrides'::pg_catalog.regclass)
     or exists (select 1 from pg_catalog.pg_policies p
                where p.schemaname = 'public' and p.tablename = 'content_release_media_overrides') then
    raise exception 'release media overrides must keep RLS on and take no policies';
  end if;
  if pg_catalog.has_any_column_privilege('anon', 'public.content_release_media_overrides', 'SELECT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.content_release_media_overrides', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'DELETE') then
    raise exception 'release media override privileges are unsafe';
  end if;
  foreach v_fn in array array[
    'public.agency_release_media_status(uuid,integer)',
    'public.agency_record_release_media_override(uuid,text,integer,text,text)'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'release media function grants are unsafe: %', v_fn;
    end if;
  end loop;
  if pg_catalog.has_function_privilege('anon', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE') then
    raise exception 'the release media check must be reachable only through the release functions';
  end if;
  select pg_catalog.pg_get_functiondef('public.mark_content_ready(uuid,integer)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_assert_release_media%' then
    raise exception 'mark_content_ready lost the release media guard';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%portal_assert_release_media%' then
    raise exception 'record_content_courtesy_release lost the release media guard';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.agency_record_release_media_override(uuid,text,integer,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not like '%Approved by Anastasia:%' then
    raise exception 'the no-media override prefix rule drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
                 where t.event_type = 'release_media_override' and t.agency_internal) then
    raise exception 'release media overrides would notify';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_release_media_guard_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_release_media_guard_security()', 'EXECUTE') then
    raise exception 'release media assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_release_media_guard_security() from public, anon, authenticated;
grant execute on function public.assert_release_media_guard_security() to service_role;

select public.assert_release_media_guard_security();

```

- [ ] **Step 3: Fold the new assertion**

In the same file, in the final `create or replace function public.assert_portal_security()` body, replace:

```sql
  perform public.assert_review_preview_security();
end;
```

with:

```sql
  perform public.assert_review_preview_security();
  perform public.assert_release_media_guard_security();
end;
```

- [ ] **Step 4: Fresh replay and upgrade replay**

```bash
cd ~/worktrees/kanset-media-previews && supabase db reset
supabase db reset --version 0091 && supabase migration up --local
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{gsub(/"/,"",$2); print $2}')" -v ON_ERROR_STOP=1 \
  -c "select public.assert_portal_security();" \
  -c "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_release_media_guard_security' as folded;"
```

Expected: both replays finish with no `ERROR`; the assertion returns one empty row; `folded = t`. A `drifted; 0092 will not rewrite it blindly` error means a body changed after 0081/0086: read it, confirm the anchor line, and update `v_old` only (never weaken the guard).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add supabase/migrations/0092_review_media_previews.sql
git -C ~/worktrees/kanset-media-previews commit -m "Refuse a release with no media unless Anastasia approved it (0092)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1b: Keep the existing fixtures releasing (amended 2026-10-03)

**Files:**
- Modify: `scripts/test-rls.ts`
- Modify: `scripts/seed-rls-local.ts`
- Modify: `scripts/update-portal-harness.ts`

After Task 1a, `mark_content_ready` refuses a bare text fixture. About 25 existing `test-rls.ts` checks release such fixtures to test other rules, so the script's service-role client records a fixture override first, and only when the version has no media. The guard's own tests (Task 12a) use the unwrapped client. The seed and the update-portal harness give their pieces a design link instead, because the harness re-shares later versions through the real CLI and an item-level link covers every version.

- [ ] **Step 1: Show the failure first**

```bash
cd ~/worktrees/kanset-media-previews && pnpm test:rls:seed-local
```

Expected: FAIL with `baseline release: release_media_missing: v1 has no review asset, no portal preview and no design link...`.

- [ ] **Step 2: Seed a design link before the baseline release**

In `scripts/seed-rls-local.ts`, replace:

```ts
    if (!itemId) throw new Error('baseline sync returned no item_id')
    const { error: readyError } = await admin.rpc('mark_content_ready', {
```

with:

```ts
    if (!itemId) throw new Error('baseline sync returned no item_id')
    // Release media guard (0092): the baseline needs something for the seat to look at.
    const { error: designError } = await admin.rpc('set_content_design_links', {
      p_client_id: client.id, p_content_id: CONTENT_ID,
      p_canva_url: 'https://www.canva.com/design/RLSBASELINE/view', p_drive_url: null,
      p_actor_key: 'thedot-admin', p_idempotency_key: `local-baseline-design-${randomUUID()}`,
    })
    if (designError) throw new Error(`baseline design link: ${designError.message}`)
    const { error: readyError } = await admin.rpc('mark_content_ready', {
```

- [ ] **Step 3: Give every harness piece a design link**

In `scripts/update-portal-harness.ts`, replace:

```ts
    if (error || !data) throw new Error(`seed sync ${id}: ${error?.message ?? 'no result'}`)
    if (released) {
```

with:

```ts
    if (error || !data) throw new Error(`seed sync ${id}: ${error?.message ?? 'no result'}`)
    // Release media guard (0092): an item-level design link covers every version the harness
    // later re-shares through the real CLI.
    const design = await this.db.rpc('set_content_design_links', {
      p_client_id: this.clientId, p_content_id: id,
      p_canva_url: 'https://www.canva.com/design/HARNESSDESIGN/view', p_drive_url: null,
      p_actor_key: 'thedot-admin', p_idempotency_key: `harness-design-${id}-${randomUUID()}`,
    })
    if (design.error) throw new Error(`seed design ${id}: ${design.error.message}`)
    if (released) {
```

- [ ] **Step 4: Give the test script's fixtures a design link before release**

(Changed 2026-10-04 at Anastasia's choice: fixtures carry a design link, no automated approval wording. The earlier override wrapper is dropped; nothing in the test script records an override.)

In `scripts/test-rls.ts`, replace:

```ts
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
```

with an unwrapped `rawAdmin` client plus an `admin` Proxy over it. Before `mark_content_ready` or `record_content_courtesy_release`, the proxy calls `agency_release_media_status` for that exact version. When it has no review asset, no preview and no design link, it calls `set_content_design_links` with a placeholder Canva URL (`https://www.canva.com/design/RLSFIXTURE/view`, same style as the seed and harness). Errors from that call are not swallowed silently; the release that follows would fail with its own message.

One exception: check FP1 needs a released piece with no design link (a design link or a review asset both count as a design for the final-package check). A module-level `PREVIEW_ONLY` set holds that piece's item id (`bRequestItemId`, added just before the first release loop), and for it the proxy registers a one-page portal preview through `agency_register_review_preview` instead. The preview satisfies the media guard and leaves the final-package design check unsatisfied, so FP1 keeps asserting both outcomes unchanged. Any check that must see the guard bare uses `rawAdmin`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add supabase/migrations/0092_review_media_previews.sql
git -C ~/worktrees/kanset-media-previews commit -m "Add private portal review previews with retention queue (0092)"
```

---

### Task 2: Core helpers (paths, limits, signing)

**Files:**
- Create: `src/lib/portal/review-preview-core.ts`
- Test: `src/lib/portal/review-preview-core.test.ts`

This file is browser-safe (no `node:` imports) because the component imports its types.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-preview-core.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  PREVIEW_LIMITS, PREVIEW_SIGNED_URL_TTL_SECONDS, REVIEW_PREVIEW_BUCKET,
  contentTypeForPath, frameObjectName, previewObjectPrefix, signReviewPreview,
  type ReviewPreviewRow, type SignedUrlStorage,
} from './review-preview-core'

const SHA = 'ab'.repeat(32)

function row(overrides: Partial<ReviewPreviewRow> = {}): ReviewPreviewRow {
  const prefix = `c1/i1/v2/reel/${SHA.slice(0, 16)}/`
  return {
    id: 'p1', client_id: 'c1', content_item_id: 'i1', content_version: 2, preview_key: 'reel',
    review_asset_key: null, media_kind: 'video', object_prefix: prefix,
    video_path: `${prefix}video.mp4`, poster_path: `${prefix}poster.jpg`,
    frames: [{ path: `${prefix}frames/01.jpg`, label: 'Hook' }, { path: `${prefix}frames/02.jpg`, label: 'Answer' }],
    width_px: 1080, height_px: 1920, duration_seconds: 24.5, created_at: '2026-10-03T12:00:00Z',
    ...overrides,
  }
}

function storage(sign = vi.fn(async (paths: string[]) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?t=1`, error: null })),
  error: null,
}))): { storage: SignedUrlStorage; sign: typeof sign; bucket: string[] } {
  const bucket: string[] = []
  return { sign, bucket, storage: { from: (name: string) => { bucket.push(name); return { createSignedUrls: sign } } } }
}

describe('review preview paths', () => {
  it('builds a content-addressed prefix scoped to client, item, version and key', () => {
    expect(previewObjectPrefix({
      clientId: 'C1', contentItemId: 'I1', contentVersion: 2, previewKey: 'reel', sourceSha256: SHA,
    })).toBe(`c1/i1/v2/reel/${SHA.slice(0, 16)}/`)
  })

  it('refuses a key or checksum the database would refuse', () => {
    const base = { clientId: 'c1', contentItemId: 'i1', contentVersion: 1, sourceSha256: SHA }
    expect(() => previewObjectPrefix({ ...base, previewKey: 'Reel One' })).toThrow('invalid preview key')
    expect(() => previewObjectPrefix({ ...base, previewKey: 'reel', sourceSha256: 'xyz' })).toThrow('invalid source checksum')
  })

  it('names frames in order and keeps the image extension', () => {
    expect(frameObjectName(0, '/renders/Contact Sheet 1.JPG')).toBe('frames/01.jpg')
    expect(frameObjectName(11, '/renders/page.png')).toBe('frames/12.png')
  })

  it('maps only the four allowed media types', () => {
    expect(contentTypeForPath('/a/video.MP4')).toBe('video/mp4')
    expect(contentTypeForPath('/a/f.jpeg')).toBe('image/jpeg')
    expect(contentTypeForPath('/a/f.webp')).toBe('image/webp')
    expect(() => contentTypeForPath('/a/episode.mov')).toThrow('unsupported preview file type')
    expect(() => frameObjectName(0, '/a/page.pdf')).toThrow('unsupported preview file type')
  })

  it('keeps the limits the migration enforces', () => {
    expect(PREVIEW_LIMITS.maxVideoBytes).toBe(52_428_800)
    expect(PREVIEW_LIMITS.maxDurationSeconds).toBe(240)
    expect(PREVIEW_LIMITS.maxFrames).toBe(40)
    expect(PREVIEW_LIMITS.maxTotalBytes).toBe(52_428_800 + 41 * 2_097_152)
  })
})

describe('signReviewPreview', () => {
  it('signs every object once, from the private bucket, for the short TTL', async () => {
    const { storage: s, sign, bucket } = storage()
    const signed = await signReviewPreview(s, row(), Date.parse('2026-10-03T12:00:00Z'))
    expect(bucket).toEqual([REVIEW_PREVIEW_BUCKET])
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign.mock.calls[0][1]).toBe(PREVIEW_SIGNED_URL_TTL_SECONDS)
    expect(sign.mock.calls[0][0]).toHaveLength(4)
    expect(signed.videoUrl).toContain('video.mp4')
    expect(signed.posterUrl).toContain('poster.jpg')
    expect(signed.frames).toEqual([
      { label: 'Hook', url: expect.stringContaining('frames/01.jpg') },
      { label: 'Answer', url: expect.stringContaining('frames/02.jpg') },
    ])
    expect(signed.expiresAt).toBe('2026-10-03T12:10:00.000Z')
    expect(signed.durationSeconds).toBe(24.5)
  })

  it('signs a page preview without a video or poster', async () => {
    const prefix = `c1/i1/v1/pdf/${SHA.slice(0, 16)}/`
    const { storage: s } = storage()
    const signed = await signReviewPreview(s, row({
      media_kind: 'pages', video_path: null, poster_path: null, duration_seconds: null,
      frames: [{ path: `${prefix}frames/01.png`, label: 'Page 1' }],
    }))
    expect(signed.videoUrl).toBeNull()
    expect(signed.posterUrl).toBeNull()
    expect(signed.frames).toHaveLength(1)
  })

  it('fails loudly when any object cannot be signed', async () => {
    const { storage: s } = storage(vi.fn(async (paths: string[]) => ({
      data: paths.map((path, i) => ({ path, signedUrl: '', error: i === 1 ? 'Object not found' : null })),
      error: null,
    })))
    await expect(signReviewPreview(s, row())).rejects.toThrow('Object not found')
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-core.test.ts`
Expected: FAIL, `Failed to resolve import "./review-preview-core"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/review-preview-core.ts`:

```ts
// Shared, browser-safe pieces of the review preview feature (migration 0092). The upload command,
// the server readers, the retention job and the component all import from here, so the path
// layout and limits cannot drift from what the database enforces.

export const REVIEW_PREVIEW_BUCKET = 'portal-review-previews'

// Signed links are bearer links, so they stay short. Ten minutes covers watching a reel; the
// component asks the refresh route for new links when one expires mid-review.
export const PREVIEW_SIGNED_URL_TTL_SECONDS = 600

export const PREVIEW_LIMITS = {
  maxVideoBytes: 52_428_800,
  maxImageBytes: 2_097_152,
  maxFrames: 40,
  maxDurationSeconds: 240,
  maxTotalBytes: 138_412_032,
} as const

export const PREVIEW_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export type PreviewContentType = 'video/mp4' | 'image/jpeg' | 'image/png' | 'image/webp'

const CONTENT_TYPES: Record<string, PreviewContentType> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export function fileExtension(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function contentTypeForPath(filePath: string): PreviewContentType {
  const type = CONTENT_TYPES[fileExtension(filePath)]
  if (!type) throw new Error(`unsupported preview file type: ${filePath}`)
  return type
}

// Must match the prefix agency_register_review_preview computes, character for character.
export function previewObjectPrefix(input: {
  clientId: string
  contentItemId: string
  contentVersion: number
  previewKey: string
  sourceSha256: string
}): string {
  if (!PREVIEW_KEY_PATTERN.test(input.previewKey)) throw new Error('invalid preview key')
  if (!/^[0-9a-f]{64}$/.test(input.sourceSha256)) throw new Error('invalid source checksum')
  return `${input.clientId.toLowerCase()}/${input.contentItemId.toLowerCase()}/v${input.contentVersion}`
    + `/${input.previewKey}/${input.sourceSha256.slice(0, 16)}/`
}

export function frameObjectName(index: number, sourcePath: string): string {
  contentTypeForPath(sourcePath)
  return `frames/${String(index + 1).padStart(2, '0')}${fileExtension(sourcePath)}`
}

export type ReviewPreviewFrame = { path: string; label: string }

export type ReviewPreviewRow = {
  id: string
  client_id: string
  content_item_id: string
  content_version: number
  preview_key: string
  review_asset_key: string | null
  media_kind: 'video' | 'pages'
  object_prefix: string
  video_path: string | null
  poster_path: string | null
  frames: ReviewPreviewFrame[]
  width_px: number
  height_px: number
  duration_seconds: number | string | null
  created_at: string
}

export const REVIEW_PREVIEW_COLUMNS = 'id, client_id, content_item_id, content_version, preview_key, '
  + 'review_asset_key, media_kind, object_prefix, video_path, poster_path, frames, width_px, '
  + 'height_px, duration_seconds, created_at'

export type SignedReviewPreview = {
  id: string
  contentItemId: string
  contentVersion: number
  previewKey: string
  mediaKind: 'video' | 'pages'
  width: number
  height: number
  durationSeconds: number | null
  videoUrl: string | null
  posterUrl: string | null
  frames: Array<{ label: string; url: string }>
  expiresAt: string
}

export type SignedUrlStorage = {
  from(bucket: string): {
    createSignedUrls(paths: string[], expiresIn: number): Promise<{
      data: Array<{ path: string | null; signedUrl: string; error: string | null }> | null
      error: { message: string } | null
    }>
  }
}

export async function signReviewPreview(
  storage: SignedUrlStorage,
  row: ReviewPreviewRow,
  now: number = Date.now(),
  ttlSeconds: number = PREVIEW_SIGNED_URL_TTL_SECONDS,
): Promise<SignedReviewPreview> {
  const paths = [row.video_path, row.poster_path, ...row.frames.map((frame) => frame.path)]
    .filter((value): value is string => typeof value === 'string')
  const { data, error } = await storage.from(REVIEW_PREVIEW_BUCKET).createSignedUrls(paths, ttlSeconds)
  if (error || !data) throw new Error(`Could not sign review preview: ${error?.message ?? 'no data'}`)
  const byPath = new Map<string, string>()
  for (const entry of data) {
    if (entry.error || !entry.path || !entry.signedUrl) {
      throw new Error(`Could not sign review preview object: ${entry.error ?? 'missing link'}`)
    }
    byPath.set(entry.path, entry.signedUrl)
  }
  const urlFor = (objectPath: string) => {
    const signed = byPath.get(objectPath)
    if (!signed) throw new Error(`Missing signed link for ${objectPath}`)
    return signed
  }
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    contentVersion: row.content_version,
    previewKey: row.preview_key,
    mediaKind: row.media_kind,
    width: row.width_px,
    height: row.height_px,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    videoUrl: row.video_path ? urlFor(row.video_path) : null,
    posterUrl: row.poster_path ? urlFor(row.poster_path) : null,
    frames: row.frames.map((frame) => ({ label: frame.label, url: urlFor(frame.path) })),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
  }
}

export async function signReviewPreviews(
  storage: SignedUrlStorage,
  rows: ReviewPreviewRow[],
  now: number = Date.now(),
): Promise<SignedReviewPreview[]> {
  return Promise.all(rows.map((row) => signReviewPreview(storage, row, now)))
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-core.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/review-preview-core.ts src/lib/portal/review-preview-core.test.ts
git -C ~/worktrees/kanset-media-previews commit -m "Add review preview path, limit and signing helpers"
```

---

### Task 3: Retention library

**Files:**
- Create: `src/lib/portal/review-preview-retention.ts`
- Test: `src/lib/portal/review-preview-retention.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-preview-retention.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'
import {
  drainReviewPreviewRemovals, purgePreviewsAfterPublication, runPreviewRetention,
} from './review-preview-retention'

type Call = { fn: string; args: Record<string, unknown> }

function fakeAdmin(options: {
  retired?: Array<{ preview_id: string; reason: string }>
  pending?: Array<{ id: string; object_paths: string[] }>
  removeError?: string
  retireError?: string
} = {}) {
  const calls: Call[] = []
  const removed: Array<{ bucket: string; paths: string[] }> = []
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'agency_retire_review_previews') {
        return options.retireError
          ? { data: null, error: { message: options.retireError } }
          : { data: options.retired ?? [], error: null }
      }
      if (fn === 'agency_pending_review_preview_removals') return { data: options.pending ?? [], error: null }
      if (fn === 'agency_complete_review_preview_removal') return { data: { outcome: 'completed' }, error: null }
      throw new Error(`unexpected rpc ${fn}`)
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths })
          return options.removeError ? { data: null, error: { message: options.removeError } } : { data: [], error: null }
        },
      }),
    },
  }
  return { admin: admin as unknown as SupabaseClient, calls, removed }
}

describe('runPreviewRetention', () => {
  it('retires as of the given time, then deletes the queued objects and completes each removal', async () => {
    const { admin, calls, removed } = fakeAdmin({
      retired: [{ preview_id: 'p1', reason: 'planned_date_past' }],
      pending: [{ id: 'r1', object_paths: ['a/video.mp4', 'a/poster.jpg'] }],
    })
    const result = await runPreviewRetention(admin, { now: new Date('2027-07-29T16:00:00Z'), contentItemId: 'i1' })
    expect(calls[0]).toEqual({ fn: 'agency_retire_review_previews', args: { p_now: '2027-07-29T16:00:00.000Z', p_content_item_id: 'i1' } })
    expect(removed).toEqual([{ bucket: REVIEW_PREVIEW_BUCKET, paths: ['a/video.mp4', 'a/poster.jpg'] }])
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r1', p_error: null } })
    expect(result).toEqual({ retired: 1, removed: 1, failed: 0 })
  })

  it('completes a removal whose paths are all reused by a current preview without touching storage', async () => {
    const { admin, calls, removed } = fakeAdmin({ pending: [{ id: 'r2', object_paths: [] }] })
    const result = await drainReviewPreviewRemovals(admin)
    expect(removed).toEqual([])
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r2', p_error: null } })
    expect(result).toEqual({ removed: 1, failed: 0 })
  })

  it('records a storage failure on the removal instead of completing it', async () => {
    const { admin, calls } = fakeAdmin({ pending: [{ id: 'r3', object_paths: ['x'] }], removeError: 'storage down' })
    const result = await drainReviewPreviewRemovals(admin)
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r3', p_error: 'storage down' } })
    expect(result).toEqual({ removed: 0, failed: 1 })
  })
})

describe('purgePreviewsAfterPublication', () => {
  it('never fails the publication confirmation it follows; the nightly sweep retries', async () => {
    const { admin } = fakeAdmin({ retireError: 'database down' })
    const log = vi.fn()
    await expect(purgePreviewsAfterPublication(admin, 'i1', log)).resolves.toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('nightly sweep will retry'))
  })

  it('scopes the purge to the confirmed piece', async () => {
    const { admin, calls } = fakeAdmin()
    await purgePreviewsAfterPublication(admin, 'item-9')
    expect(calls[0].args.p_content_item_id).toBe('item-9')
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-retention.test.ts`
Expected: FAIL, `Failed to resolve import "./review-preview-retention"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/review-preview-retention.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'

// Retention for portal review previews (migration 0092, spec 7). The database decides WHAT to
// retire and queues the object paths; only the Storage API can delete objects, so this module
// drains the queue and reports each removal back, which writes the activity row.

export type RetiredPreview = { preview_id: string; reason: string }
export type RetentionResult = { retired: number; removed: number; failed: number }

export async function retireReviewPreviews(
  admin: SupabaseClient,
  options: { now: Date; contentItemId?: string | null },
): Promise<RetiredPreview[]> {
  const { data, error } = await admin.rpc('agency_retire_review_previews', {
    p_now: options.now.toISOString(),
    p_content_item_id: options.contentItemId ?? null,
  })
  if (error) throw new Error(`agency_retire_review_previews: ${error.message}`)
  return (data ?? []) as RetiredPreview[]
}

export async function drainReviewPreviewRemovals(
  admin: SupabaseClient,
  options: { limit?: number } = {},
): Promise<{ removed: number; failed: number }> {
  const { data, error } = await admin.rpc('agency_pending_review_preview_removals', {
    p_limit: options.limit ?? 200,
  })
  if (error) throw new Error(`agency_pending_review_preview_removals: ${error.message}`)
  let removed = 0
  let failed = 0
  for (const row of (data ?? []) as Array<{ id: string; object_paths: string[] }>) {
    let failure: string | null = null
    if (row.object_paths.length > 0) {
      const { error: removeError } = await admin.storage.from(REVIEW_PREVIEW_BUCKET).remove(row.object_paths)
      if (removeError) failure = removeError.message.slice(0, 500)
    }
    const { error: completeError } = await admin.rpc('agency_complete_review_preview_removal', {
      p_removal_id: row.id,
      p_error: failure,
    })
    if (completeError) throw new Error(`agency_complete_review_preview_removal: ${completeError.message}`)
    if (failure) failed += 1
    else removed += 1
  }
  return { removed, failed }
}

export async function runPreviewRetention(
  admin: SupabaseClient,
  options: { now?: Date; contentItemId?: string | null; limit?: number } = {},
): Promise<RetentionResult> {
  const retired = await retireReviewPreviews(admin, {
    now: options.now ?? new Date(),
    contentItemId: options.contentItemId ?? null,
  })
  const drained = await drainReviewPreviewRemovals(admin, { limit: options.limit })
  return { retired: retired.length, ...drained }
}

// Called right after a publication is confirmed (portal-write publication-confirm, portal-ship,
// and the admin Publication surface). The confirmation has already committed, so a failure here
// must never turn it into an error; the nightly cron catches anything left behind.
export async function purgePreviewsAfterPublication(
  admin: SupabaseClient,
  contentItemId: string,
  log: (message: string) => void = console.warn,
): Promise<RetentionResult | null> {
  try {
    return await runPreviewRetention(admin, { contentItemId })
  } catch (error) {
    log(`WARN: preview retention after publication failed; the nightly sweep will retry: ${
      error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-retention.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/review-preview-retention.ts src/lib/portal/review-preview-retention.test.ts
git -C ~/worktrees/kanset-media-previews commit -m "Add review preview retention and removal drain"
```

---

### Task 4: Upload library

**Files:**
- Create: `src/lib/portal/review-preview-upload.ts`
- Test: `src/lib/portal/review-preview-upload.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-preview-upload.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'
import {
  parseReviewPreviewPayload, uploadReviewPreview,
  type MediaProbe, type PreviewTools, type ReviewPreviewRequest,
} from './review-preview-upload'

type Rpc = { fn: string; args: Record<string, unknown> }

function fakeAdmin(options: {
  registerOutcome?: 'registered' | 'unchanged' | 'replaced'
  registerError?: string
  prefixStillUsed?: boolean
} = {}) {
  const uploads: Array<{ bucket: string; path: string; contentType?: string; bytes: number }> = []
  const removed: string[][] = []
  const rpcs: Rpc[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, opts: { contentType?: string }) => {
          uploads.push({ bucket, path, contentType: opts.contentType, bytes: body.length })
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => { removed.push(paths); return { data: [], error: null } },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      if (fn === 'agency_register_review_preview') {
        if (options.registerError) return { data: null, error: { message: options.registerError } }
        return { data: { preview_id: 'p1', outcome: options.registerOutcome ?? 'registered', object_prefix: args.p_object_prefix }, error: null }
      }
      if (fn === 'agency_pending_review_preview_removals') return { data: [], error: null }
      throw new Error(`unexpected rpc ${fn}`)
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: options.prefixStillUsed ? { id: 'kept' } : null, error: null }) }),
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient, uploads, removed, rpcs }
}

function fakeTools(files: Record<string, string>, sizes: Record<string, number> = {},
  probe: MediaProbe = { width: 1080, height: 1920, durationSeconds: 24 }): PreviewTools {
  return {
    probe: async () => probe,
    faststart: async (input) => input,
    extractPoster: async () => '/work/poster.jpg',
    readFile: async (file) => {
      if (!(file in files)) throw new Error(`missing ${file}`)
      return Buffer.from(files[file])
    },
    statSize: async (file) => sizes[file] ?? Buffer.byteLength(files[file] ?? ''),
  }
}

const FILES = {
  '/r/reel.mp4': 'video-bytes',
  '/r/f1.jpg': 'frame-1',
  '/r/f2.jpg': 'frame-2',
  '/work/poster.jpg': 'poster-bytes',
  '/r/p1.png': 'page-1',
}

function videoRequest(overrides: Partial<ReviewPreviewRequest> = {}): ReviewPreviewRequest {
  return {
    clientSlug: 'kanset', contentId: 'kanset-2026-10-reel', contentVersion: 2, previewKey: 'reel',
    reviewAssetKey: null, video: '/r/reel.mp4', poster: null,
    frames: [{ path: '/r/f1.jpg', label: 'Hook' }, { path: '/r/f2.jpg', label: 'Answer' }],
    pages: [], actorKey: 'thedot-admin', ...overrides,
  }
}

const target = { clientId: 'client-1', contentItemId: 'item-1' }

describe('uploadReviewPreview', () => {
  it('uploads video, poster and frames under one content-addressed prefix, then registers them', async () => {
    const { admin, uploads, rpcs } = fakeAdmin()
    const result = await uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })
    expect(result.outcome).toBe('registered')
    expect(result.objectPrefix).toMatch(/^client-1\/item-1\/v2\/reel\/[0-9a-f]{16}\/$/)
    expect(uploads.map((u) => [u.bucket, u.path.slice(result.objectPrefix.length), u.contentType])).toEqual([
      [REVIEW_PREVIEW_BUCKET, 'video.mp4', 'video/mp4'],
      [REVIEW_PREVIEW_BUCKET, 'poster.jpg', 'image/jpeg'],
      [REVIEW_PREVIEW_BUCKET, 'frames/01.jpg', 'image/jpeg'],
      [REVIEW_PREVIEW_BUCKET, 'frames/02.jpg', 'image/jpeg'],
    ])
    const register = rpcs.find((r) => r.fn === 'agency_register_review_preview')!.args
    expect(register).toMatchObject({
      p_client_id: 'client-1', p_content_id: 'kanset-2026-10-reel', p_content_version: 2,
      p_preview_key: 'reel', p_media_kind: 'video', p_object_prefix: result.objectPrefix,
      p_video_path: `${result.objectPrefix}video.mp4`, p_poster_path: `${result.objectPrefix}poster.jpg`,
      p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 24, p_actor_key: 'thedot-admin',
      p_frames: [
        { path: `${result.objectPrefix}frames/01.jpg`, label: 'Hook' },
        { path: `${result.objectPrefix}frames/02.jpg`, label: 'Answer' },
      ],
    })
    expect(register.p_byte_total).toBe(
      ['video-bytes', 'poster-bytes', 'frame-1', 'frame-2'].reduce((n, s) => n + s.length, 0))
    expect(register.p_source_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gives identical inputs the same prefix and a changed label a new one', async () => {
    const a = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), { ...target, request: videoRequest() })
    const b = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), { ...target, request: videoRequest() })
    const c = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), {
      ...target, request: videoRequest({ frames: [{ path: '/r/f1.jpg', label: 'Opening' }, { path: '/r/f2.jpg', label: 'Answer' }] }),
    })
    expect(a.objectPrefix).toBe(b.objectPrefix)
    expect(c.objectPrefix).not.toBe(a.objectPrefix)
  })

  it('refuses a video longer than 240 seconds before uploading anything', async () => {
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1920, height: 1080, durationSeconds: 2213 }),
      { ...target, request: videoRequest() })).rejects.toThrow('never a full episode')
    expect(uploads).toEqual([])
  })

  it('refuses an oversized video before uploading anything', async () => {
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(FILES, { '/r/reel.mp4': 60 * 1024 * 1024 }),
      { ...target, request: videoRequest() })).rejects.toThrow('the limit is 52428800')
    expect(uploads).toEqual([])
  })

  it('removes what it uploaded when registration fails', async () => {
    const { admin, uploads, removed } = fakeAdmin({ registerError: 'preview version is not the current working or released version' })
    await expect(uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() }))
      .rejects.toThrow('not the current working or released version')
    expect(removed).toEqual([uploads.map((u) => u.path)])
  })

  it('keeps the objects when a current preview already uses that prefix', async () => {
    const { admin, removed } = fakeAdmin({ registerError: 'boom', prefixStillUsed: true })
    await expect(uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })).rejects.toThrow('boom')
    expect(removed).toEqual([])
  })

  it('drains the queue when a preview was replaced', async () => {
    const { admin, rpcs } = fakeAdmin({ registerOutcome: 'replaced' })
    await uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })
    expect(rpcs.map((r) => r.fn)).toContain('agency_pending_review_preview_removals')
  })

  it('uploads a page preview with no video, poster or duration', async () => {
    const { admin, uploads, rpcs } = fakeAdmin()
    const result = await uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1080, height: 1350, durationSeconds: null }), {
      ...target,
      request: videoRequest({ previewKey: 'carousel', video: null, frames: [], pages: [{ path: '/r/p1.png', label: 'Page 1' }] }),
    })
    expect(uploads.map((u) => u.path.slice(result.objectPrefix.length))).toEqual(['frames/01.png'])
    expect(rpcs[0].args).toMatchObject({
      p_media_kind: 'pages', p_video_path: null, p_poster_path: null, p_duration_seconds: null,
      p_width_px: 1080, p_height_px: 1350,
    })
  })
})

describe('parseReviewPreviewPayload', () => {
  const base = { clientSlug: 'kanset', contentId: 'kanset-x', contentVersion: 1, previewKey: 'reel', video: '/r/reel.mp4' }

  it('labels plain frame paths in order', () => {
    const parsed = parseReviewPreviewPayload({ ...base, frames: ['/r/f1.jpg', { path: '/r/f2.jpg', label: 'Answer' }] })
    expect(parsed.frames).toEqual([{ path: '/r/f1.jpg', label: 'Frame 1' }, { path: '/r/f2.jpg', label: 'Answer' }])
    expect(parsed.actorKey).toBe('thedot-admin')
  })

  it('refuses relative paths, mixed kinds, unknown types and too many images', () => {
    expect(() => parseReviewPreviewPayload({ ...base, video: 'reel.mp4' })).toThrow('absolute')
    expect(() => parseReviewPreviewPayload({ ...base, pages: ['/r/p1.png'] })).toThrow('not both')
    expect(() => parseReviewPreviewPayload({ ...base, video: '/r/episode.mov' })).toThrow('unsupported preview file type')
    expect(() => parseReviewPreviewPayload({ ...base, frames: Array.from({ length: 41 }, (_, i) => `/r/f${i}.jpg`) }))
      .toThrow('at most 40')
    expect(() => parseReviewPreviewPayload({ ...base, video: null })).toThrow('a video or at least one page')
    expect(() => parseReviewPreviewPayload({ ...base, previewKey: 'Reel 1' })).toThrow('previewKey')
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-upload.test.ts`
Expected: FAIL, `Failed to resolve import "./review-preview-upload"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/review-preview-upload.ts`:

```ts
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertClientSafeAgencyText, optionalText, requiredText } from './agency-write'
import {
  PREVIEW_KEY_PATTERN, PREVIEW_LIMITS, REVIEW_PREVIEW_BUCKET,
  contentTypeForPath, fileExtension, frameObjectName, previewObjectPrefix,
} from './review-preview-core'
import { drainReviewPreviewRemovals } from './review-preview-retention'

// Agency upload path for portal review previews (migration 0092). The input is the same local
// render file that goes to Drive; Drive stays the master and keeps the link Anastasia supplies.

export type PreviewFileInput = { path: string; label: string }

export type ReviewPreviewRequest = {
  clientSlug: string
  contentId: string
  contentVersion: number
  previewKey: string
  reviewAssetKey: string | null
  video: string | null
  poster: string | null
  frames: PreviewFileInput[]
  pages: PreviewFileInput[]
  actorKey: string
}

export type MediaProbe = { width: number; height: number; durationSeconds: number | null }

export type PreviewTools = {
  probe(file: string): Promise<MediaProbe>
  faststart(video: string): Promise<string>
  extractPoster(video: string): Promise<string>
  readFile(file: string): Promise<Buffer>
  statSize(file: string): Promise<number>
}

export type UploadResult = {
  outcome: 'registered' | 'unchanged' | 'replaced'
  previewId: string
  objectPrefix: string
  bytes: number
}

function fileList(value: unknown, field: string, labelPrefix: string): PreviewFileInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value.map((entry, index) => {
    if (typeof entry === 'string') return { path: entry.trim(), label: `${labelPrefix} ${index + 1}` }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      return {
        path: requiredText(record.path, `${field}[${index}].path`, 1000),
        label: optionalText(record.label, `${field}[${index}].label`, 80) ?? `${labelPrefix} ${index + 1}`,
      }
    }
    throw new Error(`${field}[${index}] must be a path or {path, label}`)
  })
}

export function parseReviewPreviewPayload(payload: Record<string, unknown>): ReviewPreviewRequest {
  const contentVersion = payload.contentVersion
  if (!Number.isInteger(contentVersion) || (contentVersion as number) < 1) {
    throw new Error('contentVersion must be an integer >= 1')
  }
  const previewKey = requiredText(payload.previewKey, 'previewKey', 64)
  if (!PREVIEW_KEY_PATTERN.test(previewKey)) {
    throw new Error('previewKey must be lowercase letters, digits, - or _ (for example reel, teaser, carousel)')
  }
  const video = optionalText(payload.video, 'video', 1000)
  const poster = optionalText(payload.poster, 'poster', 1000)
  const frames = fileList(payload.frames, 'frames', 'Frame')
  const pages = fileList(payload.pages, 'pages', 'Page')
  if (video && pages.length > 0) throw new Error('give either video (with frames) or pages, not both')
  if (!video && pages.length === 0) throw new Error('a preview needs a video or at least one page')
  if (!video && (poster || frames.length > 0)) throw new Error('poster and frames belong to a video preview')
  const images = [...(poster ? [poster] : []), ...frames.map((f) => f.path), ...pages.map((p) => p.path)]
  for (const file of [...(video ? [video] : []), ...images]) {
    if (!path.isAbsolute(file)) throw new Error(`file paths must be absolute: ${file}`)
  }
  if (video && contentTypeForPath(video) !== 'video/mp4') throw new Error('video must be an .mp4 file')
  for (const image of images) {
    if (contentTypeForPath(image) === 'video/mp4') throw new Error(`expected an image: ${image}`)
  }
  if (frames.length + pages.length > PREVIEW_LIMITS.maxFrames) {
    throw new Error(`a preview carries at most ${PREVIEW_LIMITS.maxFrames} frames or pages`)
  }
  const labels = [...frames, ...pages].map((f) => f.label).join('\n')
  if (labels) assertClientSafeAgencyText({ frameLabels: labels })
  return {
    clientSlug: requiredText(payload.clientSlug, 'clientSlug', 100),
    contentId: requiredText(payload.contentId, 'contentId', 200),
    contentVersion: contentVersion as number,
    previewKey,
    reviewAssetKey: optionalText(payload.reviewAssetKey, 'reviewAssetKey', 64),
    video,
    poster,
    frames,
    pages,
    actorKey: requiredText(payload.actorKey ?? 'thedot-admin', 'actorKey', 64),
  }
}

const run = promisify(execFile)

// Real tools for Anastasia's Mac (ffmpeg and ffprobe are installed). workDir must sit under
// /tmp/kanset-<content-id>/ per CONTENT-HOUSEKEEPING.md; the caller deletes it afterwards.
export function ffmpegTools(workDir: string): PreviewTools {
  return {
    async probe(file) {
      const { stdout } = await run('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
      ])
      const parsed = JSON.parse(stdout) as {
        streams?: Array<{ width?: number; height?: number }>
        format?: { duration?: string }
      }
      const stream = parsed.streams?.[0]
      if (!stream?.width || !stream?.height) throw new Error(`no picture found in ${file}`)
      const duration = parsed.format?.duration ? Number(parsed.format.duration) : Number.NaN
      return { width: stream.width, height: stream.height, durationSeconds: Number.isFinite(duration) ? duration : null }
    },
    async faststart(video) {
      await mkdir(workDir, { recursive: true })
      const output = path.join(workDir, 'faststart.mp4')
      // Lossless remux that moves the index to the front, so the browser can start playing before
      // the whole file has downloaded. No re-encode: on-screen text stays pixel-identical.
      await run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-map', '0:v:0', '-map', '0:a?',
        '-c', 'copy', '-movflags', '+faststart', output])
      return output
    },
    async extractPoster(video) {
      await mkdir(workDir, { recursive: true })
      const output = path.join(workDir, 'poster.jpg')
      // Frame one is the cover for graphic reels (memory: no-cover-for-graphic-reels).
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', '0', '-i', video, '-frames:v', '1', '-q:v', '3', output])
      return output
    },
    readFile: (file) => readFile(file),
    statSize: async (file) => (await stat(file)).size,
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function uploadReviewPreview(
  admin: SupabaseClient,
  tools: PreviewTools,
  input: { clientId: string; contentItemId: string; request: ReviewPreviewRequest },
): Promise<UploadResult> {
  const { request } = input
  const isVideo = request.video !== null
  const imageInputs = isVideo ? request.frames : request.pages

  // The checksum covers the SOURCE files and labels, never derived files, so re-running the same
  // command always lands on the same prefix and the database answers "unchanged".
  const hash = createHash('sha256').update(isVideo ? 'video\n' : 'pages\n')
  const sources = isVideo
    ? [request.video as string, ...(request.poster ? [request.poster] : []), ...request.frames.map((f) => f.path)]
    : request.pages.map((p) => p.path)
  for (const file of sources) hash.update(`${sha256Hex(await tools.readFile(file))}\n`)
  for (const item of imageInputs) hash.update(`label:${item.label}\n`)
  const sourceSha256 = hash.digest('hex')
  const prefix = previewObjectPrefix({
    clientId: input.clientId,
    contentItemId: input.contentItemId,
    contentVersion: request.contentVersion,
    previewKey: request.previewKey,
    sourceSha256,
  })

  const uploads: Array<{ objectPath: string; file: string; maxBytes: number }> = []
  let videoPath: string | null = null
  let posterPath: string | null = null
  let durationSeconds: number | null = null
  let width: number
  let height: number

  if (isVideo) {
    const media = await tools.probe(request.video as string)
    if (media.durationSeconds === null || media.durationSeconds <= 0) {
      throw new Error('could not read the video duration')
    }
    if (media.durationSeconds > PREVIEW_LIMITS.maxDurationSeconds) {
      throw new Error(`video runs ${Math.round(media.durationSeconds)}s; previews are teasers and cuts up to `
        + `${PREVIEW_LIMITS.maxDurationSeconds}s, never a full episode`)
    }
    width = media.width
    height = media.height
    durationSeconds = Math.round(media.durationSeconds * 100) / 100
    const prepared = await tools.faststart(request.video as string)
    const poster = request.poster ?? await tools.extractPoster(request.video as string)
    videoPath = `${prefix}video.mp4`
    posterPath = `${prefix}poster${fileExtension(poster)}`
    uploads.push(
      { objectPath: videoPath, file: prepared, maxBytes: PREVIEW_LIMITS.maxVideoBytes },
      { objectPath: posterPath, file: poster, maxBytes: PREVIEW_LIMITS.maxImageBytes },
    )
  } else {
    const first = await tools.probe(request.pages[0].path)
    width = first.width
    height = first.height
  }
  const frames = imageInputs.map((item, index) => ({ path: `${prefix}${frameObjectName(index, item.path)}`, label: item.label }))
  imageInputs.forEach((item, index) => {
    uploads.push({ objectPath: frames[index].path, file: item.path, maxBytes: PREVIEW_LIMITS.maxImageBytes })
  })

  let bytes = 0
  for (const upload of uploads) {
    const size = await tools.statSize(upload.file)
    if (size > upload.maxBytes) {
      throw new Error(`${upload.file} is ${size} bytes; the limit is ${upload.maxBytes}`)
    }
    bytes += size
  }
  if (bytes > PREVIEW_LIMITS.maxTotalBytes) {
    throw new Error(`preview totals ${bytes} bytes; the limit is ${PREVIEW_LIMITS.maxTotalBytes}`)
  }

  const uploaded: string[] = []
  try {
    for (const upload of uploads) {
      const { error } = await admin.storage.from(REVIEW_PREVIEW_BUCKET).upload(
        upload.objectPath,
        await tools.readFile(upload.file),
        { contentType: contentTypeForPath(upload.objectPath), upsert: true, cacheControl: '86400' },
      )
      if (error) throw new Error(`upload ${upload.objectPath}: ${error.message}`)
      uploaded.push(upload.objectPath)
    }
    const { data, error } = await admin.rpc('agency_register_review_preview', {
      p_client_id: input.clientId,
      p_content_id: request.contentId,
      p_content_version: request.contentVersion,
      p_preview_key: request.previewKey,
      p_review_asset_key: request.reviewAssetKey,
      p_media_kind: isVideo ? 'video' : 'pages',
      p_object_prefix: prefix,
      p_video_path: videoPath,
      p_poster_path: posterPath,
      p_frames: frames,
      p_width_px: width,
      p_height_px: height,
      p_duration_seconds: durationSeconds,
      p_byte_total: bytes,
      p_source_sha256: sourceSha256,
      p_actor_key: request.actorKey,
    })
    if (error) throw new Error(`agency_register_review_preview: ${error.message}`)
    const response = data as { preview_id: string; outcome: UploadResult['outcome']; object_prefix: string }
    if (response.outcome === 'replaced') await drainReviewPreviewRemovals(admin, { limit: 50 })
    return { outcome: response.outcome, previewId: response.preview_id, objectPrefix: prefix, bytes }
  } catch (error) {
    if (uploaded.length > 0) {
      const { data: kept } = await admin.from('content_review_previews')
        .select('id').eq('object_prefix', prefix).maybeSingle()
      if (!kept) await admin.storage.from(REVIEW_PREVIEW_BUCKET).remove(uploaded)
    }
    throw error
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-preview-upload.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/review-preview-upload.ts src/lib/portal/review-preview-upload.test.ts
git -C ~/worktrees/kanset-media-previews commit -m "Add review preview upload with size, duration and cleanup guards"
```

---

### Task 5: Server readers (client and agency)

**Files:**
- Create: `src/lib/portal/review-previews.ts`
- Test: `src/lib/portal/review-previews.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/review-previews.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serverFrom, adminFrom, sign } = vi.hoisted(() => ({
  serverFrom: vi.fn(),
  adminFrom: vi.fn(),
  sign: vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
    error: null,
  })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: serverFrom }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: adminFrom, storage: { from: () => ({ createSignedUrls: sign }) } }),
}))

import {
  getAgencyReviewPreviews, getClientReviewPreviewById, getClientReviewPreviews,
} from './review-previews'

const ROW = {
  id: '6f1c2f8e-0000-4000-8000-000000000001', client_id: 'c1', content_item_id: 'i1', content_version: 1,
  preview_key: 'reel', review_asset_key: null, media_kind: 'video', object_prefix: 'c1/i1/v1/reel/x/',
  video_path: 'c1/i1/v1/reel/x/video.mp4', poster_path: 'c1/i1/v1/reel/x/poster.jpg',
  frames: [], width_px: 1080, height_px: 1920, duration_seconds: '12.00', created_at: '2026-10-03T00:00:00Z',
}

function query(rows: unknown[]) {
  const filters: Array<[string, unknown]> = []
  const builder = {
    filters,
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
    order: () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  }
  return builder
}

beforeEach(() => { serverFrom.mockReset(); adminFrom.mockReset(); sign.mockClear() })

describe('client review preview reader', () => {
  it('reads through the seat session (RLS) and signs with the service role', async () => {
    const q = query([ROW])
    serverFrom.mockReturnValue(q)
    const previews = await getClientReviewPreviews('c1', 'i1', 1)
    expect(serverFrom).toHaveBeenCalledWith('content_review_previews')
    expect(adminFrom).not.toHaveBeenCalled()
    expect(q.filters).toEqual([['client_id', 'c1'], ['content_item_id', 'i1'], ['content_version', 1]])
    expect(previews[0].videoUrl).toContain('video.mp4')
    expect(previews[0].durationSeconds).toBe(12)
  })

  it('signs nothing when RLS returns no row', async () => {
    serverFrom.mockReturnValue(query([]))
    expect(await getClientReviewPreviews('c1', 'i1', 2)).toEqual([])
    expect(sign).not.toHaveBeenCalled()
  })

  it('refuses a malformed preview id without querying', async () => {
    expect(await getClientReviewPreviewById('c1', '../../etc')).toBeNull()
    expect(serverFrom).not.toHaveBeenCalled()
  })
})

describe('agency review preview reader', () => {
  it('reads every version through the service role', async () => {
    const q = query([ROW])
    adminFrom.mockReturnValue(q)
    const previews = await getAgencyReviewPreviews('i1', 1)
    expect(serverFrom).not.toHaveBeenCalled()
    expect(q.filters).toEqual([['content_item_id', 'i1'], ['content_version', 1]])
    expect(previews).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-previews.test.ts`
Expected: FAIL, `Failed to resolve import "./review-previews"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal/review-previews.ts`:

```ts
import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  REVIEW_PREVIEW_COLUMNS, signReviewPreview, signReviewPreviews,
  type ReviewPreviewRow, type SignedReviewPreview,
} from './review-preview-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Client reads go through the seat's own session, so RLS (migration 0092) decides what she may
// see: her tenant only, the released version only, never an archived piece. Only after RLS has
// returned the row does the service role sign its object paths. Storage itself has no client
// policy at all, so a seat can never fetch an object without passing through here.
export async function getClientReviewPreviews(
  clientId: string,
  contentItemId: string,
  contentVersion: number,
): Promise<SignedReviewPreview[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('client_id', clientId)
    .eq('content_item_id', contentItemId)
    .eq('content_version', contentVersion)
    .order('preview_key')
  if (error) throw new Error(`Could not load review previews: ${error.message}`)
  const rows = (data ?? []) as unknown as ReviewPreviewRow[]
  if (rows.length === 0) return []
  return signReviewPreviews(createSupabaseAdmin().storage, rows)
}

export async function getClientReviewPreviewById(
  clientId: string,
  previewId: string,
): Promise<SignedReviewPreview | null> {
  if (!UUID.test(previewId)) return null
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('client_id', clientId)
    .eq('id', previewId)
    .maybeSingle()
  if (error) throw new Error(`Could not load review preview: ${error.message}`)
  if (!data) return null
  return signReviewPreview(createSupabaseAdmin().storage, data as unknown as ReviewPreviewRow)
}

// Agency reads: any version, including a working version the client has not seen yet.
export async function getAgencyReviewPreviews(
  contentItemId: string,
  contentVersion: number,
): Promise<SignedReviewPreview[]> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('content_item_id', contentItemId)
    .eq('content_version', contentVersion)
    .order('preview_key')
  if (error) throw new Error(`Could not load review previews: ${error.message}`)
  const rows = (data ?? []) as unknown as ReviewPreviewRow[]
  if (rows.length === 0) return []
  return signReviewPreviews(admin.storage, rows)
}

export async function getAgencyReviewPreviewById(previewId: string): Promise<SignedReviewPreview | null> {
  if (!UUID.test(previewId)) return null
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('id', previewId)
    .maybeSingle()
  if (error) throw new Error(`Could not load review preview: ${error.message}`)
  if (!data) return null
  return signReviewPreview(admin.storage, data as unknown as ReviewPreviewRow)
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/lib/portal/review-previews.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/review-previews.ts src/lib/portal/review-previews.test.ts
git -C ~/worktrees/kanset-media-previews commit -m "Add client and agency review preview readers"
```

---

### Task 6: Signed-link refresh routes (client and admin)

**Files:**
- Create: `src/app/api/client/[slug]/review-previews/[previewId]/route.ts`
- Create: `src/app/api/client/[slug]/review-previews/[previewId]/route.test.ts`
- Create: `src/app/api/admin/portal/review-previews/[previewId]/route.ts`
- Create: `src/app/api/admin/portal/review-previews/[previewId]/route.test.ts`

API routes are outside the middleware matcher (`src/middleware.ts` excludes `api`), so each route authenticates itself, as the assistant route and the evidence route do.

- [ ] **Step 1: Write the failing client route test**

Create `src/app/api/client/[slug]/review-previews/[previewId]/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getClientSession, getClientReviewPreviewById } = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getClientReviewPreviewById: vi.fn(),
}))
vi.mock('@/lib/portal/auth', () => ({ getClientSession }))
vi.mock('@/lib/portal/review-previews', () => ({ getClientReviewPreviewById }))

import { GET } from './route'

const params = (slug: string, previewId: string) => ({ params: Promise.resolve({ slug, previewId }) })
const request = new Request('https://www.thedotcreative.co/api/client/kanset/review-previews/x')

beforeEach(() => { getClientSession.mockReset(); getClientReviewPreviewById.mockReset() })

describe('client review preview refresh route', () => {
  it('refuses a request with no seat for that client', async () => {
    getClientSession.mockResolvedValue(null)
    const response = await GET(request, params('kanset', 'p1'))
    expect(response.status).toBe(401)
    expect(getClientReviewPreviewById).not.toHaveBeenCalled()
  })

  it('reads with the session client id, never one from the URL', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c-from-session' })
    getClientReviewPreviewById.mockResolvedValue({ id: 'p1', videoUrl: 'https://signed/x' })
    const response = await GET(request, params('kanset', 'p1'))
    expect(getClientReviewPreviewById).toHaveBeenCalledWith('c-from-session', 'p1')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ preview: { id: 'p1', videoUrl: 'https://signed/x' } })
  })

  it('answers 404 when RLS hides the preview', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c1' })
    getClientReviewPreviewById.mockResolvedValue(null)
    expect((await GET(request, params('kanset', 'p1'))).status).toBe(404)
  })

  it('does not leak an internal error message', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c1' })
    getClientReviewPreviewById.mockRejectedValue(new Error('Could not sign review preview: secret detail'))
    const response = await GET(request, params('kanset', 'p1'))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret detail')
  })
})
```

- [ ] **Step 2: Write the failing admin route test**

Create `src/app/api/admin/portal/review-previews/[previewId]/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAdminSession, getAgencyReviewPreviewById } = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getAgencyReviewPreviewById: vi.fn(),
}))
vi.mock('@/lib/admin-security', () => ({ requireAdminSession }))
vi.mock('@/lib/portal/review-previews', () => ({ getAgencyReviewPreviewById }))

import { GET } from './route'

const params = (previewId: string) => ({ params: Promise.resolve({ previewId }) })
const request = new Request('https://www.thedotcreative.co/api/admin/portal/review-previews/p1')

beforeEach(() => { requireAdminSession.mockReset(); getAgencyReviewPreviewById.mockReset() })

describe('admin review preview refresh route', () => {
  it('refuses without an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('ADMIN_AUTH_REQUIRED'))
    const response = await GET(request, params('p1'))
    expect(response.status).toBe(401)
    expect(getAgencyReviewPreviewById).not.toHaveBeenCalled()
  })

  it('returns fresh signed links for the agency', async () => {
    requireAdminSession.mockResolvedValue({ role: 'admin' })
    getAgencyReviewPreviewById.mockResolvedValue({ id: 'p1' })
    const response = await GET(request, params('p1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('answers 404 for an unknown preview', async () => {
    requireAdminSession.mockResolvedValue({ role: 'admin' })
    getAgencyReviewPreviewById.mockResolvedValue(null)
    expect((await GET(request, params('p1'))).status).toBe(404)
  })
})
```

- [ ] **Step 3: Run both tests to see them fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run "src/app/api/client/[slug]/review-previews" "src/app/api/admin/portal/review-previews"`
Expected: FAIL, `Failed to resolve import "./route"` in both files.

- [ ] **Step 4: Write the client route**

Create `src/app/api/client/[slug]/review-previews/[previewId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getClientSession } from '@/lib/portal/auth'
import { getClientReviewPreviewById } from '@/lib/portal/review-previews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'private, no-store' }

// Fresh signed links for one preview, used when the ten-minute links expire mid-review. The client
// id comes from the seat's session, and the row itself is read under RLS, so a seat can only ever
// refresh a preview it could already see.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; previewId: string }> },
) {
  const { slug, previewId } = await params
  try {
    const session = await getClientSession(slug)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    const preview = await getClientReviewPreviewById(session.clientId, previewId)
    if (!preview) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ preview }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Preview unavailable' }, { status: 500, headers: NO_STORE })
  }
}
```

- [ ] **Step 5: Write the admin route**

Create `src/app/api/admin/portal/review-previews/[previewId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin-security'
import { getAgencyReviewPreviewById } from '@/lib/portal/review-previews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'private, no-store' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ previewId: string }> },
) {
  try {
    await requireAdminSession()
    const { previewId } = await params
    const preview = await getAgencyReviewPreviewById(previewId)
    if (!preview) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ preview }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message === 'ADMIN_AUTH_REQUIRED' ? 'Unauthorized' : 'Preview unavailable' },
      { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : 500, headers: NO_STORE },
    )
  }
}
```

- [ ] **Step 6: Run both tests to see them pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run "src/app/api/client/[slug]/review-previews" "src/app/api/admin/portal/review-previews"`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add "src/app/api/client/[slug]/review-previews" "src/app/api/admin/portal/review-previews"
git -C ~/worktrees/kanset-media-previews commit -m "Add signed-link refresh routes for review previews"
```

---

### Task 7: Nightly retention cron

**Files:**
- Create: `src/app/api/cron/portal-preview-retention/route.ts`
- Create: `src/app/api/cron/portal-preview-retention/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/cron/portal-preview-retention/route.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runPreviewRetention, createSupabaseAdmin } = vi.hoisted(() => ({
  runPreviewRetention: vi.fn(),
  createSupabaseAdmin: vi.fn(() => ({ admin: true })),
}))
vi.mock('@/lib/portal/review-preview-retention', () => ({ runPreviewRetention }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin }))

import { GET } from './route'

const call = (authorization?: string) => GET(new Request('https://www.thedotcreative.co/api/cron/portal-preview-retention', {
  headers: authorization ? { authorization } : {},
}))

beforeEach(() => { vi.stubEnv('CRON_SECRET', 'cron-secret-value'); runPreviewRetention.mockReset() })
afterEach(() => { vi.unstubAllEnvs() })

describe('preview retention cron', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(runPreviewRetention).not.toHaveBeenCalled()
  })

  it('runs the sweep across every client and reports the counts', async () => {
    runPreviewRetention.mockResolvedValue({ retired: 2, removed: 2, failed: 0 })
    const response = await call('Bearer cron-secret-value')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ retired: 2, removed: 2, failed: 0 })
    expect(runPreviewRetention).toHaveBeenCalledWith({ admin: true }, { now: expect.any(Date) })
  })

  it('reports a failure as 500 so Vercel shows the cron as failed', async () => {
    runPreviewRetention.mockRejectedValue(new Error('agency_retire_review_previews: boom'))
    expect((await call('Bearer cron-secret-value')).status).toBe(500)
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/app/api/cron/portal-preview-retention`
Expected: FAIL, `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `src/app/api/cron/portal-preview-retention/route.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runPreviewRetention } from '@/lib/portal/review-preview-retention'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret), b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Nightly sweep (spec 7): retires previews whose piece is live everywhere, archived or superseded,
// or whose planned date is more than 7 days past, then deletes the queued objects. Publication
// confirmations already purge their own piece; this catches everything else.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runPreviewRetention(createSupabaseAdmin(), { now: new Date() }))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview retention failed' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 4: Register the cron**

Replace the whole content of `vercel.json` with:

```json
{
  "crons": [
    { "path": "/api/cron/portal-calendar", "schedule": "17 * * * *" },
    { "path": "/api/cron/portal-assistant", "schedule": "41 * * * *" },
    { "path": "/api/cron/portal-notifications", "schedule": "* * * * *" },
    { "path": "/api/cron/portal-preview-retention", "schedule": "23 7 * * *" }
  ]
}
```

`23 7 * * *` UTC is 03:23 Toronto in summer time and 02:23 in winter, after the Toronto calendar date has turned.

- [ ] **Step 5: Run the test to see it pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/app/api/cron/portal-preview-retention`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/app/api/cron/portal-preview-retention vercel.json
git -C ~/worktrees/kanset-media-previews commit -m "Run review preview retention nightly"
```

---

### Task 8: Minimal preview component

**Files:**
- Create: `src/components/portal/ReviewPreviewMedia.tsx`
- Create: `src/components/portal/ReviewPreviewMedia.module.css`
- Test: `src/components/portal/ReviewPreviewMedia.test.tsx`

Not imported by any page in this plan. Plan 4 places it in the media column, adds the page viewer (arrows, swipe, counter, enlarge), Suggest a change per frame, and the collapsed "8 frames" line. This component only proves the data layer renders: a video with its poster, a 4-across frame grid (spec 4.2), a 2-across page grid, and one link refresh per expiry.

- [ ] **Step 1: Write the failing test**

Create `src/components/portal/ReviewPreviewMedia.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReviewPreviewMedia from './ReviewPreviewMedia'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

const VIDEO: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i1', contentVersion: 2, previewKey: 'reel', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 24,
  videoUrl: 'https://signed.example/video.mp4?t=1', posterUrl: 'https://signed.example/poster.jpg?t=1',
  frames: [{ label: 'Hook', url: 'https://signed.example/f1.jpg?t=1' }, { label: 'Answer', url: 'https://signed.example/f2.jpg?t=1' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

afterEach(() => { vi.unstubAllGlobals() })

describe('ReviewPreviewMedia', () => {
  it('plays the video inline with its poster and lists the frames with labels', () => {
    render(<ReviewPreviewMedia preview={VIDEO} title="Work permit reel" />)
    const video = screen.getByLabelText('Work permit reel: preview video')
    expect(video).toHaveAttribute('src', VIDEO.videoUrl)
    expect(video).toHaveAttribute('poster', VIDEO.posterUrl)
    expect(video).toHaveAttribute('playsinline')
    expect(screen.getByRole('list', { name: 'Work permit reel: frames' })).toBeInTheDocument()
    expect(screen.getByAltText('Hook')).toHaveAttribute('src', VIDEO.frames[0].url)
    expect(screen.getByText('Answer')).toBeInTheDocument()
  })

  it('renders a page preview as pages, with no video', () => {
    render(<ReviewPreviewMedia title="Carousel" preview={{
      ...VIDEO, mediaKind: 'pages', videoUrl: null, posterUrl: null, durationSeconds: null,
      frames: [{ label: 'Page 1', url: 'https://signed.example/p1.png' }],
    }} />)
    expect(screen.queryByLabelText('Carousel: preview video')).toBeNull()
    expect(screen.getByRole('list', { name: 'Carousel: pages' })).toBeInTheDocument()
  })

  it('asks for fresh links once when the signed links expire, then uses them', async () => {
    const fresh = { ...VIDEO, videoUrl: 'https://signed.example/video.mp4?t=2', expiresAt: '2026-10-03T12:20:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ReviewPreviewMedia preview={VIDEO} title="Reel" refreshUrl="/api/client/kanset/review-previews/p1" />)
    const video = screen.getByLabelText('Reel: preview video')
    fireEvent.error(video)
    fireEvent.error(screen.getByAltText('Hook'))
    await waitFor(() => expect(video).toHaveAttribute('src', fresh.videoUrl))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/client/kanset/review-previews/p1', { cache: 'no-store' })
  })

  it('does not refresh without a refresh URL', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ReviewPreviewMedia preview={VIDEO} title="Reel" />)
    fireEvent.error(screen.getByLabelText('Reel: preview video'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/components/portal/ReviewPreviewMedia.test.tsx`
Expected: FAIL, `Failed to resolve import "./ReviewPreviewMedia"`.

- [ ] **Step 3: Write the component**

Create `src/components/portal/ReviewPreviewMedia.tsx`:

```tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import styles from './ReviewPreviewMedia.module.css'

type Props = {
  preview: SignedReviewPreview
  title: string
  // The client or admin refresh route for this preview. Signed links last ten minutes; when one
  // fails, the component asks once per set of links and swaps the new ones in.
  refreshUrl?: string
}

export default function ReviewPreviewMedia({ preview: initial, title, refreshUrl }: Props) {
  const [preview, setPreview] = useState(initial)
  const refreshedFor = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!refreshUrl || refreshedFor.current === preview.expiresAt) return
    refreshedFor.current = preview.expiresAt
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (body.preview) setPreview(body.preview)
    } catch {
      // The Drive link stays beside the preview; a failed refresh leaves the current links.
    }
  }, [refreshUrl, preview.expiresAt])

  const ratio = `${preview.width} / ${preview.height}`
  const isVideo = preview.mediaKind === 'video' && preview.videoUrl !== null
  const listName = isVideo ? `${title}: frames` : `${title}: pages`

  return (
    <figure className={styles.media}>
      {isVideo ? (
        <video
          className={styles.video}
          style={{ aspectRatio: ratio }}
          src={preview.videoUrl ?? undefined}
          poster={preview.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={`${title}: preview video`}
          onError={refresh}
        />
      ) : null}
      {preview.frames.length > 0 ? (
        <ol className={isVideo ? styles.frames : styles.pages} aria-label={listName}>
          {preview.frames.map((frame, index) => (
            <li key={`${index}-${frame.label}`} className={styles.frame}>
              {/* Signed, expiring storage links: next/image would cache and re-host them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.frameImage}
                style={{ aspectRatio: ratio }}
                src={frame.url}
                alt={frame.label}
                loading="lazy"
                onError={refresh}
              />
              <span className={styles.frameLabel}>{frame.label}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </figure>
  )
}
```

Create `src/components/portal/ReviewPreviewMedia.module.css`:

```css
/* Minimal data-layer rendering for review previews. The approved v3 layout (sticky media column,
   page viewer, collapsing frame strip) is plan 4; this only uses tokens that already exist. */
.media {
  margin: 0;
  display: grid;
  gap: 16px;
}
.video {
  display: block;
  width: 100%;
  max-height: 80vh;
  background: var(--dot-black);
  object-fit: contain;
}
.frames,
.pages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
/* Spec 4.2: the frame strip under a video is a 4-across grid, never a horizontal scroll. */
.frames { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.pages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.frame {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.frameImage {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
  border: 1px solid var(--dot-grey-light);
  background: var(--dot-black);
}
.frameLabel {
  font-family: var(--dot-font-text);
  font-size: 12px;
  color: var(--dot-graphite);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec vitest run src/components/portal/ReviewPreviewMedia.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/components/portal/ReviewPreviewMedia.tsx src/components/portal/ReviewPreviewMedia.module.css src/components/portal/ReviewPreviewMedia.test.tsx
git -C ~/worktrees/kanset-media-previews commit -m "Add minimal review preview media component"
```

---

### Task 9: Agency command `portal-write review-preview` and the publication hook

**Files:**
- Modify: `scripts/portal-write.ts`

`portal-write` has no unit test harness (it is exercised against the local stack); the logic it calls is unit-tested in Tasks 3 and 4, and the end-to-end path is exercised in Task 13.

- [ ] **Step 1: Imports**

In `scripts/portal-write.ts` replace:

```ts
import { readFile, writeFile } from 'node:fs/promises'
```

with:

```ts
import { readFile, rm, writeFile } from 'node:fs/promises'
```

and replace:

```ts
import { buildReportNotificationCopy } from '../src/lib/portal/report-email'
```

with:

```ts
import { buildReportNotificationCopy } from '../src/lib/portal/report-email'
import { purgePreviewsAfterPublication } from '../src/lib/portal/review-preview-retention'
import {
  ffmpegTools, parseReviewPreviewPayload, uploadReviewPreview, type ReviewPreviewRequest,
} from '../src/lib/portal/review-preview-upload'
```

- [ ] **Step 2: Usage string**

In the usage string, replace `|ops-task|ops-task-complete|archive-draft> <payload.json>` with `|ops-task|ops-task-complete|archive-draft|review-preview> <payload.json>`.

- [ ] **Step 3: Idempotency exemption**

Replace:

```ts
  const idempotency = command === 'status-gates' ? '' : requiredText(payload.idempotencyKey, 'idempotencyKey', 200)
```

with:

```ts
  // review-preview is content-addressed: the same files always land on the same object prefix and
  // the database answers "unchanged", so a separate idempotency key would add nothing.
  const idempotency = command === 'status-gates' || command === 'review-preview'
    ? '' : requiredText(payload.idempotencyKey, 'idempotencyKey', 200)
```

- [ ] **Step 4: State variables**

Replace:

```ts
  let statusGatesContentId: string | null = null
```

with:

```ts
  let statusGatesContentId: string | null = null
  let reviewPreview: ReviewPreviewRequest | null = null
  let publicationItemId: string | null = null
```

- [ ] **Step 5: Command branch**

Replace:

```ts
  } else if (command === 'idea') {
```

with:

```ts
  } else if (command === 'review-preview') {
    // Portal-hosted preview of a final render for one exact version (migration 0092). Drive stays
    // the master: this uploads a temporary copy of the local file and never touches a Drive link.
    // Payload: { clientSlug, contentId, contentVersion, previewKey, reviewAssetKey?, video?,
    // poster?, frames?: [path | {path,label}], pages?: [path | {path,label}] }, absolute paths.
    reviewPreview = parseReviewPreviewPayload(payload)
    rpc = 'review-preview'
    args = {}
  } else if (command === 'idea') {
```

- [ ] **Step 6: Run the upload after the client is resolved**

Replace:

```ts
  if (statusGatesContentId) {
    if (!clientId) throw new Error('status-gates requires a client')
    await emitStatusGatesBlock(clientId, statusGatesContentId, packPath)
    return
  }
```

with:

```ts
  if (statusGatesContentId) {
    if (!clientId) throw new Error('status-gates requires a client')
    await emitStatusGatesBlock(clientId, statusGatesContentId, packPath)
    return
  }
  if (reviewPreview) {
    if (!clientId) throw new Error('review-preview requires a client')
    const { data: item, error: itemError } = await admin.from('content_items')
      .select('id').eq('client_id', clientId).eq('content_id', reviewPreview.contentId).single()
    if (itemError || !item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    // Disposable renders live under /tmp/kanset-<content-id>/ (CONTENT-HOUSEKEEPING.md).
    const workDir = `/tmp/kanset-${reviewPreview.contentId.replace(/[^A-Za-z0-9-]/g, '-')}/review-preview`
    try {
      const result = await uploadReviewPreview(admin, ffmpegTools(workDir), {
        clientId, contentItemId: item.id, request: reviewPreview,
      })
      console.log(`OK review-preview ${result.outcome} ${result.previewId} ${result.objectPrefix} (${result.bytes} bytes)`)
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
    return
  }
```

- [ ] **Step 7: Remember the confirmed piece**

Replace:

```ts
      .select('id').eq('client_id', clientId).eq('content_id', publication.contentId).single()
    if (itemError || !item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
```

with:

```ts
      .select('id').eq('client_id', clientId).eq('content_id', publication.contentId).single()
    if (itemError || !item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    publicationItemId = item.id
```

- [ ] **Step 8: Purge after an exact retry of a confirmation**

Replace:

```ts
      console.log(`OK publication-confirm ${existing.id} (existing)`)
      return
```

with:

```ts
      console.log(`OK publication-confirm ${existing.id} (existing)`)
      await purgePreviewsAfterPublication(admin, item.id)
      return
```

- [ ] **Step 9: Purge after a new confirmation**

Replace:

```ts
  console.log(`OK ${command} ${String(data)}`)
```

with:

```ts
  console.log(`OK ${command} ${String(data)}`)
  if (publicationItemId) {
    // Spec 7: once every destination is confirmed live, the portal copy is deleted. Never fails
    // the confirmation above; the nightly cron retries anything left.
    const purge = await purgePreviewsAfterPublication(admin, publicationItemId)
    if (purge && purge.retired > 0) console.log(`Preview retention: removed ${purge.retired} preview(s)`)
  }
```

- [ ] **Step 10: Type-check the script**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec tsc --noEmit -p . 2>&1 | grep -E "portal-write|review-preview" || echo "clean for these files"`
Expected: `clean for these files` (the repo has pre-existing errors in marketing routes; only these files matter, per manual section 17).

- [ ] **Step 11: Dry run validates without touching the database**

With the local env from Task 0 step 3 exported:

```bash
cd ~/worktrees/kanset-media-previews
cat > /tmp/kanset-preview-dryrun.json <<'JSON'
{ "clientSlug": "kanset", "contentId": "rls-kanset-baseline", "contentVersion": 1,
  "previewKey": "reel", "video": "/tmp/kanset-rls-kanset-baseline/fixture/reel.mp4",
  "frames": ["/tmp/kanset-rls-kanset-baseline/fixture/f1.jpg"] }
JSON
pnpm portal-write review-preview /tmp/kanset-preview-dryrun.json --dry-run
cat > /tmp/kanset-preview-bad.json <<'JSON'
{ "clientSlug": "kanset", "contentId": "x", "contentVersion": 1, "previewKey": "reel", "video": "episode.mov" }
JSON
pnpm portal-write review-preview /tmp/kanset-preview-bad.json --dry-run; echo "exit $?"
rm /tmp/kanset-preview-dryrun.json /tmp/kanset-preview-bad.json
```

Expected: first prints `VALID review-preview for kanset ()`; second prints `FAILED: file paths must be absolute: episode.mov` and `exit 1`.

- [ ] **Step 12: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add scripts/portal-write.ts
git -C ~/worktrees/kanset-media-previews commit -m "Add portal-write review-preview and purge previews after publication confirm"
```

---

### Task 9a: Release media pre-check and `--no-media` in the agency commands (amended 2026-10-03)

**Files:**
- Create: `src/lib/portal/release-media-guard.ts`
- Create: `src/lib/portal/release-media-guard.test.ts`
- Create: `src/lib/portal/release-media-wiring.test.ts`
- Modify: `scripts/portal-admin.ts`
- Modify: `scripts/update-portal.ts`
- Modify: `scripts/portal-write.ts`
- Modify: `scripts/portal-ship.ts`

The database refuses a release without media (Task 1a). This task makes every agency command say so before it tries, naming what is missing and how to fix it, and gives each command one explicit way to record Anastasia's override: `--no-media "Approved by Anastasia: <why>"` on the command line, or `"noMediaReason"` in a `portal-write` payload. The override is recorded for that exact version through `agency_record_release_media_override`, which logs it (agency only, no notification). The check runs before any release call; in `update-portal --re-share` it runs after the sync, so a refusal leaves the new version synced but unshared and a re-run retries the release (the existing stranded-release path). `update-portal` exits with code `6`.

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/portal/release-media-guard.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ensureReleaseMedia, hasReleaseMedia, NO_MEDIA_PREFIX, parseReleaseMediaStatus, ReleaseMediaMissingError,
  releaseMediaRefusal, validateNoMediaReason,
} from './release-media-guard'

function fakeDb(status: Record<string, unknown>, override: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = vi.fn(async (fn: string) => fn === 'agency_release_media_status'
    ? { data: status, error: null }
    : { data: override.data ?? { outcome: 'recorded' }, error: override.error ?? null })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
const input = { clientId: 'c1', contentItemId: 'item-1', contentId: 'kanset-reel', version: 3, actorKey: 'thedot-admin' }
const NONE = { review_assets: 0, previews: 0, design_link: false, override_reason: null }

describe('validateNoMediaReason', () => {
  it('accepts the exact prefix with a reason and trims it', () => {
    expect(validateNoMediaReason('  Approved by Anastasia: article, no visual  ')).toBe('Approved by Anastasia: article, no visual')
    expect(validateNoMediaReason(undefined)).toBeNull()
    expect(validateNoMediaReason(null)).toBeNull()
  })

  it('refuses anything else', () => {
    for (const bad of ['approved by anastasia: lower case', 'Agency override authorized by Anastasia: wrong words',
      'Approved by Anastasia:', 'Approved by Anastasia: ok', `${NO_MEDIA_PREFIX} two\nlines`, `${NO_MEDIA_PREFIX} ${'x'.repeat(500)}`, 42]) {
      expect(() => validateNoMediaReason(bad)).toThrow(/Approved by Anastasia:/)
    }
  })
})

describe('status', () => {
  it('parses the database row and knows when media is present', () => {
    expect(parseReleaseMediaStatus({ review_assets: 1, previews: 0, design_link: false, override_reason: null }))
      .toEqual({ reviewAssets: 1, previews: 0, designLink: false, overrideReason: null })
    expect(hasReleaseMedia(parseReleaseMediaStatus(NONE))).toBe(false)
    expect(hasReleaseMedia(parseReleaseMediaStatus({ ...NONE, previews: 2 }))).toBe(true)
    expect(hasReleaseMedia(parseReleaseMediaStatus({ ...NONE, design_link: true }))).toBe(true)
    expect(parseReleaseMediaStatus(null)).toEqual({ reviewAssets: 0, previews: 0, designLink: false, overrideReason: null })
  })

  it('names what is missing and the way out', () => {
    const message = releaseMediaRefusal('kanset-reel', 3)
    expect(message).toContain('REFUSED: kanset-reel v3 has nothing for Maria to look at')
    expect(message).toContain('no review asset, no portal preview and no design link')
    expect(message).toContain('--no-media "Approved by Anastasia: <why>"')
    expect(message).toContain('"noMediaReason"')
  })
})

describe('ensureReleaseMedia', () => {
  it('passes when media is attached and records nothing', async () => {
    const { db, rpc } = fakeDb({ ...NONE, review_assets: 1 })
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: not needed here' })).toBe('media')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('agency_release_media_status', { p_content_item_id: 'item-1', p_content_version: 3 })
  })

  it('passes on an override already on file', async () => {
    const { db, rpc } = fakeDb({ ...NONE, override_reason: 'Approved by Anastasia: article' })
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: null })).toBe('override')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses with a named error when nothing is attached and no reason is given', async () => {
    const { db } = fakeDb(NONE)
    const refusal = ensureReleaseMedia(db, { ...input, noMediaReason: null })
    await expect(refusal).rejects.toBeInstanceOf(ReleaseMediaMissingError)
    await expect(ensureReleaseMedia(db, { ...input, noMediaReason: null })).rejects.toThrow(/kanset-reel v3/)
  })

  it('records the override for that exact version when a reason is given', async () => {
    const { db, rpc } = fakeDb(NONE)
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: text-only post' })).toBe('override')
    expect(rpc).toHaveBeenLastCalledWith('agency_record_release_media_override', {
      p_client_id: 'c1', p_content_id: 'kanset-reel', p_content_version: 3,
      p_reason: 'Approved by Anastasia: text-only post', p_actor_key: 'thedot-admin',
    })
  })

  it('surfaces a refused override instead of releasing', async () => {
    const { db } = fakeDb(NONE, { error: { message: 'v3 already has a no-media override with a different reason' } })
    await expect(ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: another reason' }))
      .rejects.toThrow(/different reason/)
  })
})
```

Create `src/lib/portal/release-media-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The scripts are I/O shells with no harness of their own, so this pins the ORDER that makes the
// friendly refusal useful: the media check runs before each release call.
const read = (name: string) => readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), 'utf8')

function body(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('release media pre-check wiring', () => {
  it('portal-admin ready checks before mark_content_ready and accepts --no-media', () => {
    const src = read('portal-admin.ts')
    const fn = body(src, 'ready')
    expect(fn.indexOf('ensureReleaseMedia(')).toBeGreaterThan(-1)
    expect(fn.indexOf('ensureReleaseMedia(')).toBeLessThan(fn.indexOf("rpc('mark_content_ready'"))
    expect(src).toContain("'--no-media'")
  })

  it('update-portal checks before both release routes and exits 6', () => {
    const src = read('update-portal.ts')
    const fn = body(src, 'releaseReshared')
    const check = fn.indexOf('ensureReleaseMedia(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf("runAdmin(['ready'"))
    expect(check).toBeLessThan(fn.indexOf("'record_agency_supersession'"))
    expect(fn).toMatch(/process\.exitCode = 6/)
    expect(src).toContain("'--no-media'")
  })

  it('portal-write checks courtesy, applied and supersede releases before the RPC', () => {
    const src = read('portal-write.ts')
    for (const rpc of ['record_content_courtesy_release', 'record_agency_applied_release', 'record_agency_supersession']) {
      const at = src.indexOf(`rpc = '${rpc}'`)
      expect(at).toBeGreaterThan(-1)
      expect(src.slice(Math.max(0, at - 200), at)).toContain('releaseCommand = true')
    }
    expect(src.indexOf('ensureReleaseMedia(')).toBeGreaterThan(src.indexOf('if(externalContentId){'))
    expect(src).toContain('payload.noMediaReason')
  })

  it('portal-ship passes the override through to every release it runs', () => {
    const src = read('portal-ship.ts')
    expect(src).toContain("'--no-media'")
    expect(src.match(/noMediaReason/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/release-media-guard.test.ts src/lib/portal/release-media-wiring.test.ts`
Expected: FAIL, cannot resolve `./release-media-guard`; the wiring tests fail on `ensureReleaseMedia(` not found.

- [ ] **Step 3: Implement the shared helper**

Create `src/lib/portal/release-media-guard.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// Release media guard (migration 0092, amended 2026-10-03). A version reaches Maria only with a
// review asset, a portal preview or a design link, or with an override for that exact version
// whose reason starts "Approved by Anastasia:". The database enforces it on every release; this
// module lets the agency scripts refuse first, name what is missing, and record the override.
// No server-only import: the tsx scripts use it with the service-role client.

export const NO_MEDIA_PREFIX = 'Approved by Anastasia:'

export type ReleaseMediaStatus = {
  reviewAssets: number
  previews: number
  designLink: boolean
  overrideReason: string | null
}

export class ReleaseMediaMissingError extends Error {
  readonly missing: string[]
  constructor(message: string) {
    super(message)
    this.name = 'ReleaseMediaMissingError'
    this.missing = ['review_asset', 'portal_preview', 'design_link']
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/

export function validateNoMediaReason(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (!reason.startsWith(NO_MEDIA_PREFIX) || reason.slice(NO_MEDIA_PREFIX.length).trim().length < 3
      || reason.length > 500 || CONTROL.test(reason)) {
    throw new Error(`a no-media override must start "${NO_MEDIA_PREFIX}" and say why, on one line, in at most 500 characters`)
  }
  return reason
}

export function parseReleaseMediaStatus(raw: unknown): ReleaseMediaStatus {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const count = (value: unknown) => {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : 0
  }
  return {
    reviewAssets: count(row.review_assets),
    previews: count(row.previews),
    designLink: row.design_link === true,
    overrideReason: typeof row.override_reason === 'string' ? row.override_reason : null,
  }
}

export function hasReleaseMedia(status: ReleaseMediaStatus): boolean {
  return status.reviewAssets > 0 || status.previews > 0 || status.designLink
}

export function releaseMediaRefusal(contentId: string, version: number): string {
  return [
    `REFUSED: ${contentId} v${version} has nothing for Maria to look at: no review asset, no portal preview and no design link.`,
    `   Attach one to v${version} (portal-write review-asset, review-preview or design-link), then release again.`,
    `   Only with Anastasia's written approval: --no-media "${NO_MEDIA_PREFIX} <why>" (in a portal-write payload, "noMediaReason").`,
  ].join('\n')
}

export async function ensureReleaseMedia(
  db: SupabaseClient,
  input: {
    clientId: string
    contentItemId: string
    contentId: string
    version: number
    noMediaReason: string | null
    actorKey: string
  },
): Promise<'media' | 'override'> {
  const status = await db.rpc('agency_release_media_status', {
    p_content_item_id: input.contentItemId, p_content_version: input.version,
  })
  if (status.error) throw new Error(`release media check failed: ${status.error.message}`)
  const parsed = parseReleaseMediaStatus(status.data)
  if (hasReleaseMedia(parsed)) return 'media'
  if (parsed.overrideReason) return 'override'
  if (!input.noMediaReason) throw new ReleaseMediaMissingError(releaseMediaRefusal(input.contentId, input.version))
  const recorded = await db.rpc('agency_record_release_media_override', {
    p_client_id: input.clientId, p_content_id: input.contentId, p_content_version: input.version,
    p_reason: input.noMediaReason, p_actor_key: input.actorKey,
  })
  if (recorded.error) throw new Error(`no-media override refused: ${recorded.error.message}`)
  return 'override'
}
```

Run: `pnpm exec vitest run src/lib/portal/release-media-guard.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 4: `portal-admin ready`**

In `scripts/portal-admin.ts`, after the line `import { randomUUID } from 'node:crypto'` add:

```ts
import { ensureReleaseMedia, validateNoMediaReason } from '../src/lib/portal/release-media-guard'
```

Replace:

```ts
async function ready(slug: string, contentId: string, expectedVersion?: string) {
```

with:

```ts
async function ready(slug: string, contentId: string, expectedVersion?: string, noMediaReason: string | null = null) {
```

Replace:

```ts
  const { error } = await admin.rpc('mark_content_ready', {
    p_content_id: item.id,
    p_content_version: version,
  })
```

with:

```ts
  // Release media guard (0092): refuse before the database does, naming what is missing.
  const media = await ensureReleaseMedia(admin, {
    clientId: client.id, contentItemId: item.id, contentId, version, noMediaReason, actorKey: 'thedot-admin',
  })
  if (media === 'override') console.log(`release media: none attached; Anastasia's override is on file for v${version}`)

  const { error } = await admin.rpc('mark_content_ready', {
    p_content_id: item.id,
    p_content_version: version,
  })
```

Replace the `ready` action:

```ts
  if (action === 'ready') {
    const [, slug, contentId, version] = process.argv.slice(2)
    if (!slug || !contentId) {
      throw new Error('usage: portal-admin.ts ready <slug> <content_id> [version]')
    }
    await ready(slug, contentId, version)
    return
  }
```

with:

```ts
  if (action === 'ready') {
    const [, slug, contentId, ...rest] = process.argv.slice(2)
    if (!slug || !contentId) {
      throw new Error('usage: portal-admin.ts ready <slug> <content_id> [version] [--no-media "Approved by Anastasia: <why>"]')
    }
    let version: string | undefined
    let noMediaReason: string | null = null
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === '--no-media') {
        const value = rest[i + 1]
        if (!value || value.startsWith('--')) throw new Error('--no-media requires "Approved by Anastasia: <why>"')
        noMediaReason = validateNoMediaReason(value)
        i += 1
      } else if (version === undefined && !rest[i].startsWith('--')) version = rest[i]
      else throw new Error(`unexpected argument: ${rest[i]}`)
    }
    await ready(slug, contentId, version, noMediaReason)
    return
  }
```

- [ ] **Step 5: `update-portal --re-share` (and `--quiet`)**

In `scripts/update-portal.ts`:

1. After the line `import { isUnresolvedContentRequest } from '../src/lib/portal/request-status'` add:

```ts
import { ensureReleaseMedia, ReleaseMediaMissingError, validateNoMediaReason } from '../src/lib/portal/release-media-guard'
```

2. In the header comment, after the line `//     --confirm          Required to actually execute a --re-share --apply.` add:

```ts
//     --no-media "…"     With --re-share, only with Anastasia's written approval: release a version
//                        with no review asset, portal preview or design link. Must start
//                        "Approved by Anastasia:"; recorded for that exact version (0092).
```

and if the header carries plan 1's `EXIT CODES` paragraph, replace its last line

```ts
// short, carousel or single without its frame-by-frame text; spec 2026-10-03 section 9.3).
```

with

```ts
// short, carousel or single without its frame-by-frame text; spec 2026-10-03 section 9.3),
// 6 = release media missing (no review asset, portal preview or design link on the version being
// released, and no "Approved by Anastasia:" override; migration 0092).
```

3. In `type Flags`, replace:

```ts
  changeNote: string | null
  confirm: boolean
}
```

with:

```ts
  changeNote: string | null
  confirm: boolean
  noMediaReason: string | null
}
```

4. In `parseArgs`, replace `  let changeNote: string | null = null` with:

```ts
  let changeNote: string | null = null
  let noMediaReason: string | null = null
```

replace:

```ts
    else if (arg.startsWith('--change-note=')) changeNote = arg.slice('--change-note='.length)
```

with:

```ts
    else if (arg.startsWith('--change-note=')) changeNote = arg.slice('--change-note='.length)
    else if (arg === '--no-media') {
      const candidate = argv[i + 1]
      if (!candidate || candidate.startsWith('--')) throw new Error('--no-media requires "Approved by Anastasia: <why>"')
      noMediaReason = validateNoMediaReason(candidate)
      i += 1
    }
```

replace:

```ts
  if (changeNote !== null && !reShare) throw new Error('--change-note is only valid with --re-share')
```

with:

```ts
  if (changeNote !== null && !reShare) throw new Error('--change-note is only valid with --re-share')
  if (noMediaReason !== null && !reShare) throw new Error('--no-media is only valid with --re-share')
```

and replace:

```ts
  return { target: positional[0], apply: apply && !previewOnly, reShare, quiet, changeNote: note, confirm }
```

with:

```ts
  return { target: positional[0], apply: apply && !previewOnly, reShare, quiet, changeNote: note, confirm, noMediaReason }
```

5. In the `case 'reshare':` call, replace:

```ts
          apply: flags.apply, confirm: flags.confirm, quiet: flags.quiet, report })
```

with:

```ts
          apply: flags.apply, confirm: flags.confirm, quiet: flags.quiet, noMediaReason: flags.noMediaReason, report })
```

6. In `runReshare`'s parameter type, replace:

```ts
  changeNote: string; apply: boolean; confirm: boolean; quiet: boolean
```

with:

```ts
  changeNote: string; apply: boolean; confirm: boolean; quiet: boolean; noMediaReason: string | null
```

7. In `runReshare`'s preview branch, replace:

```ts
    console.log('   To execute: add --apply --confirm.')
```

with:

```ts
    console.log('   To execute: add --apply --confirm.')
    console.log('   The release needs media on the new version (review asset, portal preview or design link),')
    console.log('   or, only with Anastasia\'s written approval, --no-media "Approved by Anastasia: <why>".')
```

8. Replace `    await releaseReshared(ctx, ctx.workingVersion)` with `    if (!(await releaseReshared(ctx, ctx.workingVersion))) return`, and replace `  await releaseReshared(ctx, ctx.newVersion)` with `  if (!(await releaseReshared(ctx, ctx.newVersion))) return`.

9. Replace the start of `releaseReshared`:

```ts
async function releaseReshared(
  ctx: { supabase: Db; clientId: string; contentId: string; changeNote: string; quiet: boolean },
  version: number,
): Promise<void> {
  if (!ctx.quiet) {
    runAdmin(['ready', CLIENT_SLUG, ctx.contentId, String(version)])
    return
  }
  const { data: item, error: itemError } = await ctx.supabase.from('content_items')
    .select('id').eq('client_id', ctx.clientId).eq('content_id', ctx.contentId).single()
  if (itemError || !item) throw new Error(`content item unavailable for quiet release: ${itemError?.message ?? 'missing'}`)
```

with:

```ts
async function releaseReshared(
  ctx: {
    supabase: Db; clientId: string; contentId: string; changeNote: string; quiet: boolean
    noMediaReason: string | null; report: (extra?: Record<string, unknown>) => void
  },
  version: number,
): Promise<boolean> {
  const { data: item, error: itemError } = await ctx.supabase.from('content_items')
    .select('id').eq('client_id', ctx.clientId).eq('content_id', ctx.contentId).single()
  if (itemError || !item) throw new Error(`content item unavailable for release: ${itemError?.message ?? 'missing'}`)
  // Release media guard (0092). The database refuses too; this names what is missing and keeps the
  // run recoverable: the version stays synced but unshared, and re-running retries the release.
  try {
    await ensureReleaseMedia(ctx.supabase, {
      clientId: ctx.clientId, contentItemId: item.id, contentId: ctx.contentId, version,
      noMediaReason: ctx.noMediaReason, actorKey: 'thedot-admin',
    })
  } catch (error) {
    if (!(error instanceof ReleaseMediaMissingError)) throw error
    ctx.report({ outcome: 'refused', reason: 'release media missing', version, missing: error.missing })
    console.error(error.message)
    console.error(`   v${version} is synced but not shared. Attach media to v${version}, then re-run this exact command; it retries the release.`)
    process.exitCode = 6
    return false
  }
  if (!ctx.quiet) {
    runAdmin(['ready', CLIENT_SLUG, ctx.contentId, String(version)])
    return true
  }
```

and replace the end of the function:

```ts
  console.log(`Superseded v${version} quietly: the portal shows the corrected copy and Maria's review stays as it was. No email.`)
}
```

with:

```ts
  console.log(`Superseded v${version} quietly: the portal shows the corrected copy and Maria's review stays as it was. No email.`)
  return true
}
```

The pending-release marker is not cleared on a refusal (the two `return`s happen before `clearPendingMarker`), so the next run takes the stranded-release retry path, which calls `releaseReshared` again.

- [ ] **Step 6: `portal-write courtesy-release`, `applied-release`, `supersede`**

In `scripts/portal-write.ts`:

1. After the line `import { parseProposalBlocks } from '../src/lib/portal/proposals'` add:

```ts
import { ensureReleaseMedia, validateNoMediaReason } from '../src/lib/portal/release-media-guard'
```

2. Replace `  let externalContentId: string | null = null` with:

```ts
  let externalContentId: string | null = null
  // Release media guard (0092): the three commands that release or approve a version for the client.
  let releaseCommand = false
  let releaseMediaReason: string | null = null
```

3. Replace each of these three lines

```ts
    rpc = 'record_content_courtesy_release'; args = {
```

```ts
    rpc = 'record_agency_applied_release'; args = {
```

```ts
    rpc = 'record_agency_supersession'; args = {
```

with the same line preceded by:

```ts
    releaseCommand = true; releaseMediaReason = validateNoMediaReason(payload.noMediaReason)
```

(three edits, one per command; the prefix line is identical in all three).

4. Replace:

```ts
    args.p_content_id=item.id; args.p_content_version=externalContentVersion ?? item.working_version
  }
```

with:

```ts
    args.p_content_id=item.id; args.p_content_version=externalContentVersion ?? item.working_version
    if (releaseCommand) {
      if (!clientId) throw new Error(`${command} requires a client`)
      // Release media guard (0092): name what is missing before the database refuses.
      await ensureReleaseMedia(admin, {
        clientId, contentItemId: item.id, contentId: externalContentId,
        version: args.p_content_version as number, noMediaReason: releaseMediaReason, actorKey: actor,
      })
    }
  }
```

A `--dry-run` returns before this block, so it validates the payload (including the reason's prefix) without touching the database, as before.

- [ ] **Step 7: `portal-ship` passes the override through**

In `scripts/portal-ship.ts`:

1. After `import { planShip, shipOverrideReason, type ShipDestination, type ShipInput } from '../src/lib/portal/ship-plan'` add:

```ts
import { validateNoMediaReason } from '../src/lib/portal/release-media-guard'
```

2. In `parseArgs`, replace:

```ts
      + '[--published-at <iso>] [--apply]')
```

with:

```ts
      + '[--published-at <iso>] [--no-media "Approved by Anastasia: <why>"] [--apply]')
```

replace `  let publishedAt: string | null = null` with:

```ts
  let publishedAt: string | null = null
  let noMediaReason: string | null = null
```

replace:

```ts
    if (arg === '--published-at') { publishedAt = rest[i + 1] ?? null; i += 1; continue }
```

with:

```ts
    if (arg === '--published-at') { publishedAt = rest[i + 1] ?? null; i += 1; continue }
    if (arg === '--no-media') {
      const value = rest[i + 1]
      if (!value || value.startsWith('--')) throw new Error('--no-media requires "Approved by Anastasia: <why>"')
      noMediaReason = validateNoMediaReason(value); i += 1; continue
    }
```

and replace `  return { slug, contentId, links, apply, publishedAt }` with `  return { slug, contentId, links, apply, publishedAt, noMediaReason }`.

3. Replace `  const { slug, contentId, links, apply, publishedAt } = parseArgs()` with `  const { slug, contentId, links, apply, publishedAt, noMediaReason } = parseArgs()`.

4. Replace:

```ts
      run(['scripts/portal-write.ts', 'applied-release', payload('applied-release', {
        contentId, contentVersion: plan.targetVersion, reason, idempotencyKey: randomUUID(),
      })])
```

with:

```ts
      run(['scripts/portal-write.ts', 'applied-release', payload('applied-release', {
        contentId, contentVersion: plan.targetVersion, reason, idempotencyKey: randomUUID(),
        ...(noMediaReason ? { noMediaReason } : {}),
      })])
```

replace:

```ts
      run(['scripts/portal-write.ts', 'courtesy-release', payload('courtesy', {
        contentId, contentVersion: plan.targetVersion, reason, idempotencyKey: randomUUID(),
      })])
```

with:

```ts
      run(['scripts/portal-write.ts', 'courtesy-release', payload('courtesy', {
        contentId, contentVersion: plan.targetVersion, reason, idempotencyKey: randomUUID(),
        ...(noMediaReason ? { noMediaReason } : {}),
      })])
```

and replace:

```ts
      run(['scripts/portal-admin.ts', 'ready', slug, contentId, String(plan.targetVersion)])
```

with:

```ts
      run(['scripts/portal-admin.ts', 'ready', slug, contentId, String(plan.targetVersion),
        ...(noMediaReason ? ['--no-media', noMediaReason] : [])])
```

- [ ] **Step 8: Run the tests and the type check**

```bash
cd ~/worktrees/kanset-media-previews
pnpm exec vitest run src/lib/portal/release-media-guard.test.ts src/lib/portal/release-media-wiring.test.ts src/lib/portal/update-portal-core.test.ts
pnpm exec tsc --noEmit 2>&1 | grep -E "release-media|scripts/(portal-admin|update-portal|portal-write|portal-ship)\.ts" || echo "clean for this task"
```

Expected: PASS (guard 9, wiring 4, and the existing update-portal core tests unchanged); `clean for this task`.

- [ ] **Step 9: Smoke the refusal against the local stack**

With the local env exported (Task 0 step 3):

```bash
cd ~/worktrees/kanset-media-previews
DB="$(supabase status -o env | awk -F= '/^DB_URL=/{gsub(/"/,"",$2); print $2}')"
psql "$DB" -At -c "select ci.content_id from content_items ci join clients c on c.id = ci.client_id where c.slug = 'kanset' and ci.client_visible_version is null limit 1"
```

If that prints a content id, run `pnpm exec tsx scripts/portal-admin.ts ready kanset <that id>` and expect the three-line `REFUSED: ... has nothing for Maria to look at` message and a non-zero exit, with `client_visible_version` still null afterwards. If it prints nothing, the local seed has no unreleased Kanset piece; Task 12a's RM1 covers the same refusal, so record "no unreleased local piece" in the handoff and move on.

- [ ] **Step 10: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/release-media-guard.ts src/lib/portal/release-media-guard.test.ts src/lib/portal/release-media-wiring.test.ts scripts/portal-admin.ts scripts/update-portal.ts scripts/portal-write.ts scripts/portal-ship.ts
git -C ~/worktrees/kanset-media-previews commit -m "Name missing release media in every agency release command, with an explicit override

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Purge from the admin Publication surface

**Files:**
- Modify: `src/app/api/admin/portal/operation/route.ts`

- [ ] **Step 1: Import the purge**

Replace:

```ts
import { createSupabaseAdmin } from '@/lib/supabase/admin'
```

with:

```ts
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { purgePreviewsAfterPublication } from '@/lib/portal/review-preview-retention'
```

- [ ] **Step 2: Read the piece id with the target**

Replace:

```ts
      .select('current_observation_id').eq('id', body.targetId).single()
```

with:

```ts
      .select('current_observation_id,content_id').eq('id', body.targetId).single()
```

- [ ] **Step 3: Purge after a live confirmation**

Replace:

```ts
      p_verification_note: body.note ?? null,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data })
```

with:

```ts
      p_verification_note: body.note ?? null,
    })
    if (error) throw new Error(error.message)
    if (providerState === 'live') await purgePreviewsAfterPublication(admin, target.content_id)
    return NextResponse.json({ result: data })
```

- [ ] **Step 4: Type-check**

Run: `cd ~/worktrees/kanset-media-previews && pnpm exec tsc --noEmit -p . 2>&1 | grep -E "operation/route|review-preview" || echo "clean for these files"`
Expected: `clean for these files`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/app/api/admin/portal/operation/route.ts
git -C ~/worktrees/kanset-media-previews commit -m "Purge review previews when the admin confirms a piece live"
```

---

### Task 11: Keep preview housekeeping out of the client feed

**Files:**
- Modify: `src/lib/portal/data.ts:85-89`

- [ ] **Step 1: Extend the exclusion list**

Replace:

```ts
const CLIENT_FEED_EXCLUDED_EVENTS = ['design_link_updated', 'working_version_discarded',
  'agency_supersession_recorded', 'agency_draft_archived']
```

with:

```ts
// 'review_preview_uploaded' and 'review_preview_deleted' (0092) join them: a preview is a
// temporary portal copy of a render she reviews on the piece page itself. "Preview removed" in
// her feed would read as her media being taken away. The agency activity log keeps both.
const CLIENT_FEED_EXCLUDED_EVENTS = ['design_link_updated', 'working_version_discarded',
  'agency_supersession_recorded', 'agency_draft_archived',
  'review_preview_uploaded', 'review_preview_deleted']
```

Note for reviewers: the activity trigger (`portal_activity_notify`, last redefined in 0078) also enqueues an `in_app` notification row for the client on every agency activity. No client surface renders `notification_outbox` rows (verified 2026-10-03: only `scripts/portal-notification-*` and `src/lib/portal/notify.ts` read that table, and `notify.ts` sends email rows only), and neither event type is in `portal_client_activity_email_required`, so nothing reaches Maria.

- [ ] **Step 2: Run the existing unit suite**

Run: `cd ~/worktrees/kanset-media-previews && pnpm test`
Expected: all suites pass, including the 41 new tests from Tasks 2 to 8.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/data.ts
git -C ~/worktrees/kanset-media-previews commit -m "Keep review preview housekeeping out of the client feed"
```

---

### Task 11a: Keep the no-media override out of the client feed (amended 2026-10-03)

**Files:**
- Modify: `src/lib/portal/data.ts`

`release_media_override` is agency housekeeping (Task 1a flags it `agency_internal`, so it queues no notification), but the activity row is still readable by the tenant through RLS, so the feed filter must drop it too, like the preview events.

- [ ] **Step 1: Extend the exclusion list**

Replace:

```ts
  'review_preview_uploaded', 'review_preview_deleted']
```

with:

```ts
  'review_preview_uploaded', 'review_preview_deleted',
  // 'release_media_override' (0092, amended 2026-10-03): Anastasia's approval to release a version
  // with no media. An agency decision recorded for Ops, not news for Maria.
  'release_media_override']
```

- [ ] **Step 2: Run the unit suite**

Run: `cd ~/worktrees/kanset-media-previews && pnpm test`
Expected: all suites pass.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add src/lib/portal/data.ts
git -C ~/worktrees/kanset-media-previews commit -m "Keep the no-media release override out of the client feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Real-JWT RLS, storage privacy and retention tests

**Files:**
- Modify: `scripts/test-rls.ts`

These run against the disposable local stack only (the script refuses the production host and any non-loopback host).

> **Corrected 2026-10-04:** the service role has no select on `activity_log` (0001, 0064), and client seats no longer read `agency_internal` rows (0092 `act_read`), so the activity assertions read through the service-only `agency_internal_activity(p_client_id, p_content_item_id)` reader instead of `admin.from('activity_log')`.

- [ ] **Step 1: Imports**

In `scripts/test-rls.ts` replace:

```ts
import { deriveMyTasks, renderStatusGatesBlock } from '../src/lib/portal/gates'
```

with:

```ts
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
```

- [ ] **Step 2: Add the RP and RT block**

Insert the block below immediately after these existing lines (the end of the 0088 long-form block, before the block that turns the tenant kill switch off and transfers the decider):

```ts
      check('LF4: a caption-sized edit is unaffected', SHORT.length < 8000, `${SHORT.length} characters`)
    }
```

Block to insert:

```ts

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
            && (replacedLog.data ?? []).some((row: { summary: string | null }) => /new preview replaced/i.test(row.summary ?? '')),
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
            && (liveLog.data ?? []).some((row: { summary: string | null }) => /Live on every destination/.test(row.summary ?? '')),
          observed.error?.message ?? JSON.stringify({ afterLive, rows: liveRow.data, log: liveLog.data }))

        // Amended 2026-10-03: housekeeping activity is flagged agency_internal, so neither the
        // uploads ('anastasia') nor the deletions ('agent') queue a row for Maria or the agency.
        const housekeeping = await rawAdmin.rpc('agency_internal_activity', { p_client_id: bClientId })
          .in('event_type', ['review_preview_uploaded', 'review_preview_deleted'])
          .in('content_id', [previewItemId, datedItemId, liveItemId])
        const housekeepingIds = (housekeeping.data ?? []).map((row: { id: string }) => row.id as string)
        const housekeepingOutbox = housekeepingIds.length
          ? await admin.from('notification_outbox').select('recipient_kind, channel, event_key')
            .in('source_activity_id', housekeepingIds)
          : { data: [] as Array<{ recipient_kind: string }>, error: null }
        check('RT5: preview uploads and deletions queue no notification for the client or the agency',
          !housekeeping.error && housekeepingIds.length >= 4
            && !housekeepingOutbox.error && (housekeepingOutbox.data ?? []).length === 0,
          JSON.stringify({ activity: housekeepingIds.length, error: housekeepingOutbox.error?.message, outbox: housekeepingOutbox.data }))
      } finally {
        await rm(previewDir, { recursive: true, force: true })
      }
    }
```

- [ ] **Step 3: Seed and run against the local stack**

With the local env from Task 0 step 3 exported:

```bash
cd ~/worktrees/kanset-media-previews && supabase db reset && pnpm test:rls:seed-local && pnpm test:rls 2>&1 | tee /tmp/kanset-rls-0092.log | grep -E "^(FAIL|PASS  R[PT])|SUMMARY"
```

Expected: `PASS  RP1` through `PASS  RP12`, `PASS  RT1` through `PASS  RT5`, no `FAIL` lines, and `=== SUMMARY: ALL ASSERTIONS PASSED ===`. If a pre-existing check fails, compare against a run on the base commit before blaming this slice. Delete `/tmp/kanset-rls-0092.log` after recording the summary in the review handoff.

- [ ] **Step 4: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add scripts/test-rls.ts
git -C ~/worktrees/kanset-media-previews commit -m "Prove review preview isolation, privacy and retention with real JWTs"
```

---

### Task 12a: Real-JWT tests for the release media guard (amended 2026-10-03)

**Files:**
- Modify: `scripts/test-rls.ts`

These use `rawAdmin` (Task 1b), never the fixture wrapper, so the guard is exercised exactly as production calls it. Override activity rows are read through `agency_internal_activity` (see the Task 12 correction), and `AI1` (added 2026-10-04, after RM6) proves a client seat reading `activity_log` with its own JWT gets no `agency_internal` row while keeping its ordinary rows.

- [ ] **Step 1: Insert the RM block**

In `scripts/test-rls.ts`, insert the block below immediately after the closing `    }` of the 0092 RP/RT block from Task 12 (the block whose last lines are `        await rm(previewDir, { recursive: true, force: true })`, `      }`, `    }`):

```ts

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
      const overrideIds = (overrideRows.data ?? []).map((row: { id: string }) => row.id as string)
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
```

`randomUUID`, `sync`, `snapshot`, `bClient` and `bClientId` are already in scope in `main` (the RP block and the 0084 discard tests use them).

- [ ] **Step 2: Run against the local stack**

```bash
cd ~/worktrees/kanset-media-previews && supabase db reset && pnpm test:rls:seed-local && pnpm test:rls 2>&1 | grep -E "^(FAIL|PASS  RM)|SUMMARY"
```

Expected: `PASS  RM1` to `PASS  RM6`, no `FAIL` lines, `=== SUMMARY: ALL ASSERTIONS PASSED ===`. Keep the output for the review handoff (Task 15 step 2).

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add scripts/test-rls.ts
git -C ~/worktrees/kanset-media-previews commit -m "Prove the release media guard and its override with real JWTs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: End-to-end smoke of the CLI with real ffmpeg (local only)

**Files:** none changed. Disposable files under `/tmp/kanset-rls-kanset-baseline/` only.

- [ ] **Step 1: Make a synthetic render and frames**

```bash
mkdir -p /tmp/kanset-rls-kanset-baseline/fixture && cd /tmp/kanset-rls-kanset-baseline/fixture
ffmpeg -v error -y -f lavfi -i testsrc=size=1080x1920:rate=30 -f lavfi -i sine=frequency=440 -t 6 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest reel.mp4
ffmpeg -v error -y -ss 1 -i reel.mp4 -frames:v 1 -q:v 3 f1.jpg
ffmpeg -v error -y -ss 4 -i reel.mp4 -frames:v 1 -q:v 3 f2.jpg
ls -la
```

Expected: `reel.mp4`, `f1.jpg`, `f2.jpg` exist.

- [ ] **Step 2: Upload through the real command, then repeat it**

With the local env exported (Task 0 step 3) and the local seed from Task 12 present (it creates the released `rls-kanset-baseline` piece):

```bash
cd ~/worktrees/kanset-media-previews
cat > /tmp/kanset-rls-kanset-baseline/payload.json <<'JSON'
{ "clientSlug": "kanset", "contentId": "rls-kanset-baseline", "contentVersion": 1, "previewKey": "reel",
  "video": "/tmp/kanset-rls-kanset-baseline/fixture/reel.mp4",
  "frames": [{ "path": "/tmp/kanset-rls-kanset-baseline/fixture/f1.jpg", "label": "Opening" },
             { "path": "/tmp/kanset-rls-kanset-baseline/fixture/f2.jpg", "label": "Answer" }] }
JSON
pnpm portal-write review-preview /tmp/kanset-rls-kanset-baseline/payload.json
pnpm portal-write review-preview /tmp/kanset-rls-kanset-baseline/payload.json
```

Expected: first line `OK review-preview registered <uuid> <client>/<item>/v1/reel/<16 hex>/ (<n> bytes)`; second `OK review-preview unchanged <same uuid> ...`. If `rls-kanset-baseline` is not at version 1 in your local seed, read its version with `psql ... -c "select working_version, client_visible_version from content_items where content_id='rls-kanset-baseline'"` and use that number.

- [ ] **Step 3: Check the stored video plays from the start (faststart) and clean up**

```bash
DB="$(supabase status -o env | awk -F= '/^DB_URL=/{gsub(/"/,"",$2); print $2}')"
psql "$DB" -At -c "select video_path, duration_seconds, width_px, height_px, jsonb_array_length(frames) from content_review_previews order by created_at desc limit 1"
rm -rf /tmp/kanset-rls-kanset-baseline
```

Expected: one row, duration about `6.00`, `1080`, `1920`, `2`. The `/tmp/kanset-rls-kanset-baseline/review-preview` work directory is already gone (the command deletes it); the `rm` removes the fixture.

---

### Task 13a: Document the release media guard and prepare the rollout query (amended 2026-10-03)

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify: `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` (workspace doc, outside git)

- [ ] **Step 1: Manual, recipe**

In `docs/PORTAL-AGENT-MANUAL.md` section 18, after the paragraph that starts with `**Attach a podcast review asset:**`, add:

```markdown
**Release media guard (since 0092):** every release refuses a version with no review asset, no
portal preview and no design link: `portal-admin ready`, `update-portal --re-share` (with or
without `--quiet`), `portal-write applied-release`, `courtesy-release` and `supersede`, and
`portal-ship`. The database enforces it (`mark_content_ready` and `record_content_courtesy_release`
call `portal_assert_release_media`); the commands refuse first and name the fix. Review assets and
previews belong to one version, so a new version needs its own (an item-level design link covers
every version). Only with Anastasia's written approval, release without media by passing
`--no-media "Approved by Anastasia: <why>"` (CLI) or `"noMediaReason"` (portal-write payload). That
records one override for that exact version in `content_release_media_overrides` and an
agency-internal `release_media_override` activity row; nobody is notified and Maria's feed does not
show it. A piece with no media in front of Maria shows in Ops My Tasks until media is attached or it
goes live (plan 5). `update-portal` exits 6 on this refusal; the new version stays synced but
unshared, and re-running the same command retries the release.
```

- [ ] **Step 2: Playbook, the release step**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` section 7, "New or changed copy", replace:

```markdown
6. Release through the approved readiness command. Only then is that version visible to Maria.
```

with:

```markdown
6. Release through the approved readiness command. Only then is that version visible to Maria. **Since 0092 every release refuses a version with no review asset, no portal preview and no design link.** Attach one to that exact version first. A piece with nothing to show (an article, a text-only post) needs Anastasia's written OK and `--no-media "Approved by Anastasia: <why>"` (payload `noMediaReason`); never type that prefix without her say-so.
```

This file is mirrored to Notion under the Kanset job hub; update its Notion twin with the same line if one exists.

- [ ] **Step 3: The read-only rollout query (used in Task 15 step 4)**

Save it for the rollout; it changes nothing:

```sql
-- Pieces currently with Maria and what their released version carries. Run after 0092 is applied.
select ci.content_id, ci.client_visible_version, ci.status, ci.planned_date,
  public.agency_release_media_status(ci.id, ci.client_visible_version) as media
from public.content_items ci
join public.clients c on c.id = ci.client_id and c.slug = 'kanset'
where ci.client_visible and ci.archived_at is null and ci.client_visible_version is not null
  and ci.status in ('draft', 'approved', 'scheduled')
order by ci.planned_date nulls last, ci.content_id;
```

Rows whose `media` shows `review_assets = 0`, `previews = 0` and `design_link = false` are pieces Maria is looking at with nothing to look at; the guard does not touch them (it acts on the next release), but list them for Anastasia with the rollout handoff.

- [ ] **Step 4: Commit**

```bash
git -C ~/worktrees/kanset-media-previews add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-media-previews commit -m "Document the release media guard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Documentation and full verification

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify: `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` (workspace doc, outside git)

- [ ] **Step 1: Manual, migration ledger**

In `docs/PORTAL-AGENT-MANUAL.md`, after the table row that starts with `` | `0081_unified_piece_review_bundles` | `` add:

```markdown
| `0092_review_media_previews` | n/a | Private `portal-review-previews` bucket (no client storage policy), `content_review_previews` readable only by the owning seat for the released version, signed links served by the app, a removal queue drained through the Storage API, retention on live-everywhere, superseded, archived and planned date + 7 days, and `review_preview_uploaded` / `review_preview_deleted` activity (flagged `activity_event_types.agency_internal`, so `portal_activity_notify` queues no notification for them). Full podcast episodes and videos over 240 s are refused. |
```

- [ ] **Step 2: Manual, recipe**

In section 18, after the paragraph that starts with `**Attach a podcast review asset:**`, add:

```markdown
**Attach a review preview (portal-hosted copy of a render):** run `portal-write review-preview` with
`clientSlug`, `contentId`, the exact `contentVersion`, a `previewKey` (`reel`, `teaser`, `carousel`),
and absolute local paths: `video` (MP4, at most 50 MiB and 240 s) with optional `poster` and
`frames` (`[path]` or `[{path,label}]`), or `pages` for a carousel or PDF. It uploads the same
render file that goes to Drive; Drive stays the master and Anastasia still supplies every Drive
link. Re-running with the same files answers `unchanged`; changed files replace the old preview and
delete its objects. It emails nobody. Previews are deleted automatically when every destination is
confirmed live (`publication-confirm`, `portal-ship`, the admin Publication surface) and nightly by
`/api/cron/portal-preview-retention` once the planned date is more than 7 days past. Never upload a
full podcast episode; the database refuses it.
```

- [ ] **Step 3: Playbook, which commands email Maria**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`, section 9 table "Which commands email Maria, and which are portal-only", after the row `` | `portal-write review-asset` | no | `` add:

```markdown
| `portal-write review-preview` | no, and the nightly preview retention sweep emails nobody either |
```

This file is mirrored to Notion under the Kanset job hub; update its Notion twin with the same row if one exists.

- [ ] **Step 4: Full verification run**

```bash
cd ~/worktrees/kanset-media-previews
pnpm test
pnpm exec tsc --noEmit -p . 2>&1 | grep -E "review-preview|review-previews|portal-write|operation/route|portal-preview-retention|ReviewPreviewMedia|data\.ts|release-media|portal-admin|update-portal|portal-ship|seed-rls-local" || echo "clean for this slice"
pnpm exec next build
```

Expected: vitest all green; `clean for this slice`; `next build` succeeds and lists `/api/cron/portal-preview-retention`, `/api/client/[slug]/review-previews/[previewId]` and `/api/admin/portal/review-previews/[previewId]` as dynamic routes. Delete `.next/` afterwards if disk is tight (`rm -rf ~/worktrees/kanset-media-previews/.next`).

- [ ] **Step 5: Commit and freeze**

```bash
git -C ~/worktrees/kanset-media-previews add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-media-previews commit -m "Document review previews in the portal manual"
git -C ~/worktrees/kanset-media-previews rev-parse HEAD
```

Record the printed hash: that is the frozen commit for review (playbook section 12, step 2). Stop the local stack when done (`supabase stop`) unless the next task needs it.

---

### Task 15: Review and rollout (needs Anastasia; not done by the executing agent alone)

**Files:** none changed.

- [ ] **Step 1: Confirm the Supabase assumptions** (Anastasia, dashboard): production project plan (Free or Pro), global upload file size limit at least 50 MiB, egress allowance. If the project is on Free, 1 GB of storage is still ample for previews under review, but record the plan in the handoff.
- [ ] **Step 2: Code-review pass on the frozen hash (the `code-review` skill; no Codex lane)** from Task 14 step 5, migration first (manual section 15, tier 1). Hand over: the hash, the replay outputs from Task 1 steps 2 to 4, and the `test:rls` summaries from Task 12 step 3 and Task 12a step 2 (RM1 to RM6). Fix findings in new commits, rerun Tasks 12 and 14, and freeze a new hash.
- [ ] **Step 3: Anastasia's go-ahead.** Show her the frozen hash, the review outcome, the `test:rls` summary and the Step 1 dashboard answers. Nothing below touches production until she says go.
- [ ] **Step 4: Apply 0092 to production** through the same runbook used for 0090 and 0091 (manual section 15, tier 1: backup first, apply in order, capture the migration and `assert_portal_security()` output). The migration must be live before any code that queries `content_review_previews` deploys (playbook section 12, step 4). Then, read-only: `select id, public, file_size_limit from storage.buckets where id = 'portal-review-previews'` shows `public = false`; `select public.assert_portal_security()` succeeds. Then run Task 13a step 3's read-only query and give Anastasia the list of pieces currently with Maria whose released version has no media (amended 2026-10-03: the guard acts on the next release of each, nothing changes for them today).
- [ ] **Step 5: Deploy by pushing the production branch.** The push updates git and a Preview build only; production then needs the CLI deploy in the correction note at the top; there is no separate feature-branch deploy and no direct `vercel --prod`.

```bash
git -C ~/thedot-site status --short | grep -v '^??' || echo "tracked tree clean"
git -C ~/thedot-site checkout feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site pull --ff-only origin feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site merge --ff-only feat/piece-page-media-previews
git -C ~/thedot-site rev-parse HEAD
git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15
```

Expected: `tracked tree clean`, and the printed HEAD is the reviewed frozen hash. If the fast-forward fails because the production branch moved, rebase `feat/piece-page-media-previews` onto it, rerun Tasks 12 and 14, re-review the new hash, get the go-ahead again, then repeat.
- [ ] **Step 6: Verify the deployment.** Watch the Vercel deployment for the pushed commit reach Ready and confirm its commit is the frozen hash. Confirm `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel (both already used by the existing crons) and that the project's cron list shows `/api/cron/portal-preview-retention`. `select public.assert_portal_security()` still succeeds. Do not upload a real Kanset preview until Anastasia has approved that render and asked for it.
- [ ] **Step 7: Clean up**

```bash
git -C ~/thedot-site worktree remove ~/worktrees/kanset-media-previews
git -C ~/thedot-site branch -d feat/piece-page-media-previews
```

Cleanup condition met: no worktree, no `.next` build output, no dev server, no browser process left by this slice; the local Supabase stack is stopped.

---

## Self-review

**Spec coverage**
- Section 7, private portal storage with short-lived signed links scoped to the client: bucket private + no client storage policy (Task 1), RLS row read then server signing (Tasks 2, 5, 6), 10-minute TTL (Task 2), privacy proven with real JWTs (Task 12, RP2 to RP9).
- Section 7, Drive stays the master; Anastasia supplies Drive links: stated in Ground rules, migration header, command comment and manual recipe; no task touches a Drive link.
- Section 7, frame strip images uploaded alongside: `frames` / `pages` in the command (Tasks 4, 9).
- Section 7, retention on live-everywhere and planned date + 7, storage holds only pieces under review: Task 1 retire function (plus superseded and archived), Task 3 drain, Task 7 nightly cron, Tasks 9 and 10 publication hooks, Task 12 RT1 to RT4.
- Section 7, full podcast episodes not uploaded: database refusal + 240 s cap (Task 1), client-side duration check (Task 4), RP10 and RP11.
- Section 7, fallback to the Drive button: unchanged existing behaviour; plan 4 renders the fallback when the readers return an empty list.
- Section 4.2, video inline from portal storage, frame strip as a 4-across grid, horizontal episodes play the trailer only: Task 8 component (minimal), key rule `teaser|trailer|cut` (Task 1).
- Section 8, activity log records preview upload and deletion: `review_preview_uploaded` in register, `review_preview_deleted` on completed removal (Task 1), excluded from the client feed (Task 11), asserted in RP1, RP12, RT2, RT4; no notification queued for either (Task 1 `agency_internal`, RT5).
- Section 12, RLS tests for preview objects and retention against a disposable database: Task 12.
- Deferred to plan 4 by the brief: page viewer, Suggest a change per frame, collapsed frame line, wiring into client and admin pages.

**Release media guard (amended 2026-10-03):** refusal in the database on every release path (`mark_content_ready`, `record_content_courtesy_release`; Task 1a), friendly pre-check and explicit `--no-media` / `noMediaReason` override whose reason must start `Approved by Anastasia:` (Task 9a), override recorded per version and logged as agency-internal activity with no notification (Tasks 1a, 11a), no silent exemption, and real-JWT tests RM1 to RM6 (Task 12a). Shown in Ops by plan 5 (amended). Known consequence: review assets and previews are per version, so every new version (a re-share, Maria's applied edits) needs its own media or the item-level design link; the refusal message says so.

**Placeholder scan:** no TBD or "similar to" steps; every code step carries the code. The one conditional instruction (Task 13 step 2, reading the local seed's version) gives the exact query.

**Type consistency:** `ReviewPreviewRequest`, `PreviewTools`, `MediaProbe`, `UploadResult` are defined in Task 4 and used unchanged in Tasks 9 and 12; `ReviewPreviewRow`, `SignedReviewPreview`, `REVIEW_PREVIEW_COLUMNS`, `signReviewPreview` from Task 2 are used in Tasks 5, 8 and 12; `runPreviewRetention`, `purgePreviewsAfterPublication`, `drainReviewPreviewRemovals` from Task 3 are used in Tasks 4, 7, 9, 10 and 12. RPC names and parameter lists in TypeScript match the SQL signatures in Task 1 (`agency_register_review_preview` 16 parameters, `agency_retire_review_previews(p_now, p_content_item_id)`, `agency_pending_review_preview_removals(p_limit)`, `agency_complete_review_preview_removal(p_removal_id, p_error)`). The object prefix format is built identically in `previewObjectPrefix` and the register function.

**Known risks for the executor**
- `test-rls.ts` fixtures assume `sync_content_item_versions` accepts `format: 'podcast'` and `planned_date` on a v1 snapshot; both are plain columns in 0006, but if a later release-quality rule rejects either, adjust only the fixture, never the guard.
- A removal queued for a prefix and a simultaneous identical re-upload of that prefix can race; the pending function filters out paths a current preview uses, so the only remaining window is between the upload and the register call. Re-running the command repairs it.
- Supabase Storage `remove` of an already-missing object succeeds, so the drain is safe to retry.

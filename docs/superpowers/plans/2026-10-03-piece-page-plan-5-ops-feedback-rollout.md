# Piece Page Plan 5 of 5: Agency Ops, Feedback Card and Rollout Implementation Plan


> **Activity-read correction 2026-10-04 (from plan 2's build).** The service role has no SELECT on `activity_log`, and since 0092 a client seat's `act_read` hides every `agency_internal` event type. Every test below that reads `admin.from('activity_log')` must instead read through the service-role RPC `agency_internal_activity(p_client_id, p_content_item_id)` for `agency_internal` rows, or through a client seat (`bClient`) for ordinary client-visible rows. Adjust each such read when executing the task; the code blocks below predate this.

> **Deploy correction 2026-10-04 (overrides every deploy step below).** Pushing `feat/portal-audit-fixes-2026-09-15` builds a Vercel **Preview only**; production is NOT deployed by a push (found when plan 1 shipped: commit a942714 built as Preview, production unchanged). Production deploys with the Vercel CLI from the clean frozen checkout: `cp -R ~/thedot-site/.vercel <worktree>/.vercel && cd <worktree> && npx vercel --prod --yes`, after the push so git and production match. Agents cannot run the push or the deploy (Claude Code's auto-mode blocks production deploys): hand Anastasia both commands, then confirm the new `target: production` deployment is READY (Vercel `list_deployments`) and verify live with a browser user agent (plain curl gets 403).

**Renumbered 2026-10-03:** this plan's migration is 0095 (plan 4a claims 0094 for review ticks and the approve guard). Build order: 1, 2 (0092), 3 (0093), 4a (0094), 4b, 5 (0095).

**Approved spec; **plan approved by Anastasia 2026-10-03** with all decisions as recommended (switch per seat, preview seat first; server-side ticks gating Approve; DB approve guard on unsent drafts; Approve waits for media; phone nav hidden on the piece page, 767/1100 breakpoints; ProseMirror with our own Markdown codec; cut the line "I usually reply the same day"; Maria's switch flips with plan 5; media guard: design link counts per piece, new versions re-attach media, an approved no-media override silences the no-media alert, playback limits 1 per 10 min / 20 a day / 15 s stall, portal-ship gets --no-media).** Not built yet.

> **Amended 2026-10-03 (after plans 2 and 3 were amended for this plan's cross-review).** (1) The send-failure inbox fix now ships in plan 3's 0093, which re-creates `ack_portal_inbox` with the `client_request_failure_attempt` terminal case and asserts it (plan 3 DR16). Task 1 here no longer introduces that clause; it keeps it verbatim from 0093 and adds only the `agency_inbox_resolutions` case. Task 0 step 4 now expects 0093 as the latest body, Task 1 step 3's diff expects one added clause, and SG5/SG6 stay as a regression check that 0095 kept 0093's rule. (2) Plans 2 and 3 now flag their housekeeping event types `activity_event_types.agency_internal`, so they queue no notification; cross-plan findings 2 and 3 are marked resolved, and decision 5's inbox-only alternative uses the same flag instead of an `'agent'` actor.

> **Amended 2026-10-03 (media guard).** Two Ops signals approved by Anastasia, with letter-suffixed tasks so no existing task moves; run them where they sit. **Task 1a** extends 0095: `agency_open_client_signals` and `agency_resolve_inbox_event` take plan 4a's `review_playback_failed` events (open until Done), and a new service-role `agency_release_media_alerts()` lists every piece currently with Maria (released and visible, `draft`, `approved` or `scheduled`, not yet live and verified on every required destination) whose released version has no review asset, no portal preview and no design link. It clears itself when media is attached or the piece goes live, and an approved no-media override (reason starting `Approved by Anastasia:`, plan 2, 0092) on the released version silences it for that version (Anastasia, 2026-10-03); a newer released version with no media and no override of its own alerts again. The agency panel still shows the override as an informational line. **Task 2a / 3a** add the core lines ("Maria's video didn't play: iPhone, Safari"; "No media on <title> v3: Maria is reviewing it") and the reader. **Task 7a** shows both under My Tasks "From Maria" (counted in "Need you"; the no-media line has no Done). **Task 9a** shows the override, or "Maria has nothing to look at on this version", in the agency panel. **Task 16a** adds SG9, SG10 and SG11 (the override silences the alert). **Task 17a** documents them. Needs plan 2's 0092 (`agency_release_media_status`, `content_release_media_overrides`) and plan 4a's 0094 (`content_review_playback_failures`) on disk; Task 1a's pre-check refuses otherwise. Nothing new emails Maria; the playback email to the agency is plan 4a's.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Anastasia one Agency Ops view of every piece (Maria's exact read-only page plus an agency side panel), raise every client signal the redesign creates (send failures, forgotten unsent edits, carried-over drafts, feedback answers) in My Tasks and the durable inbox, ship the client feedback card, and tell Maria about the new page with one in-portal note.

**Architecture:** One migration (`0095`, see the renumber rule) adds the feedback table and its only writer `submit_portal_feedback`, an agency-only `agency_inbox_resolutions` table with `agency_resolve_inbox_event`, `agency_open_client_signals` (the My Tasks query, with self-closing rules), `agency_raise_unsent_draft_alert_events` (an hourly cron turns plan 3's live alert into one inbox event per seat, piece and Toronto day) and a widened `ack_portal_inbox` so a handled signal never blocks the inbox cursor. The app side is a pure core module (`agency-ops-core.ts`: labels, gate dots, version rows, request states, frame anchors), server readers (`agency-ops.ts`), a "From Maria" panel in My Tasks with a Done button, a rebuilt admin piece page whose centre is the client layout in read-only mode (through one adapter file, `AgencyPieceCenter.tsx`, the only file that touches plan 4's component) and whose right column is `AgencyPanel`, a cookie-style `FeedbackCard` and a one-time `PiecePageAnnouncement` dialog on the client piece page. Nothing in this plan emails Maria.

**Tech Stack:** Supabase Postgres 15 (migration, SECURITY DEFINER RPCs, RLS), Next.js 15 App Router (server components, server actions, route handlers, Vercel Cron), React 19, CSS Modules on The Dot tokens, `@thedot/design-system` (`Button`, `Heading`, `Text`, `Textarea`, plan 1's `TickDot` and `ReviewDots`), Vitest 2 + Testing Library (jsdom), `scripts/test-rls.ts` (real JWT, disposable local stack).

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md` section 8 (Agency Ops), 9.1 (feedback pop-up), 9.2 (first-visit intro, merged into the rollout note, decision 3), 9.5 (rollout), 10 and 10a (design system, dots), 12 (tests). Approved visuals: `~/thedot-site/.superpowers/brainstorm/mockups-2026-10-03/screens-v3/10-admin.html`, `09a-feedback.html`, `09b-first-visit-intro.html`, styles in `../portal-v3.css` (admin lines 302-327, pop-ups 252-258, dots 486-500, phone overrides 380).

**Consumes (approved plans, do not re-implement):**

| From | Interface plan 5 uses |
|---|---|
| Plan 1 | `TickDot` (`checked`, `label?`), `ReviewDots` (`total`, `filled`, `size?: 'md' \| 'sm'`, `label?`) from `@thedot/design-system`; tokens `--dot-off-white`, `--dot-danger`, `--dot-grad-highlight-soft`, `--dot-grad-glow`; yellow `Button` glow |
| Plan 2 | `getAgencyReviewPreviews(contentItemId, contentVersion): Promise<SignedReviewPreview[]>` in `src/lib/portal/review-previews.ts`; `SignedReviewPreview` (`previewKey`, `mediaKind`, `frames: {label,url}[]`, `videoUrl`, `contentVersion`); activity event types `review_preview_uploaded`, `review_preview_deleted` |
| Plan 3 | `getAgencyReviewDrafts(contentItemId): Promise<AgencyReviewDraftRow[]>` and `getUnsentDraftAlerts(now?): Promise<UnsentDraftAlert[]>` in `src/lib/portal/review-drafts.ts`; `UnsentDraftAlert`, `unsentDraftAlertLine` in `src/lib/portal/review-drafts-core.ts`; tables `content_review_drafts` (`anchor`, `anchor_label`, `sent_bundle_id`, `status`, `send_failed_at`, `last_send_error`), `client_request_failures.attempt_id`; inbox event types `review_send_failed` (object `client_request_failure_attempt`, `requires_reconciliation = true`) and `review_drafts_carried_over` (payload `content_id`, `auth_user_id`, `from_version`, `to_version`, `draft_count`); RPC `agency_record_review_send_failure(p_attempt_id, p_draft_ids)`, `save_review_draft(...)` (11 parameters) |
| Plan 4 | The read-only piece layout, see "Shared component boundary with plan 4" below |

---

## Decisions for Anastasia (answer before Task 1; each has a recommendation)

1. **Signals live in the inbox, not as ops tasks.** The existing `ops_tasks` rows have no piece link and an immutable `trigger_note`, so a send failure or feedback answer would show as an unlinked line. This plan keeps each signal as a `portal_inbox_events` row (the durable inbox the CLI already reads), shows open ones in a new **From Maria** panel at the top of My Tasks with a link to the piece and a **Done** button, and records Done in a new `agency_inbox_resolutions` table (never deleted, same shape as `complete_ops_task`). Manual ops tasks are unchanged. **Recommend: yes.**
2. **Signals that close themselves.** A send failure leaves My Tasks once a retry succeeds (plan 3 resolves its failure rows); carried-over drafts leave once Maria keeps or discards them; unsent-edit alerts leave once she sends, discards, or the piece posts. Feedback stays until you press Done. **Recommend: yes.**
3. **One modal, not two.** Spec 9.2 (first-visit intro) and 9.5 (rollout note) both target Maria's first visit to the new page, and she is the only real seat. This plan ships one dialog (09b layout) under a new key `piece_page_2026_10`, with the 09b three lines plus one line about the feedback card. Any future seat sees the same dialog once. **Recommend: yes.**
4. **When the feedback card first appears.** Not on the same visit as the rollout note (two pop-ups at once). It appears from her next visit after she closes the note, then on every visit until she sends it. A "visit" is one browser or installed-app session: Close hides it until she closes the tab or app. **Recommend: yes.**
5. **Feedback emails you.** Her answer writes a client activity row, and the existing trigger (0078) sends one agency email plus an in-app row, exactly like plan 3's send failures. It is a one-time message per seat. It never emails Maria. **Recommend: yes.** If you want inbox only, flag `portal_feedback_submitted` as `agency_internal` in Task 1 (`update public.activity_event_types set agency_internal = true where event_type = 'portal_feedback_submitted';`, the routing plans 2 and 3 added) and the email and in-app row stop. Do not switch the actor to `'agent'`: a non-client actor routes an in-app row to the client.
6. **Her feedback row stays out of her activity feed.** `portal_feedback_submitted` joins `CLIENT_FEED_EXCLUDED_EVENTS`. **Recommend: yes** (spec 9.1 says "unless agreed").
7. **Unsent-edit alerts: My Tasks and inbox, no email.** The hourly cron writes one inbox event per seat, piece and Toronto day; My Tasks shows the live list. You cannot send for her, so an email adds little; My Tasks is your landing page. **Recommend: no email.**
8. **The admin piece page shows the version Maria sees.** When a newer working version is not shared yet, the panel says so ("v3 working, not shared yet") and the full working copy stays one click away in the existing working-copy section below the layout. No version switcher in the read-only view. **Recommend: yes.**
9. **"2 of 3 reviewed" in the admin bar.** Plan 4 owns tab ticks. If plan 4 stores ticks server-side per seat and version, Task 15 adds the count to the admin bar; if ticks are browser-only, the bar shows unsent edits and decision state only. **Recommend: accept whichever plan 4 ships; do not add a table for it here.**

---

## Ground rules for whoever executes this

- **Playbook section 12 governs this build** (`~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`): one editor owns the slice; review a frozen commit; unit tests, one build and real-JWT RLS tests; the migration is applied to production before any code that queries its objects deploys; capture migration and assertion output; push the reviewed branch. **There is no Codex lane** (Anastasia, 2026-09-21): review the frozen hash with the `code-review` skill.
- **Order:** plans 1, 2, 3 and 4 are merged into `feat/portal-audit-fixes-2026-09-15` and live before Task 1 starts. Plan 5 needs plan 3's tables and plan 4's layout.
- **Branch and deploy:** worktree branch `feat/piece-page-ops-feedback`, cut from the tip of `feat/portal-audit-fixes-2026-09-15`. Production deploys by pushing `feat/portal-audit-fixes-2026-09-15` (verified 2026-09-30, `ac03a60`). Task 19 fast-forwards that branch to the reviewed hash and pushes it, only after the migration is live and only when Anastasia says go.
- **One editor owns** `src/app/admin/portal/pieces/[contentId]/`, `src/app/admin/portal/GatesAdmin.tsx`, `src/app/admin/portal/data.ts`, `src/app/admin/portal/page.tsx`, `src/app/client/[slug]/piece/[contentId]/page.tsx`, `scripts/portal-inbox.ts`, `scripts/test-rls.ts`, `vercel.json` and `src/lib/portal/data.ts` while this runs.
- **Migration number and the renumber rule.** This plan uses `0095`, assuming plan 2 landed `0092_review_media_previews.sql`, plan 3 landed `0093_durable_review_drafts.sql`, and plan 4 added no migration. **Before Task 1, run `ls supabase/migrations | tail -3`. Use the next free number after the highest file on disk** (for example `0095` if plan 4 added `0095_*`), rename the file, and change every `0095` mention inside it, in Task 17's docs and in test labels. The fold uses the rename pattern (0081, 0093), so it is order-independent. Nothing else depends on the number.
- **`.env.local` points at production.** Every database command runs with the local-stack override from Task 0 step 3. `scripts/test-rls.ts` refuses the production host by construction; keep it that way.
- **Nothing here emails Maria.** No new event type is in `portal_client_activity_email_required`, the feedback activity is `actor_type = 'client'` (routes to the agency), the cron writes inbox rows only, and client alerts are off since 2026-09-21. The rollout note is in-portal only.
- **Client-facing copy** (the rollout note, the feedback card) is drafted here and **must pass the `kanset-copywriting` skill before deploy** (Task 18). First person singular from Anastasia, point form, no em dashes, no "we".
- **Never `git add -A` or `git add .`;** add only the files each task names. Commits stay local until Task 19.
- **Host-resource discipline (`~/Kanset/CLAUDE.md`):** one worktree, removed after the push is verified; the local Supabase stack is the only disposable database; one full `next build`, in Task 18; no dev server left running; browser automation only for the single phone-width check in Task 18.
- **No em dashes** in any file this plan creates or edits.

**Test commands (from the worktree root):**
- One file: `pnpm exec vitest run <path>`
- Full unit suite: `pnpm test`
- Types for your files only: `pnpm exec tsc --noEmit 2>&1 | grep -E '<your files>' || echo clean` (the repo has pre-existing errors in marketing routes)
- RLS: `pnpm test:rls:seed-local && pnpm test:rls`

---

## Shared component boundary with plan 4

Plan 5 never imports plan 4's internals. It expects **one** component and **one** CSS variable:

```ts
// Expected from plan 4: src/app/client/[slug]/piece/[contentId]/PieceReviewLayout.tsx
export type PieceReviewLayoutProps = {
  // ...every data prop the client page passes today (slug, item, comments, schedule, publication,
  // requests, requestMessages, reviewAssets, capabilities, backHref, backLabel, draftScope)
  // plus plan 2's `previews` and plan 3's `serverDrafts`.
  readOnly?: boolean            // no editors, no Send or Approve, drafts provider in browser-only mode, no ticks written
  sidePanel?: React.ReactNode   // right column on desktop (>= 1100 px), stacked below the content on phone
  bottomBar?: React.ReactNode   // replaces the decision bar when readOnly
}
export default function PieceReviewLayout(props: PieceReviewLayoutProps): JSX.Element
```

```css
/* Expected from plan 4: the decision bar publishes its height so overlays sit above it. */
:root { --piece-bar-h: <bar height>; }
```

Until plan 4's file exists, `AgencyPieceCenter.tsx` (Task 10) renders today's `PieceReviewScreen` inside `ReadOnlyPreview` (exactly what `maria-preview` does now) with the side panel beside it, so plan 5 builds and tests on its own. **Task 15 ("Dependency on plan 4")** switches the adapter to `PieceReviewLayout` once plan 4 is final and adapts to any name or prop difference. Only `AgencyPieceCenter.tsx`, `FeedbackCard.module.css` (the `--piece-bar-h` fallback) and the client `page.tsx` mount change in that task.

---

## Cross-plan findings (read before Task 1)

1. **Plan 3's send-failure event would freeze the inbox cursor. Resolved in plan 3 (amended 2026-10-03).** It is written with `requires_reconciliation = true` and object type `client_request_failure_attempt`, and `ack_portal_inbox` (0014) only treated `content_change_request` objects as terminal. Plan 3 ships first, so its 0093 now re-creates `ack_portal_inbox` with the send-failure terminal case (failure rows all resolved) and asserts it inside `assert_review_draft_security()`, which runs in the fold. Task 1 here keeps that clause verbatim and adds only the agency-resolved case; dropping 0093's clause would fail the fold assertion at the end of 0095.
2. **Plans 2 and 3 wrote housekeeping activity rows with `actor_type = 'agent'`. Resolved in plans 2 and 3 (amended 2026-10-03).** `portal_notification_recipient('agent')` is `'client'`, so each one enqueued a client `in_app` row that `scripts/portal-notification-audit.ts` would count, and no actor type avoids a notification. Plans 2 and 3 now add `activity_event_types.agency_internal` and an early return in `portal_activity_notify` for flagged types (plan 2 RT5, plan 3 DR17). Nothing in this plan writes an `'agent'` activity row.
3. **Plan 3's rollout step described a different deploy path** (a display-plane `vercel --prod`). **Resolved in plan 3 (amended 2026-10-03):** its Task 14 now pushes `feat/portal-audit-fixes-2026-09-15` after review and Anastasia's go-ahead, the same path as Task 19 here.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0095_agency_ops_signals_and_feedback.sql` | Create | Feedback table + `submit_portal_feedback`; `agency_inbox_resolutions` + `agency_resolve_inbox_event`; `agency_open_client_signals`; `agency_raise_unsent_draft_alert_events`; `ack_portal_inbox` widened for agency-resolved signals (0093's send-failure case kept); `assert_agency_ops_feedback_security()`; fold |
| `src/lib/portal/agency-ops-core.ts` | Create | Pure, browser-safe: signal rows to view models, gate dots, version rows, request states, frame anchors, "posts in" and "Maria's view" lines, feedback line |
| `src/lib/portal/agency-ops-core.test.ts` | Create | Unit tests |
| `src/lib/portal/agency-ops.ts` | Create | Server-only readers and the resolve call |
| `src/lib/portal/agency-ops.test.ts` | Create | Reader tests with a fake Supabase client |
| `src/app/api/admin/portal/inbox-resolve/route.ts` | Create | Done button endpoint (admin session, same origin) |
| `src/app/api/admin/portal/inbox-resolve/route.test.ts` | Create | Route tests |
| `src/app/api/cron/portal-unsent-draft-alerts/route.ts` | Create | Hourly cron that raises unsent-edit inbox events |
| `src/app/api/cron/portal-unsent-draft-alerts/route.test.ts` | Create | Cron auth and call tests |
| `vercel.json` | Modify | Register the hourly cron |
| `scripts/portal-inbox.ts` | Modify | `signals` and `resolve` commands |
| `src/app/admin/portal/ClientSignalsPanel.tsx` | Create | My Tasks "From Maria" panel |
| `src/app/admin/portal/ResolveSignalButton.tsx` | Create | Client component: Done |
| `src/app/admin/portal/ClientSignalsPanel.test.tsx` | Create | Component tests |
| `src/app/admin/portal/GatesAdmin.tsx` | Modify | Render the panel, count it in "Need you" |
| `src/app/admin/portal/GatesAdmin.test.tsx` | Modify | New props in existing renders, one new test |
| `src/app/admin/portal/data.ts` | Modify | `loadMyTasksData` returns signals and alerts |
| `src/app/admin/portal/page.tsx` | Modify | Pass the new props |
| `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.ts` | Create | Pure: request views with frame thumbnails, draft summaries, alert sentence |
| `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts` | Create | Unit tests |
| `src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts` | Create | Server loader: everything the admin piece page needs |
| `src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx` | Create | The agency side panel (server component) |
| `src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx` | Create | Component tests |
| `src/app/admin/portal/pieces/[contentId]/agency-panel.module.css` | Create | Panel, gates, versions, requests, alerts, bar, grid |
| `src/app/admin/portal/pieces/[contentId]/AgencyStateBar.tsx` | Create | "Maria's view" bottom bar |
| `src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx` | Create | Adapter: the only file that renders the client layout read-only |
| `src/app/admin/portal/pieces/[contentId]/WorkingCopy.tsx` | Create | The current page's working-copy rendering, extracted unchanged |
| `src/app/admin/portal/pieces/[contentId]/page.tsx` | Rewrite | Compose centre, panel, bar, then comments and requests below |
| `src/lib/portal/portal-feedback.ts` | Create | Prompt key, limits, visit storage keys, visibility rule |
| `src/lib/portal/portal-feedback.test.ts` | Create | Unit tests |
| `src/app/client/[slug]/feedback-actions.ts` | Create | Server actions: submit feedback, acknowledge the rollout note |
| `src/app/client/[slug]/feedback-actions.test.ts` | Create | Action tests |
| `src/app/client/[slug]/piece/[contentId]/FeedbackCard.tsx` | Create | Cookie-style card, 5 rating dots, comment, Close, Send |
| `src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css` | Create | Card styles (09a) |
| `src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx` | Create | Component tests |
| `src/lib/portal/piece-page-announcement.ts` | Create | Announcement key and copy |
| `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.tsx` | Create | One-time dialog (09b) |
| `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.module.css` | Create | Dialog styles |
| `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx` | Create | Component tests |
| `src/app/client/[slug]/piece/[contentId]/page.tsx` | Modify | Read the acknowledgment and feedback row; mount dialog and card |
| `src/lib/portal/data.ts` | Modify | Keep `portal_feedback_submitted` out of the client feed |
| `scripts/test-rls.ts` | Modify | FB1 to FB9 and SG1 to SG7 against the local stack |
| `docs/PORTAL-AGENT-MANUAL.md` | Modify | Ledger row, recipe |
| `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` | Modify (workspace doc, outside git) | Section 6 start-of-day line, section 9 table row |
| `supabase/migrations/0095_agency_ops_signals_and_feedback.sql` (Task 1a) | Modify | `review_playback_failed` in open signals and Done; `agency_release_media_alerts()`; `assert_agency_media_signal_security()` in the fold |
| `src/lib/portal/agency-ops-core.ts`, `agency-ops.ts` (+ tests) (Tasks 2a, 3a) | Modify | Failed-play signal line; `ReleaseMediaAlert`, its line and detail; `getReleaseMediaAlerts` |
| `ClientSignalsPanel.tsx`, `GatesAdmin.tsx`, `data.ts`, `page.tsx` (+ tests) (Task 7a) | Modify | No-media lines in From Maria, counted in Need you |
| `pieces/[contentId]/agency-piece-data.ts`, `AgencyPanel.tsx` (+ test) (Task 9a) | Modify | Override reason or "nothing to look at" in the panel |

---

### Task 0: Workspace and local database

**Files:** none changed.

- [ ] **Step 1: Confirm plans 1 to 4 are merged, then create the one worktree**

```bash
git -C ~/thedot-site fetch origin
git -C ~/thedot-site log --oneline -1 origin/feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site ls-tree --name-only origin/feat/portal-audit-fixes-2026-09-15 supabase/migrations/ | tail -3
git -C ~/thedot-site ls-tree --name-only origin/feat/portal-audit-fixes-2026-09-15 'src/app/client/[slug]/piece/[contentId]/' | grep -E 'PieceReviewLayout|ReviewDraftProvider' || true
git -C ~/thedot-site worktree add ~/worktrees/kanset-ops-feedback -b feat/piece-page-ops-feedback origin/feat/portal-audit-fixes-2026-09-15
cd ~/worktrees/kanset-ops-feedback && pnpm install --frozen-lockfile
```

Expected: the migrations list ends with `0093_durable_review_drafts.sql` (or a plan 4 migration after it, then apply the renumber rule); `PieceReviewLayout.tsx` is listed if plan 4 has landed. If `0093` is missing, stop: plan 3 must land first.

Cleanup condition: remove this worktree in Task 19 after the push is verified.

- [ ] **Step 2: Start the local stack and replay every migration**

```bash
cd ~/worktrees/kanset-ops-feedback && supabase start && supabase db reset
```

Expected: `Finished supabase db reset` with no `ERROR`.

- [ ] **Step 3: Export the provably-local environment for this shell**

Run this in every new shell before any `pnpm test:rls`, `psql` or `tsx` command in this plan:

```bash
cd ~/worktrees/kanset-ops-feedback
eval "$(supabase status -o env | awk -F= '
  /^API_URL=/{print "export NEXT_PUBLIC_SUPABASE_URL=" $2}
  /^ANON_KEY=/{print "export NEXT_PUBLIC_SUPABASE_ANON_KEY=" $2}
  /^SERVICE_ROLE_KEY=/{print "export SUPABASE_SERVICE_ROLE_KEY=" $2}
  /^DB_URL=/{print "export LOCAL_DB_URL=" $2}')"
node -e 'const u=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); if(!["127.0.0.1","localhost"].includes(u.hostname)) {console.error("NOT LOCAL", u.hostname); process.exit(1)} console.log("local", u.host)'
```

Expected: `local 127.0.0.1:54321`.

- [ ] **Step 4: Capture the live bodies this plan replaces**

```bash
psql "$LOCAL_DB_URL" -Atc "select pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::regprocedure)" > /tmp/kanset-ops-feedback-ack-before.sql
grep -c "content_change_request\|client_request_failure_attempt" /tmp/kanset-ops-feedback-ack-before.sql
grep -l "function public.ack_portal_inbox" supabase/migrations/*.sql | tail -1
```

Expected: the count is at least 2 (0014's `content_change_request` rule and 0093's `client_request_failure_attempt` rule) and the latest file is `0093_durable_review_drafts.sql` (plan 3, amended 2026-10-03). If the count is 1, plan 3's amended migration has not landed: stop, plan 3 must land first. If a migration after 0093 redefined `ack_portal_inbox`, merge its extra conditions into Task 1's body before writing it. Cleanup condition: delete `/tmp/kanset-ops-feedback-ack-before.sql` in Task 19.

---
### Task 1: Migration 0095, Agency Ops signals and the feedback card

**Files:**
- Create: `supabase/migrations/0095_agency_ops_signals_and_feedback.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0095_agency_ops_signals_and_feedback.sql`:

```sql
-- Agency Ops signals and the client feedback card (piece page redesign, plan 5; spec 8, 9.1).
--
--   * portal_feedback_responses: one answer per seat per prompt. The seat reads only its own row,
--     so the card never returns after she answers, on any device. Nobody writes the table directly;
--     submit_portal_feedback is the only writer. An answer writes a client activity row (agency
--     email + agency in-app through portal_activity_notify, never the client) and an agency inbox
--     event.
--   * agency_inbox_resolutions: the agency marks a client signal handled. Rows are never deleted.
--   * agency_open_client_signals: what My Tasks shows. A send failure closes itself once a retry
--     resolves its failure rows; carried drafts close themselves once she keeps or discards them;
--     feedback stays open until the agency marks it handled.
--   * agency_raise_unsent_draft_alert_events: the hourly cron turns 0093's live unsent-draft
--     alert into one inbox event per seat, piece and Toronto day.
--   * ack_portal_inbox: an agency-resolved signal no longer blocks the inbox cursor. 0093 already
--     lets a send failure whose rows are all resolved through; that clause is kept verbatim.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.portal_inbox_consumers') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.client_request_failures') is null
     or pg_catalog.to_regclass('public.content_review_drafts') is null
     or pg_catalog.to_regprocedure('public.agency_unsent_review_draft_alerts(timestamptz)') is null
     or pg_catalog.to_regprocedure('public.portal_activity_notify()') is null
     or pg_catalog.to_regprocedure('public.portal_note_grammar_safe(text)') is null then
    raise exception '0095 requires durable review drafts (0093), request failures (0089) and the portal inbox';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type references activity_event_types (0008).
insert into public.activity_event_types (event_type)
values ('portal_feedback_submitted')
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Feedback card answers (spec 9.1).
create table public.portal_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (prompt_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or pg_catalog.char_length(comment) between 1 and 2000),
  -- The piece she was looking at when she answered, for context only. Not a foreign key, so an
  -- archived or removed piece never removes her answer.
  content_item_id uuid,
  seat_name text not null check (pg_catalog.char_length(seat_name) between 1 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, auth_user_id, prompt_key)
);
alter table public.portal_feedback_responses enable row level security;
create policy portal_feedback_responses_read_own on public.portal_feedback_responses
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));
revoke all on public.portal_feedback_responses from public, anon, authenticated, service_role;
grant select (client_id, prompt_key, rating, comment, created_at)
  on public.portal_feedback_responses to authenticated;
grant select on public.portal_feedback_responses to service_role;

create function public.submit_portal_feedback(
  p_client_id uuid,
  p_prompt_key text,
  p_rating int,
  p_comment text,
  p_content_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_comment text := nullif(pg_catalog.btrim(p_comment), '');
  v_row public.portal_feedback_responses%rowtype;
  v_key text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_client_id is null or p_prompt_key is null or p_prompt_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid feedback';
  end if;
  -- Newlines and tabs are fine in a comment; every other control character is refused.
  if v_comment is not null and (pg_catalog.char_length(v_comment) > 2000
     or pg_catalog.regexp_replace(v_comment, E'[\\n\\r\\t]', '', 'g') ~ '[[:cntrl:]]') then
    raise exception 'invalid feedback comment';
  end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_name
    from public.client_users cu
    where cu.auth_user_id = v_uid and cu.client_id = p_client_id;
  if not found then raise exception 'not authorized for this client'; end if;
  if p_content_item_id is not null and not exists (
    select 1 from public.content_items ci
    where ci.id = p_content_item_id and ci.client_id = p_client_id
      and ci.client_visible_version is not null
  ) then
    raise exception 'invalid feedback piece';
  end if;

  insert into public.portal_feedback_responses (
    client_id, auth_user_id, prompt_key, rating, comment, content_item_id, seat_name)
  values (p_client_id, v_uid, p_prompt_key, p_rating, v_comment, p_content_item_id, v_name)
  on conflict (client_id, auth_user_id, prompt_key) do nothing
  returning * into v_row;
  if not found then
    -- One prompt per seat: a second answer (another device, a double tap) changes nothing.
    return pg_catalog.jsonb_build_object('outcome', 'already_submitted');
  end if;

  v_key := 'portal-feedback:' || v_row.id::text;
  -- actor_type 'client' routes this to the agency (0078): one email and one in-app row, never the client.
  insert into public.activity_log (client_id, event_type, event_key, title, summary,
    actor_type, actor_name, related_url)
  values (p_client_id, 'portal_feedback_submitted', v_key,
    'Feedback on the review page: ' || p_rating::text || ' of 5',
    coalesce(v_comment, 'No comment.'),
    'client', v_name, 'https://www.thedotcreative.co/admin/portal')
  on conflict do nothing;
  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (p_client_id, v_key, 'portal_feedback_submitted', 'portal_feedback_response', v_row.id,
    'client', v_name,
    pg_catalog.jsonb_build_object('prompt_key', p_prompt_key, 'rating', p_rating,
      'comment', v_comment, 'content_item_id', p_content_item_id, 'auth_user_id', v_uid),
    false)
  on conflict (client_id, event_key) do nothing;
  return pg_catalog.jsonb_build_object('outcome', 'submitted', 'submitted_at', v_row.created_at);
end;
$$;
revoke all on function public.submit_portal_feedback(uuid,text,int,text,uuid)
  from public, anon, service_role;
grant execute on function public.submit_portal_feedback(uuid,text,int,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Agency handling of client signals (spec 8).
create table public.agency_inbox_resolutions (
  event_id uuid primary key references public.portal_inbox_events(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  resolved_at timestamptz not null default pg_catalog.now(),
  resolved_by uuid not null references public.agency_actors(id),
  note text check (note is null or pg_catalog.char_length(note) between 1 and 1000),
  idempotency_key text not null unique
    check (pg_catalog.char_length(idempotency_key) between 1 and 200)
);
alter table public.agency_inbox_resolutions enable row level security;
revoke all on public.agency_inbox_resolutions from public, anon, authenticated, service_role;
grant select on public.agency_inbox_resolutions to service_role;

create function public.agency_resolve_inbox_event(
  p_event_id uuid,
  p_note text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_event public.portal_inbox_events%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_row public.agency_inbox_resolutions%rowtype;
begin
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;
  if v_note is not null and (pg_catalog.char_length(v_note) > 1000
     or not public.portal_note_grammar_safe(v_note)) then
    raise exception 'invalid resolution note';
  end if;
  select * into v_event from public.portal_inbox_events e where e.id = p_event_id;
  if not found then raise exception 'inbox event not found'; end if;
  if v_event.event_type not in ('review_send_failed', 'review_drafts_carried_over',
      'portal_feedback_submitted', 'review_unsent_drafts_due') then
    raise exception 'not a client signal';
  end if;
  insert into public.agency_inbox_resolutions (event_id, client_id, resolved_by, note, idempotency_key)
  values (v_event.id, v_event.client_id, v_actor.id, v_note, p_idempotency_key)
  on conflict (event_id) do nothing
  returning * into v_row;
  if not found then
    -- Already handled (another tab, a double click): report the first resolution, change nothing.
    select * into v_row from public.agency_inbox_resolutions r where r.event_id = v_event.id;
    return pg_catalog.jsonb_build_object('event_id', v_row.event_id, 'resolved_at', v_row.resolved_at,
      'outcome', 'already_resolved');
  end if;
  return pg_catalog.jsonb_build_object('event_id', v_row.event_id, 'resolved_at', v_row.resolved_at,
    'outcome', 'resolved');
end;
$$;
revoke all on function public.agency_resolve_inbox_event(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.agency_resolve_inbox_event(uuid,text,text,text) to service_role;

-- What My Tasks shows. review_unsent_drafts_due is left out on purpose: My Tasks renders the live
-- 0093 alert instead, which clears itself the moment she sends or discards.
create function public.agency_open_client_signals(p_limit int default 100)
returns table (
  event_id uuid,
  seq bigint,
  client_id uuid,
  event_type text,
  created_at timestamptz,
  actor_name text,
  content_item_id uuid,
  content_key text,
  title text,
  payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.seq, e.client_id, e.event_type, e.created_at, e.actor_name,
    ci.id, ci.content_id, coalesce(cv.title, ci.content_id), e.payload
  from public.portal_inbox_events e
  cross join lateral (
    select case when v.raw ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v.raw::uuid end as item_id
    from (select coalesce(e.payload->>'content_item_id', e.payload->>'content_id') as raw) v
  ) p
  left join public.content_items ci on ci.id = p.item_id and ci.client_id = e.client_id
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id
   and cv.version = coalesce(ci.client_visible_version, ci.working_version)
  where e.event_type in ('review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted')
    and not exists (select 1 from public.agency_inbox_resolutions r where r.event_id = e.id)
    and (
      e.event_type = 'portal_feedback_submitted'
      or (e.event_type = 'review_send_failed' and exists (
        select 1 from public.client_request_failures f
        where f.client_id = e.client_id and f.attempt_id = e.object_id and f.resolved_at is null))
      or (e.event_type = 'review_drafts_carried_over' and exists (
        select 1 from public.content_review_drafts d
        where d.client_id = e.client_id and d.content_item_id = p.item_id
          and d.auth_user_id::text = e.payload->>'auth_user_id'
          and d.status = 'unsent'
          and d.base_version < (e.payload->>'to_version')::int))
    )
  order by e.seq desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.agency_open_client_signals(int) from public, anon, authenticated;
grant execute on function public.agency_open_client_signals(int) to service_role;

-- Hourly cron (spec 8): "Maria has 2 unsent edits on X", once per seat, piece and Toronto day.
create function public.agency_raise_unsent_draft_alert_events(p_now timestamptz default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_day date := (v_now at time zone 'America/Toronto')::date;
  v_alert record;
  v_inserted int;
  v_count int := 0;
begin
  for v_alert in select * from public.agency_unsent_review_draft_alerts(v_now) loop
    insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation)
    values (v_alert.client_id,
      'review-unsent-drafts:' || v_alert.content_item_id::text || ':' || v_alert.auth_user_id::text
        || ':' || v_day::text,
      'review_unsent_drafts_due', 'content_item', v_alert.content_item_id, 'system', 'Review drafts',
      pg_catalog.jsonb_build_object('content_item_id', v_alert.content_item_id,
        'content_key', v_alert.content_id, 'title', v_alert.title,
        'planned_date', v_alert.planned_date, 'auth_user_id', v_alert.auth_user_id,
        'seat_name', v_alert.seat_name, 'unsent_count', v_alert.unsent_count,
        'stale_count', v_alert.stale_count, 'oldest_saved_at', v_alert.oldest_saved_at),
      false)
    on conflict (client_id, event_key) do nothing;
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.agency_raise_unsent_draft_alert_events(timestamptz)
  from public, anon, authenticated;
grant execute on function public.agency_raise_unsent_draft_alert_events(timestamptz) to service_role;

-- Same body as 0093 (0014 plus the send-failure case plan 3 added) plus one terminal case: an
-- agency-resolved signal. The client_request_failure_attempt clause is 0093's, kept verbatim;
-- assert_review_draft_security() checks it, so dropping it fails the fold below.
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
      and not exists(select 1 from public.agency_inbox_resolutions ar where ar.event_id = e.id)
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

-- ---------------------------------------------------------------------------------------------
create function public.assert_agency_ops_feedback_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actual text[];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.portal_feedback_responses'::pg_catalog.regclass)
     or not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.agency_inbox_resolutions'::pg_catalog.regclass) then
    raise exception 'agency ops feedback RLS disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'portal_feedback_responses') <> 1
     or exists (select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'agency_inbox_resolutions') then
    raise exception 'agency ops feedback policy set changed';
  end if;
  if exists (select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in ('portal_feedback_responses', 'agency_inbox_resolutions')
      and (tp.grantee in ('PUBLIC', 'anon')
        or (tp.grantee in ('authenticated', 'service_role') and tp.privilege_type <> 'SELECT')
        or (tp.table_name = 'agency_inbox_resolutions' and tp.grantee = 'authenticated'))) then
    raise exception 'agency ops feedback table privilege';
  end if;
  select pg_catalog.array_agg(cp.column_name::text order by cp.column_name) into v_actual
    from information_schema.column_privileges cp
    where cp.table_schema = 'public' and cp.table_name = 'portal_feedback_responses'
      and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  if v_actual is distinct from array['client_id','comment','created_at','prompt_key','rating'] then
    raise exception 'unsafe feedback grants: %', v_actual;
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.submit_portal_feedback(uuid,text,integer,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.submit_portal_feedback(uuid,text,integer,text,uuid)', 'EXECUTE') then
    raise exception 'feedback writer boundary changed';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public.agency_resolve_inbox_event(uuid,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_resolve_inbox_event(uuid,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_open_client_signals(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_open_client_signals(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_raise_unsent_draft_alert_events(timestamp with time zone)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_raise_unsent_draft_alert_events(timestamp with time zone)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE') then
    raise exception 'agency signal function exposed to a client role';
  end if;
  if pg_catalog.pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure)
       not like '%content_change_request%'
     or pg_catalog.pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure)
       not like '%agency_inbox_resolutions%' then
    raise exception 'ack_portal_inbox lost a terminal rule';
  end if;
  if not exists (select 1 from public.activity_event_types t where t.event_type = 'portal_feedback_submitted') then
    raise exception 'portal_feedback_submitted event type missing';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_agency_ops_feedback_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_agency_ops_feedback_security()', 'EXECUTE') then
    raise exception 'agency ops feedback assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_agency_ops_feedback_security() from public, anon, authenticated;
grant execute on function public.assert_agency_ops_feedback_security() to service_role;

select public.assert_agency_ops_feedback_security();

-- Cumulative fold, the 0081 and 0093 rename pattern: whatever assert_portal_security() is now
-- keeps running under a new name, and this slice's assertion joins it.
alter function public.assert_portal_security() rename to assert_portal_pre_ops_feedback_security;
revoke all on function public.assert_portal_pre_ops_feedback_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_ops_feedback_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_ops_feedback_security();
  perform public.assert_agency_ops_feedback_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
```

- [ ] **Step 2: Fresh replay**

```bash
cd ~/worktrees/kanset-ops-feedback && supabase db reset 2>&1 | tail -5
```

Expected: `Finished supabase db reset`, no `ERROR`. If the replay fails on an earlier assertion that inspects `ack_portal_inbox` by text, read that assertion and keep the text it requires in Task 1's body.

- [ ] **Step 3: Prove the fold, the grants and the ack body**

```bash
psql "$LOCAL_DB_URL" -Atc "select public.assert_portal_security();"
psql "$LOCAL_DB_URL" -Atc "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_agency_ops_feedback_security' as folded;"
psql "$LOCAL_DB_URL" -Atc "select has_function_privilege('authenticated','public.submit_portal_feedback(uuid,text,integer,text,uuid)','EXECUTE'), has_function_privilege('authenticated','public.agency_open_client_signals(integer)','EXECUTE');"
diff <(sed -n '/^begin$/,/^end;$/p' /tmp/kanset-ops-feedback-ack-before.sql) <(psql "$LOCAL_DB_URL" -Atc "select pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::regprocedure)" | sed -n '/^begin$/,/^end;$/p') || true
```

Expected: one empty line from the assertion; `t`; `t|f`; the diff shows only the one added `and not exists(... agency_inbox_resolutions ...)` clause (0093's send-failure clause is unchanged; whitespace differences are fine).

- [ ] **Step 4: Upgrade replay (production order)**

```bash
cd ~/worktrees/kanset-ops-feedback
mv supabase/migrations/0095_agency_ops_signals_and_feedback.sql /tmp/kanset-ops-feedback-0095.sql
supabase db reset 2>&1 | tail -1
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f /tmp/kanset-ops-feedback-0095.sql 2>&1 | tail -3
mv /tmp/kanset-ops-feedback-0095.sql supabase/migrations/0095_agency_ops_signals_and_feedback.sql
supabase db reset 2>&1 | tail -1
```

Expected: the migration applies on top of an already-migrated database ending in `COMMIT`, then the full replay finishes again.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add supabase/migrations/0095_agency_ops_signals_and_feedback.sql
git -C ~/worktrees/kanset-ops-feedback commit -m "Add client feedback answers and agency signal handling (migration 0095)"
```

---

### Task 1a: Media signals in 0095 (amended 2026-10-03)

**Files:**
- Modify: `supabase/migrations/0095_agency_ops_signals_and_feedback.sql`

Two signals Anastasia approved: a failed review video play (plan 4a's `review_playback_failed` inbox event) and a piece in front of Maria with no media. The first is an inbox event that stays until Done. The second is a live list like plan 3's unsent-draft alert: it clears itself the moment media is attached to the released version or the piece is live on every required destination. Requires plan 2's 0092 (`agency_release_media_status`) and plan 4a's 0094 (`content_review_playback_failures`).

- [ ] **Step 1: Let the playback event into the open signals and the Done button**

In `supabase/migrations/0095_agency_ops_signals_and_feedback.sql`, in `agency_open_client_signals`, replace:

```sql
  where e.event_type in ('review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted')
```

with:

```sql
  where e.event_type in ('review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted',
      'review_playback_failed')
```

and replace:

```sql
      e.event_type = 'portal_feedback_submitted'
```

with:

```sql
      e.event_type in ('portal_feedback_submitted', 'review_playback_failed')
```

In `agency_resolve_inbox_event`, replace:

```sql
      'portal_feedback_submitted', 'review_unsent_drafts_due') then
```

with:

```sql
      'portal_feedback_submitted', 'review_unsent_drafts_due', 'review_playback_failed') then
```

- [ ] **Step 2: Insert the media alert function and its assertion**

In the same file, insert the block below immediately **before** the line:

```sql
-- Cumulative fold, the 0081 and 0093 rename pattern: whatever assert_portal_security() is now
```

Block to insert:

```sql
-- ---------------------------------------------------------------------------------------------
-- Media signals (amended 2026-10-03, Anastasia).
--   * review_playback_failed (0094): listed by agency_open_client_signals until Done.
--   * agency_release_media_alerts: every piece currently with Maria (released and visible, not
--     archived, status draft / approved / scheduled, and not yet live and verified on every required
--     destination) whose released version has no review asset, no portal preview and no design link.
--     It clears itself when media is attached or the piece goes live. An approved no-media override
--     (0092, reason starting "Approved by Anastasia:") on that exact released version silences it
--     (Anastasia, 2026-10-03); a newer released version without media or its own override alerts
--     again, because the status is read for client_visible_version only. override_reason is kept in
--     the result for shape stability and is always null here.
do $$
begin
  if pg_catalog.to_regprocedure('public.agency_release_media_status(uuid,integer)') is null
     or pg_catalog.to_regclass('public.content_review_playback_failures') is null
     or not exists (select 1 from public.activity_event_types t where t.event_type = 'review_playback_failed') then
    raise exception '0095 media signals require the release media guard (0092) and playback reports (0094)';
  end if;
end;
$$;

create function public.agency_release_media_alerts()
returns table (
  client_id uuid,
  content_item_id uuid,
  content_key text,
  title text,
  content_version int,
  planned_date date,
  waiting_on text,
  override_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.client_id, ci.id, ci.content_id, coalesce(cv.title, ci.content_id), ci.client_visible_version,
    ci.planned_date,
    case when ci.status = 'draft' then 'review' else 'posting' end,
    m.status->>'override_reason'
  from public.content_items ci
  join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id and cv.version = ci.client_visible_version
  cross join lateral (
    select public.agency_release_media_status(ci.id, ci.client_visible_version) as status
  ) m
  where ci.client_visible and ci.archived_at is null and ci.client_visible_version is not null
    and ci.status in ('draft', 'approved', 'scheduled')
    and coalesce((m.status->>'review_assets')::int, 0) = 0
    and coalesce((m.status->>'previews')::int, 0) = 0
    and not coalesce((m.status->>'design_link')::boolean, false)
    and (m.status->>'override_reason') is null
    and not (
      exists (
        select 1 from public.content_publication_targets t
        where t.client_id = ci.client_id and t.content_id = ci.id
          and t.content_version = ci.client_visible_version and t.required)
      and not exists (
        select 1 from public.content_publication_targets t
        where t.client_id = ci.client_id and t.content_id = ci.id
          and t.content_version = ci.client_visible_version and t.required
          and not (t.status = 'live' and t.reconciliation_status = 'verified')))
  order by ci.planned_date nulls last, ci.content_id
$$;
revoke all on function public.agency_release_media_alerts() from public, anon, authenticated;
grant execute on function public.agency_release_media_alerts() to service_role;

create function public.assert_agency_media_signal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.has_function_privilege('anon', 'public.agency_release_media_alerts()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_release_media_alerts()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_release_media_alerts()', 'EXECUTE') then
    raise exception 'release media alerts are exposed to a client role';
  end if;
  if pg_catalog.pg_get_functiondef('public.agency_open_client_signals(integer)'::pg_catalog.regprocedure)
       not like '%review_playback_failed%'
     or pg_catalog.pg_get_functiondef('public.agency_resolve_inbox_event(uuid,text,text,text)'::pg_catalog.regprocedure)
       not like '%review_playback_failed%' then
    raise exception 'playback failures dropped out of the agency signals';
  end if;
  if pg_catalog.pg_get_functiondef('public.agency_release_media_alerts()'::pg_catalog.regprocedure)
       not like '%override_reason'') is null%' then
    raise exception 'an approved no-media override must silence the media alert';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_agency_media_signal_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_agency_media_signal_security()', 'EXECUTE') then
    raise exception 'agency media signal assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_agency_media_signal_security() from public, anon, authenticated;
grant execute on function public.assert_agency_media_signal_security() to service_role;

select public.assert_agency_media_signal_security();

```

- [ ] **Step 3: Fold it**

In the final `create function public.assert_portal_security()` body of the same file, replace:

```sql
  perform public.assert_agency_ops_feedback_security();
end;
```

with:

```sql
  perform public.assert_agency_ops_feedback_security();
  perform public.assert_agency_media_signal_security();
end;
```

- [ ] **Step 4: Replay and prove it**

```bash
cd ~/worktrees/kanset-ops-feedback && supabase db reset 2>&1 | tail -1
psql "$LOCAL_DB_URL" -Atc "select public.assert_portal_security();"
psql "$LOCAL_DB_URL" -Atc "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_agency_media_signal_security';"
psql "$LOCAL_DB_URL" -Atc "select count(*) from public.agency_release_media_alerts();"
```

Expected: `Finished supabase db reset`; one empty line; `t`; a count (any number, the query runs). Then repeat Task 1 step 4 (upgrade replay) once so the production order is proven with the amended file.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add supabase/migrations/0095_agency_ops_signals_and_feedback.sql
git -C ~/worktrees/kanset-ops-feedback commit -m "List failed plays and media-less pieces with Maria as agency signals (0095)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Agency Ops core (pure)

**Files:**
- Create: `src/lib/portal/agency-ops-core.ts`
- Test: `src/lib/portal/agency-ops-core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/agency-ops-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ResolvedGate } from './gates'
import {
  clientSignalFromRow, feedbackLine, gateDots, gateSummary, mariaViewLine, parseAnchor,
  postsInLabel, requestAnchors, requestStateLabel, unsentAlertDetail, versionRows,
  type OpenClientSignalRow,
} from './agency-ops-core'

const signal = (overrides: Partial<OpenClientSignalRow> = {}): OpenClientSignalRow => ({
  event_id: 'e1', seq: 10, client_id: 'c1', event_type: 'portal_feedback_submitted',
  created_at: '2026-10-03T14:00:00.000Z', actor_name: 'Maria Guerts', content_item_id: null,
  content_key: null, title: null, payload: { rating: 4, comment: 'Much easier on my phone.' },
  ...overrides,
})

describe('clientSignalFromRow', () => {
  it('turns a feedback answer into a resolvable line', () => {
    expect(clientSignalFromRow(signal())).toEqual({
      id: 'e1', kind: 'portal_feedback_submitted', pieceKey: null, pieceTitle: null,
      headline: 'Feedback: 4 of 5', detail: 'Maria: “Much easier on my phone.”',
      createdAt: '2026-10-03T14:00:00.000Z', resolvable: true,
    })
  })

  it('names the piece and the count for a send failure', () => {
    const row = signal({ event_type: 'review_send_failed', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { edit_count: 2, reason_code: 'draft_too_long' } })
    expect(clientSignalFromRow(row)).toMatchObject({
      kind: 'review_send_failed', pieceKey: 'kanset-reel', headline: 'Edits not sent: Hiring cost reel',
      detail: '2 edits refused (draft too long). Her text is saved.',
    })
  })

  it('describes carried-over drafts with both versions', () => {
    const row = signal({ event_type: 'review_drafts_carried_over', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { draft_count: 1, from_version: 1, to_version: 2 } })
    expect(clientSignalFromRow(row)).toMatchObject({
      headline: 'Edits carried to v2: Hiring cost reel', detail: '1 unsent edit written against v1',
    })
  })

  it('drops an event type it does not know', () => {
    expect(clientSignalFromRow(signal({ event_type: 'something_else' }))).toBeNull()
  })
})

describe('dates and lines', () => {
  it('says when a piece posts relative to today (Toronto dates)', () => {
    expect(postsInLabel('2026-10-03', '2026-10-03')).toBe('posts today')
    expect(postsInLabel('2026-10-04', '2026-10-03')).toBe('posts in 1 day')
    expect(postsInLabel('2026-10-06', '2026-10-03')).toBe('posts in 3 days')
    expect(postsInLabel('2026-10-01', '2026-10-03')).toBe('was due Oct 1')
    expect(postsInLabel(null, '2026-10-03')).toBe('no planned date')
  })

  it('describes an unsent-edit alert', () => {
    const now = new Date('2026-10-03T16:00:00.000Z')
    expect(unsentAlertDetail({ oldest_saved_at: '2026-10-02T14:00:00.000Z', planned_date: '2026-10-04' }, '2026-10-03', now))
      .toBe('Saved 26 hours ago · posts in 1 day')
  })

  it('writes the feedback line from the mockup', () => {
    expect(feedbackLine(4, 'Much easier on my phone.')).toBe('Review page: 4 of 5. “Much easier on my phone.”')
    expect(feedbackLine(5, null)).toBe('Review page: 5 of 5. No comment.')
  })

  it('states what Maria sees in one line', () => {
    expect(mariaViewLine({ released: false, decision: null, unsentCount: 0, openEditCount: 0, published: false }))
      .toBe('Not shared with Maria yet')
    expect(mariaViewLine({ released: true, decision: null, unsentCount: 2, openEditCount: 0, published: false }))
      .toBe('2 unsent edits · Approve waiting')
    expect(mariaViewLine({ released: true, decision: null, unsentCount: 0, openEditCount: 1, published: false }))
      .toBe('1 sent edit waiting for you')
    expect(mariaViewLine({ released: true, decision: 'approved', unsentCount: 0, openEditCount: 0, published: false }))
      .toBe('Approved')
    expect(mariaViewLine({ released: true, decision: 'approved', unsentCount: 0, openEditCount: 0, published: true }))
      .toBe('Live')
  })
})

describe('gates and versions', () => {
  const gate = (key: ResolvedGate['key'], state: ResolvedGate['state'], extra: Partial<ResolvedGate> = {}): ResolvedGate =>
    ({ key, state, dest: null, owner: 'anastasia', date: null, note: null, present: true, ...extra })

  it('collapses per-destination gates into one dot per step', () => {
    const dots = gateDots([
      gate('fact-check', 'done', { date: '2026-09-25' }),
      gate('source-in-hand', 'na'),
      gate('design-built', 'done', { date: '2026-09-25' }),
      gate('proofed', 'open'),
      gate('approval-sent', 'open'),
      gate('copy-approved', 'open'),
      gate('scheduled', 'done', { dest: 'instagram', date: '2026-10-01' }),
      gate('scheduled', 'open', { dest: 'youtube' }),
      gate('posted', 'open', { present: false }),
      gate('link-confirmed', 'open'),
    ])
    expect(dots.map((dot) => [dot.key, dot.state, dot.date])).toEqual([
      ['fact-check', 'done', '2026-09-25'], ['source-in-hand', 'na', null], ['design-built', 'done', '2026-09-25'],
      ['proofed', 'open', null], ['approval-sent', 'open', null], ['copy-approved', 'open', null],
      ['scheduled', 'open', null], ['posted', 'absent', null], ['link-confirmed', 'open', null],
    ])
    expect(gateSummary(dots)).toBe('2 of 9 gates')
  })

  it('labels versions working, shared and superseded', () => {
    expect(versionRows([
      { version: 1, synced_at: '2026-09-25T12:00:00Z' },
      { version: 2, synced_at: '2026-09-30T12:00:00Z' },
      { version: 3, synced_at: '2026-10-02T12:00:00Z' },
    ], 3, 2)).toEqual([
      { version: 3, label: 'v3 working, not shared yet', date: '2026-10-02' },
      { version: 2, label: 'v2 shared with Maria', date: '2026-09-30' },
      { version: 1, label: 'v1 superseded', date: '2026-09-25' },
    ])
  })
})

describe('requests', () => {
  it('names every request state in plain words', () => {
    expect(requestStateLabel('pending')).toBe('Open')
    expect(requestStateLabel('applying')).toBe('Being applied')
    expect(requestStateLabel('prepared')).toBe('Being applied')
    expect(requestStateLabel('applied')).toBe('Applied')
    expect(requestStateLabel('rejected')).toBe('Declined')
    expect(requestStateLabel('superseded')).toBe('Superseded')
    expect(requestStateLabel('conflicted')).toBe('Needs attention')
    expect(requestStateLabel('mystery')).toBe('mystery')
  })

  it('parses frame and page anchors', () => {
    expect(parseAnchor('frame:3', 'Frame 3 (0:04)')).toEqual({ kind: 'frame', index: 3, label: 'Frame 3 (0:04)' })
    expect(parseAnchor('page:2', null)).toEqual({ kind: 'page', index: 2, label: 'Page 2' })
    expect(parseAnchor('', null)).toBeNull()
    expect(parseAnchor('frame:x', null)).toBeNull()
  })

  it('finds the frames a sent visual request was written on', () => {
    const anchors = requestAnchors('r1', 'reel-video', [
      { id: 'b1', request_ids: ['r1', 'r2'] },
      { id: 'b2', request_ids: ['r9'] },
    ], [
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:3', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:1', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: '', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null },
      { sent_bundle_id: 'b2', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:5', anchor_label: null },
    ])
    expect(anchors.map((anchor) => anchor.index)).toEqual([1, 3])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/agency-ops-core.test.ts`
Expected: FAIL, cannot resolve `./agency-ops-core`.

- [ ] **Step 3: Implement**

Create `src/lib/portal/agency-ops-core.ts`:

```ts
import { AGENCY_LABELS } from './progress-bar-model'
import { GATE_ORDER, type GateKey, type ResolvedGate } from './gates'

// Pure helpers for Agency Ops (piece page plan 5). Browser-safe: no server imports.

export const CLIENT_SIGNAL_TYPES = [
  'review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted',
] as const
export type ClientSignalType = (typeof CLIENT_SIGNAL_TYPES)[number]

// One row of agency_open_client_signals (migration 0095).
export type OpenClientSignalRow = {
  event_id: string
  seq: number
  client_id: string
  event_type: string
  created_at: string
  actor_name: string
  content_item_id: string | null
  content_key: string | null
  title: string | null
  payload: Record<string, unknown>
}

export type ClientSignal = {
  id: string
  kind: ClientSignalType
  pieceKey: string | null
  pieceTitle: string | null
  headline: string
  detail: string | null
  createdAt: string
  resolvable: boolean
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'The client'
}

export function clientSignalFromRow(row: OpenClientSignalRow): ClientSignal | null {
  if (!(CLIENT_SIGNAL_TYPES as readonly string[]).includes(row.event_type)) return null
  const kind = row.event_type as ClientSignalType
  const piece = row.title ?? row.content_key ?? 'a piece'
  const base = {
    id: row.event_id, kind, pieceKey: row.content_key, pieceTitle: row.title,
    createdAt: row.created_at, resolvable: true,
  }
  if (kind === 'portal_feedback_submitted') {
    const rating = num(row.payload.rating) ?? 0
    const comment = str(row.payload.comment)
    return { ...base, headline: `Feedback: ${rating} of 5`,
      detail: comment ? `${firstName(row.actor_name)}: “${comment}”` : `${firstName(row.actor_name)} left no comment.` }
  }
  if (kind === 'review_send_failed') {
    const count = num(row.payload.edit_count) ?? 0
    const reason = (str(row.payload.reason_code) ?? 'unknown').replaceAll('_', ' ')
    return { ...base, headline: `Edits not sent: ${piece}`,
      detail: `${count === 0 ? 'An edit' : plural(count, 'edit')} refused (${reason}). Her text is saved.` }
  }
  const count = num(row.payload.draft_count) ?? 0
  return { ...base, headline: `Edits carried to v${num(row.payload.to_version) ?? '?'}: ${piece}`,
    detail: `${plural(count, 'unsent edit')} written against v${num(row.payload.from_version) ?? '?'}` }
}

function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

export function postsInLabel(plannedDate: string | null, todayIso: string): string {
  if (!plannedDate) return 'no planned date'
  const days = dayDiff(todayIso, plannedDate)
  if (days === 0) return 'posts today'
  if (days > 0) return `posts in ${plural(days, 'day')}`
  return `was due ${shortDay(plannedDate)}`
}

export function hoursSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000))
}

export function unsentAlertDetail(
  alert: { oldest_saved_at: string; planned_date: string | null },
  todayIso: string,
  now: Date,
): string {
  return `Saved ${plural(hoursSince(alert.oldest_saved_at, now), 'hour')} ago · ${postsInLabel(alert.planned_date, todayIso)}`
}

export function feedbackLine(rating: number, comment: string | null): string {
  return `Review page: ${rating} of 5. ${comment ? `“${comment}”` : 'No comment.'}`
}

export function mariaViewLine(input: {
  released: boolean
  decision: 'approved' | 'change_requested' | null
  unsentCount: number
  openEditCount: number
  published: boolean
}): string {
  if (!input.released) return 'Not shared with Maria yet'
  if (input.published) return 'Live'
  if (input.decision === 'approved') return 'Approved'
  if (input.unsentCount > 0) return `${plural(input.unsentCount, 'unsent edit')} · Approve waiting`
  if (input.openEditCount > 0) return `${plural(input.openEditCount, 'sent edit')} waiting for you`
  return 'Waiting for her review'
}

export type GateDotState = 'done' | 'open' | 'na' | 'absent'
export type GateDot = { key: GateKey; label: string; state: GateDotState; date: string | null }

// One dot per step, the same collapse rule as the Pieces table: absent if any row is untracked,
// done only when every destination is done, n/a when nothing is open, otherwise open.
export function gateDots(gates: ResolvedGate[]): GateDot[] {
  return GATE_ORDER.map((key) => {
    const rows = gates.filter((gate) => gate.key === key)
    const state: GateDotState = rows.length === 0 || rows.some((gate) => !gate.present) ? 'absent'
      : rows.every((gate) => gate.state === 'done') ? 'done'
      : rows.every((gate) => gate.state !== 'open') ? 'na'
      : 'open'
    const dates = rows.map((gate) => gate.date).filter((date): date is string => Boolean(date)).sort()
    return { key, label: AGENCY_LABELS[key], state, date: state === 'done' ? dates.at(-1)?.slice(0, 10) ?? null : null }
  })
}

export function gateSummary(dots: GateDot[]): string {
  return `${dots.filter((dot) => dot.state === 'done').length} of ${dots.length} gates`
}

export type VersionRow = { version: number; label: string; date: string | null }

export function versionRows(
  versions: Array<{ version: number; synced_at: string | null }>,
  workingVersion: number | null | undefined,
  visibleVersion: number | null | undefined,
): VersionRow[] {
  return [...versions].sort((a, b) => b.version - a.version).map((row) => ({
    version: row.version,
    date: row.synced_at ? row.synced_at.slice(0, 10) : null,
    label: row.version === visibleVersion ? `v${row.version} shared with Maria`
      : row.version === workingVersion && (visibleVersion == null || row.version > visibleVersion)
        ? `v${row.version} working, not shared yet`
        : `v${row.version} superseded`,
  }))
}

const REQUEST_STATE: Record<string, string> = {
  pending: 'Open', applying: 'Being applied', prepared: 'Being applied', applied: 'Applied',
  rejected: 'Declined', superseded: 'Superseded', conflicted: 'Needs attention',
}
export function requestStateLabel(status: string): string {
  return REQUEST_STATE[status] ?? status
}

export type FrameAnchor = { kind: 'frame' | 'page'; index: number; label: string }

export function parseAnchor(anchor: string, label: string | null): FrameAnchor | null {
  const match = /^(frame|page):([1-9][0-9]{0,2})$/.exec(anchor)
  if (!match) return null
  const kind = match[1] as 'frame' | 'page'
  const index = Number(match[2])
  return { kind, index, label: label?.trim() || `${kind === 'frame' ? 'Frame' : 'Page'} ${index}` }
}

export type SentDraftAnchorRow = {
  sent_bundle_id: string | null
  target_kind: string
  target_key: string
  anchor: string
  anchor_label: string | null
}

// Plan 3 composes frame notes into one asset edit, so the request row no longer carries the frame.
// The sent drafts keep it: a request's frames are the sent drafts in the same bundle on the same
// asset. Sorted by index, duplicates dropped.
export function requestAnchors(
  requestId: string,
  targetKey: string | null,
  bundles: Array<{ id: string; request_ids: string[] }>,
  sentDrafts: SentDraftAnchorRow[],
): FrameAnchor[] {
  if (!targetKey) return []
  const bundleIds = new Set(bundles.filter((bundle) => bundle.request_ids.includes(requestId)).map((bundle) => bundle.id))
  const seen = new Map<string, FrameAnchor>()
  for (const draft of sentDrafts) {
    if (!draft.sent_bundle_id || !bundleIds.has(draft.sent_bundle_id)) continue
    if (draft.target_kind !== 'asset' || draft.target_key !== targetKey) continue
    const anchor = parseAnchor(draft.anchor, draft.anchor_label)
    if (anchor) seen.set(`${anchor.kind}:${anchor.index}`, anchor)
  }
  return [...seen.values()].sort((a, b) => a.index - b.index)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/agency-ops-core.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/agency-ops-core.ts src/lib/portal/agency-ops-core.test.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the pure Agency Ops helpers for signals, gates, versions and frame anchors"
```

---
### Task 2a: Media signal lines in the core (amended 2026-10-03)

**Files:**
- Modify: `src/lib/portal/agency-ops-core.ts`
- Modify: `src/lib/portal/agency-ops-core.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/portal/agency-ops-core.test.ts`, replace the import block:

```ts
import {
  clientSignalFromRow, feedbackLine, gateDots, gateSummary, mariaViewLine, parseAnchor,
  postsInLabel, requestAnchors, requestStateLabel, unsentAlertDetail, versionRows,
  type OpenClientSignalRow,
} from './agency-ops-core'
```

with:

```ts
import {
  clientSignalFromRow, feedbackLine, gateDots, gateSummary, mariaViewLine, parseAnchor,
  postsInLabel, releaseMediaAlertDetail, releaseMediaAlertLine, requestAnchors, requestStateLabel,
  unsentAlertDetail, versionRows, type OpenClientSignalRow, type ReleaseMediaAlert,
} from './agency-ops-core'
```

and append at the end of the file:

```ts
describe('media signals (amended 2026-10-03)', () => {
  it('names a failed play with the device and browser', () => {
    const row = signal({ event_type: 'review_playback_failed', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { media_kind: 'video', device: 'iPhone', browser: 'Safari', error_code: 'media_err_network', content_version: 2 } })
    expect(clientSignalFromRow(row)).toMatchObject({
      kind: 'review_playback_failed', pieceKey: 'kanset-reel', resolvable: true,
      headline: "Maria's video didn't play: iPhone, Safari",
      detail: 'Hiring cost reel v2 · network error',
    })
  })

  it('says pages for a page preview', () => {
    const row = signal({ event_type: 'review_playback_failed', title: 'Carousel',
      payload: { media_kind: 'pages', device: 'Mac', browser: 'Chrome', error_code: 'unknown', content_version: 1 } })
    expect(clientSignalFromRow(row)?.headline).toBe("Maria's pages didn't load: Mac, Chrome")
  })

  const alert = (overrides: Partial<ReleaseMediaAlert> = {}): ReleaseMediaAlert => ({
    client_id: 'c', content_item_id: 'i', content_key: 'kanset-article', title: 'Work permit article',
    content_version: 3, planned_date: '2026-10-06', waiting_on: 'review', override_reason: null, ...overrides,
  })

  it('describes a piece with Maria that has nothing to look at', () => {
    expect(releaseMediaAlertLine(alert())).toBe('No media on Work permit article v3: Maria is reviewing it')
    expect(releaseMediaAlertLine(alert({ waiting_on: 'posting' }))).toBe('No media on Work permit article v3: approved, not live yet')
    expect(releaseMediaAlertDetail(alert(), '2026-10-03')).toBe('Attach a review asset, preview or design link · posts in 3 days')
    expect(releaseMediaAlertDetail(alert({ override_reason: 'Approved by Anastasia: article, no visual' }), '2026-10-03'))
      .toBe('Approved by Anastasia: article, no visual · posts in 3 days')
  })
})
```

Run: `pnpm exec vitest run src/lib/portal/agency-ops-core.test.ts`
Expected: FAIL (`releaseMediaAlertLine` is not exported; the playback rows return null).

- [ ] **Step 2: Implement**

In `src/lib/portal/agency-ops-core.ts`:

1. After `import { GATE_ORDER, type GateKey, type ResolvedGate } from './gates'` add:

```ts
import { playbackErrorLabel } from './piece-page/playback-failure'
```

2. Replace:

```ts
export const CLIENT_SIGNAL_TYPES = [
  'review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted',
] as const
```

with:

```ts
export const CLIENT_SIGNAL_TYPES = [
  'review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted', 'review_playback_failed',
] as const
```

3. In `clientSignalFromRow`, directly above the line `  const count = num(row.payload.draft_count) ?? 0` add:

```ts
  if (kind === 'review_playback_failed') {
    // 0094 (amended 2026-10-03): her player reported a failed play, once per preview per day.
    const what = str(row.payload.media_kind) === 'pages' ? "pages didn't load" : "video didn't play"
    const version = num(row.payload.content_version)
    return { ...base,
      headline: `${firstName(row.actor_name)}'s ${what}: ${str(row.payload.device) ?? 'Other device'}, ${str(row.payload.browser) ?? 'Other browser'}`,
      detail: `${piece}${version ? ` v${version}` : ''} · ${playbackErrorLabel(str(row.payload.error_code) ?? 'unknown')}` }
  }
```

4. Append at the end of the file:

```ts
// One row of agency_release_media_alerts (0095, amended 2026-10-03): a piece in front of Maria whose
// released version has no review asset, no portal preview and no design link.
export type ReleaseMediaAlert = {
  client_id: string
  content_item_id: string
  content_key: string
  title: string
  content_version: number
  planned_date: string | null
  waiting_on: 'review' | 'posting'
  override_reason: string | null
}

export function releaseMediaAlertLine(alert: ReleaseMediaAlert): string {
  const state = alert.waiting_on === 'review' ? 'Maria is reviewing it' : 'approved, not live yet'
  return `No media on ${alert.title} v${alert.content_version}: ${state}`
}

export function releaseMediaAlertDetail(alert: ReleaseMediaAlert, todayIso: string): string {
  const why = alert.override_reason ?? 'Attach a review asset, preview or design link'
  return `${why} · ${postsInLabel(alert.planned_date, todayIso)}`
}
```

The tests use the file's existing `signal()` factory, whose `actor_name` is `'Maria Guerts'`.

Run: `pnpm exec vitest run src/lib/portal/agency-ops-core.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/agency-ops-core.ts src/lib/portal/agency-ops-core.test.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Describe failed plays and media-less pieces in the Agency Ops core

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Agency Ops server readers

**Files:**
- Create: `src/lib/portal/agency-ops.ts`
- Test: `src/lib/portal/agency-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/agency-ops.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), results: new Map<string, unknown>() }))
function chain(table: string) {
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order']) query[name] = () => query
  query.limit = () => Promise.resolve(mocks.results.get(table))
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.results.get(table)).then(resolve)
  return query
}
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ rpc: mocks.rpc, from: (table: string) => chain(table) }),
}))

import { getLatestFeedback, getOpenClientSignals, getPieceRequestContext, resolveClientSignal } from './agency-ops'

beforeEach(() => { mocks.rpc.mockReset(); mocks.results.clear() })

describe('agency ops readers', () => {
  it('maps open signal rows and drops unknown types', async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { event_id: 'e1', seq: 2, client_id: 'c', event_type: 'portal_feedback_submitted', created_at: 't',
        actor_name: 'Maria Guerts', content_item_id: null, content_key: null, title: null, payload: { rating: 5 } },
      { event_id: 'e2', seq: 1, client_id: 'c', event_type: 'unknown', created_at: 't',
        actor_name: 'x', content_item_id: null, content_key: null, title: null, payload: {} },
    ], error: null })
    const signals = await getOpenClientSignals()
    expect(mocks.rpc).toHaveBeenCalledWith('agency_open_client_signals', { p_limit: 100 })
    expect(signals.map((signal) => signal.id)).toEqual(['e1'])
  })

  it('surfaces a signal read failure instead of an empty, reassuring list', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getOpenClientSignals()).rejects.toThrow(/boom/)
  })

  it('resolves through the audited RPC with the admin actor', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'resolved' }, error: null })
    await resolveClientSignal({ eventId: 'e1', note: null, idempotencyKey: 'k1' })
    expect(mocks.rpc).toHaveBeenCalledWith('agency_resolve_inbox_event', {
      p_event_id: 'e1', p_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: 'k1',
    })
  })

  it('reads the latest feedback answers', async () => {
    mocks.results.set('portal_feedback_responses', { data: [
      { seat_name: 'Maria Guerts', rating: 4, comment: 'Much easier.', created_at: '2026-10-03T10:00:00Z', prompt_key: 'p' },
    ], error: null })
    expect(await getLatestFeedback('c')).toEqual([
      { seatName: 'Maria Guerts', rating: 4, comment: 'Much easier.', createdAt: '2026-10-03T10:00:00Z', promptKey: 'p' },
    ])
  })

  it('loads bundles, sent anchors and versions for one piece', async () => {
    mocks.results.set('content_edit_review_bundles', { data: [{ id: 'b1', request_ids: ['r1'] }], error: null })
    mocks.results.set('content_review_drafts', { data: [{ sent_bundle_id: 'b1', target_kind: 'asset',
      target_key: 'reel-video', anchor: 'frame:2', anchor_label: null }], error: null })
    mocks.results.set('content_item_versions', { data: [{ version: 1, synced_at: '2026-09-25T00:00:00Z' }], error: null })
    const context = await getPieceRequestContext('c', 'item')
    expect(context.bundles).toHaveLength(1)
    expect(context.sentDrafts[0].anchor).toBe('frame:2')
    expect(context.versions[0].version).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/agency-ops.test.ts`
Expected: FAIL, cannot resolve `./agency-ops`.

- [ ] **Step 3: Implement**

Create `src/lib/portal/agency-ops.ts`:

```ts
import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import {
  clientSignalFromRow, type ClientSignal, type OpenClientSignalRow, type SentDraftAnchorRow,
} from './agency-ops-core'

// Agency Ops readers (migration 0095). Service role only; never imported by a client route.

const ACTOR_KEY = 'thedot-admin'

export async function getOpenClientSignals(limit = 100): Promise<ClientSignal[]> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_open_client_signals', { p_limit: limit })
  if (error) throw new Error(`client signals unavailable: ${error.message}`)
  return ((data ?? []) as OpenClientSignalRow[])
    .map(clientSignalFromRow)
    .filter((signal): signal is ClientSignal => signal !== null)
}

export async function resolveClientSignal(input: {
  eventId: string
  note: string | null
  idempotencyKey: string
}): Promise<{ outcome: 'resolved' | 'already_resolved' }> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_resolve_inbox_event', {
    p_event_id: input.eventId, p_note: input.note, p_actor_key: ACTOR_KEY,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(error.message)
  return { outcome: (data as { outcome?: string } | null)?.outcome === 'already_resolved' ? 'already_resolved' : 'resolved' }
}

export type FeedbackSummary = {
  seatName: string
  rating: number
  comment: string | null
  createdAt: string
  promptKey: string
}

export async function getLatestFeedback(clientId: string, limit = 3): Promise<FeedbackSummary[]> {
  const { data, error } = await createSupabaseAdmin().from('portal_feedback_responses')
    .select('seat_name, rating, comment, created_at, prompt_key')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`feedback unavailable: ${error.message}`)
  return ((data ?? []) as Array<{ seat_name: string; rating: number; comment: string | null; created_at: string; prompt_key: string }>)
    .map((row) => ({ seatName: row.seat_name, rating: row.rating, comment: row.comment,
      createdAt: row.created_at, promptKey: row.prompt_key }))
}

export type PieceRequestContext = {
  bundles: Array<{ id: string; request_ids: string[] }>
  sentDrafts: SentDraftAnchorRow[]
  versions: Array<{ version: number; synced_at: string | null }>
}

// What the admin piece page needs beyond plan 3's readers: the bundles (to map a request to its
// sent drafts), the sent drafts' frame anchors, and every version's sync date.
export async function getPieceRequestContext(clientId: string, contentItemId: string): Promise<PieceRequestContext> {
  const admin = createSupabaseAdmin()
  const [bundles, drafts, versions] = await Promise.all([
    admin.from('content_edit_review_bundles').select('id, request_ids')
      .eq('client_id', clientId).eq('content_id', contentItemId).limit(200),
    admin.from('content_review_drafts').select('sent_bundle_id, target_kind, target_key, anchor, anchor_label')
      .eq('client_id', clientId).eq('content_item_id', contentItemId).eq('status', 'sent').limit(500),
    admin.from('content_item_versions').select('version, synced_at')
      .eq('client_id', clientId).eq('content_item_id', contentItemId).order('version', { ascending: false }).limit(50),
  ])
  const failure = bundles.error ?? drafts.error ?? versions.error
  if (failure) throw new Error(`piece request context unavailable: ${failure.message}`)
  return {
    bundles: (bundles.data ?? []) as PieceRequestContext['bundles'],
    sentDrafts: (drafts.data ?? []) as SentDraftAnchorRow[],
    versions: (versions.data ?? []) as PieceRequestContext['versions'],
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/lib/portal/agency-ops.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/agency-ops.ts src/lib/portal/agency-ops.test.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Add Agency Ops readers for client signals, feedback and request anchors"
```

---

### Task 3a: Read the media alerts (amended 2026-10-03)

**Files:**
- Modify: `src/lib/portal/agency-ops.ts`
- Modify: `src/lib/portal/agency-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/portal/agency-ops.test.ts`, replace:

```ts
import { getLatestFeedback, getOpenClientSignals, getPieceRequestContext, resolveClientSignal } from './agency-ops'
```

with:

```ts
import {
  getLatestFeedback, getOpenClientSignals, getPieceRequestContext, getReleaseMediaAlerts, resolveClientSignal,
} from './agency-ops'
```

and append at the end of the file:

```ts
describe('release media alerts (amended 2026-10-03)', () => {
  it('reads the live list through the agency RPC', async () => {
    const row = { client_id: 'c', content_item_id: 'i', content_key: 'k', title: 'T', content_version: 2,
      planned_date: null, waiting_on: 'review', override_reason: null }
    mocks.rpc.mockResolvedValue({ data: [row], error: null })
    expect(await getReleaseMediaAlerts()).toEqual([row])
    expect(mocks.rpc).toHaveBeenCalledWith('agency_release_media_alerts')
  })

  it('surfaces a read failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getReleaseMediaAlerts()).rejects.toThrow(/boom/)
  })
})
```

Run: `pnpm exec vitest run src/lib/portal/agency-ops.test.ts`
Expected: FAIL, `getReleaseMediaAlerts` is not exported.

- [ ] **Step 2: Implement**

In `src/lib/portal/agency-ops.ts`, replace:

```ts
import {
  clientSignalFromRow, type ClientSignal, type OpenClientSignalRow, type SentDraftAnchorRow,
} from './agency-ops-core'
```

with:

```ts
import {
  clientSignalFromRow, type ClientSignal, type OpenClientSignalRow, type ReleaseMediaAlert, type SentDraftAnchorRow,
} from './agency-ops-core'
```

and append at the end of the file:

```ts
// Pieces in front of Maria with nothing to look at (0095, amended 2026-10-03). Live: a row
// disappears once media is attached to the released version or the piece is live everywhere.
export async function getReleaseMediaAlerts(): Promise<ReleaseMediaAlert[]> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_release_media_alerts')
  if (error) throw new Error(`release media alerts unavailable: ${error.message}`)
  return (data ?? []) as ReleaseMediaAlert[]
}
```

Run: `pnpm exec vitest run src/lib/portal/agency-ops.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/agency-ops.ts src/lib/portal/agency-ops.test.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Read the live list of media-less pieces with Maria

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Done endpoint

**Files:**
- Create: `src/app/api/admin/portal/inbox-resolve/route.ts`
- Test: `src/app/api/admin/portal/inbox-resolve/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/admin/portal/inbox-resolve/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(), assertSameOriginRequest: vi.fn(), resolveClientSignal: vi.fn(),
}))
vi.mock('@/lib/admin-security', () => ({
  requireAdminSession: mocks.requireAdminSession, assertSameOriginRequest: mocks.assertSameOriginRequest,
}))
vi.mock('@/lib/portal/agency-ops', () => ({ resolveClientSignal: mocks.resolveClientSignal }))

import { POST } from './route'

const EVENT = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const KEY = '6fa459ea-ee8a-4ca4-894e-db77e160355e'
const post = (body: unknown) => POST(new Request('https://www.thedotcreative.co/api/admin/portal/inbox-resolve', {
  method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://www.thedotcreative.co' },
}))

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.requireAdminSession.mockResolvedValue({ role: 'admin' })
  mocks.resolveClientSignal.mockResolvedValue({ outcome: 'resolved' })
})

describe('POST /api/admin/portal/inbox-resolve', () => {
  it('resolves one signal', async () => {
    const response = await post({ eventId: EVENT, idempotencyKey: KEY })
    expect(response.status).toBe(200)
    expect(mocks.resolveClientSignal).toHaveBeenCalledWith({ eventId: EVENT, note: null, idempotencyKey: KEY })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('refuses a malformed body', async () => {
    expect((await post({ eventId: 'nope', idempotencyKey: KEY })).status).toBe(400)
    expect((await post({ eventId: EVENT, idempotencyKey: KEY, note: 'x'.repeat(1001) })).status).toBe(400)
    expect(mocks.resolveClientSignal).not.toHaveBeenCalled()
  })

  it('refuses without an admin session or from another origin', async () => {
    mocks.requireAdminSession.mockRejectedValueOnce(new Error('ADMIN_AUTH_REQUIRED'))
    expect((await post({ eventId: EVENT, idempotencyKey: KEY })).status).toBe(401)
    mocks.assertSameOriginRequest.mockImplementationOnce(() => { throw new Error('INVALID_ORIGIN') })
    expect((await post({ eventId: EVENT, idempotencyKey: KEY })).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/app/api/admin/portal/inbox-resolve/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `src/app/api/admin/portal/inbox-resolve/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { assertSameOriginRequest, requireAdminSession } from '@/lib/admin-security'
import { resolveClientSignal } from '@/lib/portal/agency-ops'

// My Tasks "Done" on a client signal (migration 0095). Agency only; writes one resolution row.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as { eventId?: string; idempotencyKey?: string; note?: string }
    const note = body.note?.trim() || null
    if (!body.eventId?.match(UUID) || !body.idempotencyKey?.match(UUID) || (note && note.length > 1000)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    }
    const result = await resolveClientSignal({ eventId: body.eventId, note, idempotencyKey: body.idempotencyKey })
    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resolve failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status, headers: NO_STORE })
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/app/api/admin/portal/inbox-resolve/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/app/api/admin/portal/inbox-resolve/route.ts src/app/api/admin/portal/inbox-resolve/route.test.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the agency endpoint that marks a client signal handled"
```

---

### Task 5: `portal-inbox signals` and `portal-inbox resolve`

**Files:**
- Modify: `scripts/portal-inbox.ts`

The CLI is how agents read the inbox (`portal-inbox list/show/ack`). Two commands keep it consistent with the new panel. No unit test: the script has none today and both commands are a single RPC each; Task 16 exercises the RPCs with real JWTs and Step 3 runs them against the local stack.

- [ ] **Step 1: Add the commands**

In `scripts/portal-inbox.ts`, find

```ts
  }else if(command==='retry-projections'){
```

and insert immediately **before** it:

```ts
  }else if(command==='signals'){
    // Open client signals for Agency Ops (migration 0095): send failures, carried drafts, feedback.
    const result=await admin.rpc('agency_open_client_signals',{p_limit:200})
    if(result.error) throw new Error(result.error.message)
    const rows=((result.data ?? []) as Array<Record<string,unknown>>).filter((row)=>row.client_id===client.id)
    if(!rows.length){console.log(`No open client signals for ${slug}.`);return}
    for(const row of rows) console.log(`${row.event_id} ${row.created_at} ${row.event_type} ${row.content_key ?? '-'} ${row.actor_name}`)
  }else if(command==='resolve'){
    const note=rest.join(' ').trim()
    if(!value) throw new Error('usage: portal-inbox resolve <clientSlug> <event-uuid> ["<note>"]')
    const shown=await admin.rpc('show_portal_inbox_event',{p_client_id:client.id,p_event_id:value})
    if(shown.error) throw new Error(shown.error.message)
    const result=await admin.rpc('agency_resolve_inbox_event',{p_event_id:(shown.data as {id:string}).id,
      p_note:note||null,p_actor_key:'thedot-admin',p_idempotency_key:randomUUID()})
    if(result.error) throw new Error(result.error.message)
    console.log(`${(result.data as {outcome:string}).outcome} ${(shown.data as {id:string}).id} for ${slug}.`)
```

Then replace the usage string at the end of `main`:

```ts
  }else throw new Error('usage: portal-inbox <list|show|ack|apply-edit|apply-edit-batch|resume-edit|apply-create|apply-archive|supersede|reject|retry-projections> <clientSlug> [value]')
```

with

```ts
  }else throw new Error('usage: portal-inbox <list|show|ack|signals|resolve|apply-edit|apply-edit-batch|resume-edit|apply-create|apply-archive|supersede|reject|retry-projections> <clientSlug> [value]')
```

- [ ] **Step 2: Type-check the script**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'scripts/portal-inbox' || echo clean`
Expected: `clean`.

- [ ] **Step 3: Run both commands against the local stack**

With Task 0 step 3's environment exported:

```bash
cd ~/worktrees/kanset-ops-feedback
pnpm exec tsx scripts/portal-inbox.ts signals kanset
pnpm exec tsx scripts/portal-inbox.ts resolve kanset 00000000-0000-4000-8000-000000000000 2>&1 | tail -1
```

Expected: `No open client signals for kanset.`; then `FAILED: inbox event not found for client`.

- [ ] **Step 4: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add scripts/portal-inbox.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Let portal-inbox list open client signals and mark one handled"
```

---

### Task 6: Hourly unsent-edit alert cron

**Files:**
- Create: `src/app/api/cron/portal-unsent-draft-alerts/route.ts`
- Test: `src/app/api/cron/portal-unsent-draft-alerts/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cron/portal-unsent-draft-alerts/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({ rpc }) }))

import { GET } from './route'

const call = (token?: string) => GET(new Request('https://www.thedotcreative.co/api/cron/portal-unsent-draft-alerts', {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}))

beforeEach(() => {
  rpc.mockReset()
  process.env.CRON_SECRET = 'cron-secret-for-tests'
})

describe('GET /api/cron/portal-unsent-draft-alerts', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('wrong')).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('raises alert events and reports how many were new', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })
    const response = await call('cron-secret-for-tests')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ raised: 2 })
    expect(rpc).toHaveBeenCalledWith('agency_raise_unsent_draft_alert_events', { p_now: null })
  })

  it('fails loudly when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await call('cron-secret-for-tests')).status).toBe(500)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/app/api/cron/portal-unsent-draft-alerts/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `src/app/api/cron/portal-unsent-draft-alerts/route.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// Hourly (vercel.json). Turns plan 3's live unsent-draft alert into one agency inbox event per
// seat, piece and Toronto day (migration 0095). Idempotent; writes no activity and sends no email.
export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret), b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const { data, error } = await createSupabaseAdmin().rpc('agency_raise_unsent_draft_alert_events', { p_now: null })
  if (error) {
    console.error('unsent draft alerts failed:', error.message)
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ raised: typeof data === 'number' ? data : 0 }, { headers: NO_STORE })
}
```

- [ ] **Step 4: Register the schedule**

In `vercel.json`, add one entry to `crons` (keep plan 2's retention entry and every existing one):

```json
    { "path": "/api/cron/portal-unsent-draft-alerts", "schedule": "23 * * * *" }
```

Run: `node -e 'const c=require("./vercel.json").crons; console.log(c.length, c.some(x=>x.path==="/api/cron/portal-unsent-draft-alerts"))'`
Expected: the previous count plus one, then `true`.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run src/app/api/cron/portal-unsent-draft-alerts/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/app/api/cron/portal-unsent-draft-alerts vercel.json
git -C ~/worktrees/kanset-ops-feedback commit -m "Raise forgotten unsent edits in the agency inbox every hour"
```

---
### Task 7: My Tasks "From Maria" panel

**Files:**
- Create: `src/app/admin/portal/ClientSignalsPanel.tsx`
- Create: `src/app/admin/portal/ResolveSignalButton.tsx`
- Test: `src/app/admin/portal/ClientSignalsPanel.test.tsx`
- Modify: `src/app/admin/portal/GatesAdmin.tsx`
- Modify: `src/app/admin/portal/GatesAdmin.test.tsx`
- Modify: `src/app/admin/portal/data.ts`
- Modify: `src/app/admin/portal/page.tsx`

- [ ] **Step 1: Write the failing panel tests**

Create `src/app/admin/portal/ClientSignalsPanel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
import type { UnsentDraftAlert } from '@/lib/portal/review-drafts-core'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import ClientSignalsPanel from './ClientSignalsPanel'

const feedback: ClientSignal = {
  id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'portal_feedback_submitted', pieceKey: null, pieceTitle: null,
  headline: 'Feedback: 4 of 5', detail: 'Maria: “Much easier on my phone.”',
  createdAt: '2026-10-03T14:00:00.000Z', resolvable: true,
}
const failure: ClientSignal = {
  ...feedback, id: '2b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'review_send_failed',
  pieceKey: 'kanset-reel', pieceTitle: 'Hiring cost reel', headline: 'Edits not sent: Hiring cost reel',
  detail: '2 edits refused (draft too long). Her text is saved.',
}
const alert: UnsentDraftAlert = {
  client_id: 'c', content_item_id: 'i', content_id: 'kanset-reel', title: 'Hiring cost reel',
  planned_date: '2026-10-04', auth_user_id: 'u', seat_name: 'Maria Guerts', unsent_count: 2,
  stale_count: 2, carried_count: 0, oldest_saved_at: '2026-10-02T14:00:00.000Z',
}

beforeEach(() => {
  refresh.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: { outcome: 'resolved' } }), { status: 200 })))
})

describe('ClientSignalsPanel', () => {
  it('renders nothing when there is nothing from Maria', () => {
    const { container } = render(<ClientSignalsPanel signals={[]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists unsent edits first, then failures and feedback, each linked to its piece', () => {
    render(<ClientSignalsPanel signals={[feedback, failure]} alerts={[alert]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('heading', { level: 2, name: 'From Maria' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Maria has 2 unsent edits on Hiring cost reel')
    expect(items[0]).toHaveTextContent('Saved 26 hours ago · posts in 1 day')
    expect(screen.getByRole('link', { name: 'Edits not sent: Hiring cost reel' }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-reel')
    expect(screen.getByText('Feedback: 4 of 5')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Done/ })).toHaveLength(2)
  })

  it('marks a signal done and refreshes the page', async () => {
    render(<ClientSignalsPanel signals={[feedback]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Feedback: 4 of 5' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/admin/portal/inbox-resolve')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ eventId: feedback.id })
  })

  it('says so when Done fails, and keeps the row', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 400 }))
    render(<ClientSignalsPanel signals={[feedback]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Feedback: 4 of 5' }))
    expect(await screen.findByText('Could not mark it done. Try again.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a read failure instead of hiding the panel', () => {
    render(<ClientSignalsPanel signals={[]} alerts={[]} error="client signals unavailable: boom"
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load signals from Maria: client signals unavailable: boom')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/app/admin/portal/ClientSignalsPanel.test.tsx`
Expected: FAIL, cannot resolve `./ClientSignalsPanel`.

- [ ] **Step 3: Implement the button**

Create `src/app/admin/portal/ResolveSignalButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@thedot/design-system'
import styles from './portal-admin.module.css'

export default function ResolveSignalButton({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function resolve() {
    setPending(true)
    setFailed(false)
    try {
      const response = await fetch('/api/admin/portal/inbox-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, idempotencyKey: crypto.randomUUID() }),
      })
      if (!response.ok) throw new Error(String(response.status))
      router.refresh()
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return <>
    <Button as="button" type="button" variant="ghost" size="sm" disabled={pending}
      aria-label={`Done: ${label}`} onClick={resolve}>
      {pending ? 'Saving' : 'Done'}
    </Button>
    {failed && <span className={styles.meta} role="status">Could not mark it done. Try again.</span>}
  </>
}
```

- [ ] **Step 4: Implement the panel**

Create `src/app/admin/portal/ClientSignalsPanel.tsx`:

```tsx
import { Heading } from '@thedot/design-system'
import { unsentAlertDetail, type ClientSignal } from '@/lib/portal/agency-ops-core'
import { unsentDraftAlertLine, type UnsentDraftAlert } from '@/lib/portal/review-drafts-core'
import ResolveSignalButton from './ResolveSignalButton'
import styles from './portal-admin.module.css'

// Spec 8: the client signals the redesign creates. Unsent-edit alerts come first (a forgotten
// Send on a piece that posts soon), then send failures, carried drafts and feedback, newest first.
// Alerts have no Done: they clear when she sends, discards, or the piece posts.
function pieceHref(key: string | null): string | null {
  return key ? `/admin/portal/pieces/${encodeURIComponent(key)}` : null
}

export default function ClientSignalsPanel({ signals, alerts, error, todayIso, nowIso }: {
  signals: ClientSignal[]
  alerts: UnsentDraftAlert[]
  error: string | null
  todayIso: string
  nowIso: string
}) {
  if (!error && signals.length === 0 && alerts.length === 0) return null
  const now = new Date(nowIso)
  return (
    <section className={`${styles.card} ${styles.hero}`}>
      <div className={styles.panelHead}>
        <Heading as="h2" level={4}>From Maria</Heading>
        <span className={styles.panelCount}>{signals.length + alerts.length}</span>
      </div>
      <p className={styles.panelNote}>Unsent edits, failed sends and her feedback. Nothing here was sent to her.</p>
      {error && <p className={styles.panelNote} role="alert">Could not load signals from Maria: {error}</p>}
      <ul className={styles.taskList}>
        {alerts.map((alert) => {
          const href = pieceHref(alert.content_id)
          const line = unsentDraftAlertLine(alert)
          return <li key={`alert:${alert.content_item_id}:${alert.auth_user_id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{line}</a>
                : <span className={styles.taskTitle}>{line}</span>}
              <span className={styles.meta}>{unsentAlertDetail(alert, todayIso, now)}</span>
            </span>
          </li>
        })}
        {signals.map((signal) => {
          const href = pieceHref(signal.pieceKey)
          return <li key={`signal:${signal.id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{signal.headline}</a>
                : <span className={styles.taskTitle}>{signal.headline}</span>}
              {signal.detail && <span className={styles.meta}>{signal.detail}</span>}
            </span>
            <span className={styles.taskTrail}>
              {signal.resolvable && <ResolveSignalButton eventId={signal.id} label={signal.headline} />}
            </span>
          </li>
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run src/app/admin/portal/ClientSignalsPanel.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire it into My Tasks, test first**

In `src/app/admin/portal/GatesAdmin.test.tsx`, add at the end of the `describe('MyTasksAdmin'` block:

```tsx
  it('puts signals from Maria under "Need you"', () => {
    render(<MyTasksAdmin pieces={[]} opsTasks={[]} completedOps={[]} openComments={[]} openProposals={[]}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" signalsError={null}
      unsentDraftAlerts={[]} clientSignals={[{
        id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'portal_feedback_submitted', pieceKey: null,
        pieceTitle: null, headline: 'Feedback: 4 of 5', detail: null, createdAt: '2026-10-03T14:00:00.000Z',
        resolvable: true,
      }]} />)
    expect(screen.getByRole('heading', { level: 2, name: 'From Maria' })).toBeInTheDocument()
    expect(screen.getByText('Need you').nextElementSibling).toHaveTextContent('1')
  })
```

and add `vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))` plus `vi` to the vitest import at the top of the file (`import { describe, expect, it, vi } from 'vitest'`). The two existing renders keep working because the new props are optional.

Run: `pnpm exec vitest run src/app/admin/portal/GatesAdmin.test.tsx`
Expected: FAIL on the new test (no "From Maria" heading).

- [ ] **Step 7: Implement in `GatesAdmin.tsx`**

Add imports at the top:

```tsx
import ClientSignalsPanel from './ClientSignalsPanel'
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
import type { UnsentDraftAlert } from '@/lib/portal/review-drafts-core'
```

Replace the `MyTasksAdmin` signature

```tsx
export function MyTasksAdmin({ pieces, opsTasks, completedOps, openComments, openProposals, todayIso }: {
  pieces: StagePiece[]
  opsTasks: OpsTaskRow[]
  completedOps: CompletedOpsTask[]
  openComments: AdminComment[]
  openProposals: Array<{ id: string; clientName: string; title: string; submittedAt: string | null; latestClientReply: { authorName: string; body: string } | null }>
  todayIso: string
}) {
```

with

```tsx
export function MyTasksAdmin({ pieces, opsTasks, completedOps, openComments, openProposals, todayIso,
  clientSignals = [], unsentDraftAlerts = [], signalsError = null, nowIso }: {
  pieces: StagePiece[]
  opsTasks: OpsTaskRow[]
  completedOps: CompletedOpsTask[]
  openComments: AdminComment[]
  openProposals: Array<{ id: string; clientName: string; title: string; submittedAt: string | null; latestClientReply: { authorName: string; body: string } | null }>
  todayIso: string
  clientSignals?: ClientSignal[]
  unsentDraftAlerts?: UnsentDraftAlert[]
  signalsError?: string | null
  nowIso?: string
}) {
```

Replace

```tsx
  const needsYouCount = currentActions.length + opsAttention.length + openComments.length
```

with

```tsx
  const needsYouCount = currentActions.length + opsAttention.length + openComments.length
    + clientSignals.length + unsentDraftAlerts.length
```

and replace

```tsx
          <Panel label="Needs your attention" note="Client changes and due work come first."
            rows={currentActions} emphasis />
```

with

```tsx
          <ClientSignalsPanel signals={clientSignals} alerts={unsentDraftAlerts} error={signalsError}
            todayIso={todayIso} nowIso={nowIso ?? new Date().toISOString()} />
          <Panel label="Needs your attention" note="Client changes and due work come first."
            rows={currentActions} emphasis />
```

and in the "Clear for now" condition replace `needsYouCount === 0 && upcomingActions.length === 0` with `needsYouCount === 0 && upcomingActions.length === 0 && !signalsError`.

- [ ] **Step 8: Load the data**

In `src/app/admin/portal/data.ts`, add imports:

```ts
import { getOpenClientSignals } from '@/lib/portal/agency-ops'
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
import { getUnsentDraftAlerts } from '@/lib/portal/review-drafts'
import type { UnsentDraftAlert } from '@/lib/portal/review-drafts-core'
```

In `loadMyTasksData`, extend the return type (the object type in the signature) with

```ts
  clientSignals: ClientSignal[]; unsentDraftAlerts: UnsentDraftAlert[]; signalsError: string | null; nowIso: string
```

and replace its last line

```ts
  return { pieces, opsTasks: adminOpsTasks, completedOps, openComments, openProposals, todayIso: torontoToday() }
```

with

```ts
  // A failed signal read must not hide My Tasks; it shows as an alert in the panel instead.
  let clientSignals: ClientSignal[] = []
  let unsentDraftAlerts: UnsentDraftAlert[] = []
  let signalsError: string | null = null
  const now = new Date()
  try {
    ;[clientSignals, unsentDraftAlerts] = await Promise.all([getOpenClientSignals(), getUnsentDraftAlerts(now)])
  } catch (error) {
    signalsError = error instanceof Error ? error.message : String(error)
  }
  return { pieces, opsTasks: adminOpsTasks, completedOps, openComments, openProposals, todayIso: torontoToday(),
    clientSignals, unsentDraftAlerts, signalsError, nowIso: now.toISOString() }
```

In `src/app/admin/portal/page.tsx`, replace the body after the session check with:

```tsx
  const data = await loadMyTasksData()
  return <MyTasksAdmin pieces={data.pieces} opsTasks={data.opsTasks} completedOps={data.completedOps}
    openComments={data.openComments} openProposals={data.openProposals} todayIso={data.todayIso}
    clientSignals={data.clientSignals} unsentDraftAlerts={data.unsentDraftAlerts}
    signalsError={data.signalsError} nowIso={data.nowIso} />
```

- [ ] **Step 9: Run to verify they pass**

Run: `pnpm exec vitest run src/app/admin/portal/GatesAdmin.test.tsx src/app/admin/portal/ClientSignalsPanel.test.tsx`
Expected: PASS (3 + 5 tests).

- [ ] **Step 10: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/app/admin/portal/ClientSignalsPanel.tsx src/app/admin/portal/ResolveSignalButton.tsx src/app/admin/portal/ClientSignalsPanel.test.tsx src/app/admin/portal/GatesAdmin.tsx src/app/admin/portal/GatesAdmin.test.tsx src/app/admin/portal/data.ts src/app/admin/portal/page.tsx
git -C ~/worktrees/kanset-ops-feedback commit -m "Show unsent edits, failed sends and feedback from Maria at the top of My Tasks"
```

---
### Task 7a: Media-less pieces and failed plays in "From Maria" (amended 2026-10-03)

**Files:**
- Modify: `src/app/admin/portal/ClientSignalsPanel.tsx`
- Modify: `src/app/admin/portal/ClientSignalsPanel.test.tsx`
- Modify: `src/app/admin/portal/GatesAdmin.tsx`
- Modify: `src/app/admin/portal/data.ts`
- Modify: `src/app/admin/portal/page.tsx`

Failed plays already reach the panel as signals with a Done button (Tasks 1a, 2a). This task adds the live "no media" lines: no Done button, because they clear themselves when media is attached or the piece goes live, and they count toward "Need you".

- [ ] **Step 1: Write the failing test**

In `src/app/admin/portal/ClientSignalsPanel.test.tsx`, replace:

```tsx
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
```

with:

```tsx
import type { ClientSignal, ReleaseMediaAlert } from '@/lib/portal/agency-ops-core'
```

and append at the end of the file:

```tsx
describe('ClientSignalsPanel media lines (amended 2026-10-03)', () => {
  const noMedia: ReleaseMediaAlert = {
    client_id: 'c', content_item_id: 'i2', content_key: 'kanset-article', title: 'Work permit article',
    content_version: 3, planned_date: '2026-10-06', waiting_on: 'review', override_reason: null,
  }
  const played: ClientSignal = {
    id: '3b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'review_playback_failed', pieceKey: 'kanset-reel',
    pieceTitle: 'Hiring cost reel', headline: "Maria's video didn't play: iPhone, Safari",
    detail: 'Hiring cost reel v2 · network error', createdAt: '2026-10-03T14:00:00.000Z', resolvable: true,
  }

  it('lists a piece with nothing to look at, linked, without a Done button', () => {
    render(<ClientSignalsPanel signals={[]} alerts={[]} mediaAlerts={[noMedia]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('heading', { level: 2, name: 'From Maria' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'No media on Work permit article v3: Maria is reviewing it' }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-article')
    expect(screen.getByText('Attach a review asset, preview or design link · posts in 3 days')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Done/ })).not.toBeInTheDocument()
  })

  it('lists a failed play with Done', () => {
    render(<ClientSignalsPanel signals={[played]} alerts={[]} mediaAlerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('link', { name: "Maria's video didn't play: iPhone, Safari" }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-reel')
    expect(screen.getByRole('button', { name: "Done: Maria's video didn't play: iPhone, Safari" })).toBeInTheDocument()
  })
})
```

Run: `pnpm exec vitest run src/app/admin/portal/ClientSignalsPanel.test.tsx`
Expected: FAIL on the first new test (no media line).

- [ ] **Step 2: Implement the panel**

In `src/app/admin/portal/ClientSignalsPanel.tsx`, replace:

```tsx
import { unsentAlertDetail, type ClientSignal } from '@/lib/portal/agency-ops-core'
```

with:

```tsx
import {
  releaseMediaAlertDetail, releaseMediaAlertLine, unsentAlertDetail, type ClientSignal, type ReleaseMediaAlert,
} from '@/lib/portal/agency-ops-core'
```

replace:

```tsx
export default function ClientSignalsPanel({ signals, alerts, error, todayIso, nowIso }: {
  signals: ClientSignal[]
  alerts: UnsentDraftAlert[]
  error: string | null
  todayIso: string
  nowIso: string
}) {
  if (!error && signals.length === 0 && alerts.length === 0) return null
```

with:

```tsx
export default function ClientSignalsPanel({ signals, alerts, mediaAlerts = [], error, todayIso, nowIso }: {
  signals: ClientSignal[]
  alerts: UnsentDraftAlert[]
  // Amended 2026-10-03: pieces in front of Maria with nothing to look at. Live, so no Done.
  mediaAlerts?: ReleaseMediaAlert[]
  error: string | null
  todayIso: string
  nowIso: string
}) {
  if (!error && signals.length === 0 && alerts.length === 0 && mediaAlerts.length === 0) return null
```

replace:

```tsx
        <span className={styles.panelCount}>{signals.length + alerts.length}</span>
```

with:

```tsx
        <span className={styles.panelCount}>{signals.length + alerts.length + mediaAlerts.length}</span>
```

replace:

```tsx
      <p className={styles.panelNote}>Unsent edits, failed sends and her feedback. Nothing here was sent to her.</p>
```

with:

```tsx
      <p className={styles.panelNote}>Unsent edits, failed sends, videos that did not play, pieces with nothing to look at, and her feedback. Nothing here was sent to her.</p>
```

and directly above the line `        {signals.map((signal) => {` insert:

```tsx
        {mediaAlerts.map((alert) => {
          const href = pieceHref(alert.content_key)
          const line = releaseMediaAlertLine(alert)
          return <li key={`media:${alert.content_item_id}`} className={styles.taskRow}>
            <span className={styles.taskMain}>
              {href ? <a className={`${styles.taskTitle} ${styles.pieceLink} ${styles.taskLink}`} href={href}>{line}</a>
                : <span className={styles.taskTitle}>{line}</span>}
              <span className={styles.meta}>{releaseMediaAlertDetail(alert, todayIso)}</span>
            </span>
          </li>
        })}
```

Run: `pnpm exec vitest run src/app/admin/portal/ClientSignalsPanel.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 3: Load and count them in My Tasks**

In `src/app/admin/portal/GatesAdmin.tsx`, replace:

```tsx
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
```

with:

```tsx
import type { ClientSignal, ReleaseMediaAlert } from '@/lib/portal/agency-ops-core'
```

replace:

```tsx
  clientSignals = [], unsentDraftAlerts = [], signalsError = null, nowIso }: {
```

with:

```tsx
  clientSignals = [], unsentDraftAlerts = [], releaseMediaAlerts = [], signalsError = null, nowIso }: {
```

replace:

```tsx
  unsentDraftAlerts?: UnsentDraftAlert[]
```

with:

```tsx
  unsentDraftAlerts?: UnsentDraftAlert[]
  releaseMediaAlerts?: ReleaseMediaAlert[]
```

replace:

```tsx
    + clientSignals.length + unsentDraftAlerts.length
```

with:

```tsx
    + clientSignals.length + unsentDraftAlerts.length + releaseMediaAlerts.length
```

and replace:

```tsx
          <ClientSignalsPanel signals={clientSignals} alerts={unsentDraftAlerts} error={signalsError}
```

with:

```tsx
          <ClientSignalsPanel signals={clientSignals} alerts={unsentDraftAlerts} mediaAlerts={releaseMediaAlerts} error={signalsError}
```

In `src/app/admin/portal/data.ts`, replace:

```ts
import { getOpenClientSignals } from '@/lib/portal/agency-ops'
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
```

with:

```ts
import { getOpenClientSignals, getReleaseMediaAlerts } from '@/lib/portal/agency-ops'
import type { ClientSignal, ReleaseMediaAlert } from '@/lib/portal/agency-ops-core'
```

replace:

```ts
  clientSignals: ClientSignal[]; unsentDraftAlerts: UnsentDraftAlert[]; signalsError: string | null; nowIso: string
```

with:

```ts
  clientSignals: ClientSignal[]; unsentDraftAlerts: UnsentDraftAlert[]; releaseMediaAlerts: ReleaseMediaAlert[]
  signalsError: string | null; nowIso: string
```

replace:

```ts
  let unsentDraftAlerts: UnsentDraftAlert[] = []
```

with:

```ts
  let unsentDraftAlerts: UnsentDraftAlert[] = []
  let releaseMediaAlerts: ReleaseMediaAlert[] = []
```

replace:

```ts
    ;[clientSignals, unsentDraftAlerts] = await Promise.all([getOpenClientSignals(), getUnsentDraftAlerts(now)])
```

with:

```ts
    ;[clientSignals, unsentDraftAlerts, releaseMediaAlerts] = await Promise.all([
      getOpenClientSignals(), getUnsentDraftAlerts(now), getReleaseMediaAlerts(),
    ])
```

and replace:

```ts
    clientSignals, unsentDraftAlerts, signalsError, nowIso: now.toISOString() }
```

with:

```ts
    clientSignals, unsentDraftAlerts, releaseMediaAlerts, signalsError, nowIso: now.toISOString() }
```

In `src/app/admin/portal/page.tsx`, replace:

```tsx
    signalsError={data.signalsError} nowIso={data.nowIso} />
```

with:

```tsx
    releaseMediaAlerts={data.releaseMediaAlerts} signalsError={data.signalsError} nowIso={data.nowIso} />
```

- [ ] **Step 4: Run and type-check**

```bash
pnpm exec vitest run src/app/admin/portal/GatesAdmin.test.tsx src/app/admin/portal/ClientSignalsPanel.test.tsx
pnpm exec tsc --noEmit 2>&1 | grep -E "ClientSignals|GatesAdmin|admin/portal/data|admin/portal/page|agency-ops" || echo clean
```

Expected: PASS (3 + 7 tests); `clean`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/app/admin/portal/ClientSignalsPanel.tsx src/app/admin/portal/ClientSignalsPanel.test.tsx src/app/admin/portal/GatesAdmin.tsx src/app/admin/portal/data.ts src/app/admin/portal/page.tsx
git -C ~/worktrees/kanset-ops-feedback commit -m "Show media-less pieces and failed plays under From Maria

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Admin piece page data

**Files:**
- Create: `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.ts` (pure helpers)
- Create: `src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts` (server loader)
- Test: `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts`

The loader gathers everything the rebuilt page shows. Its two pure helpers carry the logic worth testing: which frame thumbnails a request shows, and what the unsent-drafts alert says.

- [ ] **Step 1: Write the failing tests**

Create `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { AdminContentRequest } from '../../RequestAdmin'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { buildRequestViews, summarizeDrafts, unsentAlertSentence } from './agency-piece-data-view'

const request = (overrides: Partial<AdminContentRequest> = {}): AdminContentRequest => ({
  id: 'r1', clientName: 'Kanset', requestType: 'edit', status: 'pending', requesterName: 'Maria Guerts',
  createdAt: '2026-09-30T15:00:00Z', title: 'Hiring cost reel', contentUuid: 'item', baseVersion: 2,
  resolutionNote: null, reviewCandidate: null, messages: [],
  edit: { targetKind: 'asset', targetKey: 'reel-video', targetLabel: 'Reel', targetUrl: null, blockKey: null,
    blockLabel: null, originalText: null, proposedText: 'Frame 3: Can the headline use the caption wording?' },
  ...overrides,
})
const preview = (version: number, key: string): SignedReviewPreview => ({
  id: `p${version}`, contentItemId: 'item', contentVersion: version, previewKey: key, mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed/v.mp4', posterUrl: null,
  frames: Array.from({ length: 8 }, (_, i) => ({ label: `Frame ${i + 1}`, url: `https://signed/f${i + 1}.jpg` })),
  expiresAt: '2026-10-03T16:10:00Z',
})
const context = {
  bundles: [{ id: 'b1', request_ids: ['r1', 'r2'] }],
  sentDrafts: [{ sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:3', anchor_label: null }],
  versions: [],
}

describe('buildRequestViews', () => {
  it('shows the frame a visual request was left on, with its thumbnail', () => {
    const [view] = buildRequestViews([request()], context, [preview(2, 'reel-video')])
    expect(view).toMatchObject({ kind: 'visual', heading: 'Frame 3', state: 'Open', date: '2026-09-30' })
    expect(view.thumbs).toEqual([{ label: 'Frame 3', url: 'https://signed/f3.jpg' }])
  })

  it('keeps the frame label when the preview for that version is gone', () => {
    const [view] = buildRequestViews([request()], context, [])
    expect(view.thumbs).toEqual([{ label: 'Frame 3', url: null }])
  })

  it('labels a text request by its block and shows no thumbnail', () => {
    const [view] = buildRequestViews([request({ id: 'r2', status: 'applied', edit: {
      targetKind: 'copy_block', targetKey: 'youtube', targetLabel: null, targetUrl: null, blockKey: 'youtube',
      blockLabel: 'YouTube description', originalText: 'a', proposedText: 'b' } })], context, [])
    expect(view).toMatchObject({ kind: 'text', heading: 'YouTube description', state: 'Applied', thumbs: [] })
  })

  it('ignores requests that are not edits', () => {
    expect(buildRequestViews([request({ requestType: 'archive', edit: null })], context, [])).toEqual([])
  })
})

describe('drafts', () => {
  const draft = (overrides: Record<string, unknown> = {}) => ({
    id: 'd', status: 'unsent', auth_user_id: 'u1', saved_at: '2026-10-02T14:00:00.000Z',
    send_failed_at: null, last_send_error: null, carried_over_to_version: null, ...overrides,
  })

  it('summarises unsent drafts per seat', () => {
    const summary = summarizeDrafts([
      draft(), draft({ id: 'd2', saved_at: '2026-10-03T09:00:00.000Z', send_failed_at: 'x', last_send_error: 'draft_too_long' }),
      draft({ id: 'd3', status: 'sent' }),
      draft({ id: 'd4', auth_user_id: 'u2', carried_over_to_version: 3 }),
    ], new Map([['u1', 'Maria Guerts'], ['u2', 'Kanset Preview (preview)']]))
    expect(summary).toEqual([
      { seatName: 'Maria Guerts', unsentCount: 2, failedCount: 1, carriedCount: 0,
        oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: 'draft_too_long' },
      { seatName: 'Kanset Preview (preview)', unsentCount: 1, failedCount: 0, carriedCount: 1,
        oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null },
    ])
  })

  it('writes the alert sentence from the mockup', () => {
    expect(unsentAlertSentence({ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 0, carriedCount: 0,
      oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null }, '2026-10-04', '2026-10-03', new Date('2026-10-03T16:00:00.000Z')))
      .toBe('Maria has 2 unsent edits on this piece, saved 26 hours ago. It posts in 1 day.')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts'`
Expected: FAIL, cannot resolve `./agency-piece-data-view`.

- [ ] **Step 3: Implement**

Create `src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.ts`:

```ts
import {
  firstName, hoursSince, postsInLabel, requestAnchors, requestStateLabel,
} from '@/lib/portal/agency-ops-core'
import type { PieceRequestContext } from '@/lib/portal/agency-ops'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import type { AdminContentRequest } from '../../RequestAdmin'

// Pure view helpers for the admin piece page. No server imports, so the panel (and tests) can use
// them without pulling the Supabase admin client into a bundle.

export type RequestThumb = { label: string; url: string | null }
export type AgencyRequestView = {
  id: string
  heading: string
  kind: 'visual' | 'text'
  quote: string | null
  date: string
  state: string
  thumbs: RequestThumb[]
}
export type DraftSeatSummary = {
  seatName: string
  unsentCount: number
  failedCount: number
  carriedCount: number
  oldestSavedAt: string
  lastError: string | null
}
export type DraftLike = {
  status: string; auth_user_id: string; saved_at: string
  send_failed_at: string | null; last_send_error: string | null; carried_over_to_version: number | null
}

function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function pickPreview(previews: SignedReviewPreview[], version: number | null, key: string | null): SignedReviewPreview | null {
  const candidates = previews.filter((preview) => preview.contentVersion === version)
  return candidates.find((preview) => preview.previewKey === key) ?? (candidates.length === 1 ? candidates[0] : null)
}

export function buildRequestViews(
  requests: AdminContentRequest[],
  context: PieceRequestContext,
  previews: SignedReviewPreview[],
): AgencyRequestView[] {
  return requests.filter((request) => request.requestType === 'edit' && request.edit).map((request) => {
    const edit = request.edit!
    const visual = edit.targetKind !== 'copy_block'
    const anchors = visual ? requestAnchors(request.id, edit.targetKey, context.bundles, context.sentDrafts) : []
    const preview = anchors.length ? pickPreview(previews, request.baseVersion, edit.targetKey) : null
    return {
      id: request.id,
      heading: anchors.length ? anchors.map((anchor) => anchor.label).join(', ')
        : edit.targetLabel ?? edit.blockLabel ?? (visual ? 'Visual' : 'Copy'),
      kind: visual ? 'visual' : 'text',
      quote: edit.proposedText ? excerpt(edit.proposedText) : null,
      date: request.createdAt.slice(0, 10),
      state: requestStateLabel(request.status),
      thumbs: anchors.map((anchor) => ({ label: anchor.label, url: preview?.frames[anchor.index - 1]?.url ?? null })),
    }
  })
}

export function summarizeDrafts(drafts: DraftLike[], seatNames: Map<string, string>): DraftSeatSummary[] {
  const bySeat = new Map<string, DraftSeatSummary>()
  for (const draft of drafts) {
    if (draft.status !== 'unsent') continue
    const current = bySeat.get(draft.auth_user_id) ?? {
      seatName: seatNames.get(draft.auth_user_id) ?? 'Client', unsentCount: 0, failedCount: 0,
      carriedCount: 0, oldestSavedAt: draft.saved_at, lastError: null,
    }
    current.unsentCount += 1
    if (draft.send_failed_at) { current.failedCount += 1; current.lastError = draft.last_send_error ?? current.lastError }
    if (draft.carried_over_to_version != null) current.carriedCount += 1
    if (draft.saved_at < current.oldestSavedAt) current.oldestSavedAt = draft.saved_at
    bySeat.set(draft.auth_user_id, current)
  }
  return [...bySeat.values()].sort((a, b) => b.unsentCount - a.unsentCount)
}

export function unsentAlertSentence(summary: DraftSeatSummary, plannedDate: string | null, todayIso: string, now: Date): string {
  const hours = hoursSince(summary.oldestSavedAt, now)
  const when = postsInLabel(plannedDate, todayIso)
  const tail = when === 'no planned date' ? 'It has no planned date.' : `It ${when}.`
  return `${firstName(summary.seatName)} has ${summary.unsentCount} unsent edit${summary.unsentCount === 1 ? '' : 's'} on this piece, `
    + `saved ${hours} hour${hours === 1 ? '' : 's'} ago. ${tail}`
}
```

Create `src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts`:

```ts
import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyStagePiece } from '@/lib/portal/gates-loader'
import { deriveContentStage, resolveNineGates, type StagePiece } from '@/lib/portal/gates'
import {
  gateDots, gateSummary, mariaViewLine, versionRows, type GateDot, type VersionRow,
} from '@/lib/portal/agency-ops-core'
import { getLatestFeedback, getPieceRequestContext, type FeedbackSummary } from '@/lib/portal/agency-ops'
import { getAgencyReviewDrafts } from '@/lib/portal/review-drafts'
import { getAgencyReviewPreviews } from '@/lib/portal/review-previews'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { loadClientPiecePreview, type ClientPiecePreviewData } from './maria-preview/preview-data'
import { loadAdminComments, loadRequests, type AdminComment } from '../../data'
import type { AdminContentRequest } from '../../RequestAdmin'
import { stageDisplay } from '../../GatesAdmin'
import {
  buildRequestViews, summarizeDrafts, type AgencyRequestView, type DraftLike, type DraftSeatSummary,
} from './agency-piece-data-view'

export { buildRequestViews, summarizeDrafts, unsentAlertSentence } from './agency-piece-data-view'
export type { AgencyRequestView, DraftSeatSummary, RequestThumb } from './agency-piece-data-view'

export type AgencyPieceData = {
  contentId: string
  piece: StagePiece
  stageLabel: string
  gates: GateDot[]
  gatesSummary: string
  versions: VersionRow[]
  requestViews: AgencyRequestView[]
  requests: AdminContentRequest[]
  comments: AdminComment[]
  reviewAssets: Array<{ id: string; label: string; channel: string; asset_kind: string; url: string }>
  previews: SignedReviewPreview[]
  previewError: string | null
  design: { canva: string | null; drive: string | null }
  working: { blocks: Array<{ key: string | null; label: string; body: string }>; clientBody: string | null }
  drafts: DraftSeatSummary[]
  feedback: FeedbackSummary | null
  mariaPreview: ClientPiecePreviewData | null
  mariaPreviewError: string | null
  mariaView: string
  plannedDate: string | null
  todayIso: string
  nowIso: string
}

const https = (value: string | null | undefined) => (value && /^https:\/\//i.test(value) ? value : null)
function torontoToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export async function loadAgencyPieceData(contentId: string): Promise<AgencyPieceData | null> {
  const admin = createSupabaseAdmin()
  // Single-client launch, as before: resolve Kanset explicitly so every read stays tenant-scoped.
  const client = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  if (client.error || !client.data) return null
  const clientId = client.data.id as string
  const piece = await loadAgencyStagePiece(admin, clientId, contentId)
  if (!piece) return null
  const itemRow = await admin.from('content_items').select('id, working_version, client_visible_version, planned_date')
    .eq('client_id', clientId).eq('content_id', contentId).single()
  if (itemRow.error || !itemRow.data) return null
  const item = itemRow.data as { id: string; working_version: number | null; client_visible_version: number | null; planned_date: string | null }
  const shownVersion = item.client_visible_version ?? item.working_version

  const [workingRow, designRow, assetRows, comments, requests, context, drafts, seats, feedback] = await Promise.all([
    item.working_version != null
      ? admin.from('content_item_versions').select('copy_blocks, client_body, canva_url, drive_url')
        .eq('content_item_id', item.id).eq('version', item.working_version).single()
      : Promise.resolve({ data: null, error: null }),
    admin.from('content_design_links').select('canva_url, drive_url')
      .eq('client_id', clientId).eq('content_item_id', item.id).maybeSingle(),
    shownVersion != null
      ? admin.from('content_review_assets').select('id, label, channel, asset_kind, url')
        .eq('client_id', clientId).eq('content_item_id', item.id).eq('content_version', shownVersion)
        .order('channel').order('asset_key')
      : Promise.resolve({ data: [], error: null }),
    loadAdminComments({ clientId, contentUuid: item.id }),
    loadRequests({ clientId, contentUuid: item.id }),
    getPieceRequestContext(clientId, item.id),
    getAgencyReviewDrafts(item.id),
    admin.from('client_users').select('auth_user_id, name').eq('client_id', clientId),
    getLatestFeedback(clientId, 1),
  ])
  const failure = designRow.error ?? assetRows.error ?? seats.error
  if (failure) throw new Error(`Agency piece data unavailable: ${failure.message}`)

  // Previews are a convenience on this page: a storage hiccup must not take the page down.
  let previews: SignedReviewPreview[] = []
  let previewError: string | null = null
  const versionsNeeded = new Set<number>()
  if (shownVersion != null) versionsNeeded.add(shownVersion)
  for (const request of requests) {
    if (request.edit && request.edit.targetKind !== 'copy_block' && request.baseVersion != null) versionsNeeded.add(request.baseVersion)
  }
  try {
    previews = (await Promise.all([...versionsNeeded].slice(0, 4).map((version) => getAgencyReviewPreviews(item.id, version)))).flat()
  } catch (error) {
    previewError = error instanceof Error ? error.message : String(error)
  }

  let mariaPreview: ClientPiecePreviewData | null = null
  let mariaPreviewError: string | null = null
  if (piece.released) {
    try {
      mariaPreview = await loadClientPiecePreview('kanset', contentId)
    } catch (error) {
      mariaPreviewError = error instanceof Error ? error.message : String(error)
    }
  }

  const seatNames = new Map(((seats.data ?? []) as Array<{ auth_user_id: string; name: string | null }>)
    .map((seat) => [seat.auth_user_id, seat.name?.trim() || 'Client']))
  const draftSummary = summarizeDrafts(drafts as unknown as DraftLike[], seatNames)
  const working = workingRow.data as { copy_blocks: unknown; client_body: string | null; canva_url: string | null; drive_url: string | null } | null
  const design = designRow.data as { canva_url: string | null; drive_url: string | null } | null
  const dots = gateDots(resolveNineGates(piece))
  const stage = deriveContentStage(piece)
  const display = stageDisplay(stage.stage, stage.label)
  const openEdits = requests.filter((request) => request.requestType === 'edit'
    && ['pending', 'applying', 'prepared', 'conflicted'].includes(request.status)).length
  const now = new Date()

  return {
    contentId,
    piece,
    stageLabel: [display.label, display.detail].filter(Boolean).join(' · '),
    gates: dots,
    gatesSummary: gateSummary(dots),
    versions: versionRows(context.versions, item.working_version, item.client_visible_version),
    requestViews: buildRequestViews(requests, context, previews),
    requests,
    comments,
    reviewAssets: (assetRows.data ?? []) as AgencyPieceData['reviewAssets'],
    previews: previews.filter((preview) => preview.contentVersion === shownVersion),
    previewError,
    design: { canva: https(design?.canva_url ?? working?.canva_url), drive: https(design?.drive_url ?? working?.drive_url) },
    working: {
      blocks: Array.isArray(working?.copy_blocks) ? working!.copy_blocks as AgencyPieceData['working']['blocks'] : [],
      clientBody: working?.client_body ?? null,
    },
    drafts: draftSummary,
    feedback: feedback[0] ?? null,
    mariaPreview,
    mariaPreviewError,
    mariaView: mariaViewLine({
      released: Boolean(piece.released), decision: piece.currentDecision,
      unsentCount: draftSummary.reduce((sum, seat) => sum + seat.unsentCount, 0),
      openEditCount: openEdits, published: stage.stage === 'live' || stage.stage === 'done',
    }),
    plannedDate: item.planned_date,
    todayIso: torontoToday(now),
    nowIso: now.toISOString(),
  }
}
```

`stageDisplay` is already exported from `GatesAdmin.tsx`. If importing a `.tsx` component module into this server loader trips a lint or bundling rule in this repo, move `stageDisplay` unchanged into `src/lib/portal/agency-ops-core.ts`, re-export it from `GatesAdmin.tsx`, and import it from the core here.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts'`
Expected: PASS, 6 tests.

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'agency-piece-data|agency-ops' || echo clean`
Expected: `clean`. If plan 3's `AgencyReviewDraftRow` lacks `carried_over_to_version`, `send_failed_at` or `last_send_error`, check `SERVER_DRAFT_COLUMNS` in `review-drafts-core.ts`: plan 3 lists all three, so the cast through `DraftLike` is safe.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.ts' 'src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts' 'src/app/admin/portal/pieces/[contentId]/agency-piece-data-view.test.ts'
git -C ~/worktrees/kanset-ops-feedback commit -m "Load the admin piece page: gates, versions, requests with frames, drafts, feedback"
```

---
### Task 9: Agency side panel and "Maria's view" bar

**Files:**
- Create: `src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx`
- Create: `src/app/admin/portal/pieces/[contentId]/AgencyStateBar.tsx`
- Create: `src/app/admin/portal/pieces/[contentId]/agency-panel.module.css`
- Test: `src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx`

Visual reference: `screens-v3/10-admin.html` (`aside.apanel`) and `portal-v3.css` lines 302-327 and 541-542 (gates are round; done is filled black). Only The Dot tokens, sharp corners, hairlines, no shadows, 44 px targets.

- [ ] **Step 1: Write the failing tests**

Create `src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AgencyPanel, { type AgencyPanelModel } from './AgencyPanel'
import AgencyStateBar from './AgencyStateBar'

const model = (overrides: Partial<AgencyPanelModel> = {}): AgencyPanelModel => ({
  contentId: 'kanset-reel', released: true, stageLabel: 'Awaiting Maria', gatesSummary: '5 of 9 gates',
  gates: [
    { key: 'fact-check', label: 'Fact-check', state: 'done', date: '2026-09-25' },
    { key: 'source-in-hand', label: 'Studio cut', state: 'done', date: '2026-09-25' },
    { key: 'design-built', label: 'Design', state: 'done', date: '2026-09-25' },
    { key: 'proofed', label: 'Proof', state: 'done', date: '2026-09-25' },
    { key: 'approval-sent', label: 'Final copy + design sent', state: 'done', date: '2026-09-30' },
    { key: 'copy-approved', label: 'Final copy + design approved', state: 'open', date: null },
    { key: 'scheduled', label: 'Scheduled', state: 'open', date: null },
    { key: 'posted', label: 'Posted', state: 'open', date: null },
    { key: 'link-confirmed', label: 'Link confirmed', state: 'absent', date: null },
  ],
  versions: [{ version: 2, label: 'v2 shared with Maria', date: '2026-09-30' }, { version: 1, label: 'v1 superseded', date: '2026-09-25' }],
  requestViews: [
    { id: 'r1', heading: 'Frame 3', kind: 'visual', quote: 'Can the headline use the caption wording?', date: '2026-09-30',
      state: 'Open', thumbs: [{ label: 'Frame 3', url: 'https://signed/f3.jpg' }] },
    { id: 'r2', heading: 'YouTube description', kind: 'text', quote: 'New description', date: '2026-09-30',
      state: 'Applied', thumbs: [] },
  ],
  reviewAssets: [{ id: 'a1', label: 'Reel cover', channel: 'social', asset_kind: 'cover', url: 'https://drive.google.com/x' }],
  previews: [{ id: 'p', contentItemId: 'i', contentVersion: 2, previewKey: 'reel-video', mediaKind: 'video', width: 1080,
    height: 1920, durationSeconds: 39, videoUrl: 'https://signed/v.mp4', posterUrl: null,
    frames: Array.from({ length: 8 }, (_, i) => ({ label: `Frame ${i + 1}`, url: `https://signed/f${i}.jpg` })),
    expiresAt: 'x' }],
  previewError: null,
  design: { canva: 'https://www.canva.com/design/X/view', drive: null },
  drafts: [{ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 0, carriedCount: 0,
    oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null }],
  feedback: { seatName: 'Maria Guerts', rating: 4, comment: 'Much easier on my phone.', createdAt: 'x', promptKey: 'p' },
  plannedDate: '2026-10-04', todayIso: '2026-10-03', nowIso: '2026-10-03T16:00:00.000Z',
  ...overrides,
})

describe('AgencyPanel', () => {
  it('leads with View as Maria and the stage', () => {
    render(<AgencyPanel model={model()} />)
    const panel = screen.getByRole('complementary', { name: 'Agency panel' })
    expect(within(panel).getByRole('link', { name: 'View as Maria' }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-reel/maria-preview')
    expect(panel).toHaveTextContent('Stage: Awaiting Maria · 5 of 9 gates')
  })

  it('raises the unsent-drafts alert in the mockup wording', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByText('Maria has 2 unsent edits on this piece, saved 26 hours ago. It posts in 1 day.')).toBeInTheDocument()
  })

  it('raises a failed send as a danger alert', () => {
    render(<AgencyPanel model={model({ drafts: [{ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 2, carriedCount: 0,
      oldestSavedAt: '2026-10-03T15:00:00.000Z', lastError: 'draft_too_long' }] })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Maria tried to send 2 edits and it failed (draft too long). Her text is saved and she sees Retry.')
  })

  it('shows nine gate dots with dates', () => {
    render(<AgencyPanel model={model()} />)
    const gates = screen.getByRole('list', { name: 'Production gates' })
    expect(within(gates).getAllByRole('listitem')).toHaveLength(9)
    expect(within(gates).getAllByRole('listitem')[0]).toHaveTextContent('Fact-checkSep 25')
    expect(within(gates).getAllByRole('listitem')[8]).toHaveTextContent('Link confirmednot tracked')
  })

  it('shows the frame a visual request was left on, and a text tile otherwise', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByRole('img', { name: 'Frame 3' })).toHaveAttribute('src', 'https://signed/f3.jpg')
    const requests = screen.getByRole('list', { name: "Maria's requests" })
    expect(requests).toHaveTextContent('Frame 3, visual')
    expect(requests).toHaveTextContent('“Can the headline use the caption wording?” Sep 30 · Open')
    expect(requests).toHaveTextContent('YouTube description')
    expect(requests).toHaveTextContent('Sep 30 · Applied')
  })

  it('lists the portal preview, review assets, design links and feedback', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByText('Video preview, portal storage')).toBeInTheDocument()
    expect(screen.getByText('Frame strip, 8 images')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Reel cover' })).toHaveAttribute('href', 'https://drive.google.com/x')
    expect(screen.getByRole('link', { name: 'Open design source' })).toBeInTheDocument()
    expect(screen.getByText('Review page: 4 of 5. “Much easier on my phone.”')).toBeInTheDocument()
  })

  it('says plainly when nothing is shared yet', () => {
    render(<AgencyPanel model={model({ released: false, previews: [], drafts: [], requestViews: [], feedback: null })} />)
    expect(screen.queryByRole('link', { name: 'View as Maria' })).not.toBeInTheDocument()
    expect(screen.getByText('Not shared with Maria yet')).toBeInTheDocument()
    expect(screen.getByText('No portal preview. Maria sees the Drive button.')).toBeInTheDocument()
    expect(screen.getByText('Maria has not sent a request on this piece.')).toBeInTheDocument()
    expect(screen.getByText('No answer yet.')).toBeInTheDocument()
  })
})

describe('AgencyStateBar', () => {
  it('states Maria\'s view and links to it', () => {
    render(<AgencyStateBar contentId="kanset-reel" line="2 unsent edits · Approve waiting" released />)
    expect(screen.getByRole('region', { name: "Maria's view" })).toHaveTextContent("Maria's view2 unsent edits · Approve waiting")
    expect(screen.getByRole('link', { name: 'View as Maria' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx'`
Expected: FAIL, cannot resolve `./AgencyPanel`.

- [ ] **Step 3: Implement the styles**

Create `src/app/admin/portal/pieces/[contentId]/agency-panel.module.css`:

```css
/* Admin piece page (spec 8, mockup 10-admin). The Dot tokens only: sharp corners, hairlines. */
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: var(--dot-space-6); align-items: start; }
@media (max-width: 1099px) { .layout { grid-template-columns: minmax(0, 1fr); } }

.panel { border: 1px solid var(--dot-black); background: var(--dot-white); font-family: var(--dot-font-text); }
@media (min-width: 1100px) { .panel { position: sticky; top: calc(env(safe-area-inset-top, 0px) + var(--dot-space-6)); } }
.panel section { padding: var(--dot-space-4) var(--dot-space-5); border-top: 1px solid var(--dot-hairline); }
.panel section:first-child { border-top: 0; }
.label { margin: 0 0 var(--dot-space-3); font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi);
  font-size: 0.75rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dot-graphite); }
.head { display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-3); }
.meta { margin: var(--dot-space-2) 0 0; font-size: 0.875rem; line-height: 1.45; color: var(--dot-grey-accessible); }

.alert { margin: 0; border-left: 3px solid var(--dot-black); padding: var(--dot-space-2) var(--dot-space-3);
  background: var(--dot-off-white); font-size: 0.9375rem; line-height: 1.45; }
.alert + .alert { margin-top: var(--dot-space-2); }
.danger { border-left-color: var(--dot-danger); }

.gates, .rows, .requests { list-style: none; margin: 0; padding: 0; font-size: 0.9375rem; }
.gates li { display: grid; grid-template-columns: 20px 1fr auto; gap: var(--dot-space-2); align-items: center; padding: 5px 0; }
.gateDot { width: 14px; height: 14px; border: 1px solid var(--dot-black); border-radius: var(--dot-radius-circle); display: inline-block; }
.gateDone { background: var(--dot-black); }
.gateNa { border-color: var(--dot-grey-light); background: var(--dot-grey-light); }
.gateAbsent { border-style: dashed; border-color: var(--dot-grey-light); }
.gateOpenText { color: var(--dot-grey-accessible); }
.when { font-size: 0.8125rem; color: var(--dot-grey-accessible); font-variant-numeric: tabular-nums; }

.rows li { display: flex; justify-content: space-between; gap: var(--dot-space-3); padding: 6px 0; border-bottom: 1px solid var(--dot-hairline); }
.rows a { color: var(--dot-black); min-height: 44px; display: inline-flex; align-items: center; }
.requests li { display: grid; grid-template-columns: 40px 1fr; gap: var(--dot-space-3); padding: var(--dot-space-3) 0; border-bottom: 1px solid var(--dot-hairline); }
.requests p { margin: 0; line-height: 1.45; }
.thumb { width: 40px; aspect-ratio: 9 / 16; object-fit: cover; border: 1px solid var(--dot-hairline); display: block; }
.thumbBlank { display: grid; place-items: center; width: 40px; height: 40px; font-size: 0.6875rem; text-align: center;
  color: var(--dot-grey-accessible); background: var(--dot-off-white); border: 1px solid var(--dot-hairline); }

.bar { position: sticky; bottom: 0; z-index: 20; margin-top: var(--dot-space-6); border-top: 1px solid var(--dot-black);
  background: var(--dot-white); padding: var(--dot-space-3) var(--dot-space-5) calc(var(--dot-space-3) + env(safe-area-inset-bottom, 0px));
  display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-4); flex-wrap: wrap; font-family: var(--dot-font-text); }
.barState { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); font-size: 0.8125rem;
  letter-spacing: 0.16em; text-transform: uppercase; margin-right: var(--dot-space-3); }
.barLine { color: var(--dot-graphite); font-size: 0.9375rem; }
.below { margin-top: var(--dot-space-7); }
```

- [ ] **Step 4: Implement the panel**

Create `src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx`:

```tsx
import { Button } from '@thedot/design-system'
import { feedbackLine } from '@/lib/portal/agency-ops-core'
import type { AgencyPieceData } from './agency-piece-data'
import { unsentAlertSentence } from './agency-piece-data-view'
import styles from './agency-panel.module.css'

export type AgencyPanelModel = Pick<AgencyPieceData,
  'contentId' | 'stageLabel' | 'gates' | 'gatesSummary' | 'versions' | 'requestViews' | 'reviewAssets'
  | 'previews' | 'previewError' | 'design' | 'drafts' | 'feedback' | 'plannedDate' | 'todayIso' | 'nowIso'> & {
  released: boolean
}

function shortDay(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}
const GATE_CLASS = { done: styles.gateDone, na: styles.gateNa, absent: styles.gateAbsent, open: '' } as const

export default function AgencyPanel({ model }: { model: AgencyPanelModel }) {
  const now = new Date(model.nowIso)
  const video = model.previews.find((preview) => preview.mediaKind === 'video')
  const frames = model.previews.reduce((count, preview) => count + preview.frames.length, 0)
  return (
    <aside className={styles.panel} aria-label="Agency panel">
      <section>
        <div className={styles.head}>
          <span className={styles.label} style={{ margin: 0, color: 'var(--dot-black)' }}>Agency</span>
          {model.released && <Button as="a" variant="ghost" size="sm"
            href={`/admin/portal/pieces/${encodeURIComponent(model.contentId)}/maria-preview`}>View as Maria</Button>}
        </div>
        <p className={styles.meta}>{model.released ? `Stage: ${model.stageLabel} · ${model.gatesSummary}` : 'Not shared with Maria yet'}</p>
      </section>

      {model.drafts.length > 0 && <section>
        {model.drafts.map((seat) => <div key={seat.seatName}>
          {seat.failedCount > 0 && <p className={`${styles.alert} ${styles.danger}`} role="alert">
            {seat.seatName.split(' ')[0]} tried to send {seat.failedCount} edit{seat.failedCount === 1 ? '' : 's'} and it failed
            ({(seat.lastError ?? 'unknown').replaceAll('_', ' ')}). Her text is saved and she sees Retry.
          </p>}
          <p className={styles.alert}>
            {unsentAlertSentence(seat, model.plannedDate, model.todayIso, now)}
            {seat.carriedCount > 0 ? ` ${seat.carriedCount} written against an earlier version.` : ''}
          </p>
        </div>)}
      </section>}

      <section>
        <h2 className={styles.label} id="agency-gates">Production gates</h2>
        <ul className={styles.gates} aria-labelledby="agency-gates">
          {model.gates.map((gate) => <li key={gate.key} className={gate.state === 'done' ? '' : styles.gateOpenText}>
            <span className={`${styles.gateDot} ${GATE_CLASS[gate.state]}`} aria-hidden="true" />
            <span>{gate.label}</span>
            <span className={styles.when}>{gate.state === 'done' ? shortDay(gate.date) || 'done'
              : gate.state === 'na' ? 'n/a' : gate.state === 'absent' ? 'not tracked' : 'open'}</span>
          </li>)}
        </ul>
      </section>

      <section>
        <h2 className={styles.label}>Versions</h2>
        <ul className={styles.rows}>
          {model.versions.map((row) => <li key={row.version}>
            <span>{row.label}</span><span className={styles.when}>{shortDay(row.date)}</span>
          </li>)}
        </ul>
      </section>

      <section>
        <h2 className={styles.label} id="agency-requests">Maria&apos;s requests</h2>
        {model.requestViews.length === 0
          ? <p className={styles.meta}>Maria has not sent a request on this piece.</p>
          : <ul className={styles.requests} aria-labelledby="agency-requests">
            {model.requestViews.map((request) => <li key={request.id}>
              {request.thumbs[0]?.url
                ? <img className={styles.thumb} src={request.thumbs[0].url} alt={request.thumbs[0].label} />
                : <span className={styles.thumbBlank}>{request.kind === 'text' ? 'Text' : request.thumbs[0]?.label ?? 'Visual'}</span>}
              <div>
                <p><strong>{request.heading}</strong>{request.kind === 'visual' ? ', visual' : ''}</p>
                <p className={styles.meta}>{request.quote ? `“${request.quote}” ` : ''}{shortDay(request.date)} · {request.state}</p>
              </div>
            </li>)}
          </ul>}
      </section>

      <section>
        <h2 className={styles.label}>Review assets</h2>
        <ul className={styles.rows}>
          {video && <li><span>Video preview, portal storage</span><span className={styles.when}>uploaded</span></li>}
          {frames > 0 && <li><span>{video ? 'Frame strip' : 'Page images'}, {frames} images</span><span className={styles.when}>uploaded</span></li>}
          {model.previews.length === 0 && <li><span>No portal preview. Maria sees the Drive button.</span></li>}
          {model.previewError && <li><span>Preview check failed: {model.previewError}</span></li>}
          {model.reviewAssets.map((asset) => <li key={asset.id}>
            <span>{asset.label}</span>
            <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.label}`}>open</a>
          </li>)}
          {model.design.canva && <li><span>Design source</span>
            <a href={model.design.canva} target="_blank" rel="noreferrer" aria-label="Open design source">open</a></li>}
          {model.design.drive && <li><span>Drive link, from Anastasia</span>
            <a href={model.design.drive} target="_blank" rel="noreferrer" aria-label="Open Drive link">open</a></li>}
        </ul>
      </section>

      <section>
        <h2 className={styles.label}>Feedback</h2>
        <p className={styles.meta} style={{ margin: 0 }}>
          {model.feedback ? feedbackLine(model.feedback.rating, model.feedback.comment) : 'No answer yet.'}
        </p>
      </section>
    </aside>
  )
}
```

The panel imports only the type of `AgencyPieceData` (erased at build) and the pure `agency-piece-data-view.ts`, so no server module reaches a client bundle.

- [ ] **Step 5: Implement the bar**

Create `src/app/admin/portal/pieces/[contentId]/AgencyStateBar.tsx`:

```tsx
import { Button } from '@thedot/design-system'
import styles from './agency-panel.module.css'

// The admin page's bottom bar: what Maria's own bar is showing, never an action on her behalf.
export default function AgencyStateBar({ contentId, line, released }: { contentId: string; line: string; released: boolean }) {
  return (
    <div className={styles.bar} role="region" aria-label="Maria's view">
      <span><span className={styles.barState}>Maria&apos;s view</span><span className={styles.barLine}>{line}</span></span>
      {released && <Button as="a" variant="ghost" size="sm"
        href={`/admin/portal/pieces/${encodeURIComponent(contentId)}/maria-preview`}>View as Maria</Button>}
    </div>
  )
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/'`
Expected: PASS (AgencyPanel 8 tests, agency-piece-data-view 6 tests). The `role="img"` query works because an `img` with `alt` has that role.

- [ ] **Step 7: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx' 'src/app/admin/portal/pieces/[contentId]/AgencyStateBar.tsx' 'src/app/admin/portal/pieces/[contentId]/agency-panel.module.css' 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the agency side panel and the Maria's view bar for the admin piece page"
```

---
### Task 9a: The override and missing media in the agency panel (amended 2026-10-03)

**Files:**
- Modify: `src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts`
- Modify: `src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx`
- Modify: `src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx`, in the `model()` factory replace:

```tsx
  previewError: null,
```

with:

```tsx
  previewError: null,
  mediaOverride: null,
```

and append at the end of the file:

```tsx
describe('AgencyPanel release media (amended 2026-10-03)', () => {
  it('shows Anastasia\'s no-media override for the version Maria sees', () => {
    render(<AgencyPanel model={model({ previews: [], reviewAssets: [], design: { canva: null, drive: null },
      mediaOverride: 'Approved by Anastasia: article, no visual' })} />)
    expect(screen.getByText('Released without media. Approved by Anastasia: article, no visual')).toBeInTheDocument()
    expect(screen.queryByText(/nothing to look at/)).not.toBeInTheDocument()
  })

  it('says plainly when Maria has nothing to look at', () => {
    render(<AgencyPanel model={model({ previews: [], reviewAssets: [], design: { canva: null, drive: null } })} />)
    expect(screen.getByText('Maria has nothing to look at on this version. Attach a review asset, preview or design link.'))
      .toBeInTheDocument()
  })

  it('says nothing about media when something is attached', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.queryByText(/nothing to look at/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Released without media/)).not.toBeInTheDocument()
  })
})
```

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx'`
Expected: FAIL (type error on `mediaOverride`, and neither line renders).

- [ ] **Step 2: Load the override**

In `src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts`:

1. In `export type AgencyPieceData`, replace:

```ts
  previewError: string | null
  design: { canva: string | null; drive: string | null }
```

with:

```ts
  previewError: string | null
  // Amended 2026-10-03: Anastasia's no-media override for the version Maria sees (0092), if any. Shown as an
  // informational line; it also silences the My Tasks alert for that version.
  mediaOverride: string | null
  design: { canva: string | null; drive: string | null }
```

2. Directly above the line `  const seatNames = new Map(((seats.data ?? []) as Array<{ auth_user_id: string; name: string | null }>)` add:

```ts
  const overrideRow = shownVersion != null
    ? await admin.from('content_release_media_overrides').select('reason')
      .eq('client_id', clientId).eq('content_item_id', item.id).eq('content_version', shownVersion).maybeSingle()
    : { data: null, error: null }
  if (overrideRow.error) throw new Error(`Agency piece data unavailable: ${overrideRow.error.message}`)
```

3. In the returned object, replace:

```ts
    previewError,
    design: {
```

with:

```ts
    previewError,
    mediaOverride: (overrideRow.data as { reason: string } | null)?.reason ?? null,
    design: {
```

- [ ] **Step 3: Render it**

In `src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx`, replace:

```tsx
  | 'previews' | 'previewError' | 'design' | 'drafts' | 'feedback' | 'plannedDate' | 'todayIso' | 'nowIso'> & {
```

with:

```tsx
  | 'previews' | 'previewError' | 'mediaOverride' | 'design' | 'drafts' | 'feedback' | 'plannedDate' | 'todayIso' | 'nowIso'> & {
```

replace:

```tsx
  const frames = model.previews.reduce((count, preview) => count + preview.frames.length, 0)
```

with:

```tsx
  const frames = model.previews.reduce((count, preview) => count + preview.frames.length, 0)
  const noMedia = model.previews.length === 0 && model.reviewAssets.length === 0 && !model.design.canva && !model.design.drive
```

and replace:

```tsx
          {model.previewError && <li><span>Preview check failed: {model.previewError}</span></li>}
```

with:

```tsx
          {model.previewError && <li><span>Preview check failed: {model.previewError}</span></li>}
          {model.mediaOverride && <li><span>Released without media. {model.mediaOverride}</span></li>}
          {model.released && noMedia && !model.mediaOverride && <li><span>
            Maria has nothing to look at on this version. Attach a review asset, preview or design link.
          </span></li>}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run 'src/app/admin/portal/pieces/[contentId]/'`
Expected: PASS (AgencyPanel 11 tests, agency-piece-data-view 6 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/admin/portal/pieces/[contentId]/agency-piece-data.ts' 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.tsx' 'src/app/admin/portal/pieces/[contentId]/AgencyPanel.test.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Show the no-media override and missing media in the agency panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Rebuild the admin piece page

**Files:**
- Create: `src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx`
- Create: `src/app/admin/portal/pieces/[contentId]/WorkingCopy.tsx`
- Modify: `src/app/admin/portal/pieces/[contentId]/agency-panel.module.css`
- Rewrite: `src/app/admin/portal/pieces/[contentId]/page.tsx`

The centre is Maria's exact page, read-only, loaded with her live seat permissions through the existing `loadClientPiecePreview` (the same loader `maria-preview` uses), so the two views cannot drift. A piece never shared shows its working copy instead. The full comment and request threads (with the agency reply forms) stay below the layout: the panel summarises, the threads operate.

- [ ] **Step 1: The adapter**

Create `src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx`. Copy the `PieceReviewScreen` prop list **exactly** from `src/app/admin/portal/pieces/[contentId]/maria-preview/page.tsx` as it stands after plans 3 and 4 (plan 3 may have added `serverDrafts`, plan 2 or 4 `previews`); the version below is today's list:

```tsx
import type { ReactNode } from 'react'
import PieceReviewScreen from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'
import ReadOnlyPreview from './maria-preview/ReadOnlyPreview'
import type { ClientPiecePreviewData } from './maria-preview/preview-data'
import styles from './agency-panel.module.css'

// The ONLY admin file that renders the client piece layout (spec 8: one component tree, so the
// agency view cannot drift from Maria's). Task 15 points this at plan 4's PieceReviewLayout with
// readOnly, sidePanel and bottomBar; nothing else on the admin side changes then.
export default function AgencyPieceCenter({ contentId, preview, fallback, sidePanel, bottomBar }: {
  contentId: string
  preview: ClientPiecePreviewData | null
  fallback: ReactNode
  sidePanel: ReactNode
  bottomBar: ReactNode
}) {
  return <>
    <div className={styles.layout}>
      <div>
        {preview ? <ReadOnlyPreview>
          <PieceReviewScreen
            slug={preview.slug}
            item={preview.item}
            comments={preview.comments}
            schedule={preview.schedule}
            publication={preview.publication}
            requests={preview.requests}
            requestMessages={preview.requestMessages}
            reviewAssets={preview.reviewAssets}
            capabilities={preview.capabilities}
            draftScope={`read-only-preview:${preview.seatName}`}
            showReviewIntro={false}
            backHref="/admin/portal/pieces"
            backLabel="All pieces"
          />
        </ReadOnlyPreview> : fallback}
      </div>
      {sidePanel}
    </div>
    {bottomBar}
  </>
}
```

- [ ] **Step 2: Extract the working copy**

Append to `src/app/admin/portal/pieces/[contentId]/agency-panel.module.css`:

```css
.card { border: 1px solid var(--dot-hairline); background: var(--dot-white); padding: var(--dot-space-5); margin-bottom: var(--dot-space-5); }
.blockLabel { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); font-size: 0.75rem;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--dot-graphite); margin-bottom: var(--dot-space-2); }
.block { margin-bottom: var(--dot-space-5); }
.copy { font-size: 1rem; line-height: 1.55; max-width: 65ch; }
.actions { display: flex; gap: var(--dot-space-3); margin-top: var(--dot-space-4); flex-wrap: wrap; }
.back { font-family: var(--dot-font-text); font-size: 0.875rem; color: var(--dot-graphite); text-decoration: none;
  display: inline-flex; align-items: center; min-height: 44px; }
```

Create `src/app/admin/portal/pieces/[contentId]/WorkingCopy.tsx` (today's "Content" card, inline styles moved to the module):

```tsx
import { Button, Eyebrow, Text } from '@thedot/design-system'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import styles from './agency-panel.module.css'

export default function WorkingCopy({ heading, blocks, clientBody, canva, drive }: {
  heading: string
  blocks: Array<{ key: string | null; label: string; body: string }>
  clientBody: string | null
  canva: string | null
  drive: string | null
}) {
  return (
    <section className={styles.card}>
      <Eyebrow tone="grey">{heading}</Eyebrow>
      <div style={{ marginTop: 'var(--dot-space-4)' }}>
        {blocks.length > 0 ? blocks.map((block, index) => (
          <div key={block.key ?? `block-${index}`} className={styles.block}>
            {block.label && <div className={styles.blockLabel}>{block.label}</div>}
            <MarkdownCopy body={block.body} className={styles.copy} />
          </div>
        )) : clientBody ? <MarkdownCopy body={clientBody} className={styles.copy} />
          : <Text tone="grey">No copy synced for this version yet.</Text>}
      </div>
      {(canva || drive) && <div className={styles.actions}>
        {canva && <Button as="a" href={canva} target="_blank" rel="noreferrer" variant="yellow" size="sm">Open design in Canva</Button>}
        {drive && <Button as="a" href={drive} target="_blank" rel="noreferrer" variant="ghost" size="sm">Open in Drive</Button>}
      </div>}
    </section>
  )
}
```

Check `MarkdownCopy`'s props first (`src/components/portal/MarkdownCopy.tsx`). If it accepts only `style`, not `className`, keep `style={{ fontSize: 16, lineHeight: 1.55, maxWidth: '65ch' }}` on both calls and drop `.copy` from the CSS.

- [ ] **Step 3: Rewrite the page**

Replace the whole of `src/app/admin/portal/pieces/[contentId]/page.tsx` with:

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import { Eyebrow, Text } from '@thedot/design-system'
import AdminPageHeader from '../../AdminPageHeader'
import { CommentList } from '../../CommentInbox'
import { RequestList } from '../../RequestAdmin'
import adminStyles from '../../portal-admin.module.css'
import { loadAgencyPieceData } from './agency-piece-data'
import AgencyPieceCenter from './AgencyPieceCenter'
import AgencyPanel from './AgencyPanel'
import AgencyStateBar from './AgencyStateBar'
import WorkingCopy from './WorkingCopy'
import styles from './agency-panel.module.css'

export const dynamic = 'force-dynamic'

// Admin piece page (spec 2026-10-03 section 8): Maria's exact page, read-only, plus the agency
// panel. Read and operate, not authoring: content still changes only through the canonical CLI.
export default async function AdminPiecePage({ params }: { params: Promise<{ contentId: string }> }) {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const { contentId } = await params
  const data = await loadAgencyPieceData(decodeURIComponent(contentId))
  if (!data) notFound()
  const { piece } = data
  const meta = [
    piece.pillar, piece.format,
    piece.producer === 'the_dot' ? 'The Dot' : piece.producer === 'studio' ? 'Studio' : null,
    piece.platforms.length ? piece.platforms.join(' · ') : null,
  ].filter(Boolean).join('  ·  ')
  const workingIsAhead = piece.workingVersion != null
    && (piece.visibleVersion == null || piece.workingVersion > piece.visibleVersion)

  return (
    <>
      <Link href="/admin/portal/pieces" className={styles.back}>← All pieces</Link>
      <AdminPageHeader kicker="Agency ops · Piece" title={piece.title} display intro={meta} />
      {data.mariaPreviewError && <p className={`${styles.alert} ${styles.danger}`} role="alert">
        Maria&apos;s view could not load: {data.mariaPreviewError}
      </p>}

      <AgencyPieceCenter
        contentId={data.contentId}
        preview={data.mariaPreview}
        fallback={<WorkingCopy heading={`Working copy, v${piece.workingVersion ?? '?'}, not shared yet`}
          blocks={data.working.blocks} clientBody={data.working.clientBody}
          canva={data.design.canva} drive={data.design.drive} />}
        sidePanel={<AgencyPanel model={{ ...data, released: Boolean(piece.released) }} />}
        bottomBar={<AgencyStateBar contentId={data.contentId} line={data.mariaView} released={Boolean(piece.released)} />}
      />

      <div className={styles.below}>
        {piece.calendarNote && <section className={styles.card}>
          <Eyebrow tone="grey">Note</Eyebrow>
          <Text>{piece.calendarNote}</Text>
        </section>}
        {data.mariaPreview && workingIsAhead && <WorkingCopy
          heading={`Working copy, v${piece.workingVersion}, not shared yet`}
          blocks={data.working.blocks} clientBody={data.working.clientBody}
          canva={data.design.canva} drive={data.design.drive} />}
        <section className={adminStyles.card}>
          <div className={adminStyles.panelHead}><Eyebrow tone="grey">Client comments</Eyebrow></div>
          <p className={adminStyles.panelNote}>Comments on this piece’s copy or linked design, with the full reply thread in one place.</p>
          <CommentList comments={data.comments} showPieceLink={false} emptyLabel="Maria has not left a comment on this piece yet." />
        </section>
        <section className={adminStyles.card}>
          <div className={adminStyles.panelHead}><Eyebrow tone="grey">Requests</Eyebrow></div>
          <p className={adminStyles.panelNote}>Her exact text, the conversation, and your replies. Reply here before you prepare a canonical revision.</p>
          <RequestList requests={data.requests} showPieceTitle={false} emptyLabel="Maria has not sent a request for this piece yet." />
        </section>
      </div>
    </>
  )
}
```

The old "Step detail" list is replaced by the panel's gate dots (same `resolveNineGates` source). The idea-stage rows it carried ("Idea sent to Maria", "Idea approved") stay visible on the Pieces table and the plan surfaces; if Anastasia wants them on this page too, add two rows above the gates in `AgencyPanel` from `piece.ideaApprovalSentAt` and `piece.ideaDecision`.

- [ ] **Step 4: Type-check and run the folder**

```bash
pnpm exec tsc --noEmit 2>&1 | grep -E 'admin/portal/pieces' || echo clean
pnpm exec vitest run 'src/app/admin/portal/pieces/' src/app/admin/portal/
```

Expected: `clean`; all tests pass (including the existing `ReadOnlyPreview.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx' 'src/app/admin/portal/pieces/[contentId]/WorkingCopy.tsx' 'src/app/admin/portal/pieces/[contentId]/agency-panel.module.css' 'src/app/admin/portal/pieces/[contentId]/page.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Rebuild the admin piece page as Maria's read-only view plus the agency panel"
```

---
### Task 11: Feedback rules and server actions

**Files:**
- Create: `src/lib/portal/portal-feedback.ts`
- Test: `src/lib/portal/portal-feedback.test.ts`
- Create: `src/lib/portal/piece-page-announcement.ts`
- Create: `src/app/client/[slug]/feedback-actions.ts`
- Test: `src/app/client/[slug]/feedback-actions.test.ts`

- [ ] **Step 1: Write the failing rule tests**

Create `src/lib/portal/portal-feedback.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_THIS_VISIT_KEY, FEEDBACK_CLOSED_KEY, FEEDBACK_PROMPT_KEY, readVisitFlag,
  shouldShowFeedback, writeVisitFlag,
} from './portal-feedback'

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

describe('feedback card rules (spec 9.1)', () => {
  const base = { submitted: false, announcementPending: false, closedThisVisit: false, announcementThisVisit: false }

  it('shows until she submits', () => {
    expect(shouldShowFeedback(base)).toBe(true)
    expect(shouldShowFeedback({ ...base, submitted: true })).toBe(false)
  })

  it('stays hidden for the rest of the visit after Close, and returns next visit', () => {
    expect(shouldShowFeedback({ ...base, closedThisVisit: true })).toBe(false)
    expect(shouldShowFeedback({ ...base, closedThisVisit: false })).toBe(true)
  })

  it('never shares a visit with the rollout note', () => {
    expect(shouldShowFeedback({ ...base, announcementPending: true })).toBe(false)
    expect(shouldShowFeedback({ ...base, announcementThisVisit: true })).toBe(false)
  })

  it('keys its storage by prompt so a later prompt starts fresh', () => {
    expect(FEEDBACK_PROMPT_KEY).toBe('review_page_2026_10')
    expect(FEEDBACK_CLOSED_KEY).toBe('kanset-portal:feedback-closed:review_page_2026_10')
    expect(ANNOUNCEMENT_THIS_VISIT_KEY).toBe('kanset-portal:announcement-this-visit')
  })

  it('reads and writes visit flags in session storage', () => {
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(false)
    writeVisitFlag(FEEDBACK_CLOSED_KEY)
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(true)
  })

  it('treats blocked storage as "not set" and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(false)
    expect(() => writeVisitFlag(FEEDBACK_CLOSED_KEY)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/portal/portal-feedback.test.ts`
Expected: FAIL, cannot resolve `./portal-feedback`.

- [ ] **Step 3: Implement the rules and the announcement copy**

Create `src/lib/portal/portal-feedback.ts`:

```ts
// Feedback card rules (spec 9.1, migration 0095). Browser-safe.
// "Visit" = one browser or installed-app session: sessionStorage clears when she closes it.

export const FEEDBACK_PROMPT_KEY = 'review_page_2026_10'
export const FEEDBACK_COMMENT_MAX = 2000
export const FEEDBACK_CLOSED_KEY = `kanset-portal:feedback-closed:${FEEDBACK_PROMPT_KEY}`
export const ANNOUNCEMENT_THIS_VISIT_KEY = 'kanset-portal:announcement-this-visit'

export function shouldShowFeedback(input: {
  submitted: boolean
  announcementPending: boolean
  closedThisVisit: boolean
  announcementThisVisit: boolean
}): boolean {
  if (input.submitted || input.announcementPending) return false
  return !input.closedThisVisit && !input.announcementThisVisit
}

export function readVisitFlag(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeVisitFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Private mode or blocked storage: the card still hides for this page view (component state).
  }
}
```

Create `src/lib/portal/piece-page-announcement.ts`:

```ts
// The one-time note about the new piece page (spec 9.2 and 9.5, decision 3). In-portal only,
// never emailed. Per seat, server-side receipt (portal_announcement_acknowledgments, 0081).
// COPY STATUS: draft. Must pass the kanset-copywriting skill before deploy (Task 18).
export const PIECE_PAGE_ANNOUNCEMENT_KEY = 'piece_page_2026_10'

export const PIECE_PAGE_ANNOUNCEMENT = {
  title: 'Your review page, rebuilt',
  lines: [
    'Watch the video and page through every frame right here. No Drive needed.',
    'Tap any text to edit it in place, on your phone or computer. I save your edits as you type.',
    'When you are done, send your edits or approve. One button at the bottom does either.',
    'Next time you visit, a small card will ask how the new page works for you. One tap is plenty.',
  ],
  signature: 'Anastasia',
  action: 'Got it',
} as const

export const FEEDBACK_CARD_COPY = {
  title: 'How is the new review page?',
  sub: 'One tap is plenty. It helps me fix what gets in your way.',
  ratingLegend: 'Rating, 1 to 5',
  commentLabel: 'Comment (optional)',
  close: 'Close',
  send: 'Send',
  thanks: 'Thank you. I read every answer.',
  failed: 'That did not send. Your answer is still here, so you can try again.',
} as const
```

- [ ] **Step 4: Run the rule tests**

Run: `pnpm exec vitest run src/lib/portal/portal-feedback.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing action tests**

Create `src/app/client/[slug]/feedback-actions.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.session }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { mocks.redirect(url); throw new Error('REDIRECT') } }))

import { acknowledgePiecePageAnnouncement, submitPortalFeedback } from './feedback-actions'

const ITEM = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.session.mockResolvedValue({ clientId: 'client-1', userId: 'u1' })
  mocks.rpc.mockResolvedValue({ data: { outcome: 'submitted' }, error: null })
})

describe('submitPortalFeedback', () => {
  it('sends the rating and trimmed comment through the RPC', async () => {
    expect(await submitPortalFeedback('kanset', { rating: 4, comment: '  Much easier.  ', contentItemId: ITEM }))
      .toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_portal_feedback', {
      p_client_id: 'client-1', p_prompt_key: 'review_page_2026_10', p_rating: 4,
      p_comment: 'Much easier.', p_content_item_id: ITEM,
    })
  })

  it('sends an empty comment as null and drops a malformed piece id', async () => {
    await submitPortalFeedback('kanset', { rating: 5, comment: '   ', contentItemId: 'nope' })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_portal_feedback', expect.objectContaining({
      p_comment: null, p_content_item_id: null,
    }))
  })

  it('treats an earlier answer from another device as done', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'already_submitted' }, error: null })
    expect(await submitPortalFeedback('kanset', { rating: 3, comment: '', contentItemId: null })).toEqual({ ok: true })
  })

  it('refuses a rating outside 1 to 5 or an over-long comment without calling the database', async () => {
    expect((await submitPortalFeedback('kanset', { rating: 0, comment: '', contentItemId: null })).ok).toBe(false)
    expect((await submitPortalFeedback('kanset', { rating: 2.5, comment: '', contentItemId: null })).ok).toBe(false)
    expect((await submitPortalFeedback('kanset', { rating: 4, comment: 'x'.repeat(2001), contentItemId: null })).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('keeps her answer on a database refusal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await submitPortalFeedback('kanset', { rating: 4, comment: 'x', contentItemId: null }))
      .toEqual({ ok: false, error: 'That did not send. Your answer is still here, so you can try again.' })
  })

  it('sends a signed-out visitor to login', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(submitPortalFeedback('kanset', { rating: 4, comment: '', contentItemId: null })).rejects.toThrow('REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/client/login')
  })
})

describe('acknowledgePiecePageAnnouncement', () => {
  it('records the receipt under the new key', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-10-03T10:00:00Z', error: null })
    await acknowledgePiecePageAnnouncement('kanset')
    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_portal_announcement', {
      p_client_id: 'client-1', p_announcement_key: 'piece_page_2026_10',
    })
  })
})
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/feedback-actions.test.ts'`
Expected: FAIL, cannot resolve `./feedback-actions`.

- [ ] **Step 7: Implement the actions**

Create `src/app/client/[slug]/feedback-actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { FEEDBACK_COMMENT_MAX, FEEDBACK_PROMPT_KEY } from '@/lib/portal/portal-feedback'
import { FEEDBACK_CARD_COPY, PIECE_PAGE_ANNOUNCEMENT_KEY } from '@/lib/portal/piece-page-announcement'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FeedbackResult = { ok: true } | { ok: false; error: string }

// Spec 9.1. The seat's own JWT calls the RPC, so membership and the one-per-seat rule are enforced
// in the database (migration 0095). Never emails the client.
export async function submitPortalFeedback(slug: string, input: {
  rating: number
  comment: string
  contentItemId: string | null
}): Promise<FeedbackResult> {
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const comment = input.comment.trim()
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || comment.length > FEEDBACK_COMMENT_MAX) {
    return { ok: false, error: FEEDBACK_CARD_COPY.failed }
  }
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('submit_portal_feedback', {
    p_client_id: session.clientId,
    p_prompt_key: FEEDBACK_PROMPT_KEY,
    p_rating: input.rating,
    p_comment: comment || null,
    p_content_item_id: input.contentItemId && UUID.test(input.contentItemId) ? input.contentItemId : null,
  })
  if (error) {
    console.error('feedback submit failed:', error.message)
    return { ok: false, error: FEEDBACK_CARD_COPY.failed }
  }
  return { ok: true }
}

export async function acknowledgePiecePageAnnouncement(slug: string): Promise<void> {
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('acknowledge_portal_announcement', {
    p_client_id: session.clientId,
    p_announcement_key: PIECE_PAGE_ANNOUNCEMENT_KEY,
  })
  if (error) console.error('announcement acknowledgment failed:', error.message)
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/client/[slug]/feedback-actions.test.ts' src/lib/portal/portal-feedback.test.ts`
Expected: PASS (7 + 6 tests).

- [ ] **Step 9: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/portal-feedback.ts src/lib/portal/portal-feedback.test.ts src/lib/portal/piece-page-announcement.ts 'src/app/client/[slug]/feedback-actions.ts' 'src/app/client/[slug]/feedback-actions.test.ts'
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the feedback card rules, draft copy and client actions"
```

---

### Task 12: The feedback card

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/FeedbackCard.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css`
- Test: `src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx`

Visual reference: `screens-v3/09a-feedback.html` and `portal-v3.css` lines 252-258, 380, 497-500. Rating dots are native radio inputs (keyboard and screen readers work without extra code) drawn as 28 px brand dots inside 44 px targets; dots up to the chosen rating fill with `--dot-grad-fill`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const submit = vi.fn()
vi.mock('../../feedback-actions', () => ({ submitPortalFeedback: (...args: unknown[]) => submit(...args) }))

import FeedbackCard from './FeedbackCard'

beforeEach(() => {
  submit.mockReset()
  submit.mockResolvedValue({ ok: true })
  sessionStorage.clear()
})

describe('FeedbackCard', () => {
  it('appears as a dialog with five rating dots, a comment, Close and Send', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    const card = await screen.findByRole('dialog', { name: 'How is the new review page?' })
    expect(card).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('radio', { name: '4 of 5' })).toBeInTheDocument()
    expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('fills the dots up to the chosen rating and enables Send', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('radio', { name: '4 of 5' }))
    const filled = document.querySelectorAll('[data-filled="true"]')
    expect(filled).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('Close hides it for this visit only', async () => {
    const { unmount } = render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    sessionStorage.clear() // a new visit
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does not appear on the visit she read the rollout note', async () => {
    sessionStorage.setItem('kanset-portal:announcement-this-visit', '1')
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the answer, thanks her, then goes away', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('radio', { name: '5 of 5' }))
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'Much easier on my phone.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith('kanset', {
      rating: 5, comment: 'Much easier on my phone.', contentItemId: 'item-1',
    }))
    expect(await screen.findByText('Thank you. I read every answer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps her answer and says so when the send fails', async () => {
    submit.mockResolvedValue({ ok: false, error: 'That did not send. Your answer is still here, so you can try again.' })
    render(<FeedbackCard slug="kanset" contentItemId={null} />)
    fireEvent.click(await screen.findByRole('radio', { name: '3 of 5' }))
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'Frames are small.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not send.')
    expect(screen.getByLabelText('Comment (optional)')).toHaveValue('Frames are small.')
    expect(screen.getByRole('radio', { name: '3 of 5' })).toBeChecked()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx'`
Expected: FAIL, cannot resolve `./FeedbackCard`.

- [ ] **Step 3: Implement the styles**

Create `src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css`:

```css
/* Feedback card (spec 9.1, mockup 09a). Sits above the decision bar; plan 4 publishes its height
   as --piece-bar-h, with a safe fallback until then. */
.card {
  position: fixed; z-index: 35; right: var(--dot-space-6); width: 360px;
  bottom: calc(var(--piece-bar-h, 88px) + var(--dot-space-5) + env(safe-area-inset-bottom, 0px));
  background: var(--dot-white); border: 1px solid var(--dot-black); padding: var(--dot-space-5);
  font-family: var(--dot-font-text); color: var(--dot-black);
}
.title { margin: 0 0 4px; font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 1.25rem; line-height: 1.25; }
.sub { margin: 0; font-size: 0.9375rem; color: var(--dot-grey-accessible); line-height: 1.45; }
.rating { border: 0; margin: var(--dot-space-3) 0; padding: 0; display: flex; gap: 4px; }
.srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.option { width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; position: relative; }
.option input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.dot { width: 28px; height: 28px; border-radius: var(--dot-radius-circle); border: 1px solid var(--dot-black); background: var(--dot-white); display: block; }
.dot[data-filled="true"] { background: var(--dot-grad-fill); }
.option input:focus-visible + .dot { outline: 2px solid var(--dot-black); outline-offset: 3px; }
.comment { width: 100%; min-height: 72px; font-size: 1rem; }
.row { display: flex; justify-content: space-between; align-items: center; margin-top: var(--dot-space-3); gap: var(--dot-space-3); }
.close { background: none; border: 0; padding: 0 var(--dot-space-2); min-height: 44px; font: inherit; font-size: 0.9375rem;
  color: var(--dot-grey-accessible); text-decoration: underline; cursor: pointer; }
.close:focus-visible { outline: 2px solid var(--dot-black); outline-offset: 2px; }
.error { margin: var(--dot-space-2) 0 0; font-size: 0.9375rem; color: var(--dot-danger); }
.thanks { margin: var(--dot-space-3) 0 0; font-size: 1rem; }
@media (max-width: 640px) {
  .card { left: var(--dot-space-4); right: var(--dot-space-4); width: auto;
    bottom: calc(var(--piece-bar-h, 76px) + var(--dot-space-3) + env(safe-area-inset-bottom, 0px)); }
}
```

- [ ] **Step 4: Implement the card**

Create `src/app/client/[slug]/piece/[contentId]/FeedbackCard.tsx`:

```tsx
'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Button, Textarea } from '@thedot/design-system'
import { submitPortalFeedback } from '../../feedback-actions'
import {
  ANNOUNCEMENT_THIS_VISIT_KEY, FEEDBACK_CLOSED_KEY, FEEDBACK_COMMENT_MAX, readVisitFlag,
  shouldShowFeedback, writeVisitFlag,
} from '@/lib/portal/portal-feedback'
import { FEEDBACK_CARD_COPY as COPY } from '@/lib/portal/piece-page-announcement'
import styles from './FeedbackCard.module.css'

// Rendered only when the server found no answer from this seat and the rollout note is already
// acknowledged (page.tsx). Visit rules live in portal-feedback.ts. Never mounted in admin views.
export default function FeedbackCard({ slug, contentItemId }: { slug: string; contentItemId: string | null }) {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const commentId = useId()

  useEffect(() => {
    setVisible(shouldShowFeedback({
      submitted: false, announcementPending: false,
      closedThisVisit: readVisitFlag(FEEDBACK_CLOSED_KEY),
      announcementThisVisit: readVisitFlag(ANNOUNCEMENT_THIS_VISIT_KEY),
    }))
  }, [])

  if (!visible) return null

  function close() {
    if (!sent) writeVisitFlag(FEEDBACK_CLOSED_KEY)
    setVisible(false)
  }

  function send() {
    setError(null)
    startTransition(async () => {
      const result = await submitPortalFeedback(slug, { rating, comment, contentItemId })
      if (result.ok) setSent(true)
      else setError(result.error)
    })
  }

  return (
    <aside className={styles.card} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>{COPY.title}</h2>
      {sent ? <p className={styles.thanks} role="status">{COPY.thanks}</p> : <>
        <p className={styles.sub}>{COPY.sub}</p>
        <fieldset className={styles.rating}>
          <legend className={styles.srOnly}>{COPY.ratingLegend}</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={styles.option}>
              <input type="radio" name="portal-feedback-rating" value={value} checked={rating === value}
                aria-label={`${value} of 5`} onChange={() => setRating(value)} />
              <span className={styles.dot} data-filled={value <= rating ? 'true' : 'false'} aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <Textarea id={commentId} label={COPY.commentLabel} className={styles.comment} value={comment}
          maxLength={FEEDBACK_COMMENT_MAX} onChange={(event) => setComment(event.target.value)} />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>}
      <div className={styles.row}>
        <button type="button" className={styles.close} onClick={close}>{COPY.close}</button>
        {!sent && <Button as="button" type="button" variant="black" size="sm"
          disabled={rating === 0 || pending} onClick={send}>{COPY.send}</Button>}
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx'`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.tsx' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the cookie-style feedback card with five rating dots"
```

---

### Task 13: The rollout note

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.module.css`
- Test: `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx`

Visual reference: `screens-v3/09b-first-visit-intro.html` and `portal-v3.css` `.modal`, `.steps` (cream ground, black hairline, Futura title, numbered steps, signature left, black "Got it" right). Same mechanism as today's `ReviewFlowIntro` (native `<dialog>`, server-side receipt per seat), new key, new copy.

- [ ] **Step 1: Write the failing tests**

Create `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const acknowledge = vi.fn()
vi.mock('../../feedback-actions', () => ({ acknowledgePiecePageAnnouncement: (...args: unknown[]) => acknowledge(...args) }))

import PiecePageAnnouncement from './PiecePageAnnouncement'

beforeEach(() => {
  acknowledge.mockReset()
  acknowledge.mockResolvedValue(undefined)
  sessionStorage.clear()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('PiecePageAnnouncement', () => {
  it('shows the four point-form lines signed by Anastasia', () => {
    render(<PiecePageAnnouncement slug="kanset" show />)
    expect(screen.getByRole('heading', { name: 'Your review page, rebuilt' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Anastasia')).toBeInTheDocument()
  })

  it('records the receipt and marks this visit so the feedback card waits', async () => {
    render(<PiecePageAnnouncement slug="kanset" show />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith('kanset'))
    expect(sessionStorage.getItem('kanset-portal:announcement-this-visit')).toBe('1')
    expect(screen.queryByRole('heading', { name: 'Your review page, rebuilt' })).not.toBeInTheDocument()
  })

  it('treats Escape as Got it', async () => {
    render(<PiecePageAnnouncement slug="kanset" show />)
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(acknowledge).toHaveBeenCalled())
  })

  it('renders nothing once acknowledged', () => {
    const { container } = render(<PiecePageAnnouncement slug="kanset" show={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('contains no em dash and no "we"', () => {
    render(<PiecePageAnnouncement slug="kanset" show />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\u2014/)
    expect(text).not.toMatch(/\bwe\b/i)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx'`
Expected: FAIL, cannot resolve `./PiecePageAnnouncement`.

- [ ] **Step 3: Implement the styles**

Create `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.module.css`:

```css
/* Rollout note (spec 9.2, 9.5; mockup 09b). */
.dialog { width: min(560px, calc(100vw - 32px)); background: var(--dot-cream); color: var(--dot-black);
  border: 1px solid var(--dot-black); padding: var(--dot-space-6); font-family: var(--dot-font-text); }
.dialog::backdrop { background: rgba(26, 26, 26, 0.32); }
.title { margin: 0 0 var(--dot-space-4); font-family: var(--dot-font-display); font-weight: var(--dot-weight-light);
  font-size: 1.75rem; line-height: 1.2; }
.steps { margin: 0 0 var(--dot-space-5); padding-left: 1.4em; font-size: 1rem; line-height: 1.55; }
.steps li + li { margin-top: var(--dot-space-2); }
.foot { display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-3); }
.signature { font-size: 0.9375rem; color: var(--dot-graphite); }
@media (max-width: 640px) {
  .dialog { padding: var(--dot-space-5); margin-bottom: var(--dot-space-4); }
  .title { font-size: 1.5rem; }
}
```

- [ ] **Step 4: Implement the dialog**

Create `src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@thedot/design-system'
import { acknowledgePiecePageAnnouncement } from '../../feedback-actions'
import { PIECE_PAGE_ANNOUNCEMENT as COPY } from '@/lib/portal/piece-page-announcement'
import { ANNOUNCEMENT_THIS_VISIT_KEY, writeVisitFlag } from '@/lib/portal/portal-feedback'
import styles from './PiecePageAnnouncement.module.css'

// One per seat (server receipt, 0081). In-portal only; never emailed.
export default function PiecePageAnnouncement({ slug, show }: { slug: string; show: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [visible, setVisible] = useState(show)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!visible || !dialog || dialog.open) return
    dialog.showModal()
  }, [visible])

  function acknowledge() {
    writeVisitFlag(ANNOUNCEMENT_THIS_VISIT_KEY)
    setVisible(false)
    dialogRef.current?.close()
    startTransition(async () => { await acknowledgePiecePageAnnouncement(slug) })
  }

  if (!visible) return null
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="piece-page-announcement-title"
      onCancel={(event) => { event.preventDefault(); acknowledge() }}>
      <h2 id="piece-page-announcement-title" className={styles.title}>{COPY.title}</h2>
      <ol className={styles.steps}>{COPY.lines.map((line) => <li key={line}>{line}</li>)}</ol>
      <div className={styles.foot}>
        <span className={styles.signature}>{COPY.signature}</span>
        <Button as="button" type="button" variant="black" onClick={acknowledge}>{COPY.action}</Button>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx'`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.tsx' 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.module.css' 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Add the one-time in-portal note about the new piece page"
```

---

### Task 14: Mount both on the client piece page; keep feedback out of her feed

**Files:**
- Modify: `src/app/client/[slug]/piece/[contentId]/page.tsx`
- Modify: `src/lib/portal/data.ts`

- [ ] **Step 1: Read the acknowledgment and her answer, mount both**

In `src/app/client/[slug]/piece/[contentId]/page.tsx` (as it stands after plans 3 and 4; the anchors below are today's text, adapt to plan 4's version in Task 15 if they moved):

Replace

```ts
import { REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'
```

with

```ts
import { PIECE_PAGE_ANNOUNCEMENT_KEY } from '@/lib/portal/piece-page-announcement'
import { FEEDBACK_PROMPT_KEY } from '@/lib/portal/portal-feedback'
import PiecePageAnnouncement from './PiecePageAnnouncement'
import FeedbackCard from './FeedbackCard'
```

Replace

```ts
    supabase.from('portal_announcement_acknowledgments').select('acknowledged_at')
      .eq('client_id', session.clientId)
      .eq('announcement_key', REVIEW_FLOW_ANNOUNCEMENT_KEY)
      .maybeSingle(),
  ])
```

with

```ts
    supabase.from('portal_announcement_acknowledgments').select('acknowledged_at')
      .eq('client_id', session.clientId)
      .eq('announcement_key', PIECE_PAGE_ANNOUNCEMENT_KEY)
      .maybeSingle(),
  ])
  // RLS (0095) returns only this seat's own answer. A read error hides the card rather than
  // risk asking twice.
  const feedback = await supabase.from('portal_feedback_responses').select('created_at')
    .eq('client_id', session.clientId).eq('prompt_key', FEEDBACK_PROMPT_KEY).maybeSingle()
  const announcementPending = !acknowledgment.error && !acknowledgment.data
  const showFeedback = !announcementPending && !feedback.error && !feedback.data
```

Change the `PieceReviewScreen` element's `showReviewIntro={!acknowledgment.data}` to `showReviewIntro={false}` (the new note replaces the August intro; she acknowledged that one already), wrap the returned element in a fragment, and add after it:

```tsx
    <PiecePageAnnouncement slug={slug} show={announcementPending} />
    {showFeedback && <FeedbackCard slug={slug} contentItemId={item.id} />}
```

- [ ] **Step 2: Keep her feedback out of her activity feed (decision 6)**

In `src/lib/portal/data.ts`, add `'portal_feedback_submitted'` to `CLIENT_FEED_EXCLUDED_EVENTS` (after the entries plans 2 and 3 added), with a comment line above the constant:

```ts
// 'portal_feedback_submitted' (0095): her answer to the feedback card is a message to the agency,
// not news about her pieces.
```

- [ ] **Step 3: Run the client piece folder and the data tests**

Run: `pnpm exec vitest run 'src/app/client/[slug]/' src/lib/portal/`
Expected: PASS. `ReviewFlowIntro.test.tsx` still passes (the component is unchanged, only no longer mounted with `show`). If a test asserts that `page.tsx` passes `showReviewIntro` from the old key, update it to expect `false`.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]/page|lib/portal/data' || echo clean`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/client/[slug]/piece/[contentId]/page.tsx' src/lib/portal/data.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Show the rollout note once and the feedback card until answered on the piece page"
```

---
### Task 15: Dependency on plan 4 (adapt once plan 4 is final)

**Files:**
- Modify: `src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx`
- Modify (only if needed): `src/app/client/[slug]/piece/[contentId]/page.tsx`, `src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css`

Do this task only when plan 4 (`docs/superpowers/plans/2026-10-03-piece-page-plan-4-piece-page-ui.md`) is approved and merged. It is the single place plan 5 meets plan 4.

- [ ] **Step 1: Read plan 4's boundary**

```bash
cd ~/worktrees/kanset-ops-feedback
grep -n "readOnly\|sidePanel\|bottomBar\|--piece-bar-h\|export default function\|export type .*Props" 'src/app/client/[slug]/piece/[contentId]/PieceReviewLayout.tsx' 2>/dev/null || ls 'src/app/client/[slug]/piece/[contentId]/'
grep -rn "piece-bar-h\|first-visit\|FirstVisit\|announcement" 'src/app/client/[slug]/piece/[contentId]/' | grep -v test
```

Record: the component's file and export name, how it takes read-only mode, side content and a bottom bar, whether it publishes the decision bar's height, and whether plan 4 shipped its own first-visit intro.

- [ ] **Step 2: Point the adapter at plan 4's component**

Replace the body of `AgencyPieceCenter.tsx` so it renders plan 4's layout and passes the panel and bar through its slots. With the expected boundary (adjust names to Step 1's findings):

```tsx
import type { ReactNode } from 'react'
import PieceReviewLayout from '@/app/client/[slug]/piece/[contentId]/PieceReviewLayout'
import type { ClientPiecePreviewData } from './maria-preview/preview-data'

// The ONLY admin file that renders the client piece layout (spec 8). Plan 4's component in
// read-only mode: no editors, no Send or Approve, no ticks written, no feedback card.
export default function AgencyPieceCenter({ contentId, preview, fallback, sidePanel, bottomBar }: {
  contentId: string
  preview: ClientPiecePreviewData | null
  fallback: ReactNode
  sidePanel: ReactNode
  bottomBar: ReactNode
}) {
  if (!preview) return <>{fallback}{sidePanel}{bottomBar}</>
  return <PieceReviewLayout
    {...preview}
    draftScope={`read-only-preview:${preview.seatName}`}
    backHref="/admin/portal/pieces"
    backLabel="All pieces"
    readOnly
    sidePanel={sidePanel}
    bottomBar={bottomBar}
  />
}
```

If plan 4's layout needs data that `loadClientPiecePreview` does not load yet (plan 2 previews, plan 3 server drafts), plan 4 extends that loader for the `maria-preview` page; use the same fields here. If plan 4 has **no** side slot, keep Task 10's grid (`styles.layout`) around plan 4's component instead and ask plan 4's owner for the slot in a follow-up; do not fork plan 4's component.

If the unshared case looks wrong with `fallback` and `sidePanel` stacked, wrap them in `<div className={styles.layout}>` as in Task 10.

- [ ] **Step 3: One modal, one card position**

- If plan 4 shipped its own first-visit intro (spec 9.2), keep exactly one dialog per seat: remove plan 4's mount from the client `page.tsx` and keep `PiecePageAnnouncement` (its copy passes `kanset-copywriting` in Task 18), or render plan 4's component with `PIECE_PAGE_ANNOUNCEMENT` and `PIECE_PAGE_ANNOUNCEMENT_KEY`. Never both.
- If plan 4 publishes the bar height under another name, change `--piece-bar-h` in `FeedbackCard.module.css` to that name. If it publishes none, measure the bar at 1280 px and 375 px and put those values in the two fallbacks.
- If plan 4 moved the client page's data loading out of `page.tsx`, move Task 14's two reads (`portal_announcement_acknowledgments` under the new key, `portal_feedback_responses`) and the two mounts to wherever plan 4 now renders the page, and keep `showReviewIntro` (or plan 4's equivalent) off.

- [ ] **Step 4: Add the reviewed count if plan 4 stores ticks server-side (decision 9)**

Only if plan 4 added a server-readable tick record per seat and version: read it in `loadAgencyPieceData` for Maria's seat and the shown version, add `reviewed: { done: number; total: number } | null` to `AgencyPieceData`, and prefix the bar line with `${done} of ${total} reviewed · ` (mockup 10). Add one test to `AgencyPanel.test.tsx` for `AgencyStateBar` with the prefixed line. Otherwise skip this step.

- [ ] **Step 5: Run everything that touches the boundary**

```bash
pnpm exec vitest run 'src/app/admin/portal/pieces/' 'src/app/client/[slug]/piece/'
pnpm exec tsc --noEmit 2>&1 | grep -E 'admin/portal/pieces|piece/\[contentId\]' || echo clean
```

Expected: PASS; `clean`.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add 'src/app/admin/portal/pieces/[contentId]/AgencyPieceCenter.tsx' 'src/app/client/[slug]/piece/[contentId]/page.tsx' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.module.css'
git -C ~/worktrees/kanset-ops-feedback commit -m "Render the admin piece centre through plan 4's read-only layout"
```

(Add only the files Step 2 and 3 actually changed.)

---

### Task 16: Real-JWT RLS and behaviour tests

**Files:**
- Modify: `scripts/test-rls.ts`

Runs only against the disposable local stack (the script refuses any non-loopback host). Disposable tenants and users stay until the next `supabase db reset`, as for the rest of the script.

- [ ] **Step 1: Insert the block**

In `scripts/test-rls.ts`, find the block that starts the tenant kill-switch test (unique text `p_reason: 'Exercise emergency tenant stop'`). Insert the block below immediately **before** the `    {` line that opens that block (after plan 3's 0093 block):

```ts

    // 0095: feedback answers (one per seat, own-row read, RPC-only writes, agency-only notice) and
    // agency signal handling (open signals, Done, widened inbox ack, unsent-draft alert events).
    {
      const PROMPT = `rls_feedback_${RUN_ID}`
      const answer = (client: SupabaseClient, overrides: Record<string, unknown> = {}) => client.rpc('submit_portal_feedback', {
        p_client_id: bClientId, p_prompt_key: PROMPT, p_rating: 4, p_comment: 'Much easier on my phone.',
        p_content_item_id: null, ...overrides,
      })
      const outcome = (result: { data: unknown }) => (result.data as { outcome?: string } | null)?.outcome

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
      check('FB3: the seat cannot read the hidden columns', Boolean(hiddenColumns.error))

      const directInsert = await bClient.from('portal_feedback_responses').insert({
        client_id: bClientId, auth_user_id: bUserId, prompt_key: 'forged_answer', rating: 5, seat_name: 'Forged',
      })
      const directUpdate = await bClient.from('portal_feedback_responses').update({ rating: 1 }).eq('prompt_key', PROMPT).select('rating')
      check('FB4: no direct insert or update', Boolean(directInsert.error) && (Boolean(directUpdate.error) || directUpdate.data?.length === 0))

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

      const activity = await admin.from('activity_log').select('id,actor_type').eq('client_id', bClientId)
        .eq('event_type', 'portal_feedback_submitted')
      const activityIds = (activity.data ?? []).map((row) => row.id as string)
      const outbox = activityIds.length ? await admin.from('notification_outbox').select('recipient_kind,channel')
        .in('source_activity_id', activityIds) : { data: [], error: null }
      check('FB7: each answer notifies the agency (email and in-app) and never the client',
        activity.data?.length === 2 && (activity.data ?? []).every((row) => row.actor_type === 'client')
          && (outbox.data ?? []).length === 4
          && (outbox.data ?? []).every((row) => row.recipient_kind === 'agency')
          && (outbox.data ?? []).some((row) => row.channel === 'email')
          && (outbox.data ?? []).some((row) => row.channel === 'in_app'),
        JSON.stringify({ activity: activity.data, outbox: outbox.data }))

      const feedbackInbox = await admin.from('portal_inbox_events').select('id,requires_reconciliation,object_type')
        .eq('client_id', bClientId).eq('event_type', 'portal_feedback_submitted')
      check('FB8: one non-blocking inbox event per answer',
        feedbackInbox.data?.length === 2 && (feedbackInbox.data ?? []).every((row) =>
          row.requires_reconciliation === false && row.object_type === 'portal_feedback_response'),
        JSON.stringify(feedbackInbox.data))

      type SignalRow = { event_id: string; client_id: string; event_type: string }
      const openSignals = async () => {
        const result = await admin.rpc('agency_open_client_signals', { p_limit: 500 })
        if (result.error) throw new Error(`open signals: ${result.error.message}`)
        return (result.data ?? []) as SignalRow[]
      }
      const bFeedbackSignals = (await openSignals())
        .filter((row) => row.client_id === bClientId && row.event_type === 'portal_feedback_submitted')
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

      const target = bFeedbackSignals[0].event_id
      const resolveOnce = await admin.rpc('agency_resolve_inbox_event', { p_event_id: target, p_note: 'Read it.',
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-1` })
      const resolveTwice = await admin.rpc('agency_resolve_inbox_event', { p_event_id: target, p_note: null,
        p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-2` })
      const stillOpen = (await openSignals()).some((row) => row.event_id === target)
      check('SG3: Done closes a signal once; a second Done reports already_resolved',
        outcome(resolveOnce) === 'resolved' && outcome(resolveTwice) === 'already_resolved' && !stillOpen,
        resolveOnce.error?.message ?? resolveTwice.error?.message ?? '')

      const otherEvent = await admin.from('portal_inbox_events').select('id').eq('client_id', bClientId)
        .not('event_type', 'in', '(portal_feedback_submitted,review_send_failed,review_drafts_carried_over,review_unsent_drafts_due)')
        .limit(1).single()
      const wrongType = otherEvent.data ? await admin.rpc('agency_resolve_inbox_event', { p_event_id: otherEvent.data.id,
        p_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-3` }) : { error: { message: 'no other event' } }
      check('SG4: only client signals can be marked Done', Boolean(wrongType.error) && /not a client signal/.test(wrongType.error?.message ?? ''),
        wrongType.error?.message ?? 'accepted')

      // The widened cursor rule, on a fresh tenant whose inbox holds nothing else that could block.
      // SG5 and SG6 re-prove 0093's send-failure rule (plan 3 DR16) as a regression check that 0095
      // kept it; SG7 proves this plan's agency-resolved rule.
      const createdC = await admin.rpc('create_portal_client', { p_name: 'RLS Ops Signals', p_slug: `rls-ops-${RUN_ID}` })
      if (createdC.error || !createdC.data) throw new Error(`ops tenant: ${createdC.error?.message ?? 'missing'}`)
      const cClientId = createdC.data as string
      const consumer = `rls-ops-${RUN_ID}`
      const raiseFailure = async () => {
        const attemptId = randomUUID()
        const inserted = await admin.from('client_request_failures').insert({
          attempt_id: attemptId, client_id: cClientId, reason_code: 'write_failed',
          proposed_text: 'Her exact words.', proposed_length: 16, requester_name: 'RLS Seat',
        })
        if (inserted.error) throw new Error(`failure row: ${inserted.error.message}`)
        const recorded = await admin.rpc('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: [] })
        if (recorded.error) throw new Error(`record failure: ${recorded.error.message}`)
        const inbox = await admin.rpc('read_portal_inbox', { p_consumer_key: consumer, p_client_id: cClientId, p_limit: 50 })
        const row = ((inbox.data ?? []) as Array<{ seq: number; id: string; object_id: string }>).find((event) => event.object_id === attemptId)
        if (!row) throw new Error('send failure event missing')
        return { attemptId, seq: row.seq, eventId: row.id }
      }
      const ack = (seq: number) => admin.rpc('ack_portal_inbox', { p_consumer_key: consumer, p_client_id: cClientId, p_seq: seq })

      const retried = await raiseFailure()
      const blocked = await ack(retried.seq)
      const listedBefore = (await openSignals()).some((row) => row.event_id === retried.eventId)
      check('SG5: an open send failure is listed and blocks the inbox cursor',
        Boolean(blocked.error) && /unresolved/.test(blocked.error?.message ?? '') && listedBefore,
        blocked.error?.message ?? 'acknowledged')

      const resolvedRows = await admin.from('client_request_failures').update({
        resolved_at: new Date().toISOString(), resolved_by: 'system:retry', resolution_note: 'RLS retry',
      }).eq('attempt_id', retried.attemptId)
      const passed = await ack(retried.seq)
      const listedAfter = (await openSignals()).some((row) => row.event_id === retried.eventId)
      check('SG6: a send failure closes itself once a retry resolves its rows, and the cursor moves past it',
        !resolvedRows.error && !passed.error && !listedAfter, resolvedRows.error?.message ?? passed.error?.message ?? '')

      const handled = await raiseFailure()
      const blockedAgain = await ack(handled.seq)
      const done = await admin.rpc('agency_resolve_inbox_event', { p_event_id: handled.eventId,
        p_note: 'Applied her text by hand.', p_actor_key: 'thedot-admin', p_idempotency_key: `rls-sg-${RUN_ID}-4` })
      const passedAgain = await ack(handled.seq)
      check('SG7: a send failure marked Done no longer blocks the cursor',
        Boolean(blockedAgain.error) && !done.error && !passedAgain.error,
        `${blockedAgain.error?.message ?? 'not blocked'} | ${done.error?.message ?? ''} | ${passedAgain.error?.message ?? ''}`)

      // Unsent-draft alert events: a dedicated seat so no other block's edit budget is used.
      const O_EMAIL = `rls-ops-${RUN_ID}@example.com`
      const createdSeat = await admin.auth.admin.createUser({ email: O_EMAIL, email_confirm: true })
      if (createdSeat.error || !createdSeat.data.user) throw new Error(`ops seat: ${createdSeat.error?.message ?? 'missing'}`)
      const seatMembership = await admin.rpc('upsert_portal_membership', {
        p_client_id: bClientId, p_auth_user_id: createdSeat.data.user.id, p_email: O_EMAIL, p_name: 'RLS Ops Seat',
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
      // Other blocks may leave older drafts in the database, so count this fixture's events only.
      const alertEvents = () => admin.from('portal_inbox_events').select('requires_reconciliation,payload')
        .eq('client_id', bClientId).eq('event_type', 'review_unsent_drafts_due').eq('object_id', alertRow.item_id)
      const later = new Date(Date.now() + 25 * 3600 * 1000).toISOString()
      const raisedNow = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: new Date().toISOString() })
      const eventsNow = await alertEvents()
      const raisedLater = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: later })
      const raisedAgain = await admin.rpc('agency_raise_unsent_draft_alert_events', { p_now: later })
      const eventsLater = await alertEvents()
      const listedAsSignal = (await openSignals()).some((row) => row.event_type === 'review_unsent_drafts_due')
      check('SG8: a forgotten draft raises one non-blocking inbox event per day, only after 24 hours, never as a Done row',
        !raisedNow.error && eventsNow.data?.length === 0 && (raisedLater.data as number) >= 1 && raisedAgain.data === 0
          && eventsLater.data?.length === 1 && eventsLater.data[0].requires_reconciliation === false
          && (eventsLater.data[0].payload as { unsent_count?: number }).unsent_count === 1 && !listedAsSignal,
        JSON.stringify({ now: eventsNow.data, later: raisedLater.data, again: raisedAgain.data, events: eventsLater.data }))
      console.log(`cleanup: disposable tenant rls-ops-${RUN_ID} and user ${O_EMAIL} remain until database reset`)
    }
```

`randomUUID` is already imported at the top of the script (it builds `RUN_ID`), as are `SupabaseClient`, `clientForToken`, `tokenFor`, `snapshot` and `sync`. `kansetItemId` and `anonClient` are defined earlier in `main`. If `SyncResult` names its id field differently from `item_id`, use the name plan 3's DR block uses (`draftSync.find(...)?.item_id`).

- [ ] **Step 2: Run against the local stack**

```bash
cd ~/worktrees/kanset-ops-feedback
pnpm test:rls:seed-local && pnpm test:rls 2>&1 | grep -E "FB[0-9]|SG[0-9]|SUMMARY"
```

Expected: FB1 to FB8 and SG1 to SG8 all `PASS`, and `=== SUMMARY: ALL ASSERTIONS PASSED ===`. Keep this output for the review hand-over in Task 19.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add scripts/test-rls.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Prove feedback and agency signal boundaries with real-JWT tests"
```

---

### Task 16a: Real-JWT tests for the media signals (amended 2026-10-03)

**Files:**
- Modify: `scripts/test-rls.ts`

- [ ] **Step 1: Insert the block**

In `scripts/test-rls.ts`, insert the block below immediately after the closing `    }` of Task 16's 0095 block (the block whose last line is the `console.log(\`cleanup: disposable tenant rls-ops-${RUN_ID} ...\`)` call):

```ts

    // 0095 (amended 2026-10-03): a failed play is a From Maria signal until Done; a piece in front of
    // Maria with no media is listed (with its override reason) until media is attached.
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

      // Anastasia, 2026-10-03: an approved no-media override on the released version silences the alert.
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
```

The SG10/SG11 pieces are released with a design link (so the fixture wrapper from plan 2, Task 1b, records no override) and then lose it; `bClient` is a Kanset-test tenant seat, so it may report a failure for its own client's released version.

- [ ] **Step 2: Run against the local stack**

```bash
cd ~/worktrees/kanset-ops-feedback
pnpm test:rls:seed-local && pnpm test:rls 2>&1 | grep -E "FB[0-9]|SG[0-9]|SUMMARY"
```

Expected: FB1 to FB8 and SG1 to SG11 all `PASS`, and `=== SUMMARY: ALL ASSERTIONS PASSED ===`. Keep this output with Task 16's for the review hand-over in Task 19.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-ops-feedback add scripts/test-rls.ts
git -C ~/worktrees/kanset-ops-feedback commit -m "Prove the failed-play and missing-media signals, and that an override silences the alert

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Documentation

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify: `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` (workspace doc, outside git)

- [ ] **Step 1: Manual, migration ledger**

In `docs/PORTAL-AGENT-MANUAL.md`, after the ledger row for `0093_durable_review_drafts`, add:

```markdown
| `0095_agency_ops_signals_and_feedback` | n/a | Feedback card answers in `portal_feedback_responses` (one per seat per prompt; seat reads its own row; `submit_portal_feedback` is the only writer and raises a client activity that emails the agency, never the client, plus a `portal_feedback_submitted` inbox event). Agency signal handling: `agency_inbox_resolutions` + `agency_resolve_inbox_event` (Done), `agency_open_client_signals` (My Tasks "From Maria": send failures until their rows resolve, carried drafts until kept or discarded, feedback until Done), `agency_raise_unsent_draft_alert_events` (hourly cron, one `review_unsent_drafts_due` inbox event per seat, piece and Toronto day). `ack_portal_inbox` now also passes agency-resolved signals (send failures whose rows are resolved already pass since 0093). |
```

- [ ] **Step 2: Manual, recipe**

In section 18, after the "Maria's unsent drafts" paragraph plan 3 added, add:

```markdown
**Signals from Maria (since 0095):** My Tasks opens with **From Maria**: unsent edits older than a
day on a piece due within three days (live, clears itself), refused sends, edits carried over by a
release, and feedback card answers. Press **Done** once handled, or from a shell
`pnpm exec tsx scripts/portal-inbox.ts signals kanset` and
`pnpm exec tsx scripts/portal-inbox.ts resolve kanset <event-id> "<note>"`. Done never touches her
drafts or the failure log; a refused send she later retries closes on its own. The admin piece page is
her exact page read-only (`AgencyPieceCenter`, the only admin file that renders the client layout) plus
`AgencyPanel`. The rollout note uses announcement key `piece_page_2026_10`; the feedback prompt key is
`review_page_2026_10`. A new prompt or note means a new key, never a reset of the old rows.
```

- [ ] **Step 3: Playbook**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`:

Section 6, "Start of day", add a bullet:

```markdown
- Check **From Maria** at the top of Ops My Tasks: unsent edits on a piece due soon (nudge her in person, never re-ask for a review), refused sends (her text is saved; apply it or let her Retry), carried-over drafts, feedback answers. Press Done once handled.
```

Section 9 table "Which commands email Maria, and which are portal-only", after the row plan 3 added, add:

```markdown
| Feedback card answer, rollout note, unsent-edit alert, Done on a signal | no. A feedback answer emails the agency, never Maria |
```

This file is mirrored to Notion under the Kanset job hub; update its Notion twin with the same two lines if one exists.

- [ ] **Step 4: Commit the manual**

```bash
git -C ~/worktrees/kanset-ops-feedback add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-ops-feedback commit -m "Document Agency Ops signals, the feedback card and the rollout note"
```

---

### Task 17a: Document the media signals (amended 2026-10-03)

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify: `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` (workspace doc, outside git)

Run after Task 17 (it extends the paragraph and bullet Task 17 adds).

- [ ] **Step 1: Manual**

In `docs/PORTAL-AGENT-MANUAL.md` section 18, directly after the `**Signals from Maria (since 0095):**` paragraph from Task 17, add:

```markdown
**Media signals (0095, amended 2026-10-03):** From Maria also lists a failed review video play
("Maria's video didn't play: iPhone, Safari", one per preview per day, from plan 4a's
`review_playback_failed` event; press Done once handled) and every piece in front of Maria whose
released version has no review asset, no portal preview and no design link
(`agency_release_media_alerts`). That line has no Done: it clears itself when media is attached to
the released version or the piece is live on every destination, and an approved no-media override
(`Approved by Anastasia:`) on the released version silences it for that version; a newer version
without media or its own override alerts again. The admin piece page still shows the override as an
informational line ("Released without media. Approved by Anastasia: ..."), otherwise "Maria has
nothing to look at on this version".
```

- [ ] **Step 2: Playbook**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` section 6, "Start of day", replace the bullet Task 17 added:

```markdown
- Check **From Maria** at the top of Ops My Tasks: unsent edits on a piece due soon (nudge her in person, never re-ask for a review), refused sends (her text is saved; apply it or let her Retry), carried-over drafts, feedback answers. Press Done once handled.
```

with:

```markdown
- Check **From Maria** at the top of Ops My Tasks: unsent edits on a piece due soon (nudge her in person, never re-ask for a review), refused sends (her text is saved; apply it or let her Retry), carried-over drafts, feedback answers, videos that did not play for her (check the file and her device; she already sees Retry), and pieces she is looking at with nothing to look at (attach the media to the released version). Press Done once handled; the no-media lines clear themselves.
```

This file is mirrored to Notion under the Kanset job hub; update its Notion twin with the same line if one exists.

- [ ] **Step 3: Commit the manual**

```bash
git -C ~/worktrees/kanset-ops-feedback add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-ops-feedback commit -m "Document the failed-play and missing-media signals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Copy review, full verification and freeze

**Files:** possibly `src/lib/portal/piece-page-announcement.ts` (copy edits only).

- [ ] **Step 1: Client copy through `kanset-copywriting` (blocking)**

Invoke the `kanset-copywriting` skill on `PIECE_PAGE_ANNOUNCEMENT` and `FEEDBACK_CARD_COPY` in `src/lib/portal/piece-page-announcement.ts`. Brief for the skill: in-portal note and feedback card for Maria (RCIC, busy, on her phone), point form, first person singular from Anastasia, no em dashes, no "we", no emoji, nothing promised the page cannot do. Two accuracy points to settle in that pass: line 1 "No Drive needed" is true only for pieces with a portal preview (plan 2 falls back to the Drive button, and full episodes stay in Drive); line 4 must match decision 4 (the card appears from her next visit). Apply the revised wording to the constants only, rerun `pnpm exec vitest run 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx'` (update a test's literal only where the reviewed copy changed it), and show Anastasia the final text. **Do not deploy until she has said yes to the wording.** Commit:

```bash
git -C ~/worktrees/kanset-ops-feedback add src/lib/portal/piece-page-announcement.ts 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.test.tsx' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.test.tsx'
git -C ~/worktrees/kanset-ops-feedback commit -m "Apply reviewed wording to the rollout note and feedback card"
```

- [ ] **Step 2: Run everything once**

```bash
cd ~/worktrees/kanset-ops-feedback
pnpm test
pnpm exec tsc --noEmit -p . 2>&1 | grep -E "agency-ops|agency-piece|AgencyP|AgencyStateBar|WorkingCopy|ClientSignals|ResolveSignal|GatesAdmin|admin/portal/data|admin/portal/page|inbox-resolve|unsent-draft-alerts|portal-feedback|piece-page-announcement|feedback-actions|FeedbackCard|PiecePageAnnouncement|piece/\[contentId\]/page|lib/portal/data|portal-inbox" || echo "clean for this slice"
grep -rnP "\x{2014}" supabase/migrations/0095_agency_ops_signals_and_feedback.sql src/lib/portal/agency-ops*.ts src/lib/portal/portal-feedback.ts src/lib/portal/piece-page-announcement.ts 'src/app/admin/portal/pieces/[contentId]' src/app/admin/portal/ClientSignalsPanel.tsx src/app/admin/portal/ResolveSignalButton.tsx 'src/app/client/[slug]/feedback-actions.ts' 'src/app/client/[slug]/piece/[contentId]/FeedbackCard.tsx' 'src/app/client/[slug]/piece/[contentId]/PiecePageAnnouncement.tsx' || echo "no em dashes"
pnpm exec next build
```

Expected: vitest all green; `clean for this slice`; `no em dashes`; `next build` succeeds. Then `rm -rf ~/worktrees/kanset-ops-feedback/.next` (cleanup condition for the build output).

- [ ] **Step 3: Phone-width and desktop check (one session, then stop)**

Against the local stack only: start `pnpm exec next dev` with Task 0 step 3's environment, sign in to the local admin and as the seeded local client seat (existing magic-link flow), and check with the built-in browser or one Playwright run:

1. Client piece page at 375 px and 1280 px: the rollout note shows once, "Got it" closes it, a reload in the same tab shows neither the note nor the card; a new tab (new visit) shows the card above the decision bar, not under the assistant button; Close hides it, a new tab brings it back; Send with 4 dots shows the thank-you; a new tab shows nothing again.
2. Admin piece page at 1280 px and 375 px: centre is the read-only client page, the panel is on the right (stacked below at 375 px), gate dots, versions, requests with a frame thumbnail for a visual request, the "Maria's view" bar at the bottom, nothing overflows horizontally.
3. Admin My Tasks: "From Maria" shows the feedback answer; Done removes it after the refresh.

Stop the dev server immediately afterwards (`Ctrl+C`) and close any browser automation process. Cleanup condition: no dev server, no Playwright browser left running.

- [ ] **Step 4: Freeze**

```bash
git -C ~/worktrees/kanset-ops-feedback rev-parse HEAD
```

Record the hash: the frozen commit for review (playbook section 12, step 2). Stop the local stack (`supabase stop`) unless Task 19 needs it.

---

### Task 19: Review and rollout (needs Anastasia; not done by the executing agent alone)

**Files:** none changed.

- [ ] **Step 1: Code-review pass on the frozen hash** with the `code-review` skill (no Codex lane), migration first. Hand over: the hash, Task 1 steps 2 to 4 output (and Task 1a step 4), Task 16's and Task 16a's FB and SG lines and summary. Fix findings in new commits, rerun Tasks 16 and 18 step 2, freeze a new hash.
- [ ] **Step 2: Anastasia approves the wording** of the rollout note and feedback card (Task 18 step 1) and the rollout timing. The note ships with the feedback card (spec 9.5); both go live together in Step 5.
- [ ] **Step 3: Apply 0095 to production** through the runbook used for 0090 to 0093 (manual section 15, tier 1: back up first, apply in order, capture the migration output and `select public.assert_portal_security()`). 0093 must already be live. The migration must be live before any code that queries its objects deploys (playbook section 12, step 4).
- [ ] **Step 4: Verify production, read-only:** `select public.assert_portal_security()` succeeds; `select count(*) from public.portal_feedback_responses` returns 0; `select count(*) from public.agency_open_client_signals(10)` runs.
- [ ] **Step 5: Deploy by pushing the reviewed branch**

```bash
git -C ~/thedot-site status --short | grep -v '^??' || echo "tracked tree clean"
git -C ~/thedot-site checkout feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site pull --ff-only origin feat/portal-audit-fixes-2026-09-15
git -C ~/thedot-site merge --ff-only feat/piece-page-ops-feedback
git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15
```

Only after Anastasia says go. If the fast-forward fails because the production branch moved, rebase `feat/piece-page-ops-feedback` onto it, rerun Task 18 step 2, re-review the new hash, then repeat. Watch the Vercel deployment for that commit reach Ready; confirm the new cron appears in the project's cron list.
- [ ] **Step 6: Verify live behaviour with the preview seat**, never Maria's account (`toodokie@gmail.com`, admin-minted link per the "test the portal as a client seat" rule): open a released piece; the rollout note shows once; in a new tab the feedback card shows; **do not send it from the preview seat** (one answer per seat; a test answer would sit in Agency Ops). Close it. In Agency Ops: the admin piece page renders Maria's view plus the panel; My Tasks loads with or without a "From Maria" panel. No email reaches Maria at any point (check `scripts/portal-notification-audit.ts kanset --days 1` shows no new client email rows).
- [ ] **Step 7: Clean up**

```bash
git -C ~/thedot-site worktree remove ~/worktrees/kanset-ops-feedback
git -C ~/thedot-site branch -d feat/piece-page-ops-feedback
rm -f /tmp/kanset-ops-feedback-ack-before.sql /tmp/kanset-ops-feedback-0095.sql
```

Cleanup conditions met: no worktree, no `.next` output, no dev server, no browser process, the local Supabase stack stopped, the two `/tmp` files removed. Then write the outcome into `~/.claude/open-steps/reports/kanset/latest.md` and `BIG-PICTURE.md` beside it (not in the project).

---

## Self-review

**Spec coverage**
- 8, admin page = client layout read-only + agency panel, one shared tree: `AgencyPieceCenter` is the only admin renderer of the client layout (Task 10, Task 15 points it at plan 4's `PieceReviewLayout readOnly sidePanel bottomBar`); the data comes from the same `loadClientPiecePreview` the "View as Maria" page uses.
- 8, panel contents: progress and nine gates as dots (`gateDots`, Task 2; rendered Task 9), versions working and shared (`versionRows`), Maria's requests with state (`requestStateLabel`) and frame or page thumbnails for visual requests (`requestAnchors` + `buildRequestViews` from sent drafts, bundles and plan 2 previews, Tasks 2, 3, 8), review assets and previews, design links, View as Maria link, Maria's unsent-drafts alert and failed-send alert (Task 9).
- 8, My Tasks and inbox items: send failures immediately (plan 3's event + email; listed by `agency_open_client_signals`, Task 7), unsent drafts older than 24 hours on a piece due within 3 days (live list from plan 3's reader in My Tasks, hourly inbox event, Tasks 1, 6, 7), feedback answers (Tasks 1, 7), drafts carried over (Tasks 1, 7). Agency emails only: feedback is a client-actor activity (agency recipient); nothing here can reach a client email path (FB7).
- 8, activity log for draft carry-over, send failure, retry success, preview upload and deletion: delivered by plans 2 and 3; plan 5 adds feedback and keeps it out of her feed (Task 14).
- 9.1 feedback pop-up: corner card, 5 rating dots, optional comment, Close; Close hides for the visit; returns next visit until submitted; never after; one per seat; table + RPC + RLS; answer creates an agency inbox event; activity not in her feed (Tasks 1, 11, 12, 14, 16).
- 9.2 and 9.5: one in-portal note under a new key on the existing per-seat receipt (0081), point form, first person, no email, copy gated on `kanset-copywriting` and Anastasia (Tasks 11, 13, 14, 18, 19).
- 10 and 10a: The Dot tokens, hairlines, sharp corners, dots for ratings and gates, 44 px targets, visible focus, reduced motion not needed (no animation added), mobile stacking (Tasks 9, 12, 13).
- 12 tests: unit (Tasks 2, 3, 11), component (Tasks 7, 9, 12, 13), route (Tasks 4, 6), real-JWT RLS and behaviour (Task 16), phone-width check (Task 18).
- Rollout per playbook section 12: frozen hash, `code-review` skill, migration before code, push the reviewed branch (Task 19). Renumber rule stated in the ground rules.

**Media signals (amended 2026-10-03):** failed plays (plan 4a's event) listed until Done and resolvable (Tasks 1a, 2a, 7a); pieces with Maria whose released version has no media listed live, clearing on media, live-everywhere, or an approved override on that version (Tasks 1a, 2a, 3a, 7a; SG11), counted in Need you (Task 7a); override and missing media in the agency panel (Task 9a); real-JWT SG9 and SG10 (Task 16a); documented (Task 17a).

**Placeholder scan:** every code step carries its code. The conditional steps are the renumber rule, Task 0 step 4 (0093 is the expected latest `ack_portal_inbox` body; merge any later one), Task 10 step 1 (copy the prop list as plans 3 and 4 left it), Task 15 (plan 4's final names), and Task 8's fallback for `stageDisplay`; each names exactly what to read and what to change.

**Type consistency:** `OpenClientSignalRow` matches the columns `agency_open_client_signals` returns; `ClientSignal` is produced in Task 2 and consumed in Tasks 3 and 7; `UnsentDraftAlert` is plan 3's type throughout; `AgencyPieceData` (Task 8) feeds `AgencyPanelModel` (Task 9, a `Pick` plus `released`) and the page (Task 10); `DraftSeatSummary`, `AgencyRequestView` and `RequestThumb` live in `agency-piece-data-view.ts` and are re-exported from the loader. RPC names and parameter lists match the SQL: `submit_portal_feedback(p_client_id, p_prompt_key, p_rating, p_comment, p_content_item_id)`, `agency_resolve_inbox_event(p_event_id, p_note, p_actor_key, p_idempotency_key)`, `agency_open_client_signals(p_limit)`, `agency_raise_unsent_draft_alert_events(p_now)`. Prompt and announcement keys match the SQL key pattern.

**Known risks for the executor**
- `agency_open_client_signals` reads plan 3's payload fields (`content_id`, `auth_user_id`, `to_version`) and `client_request_failures.attempt_id`. If plan 3 shipped different payload names, change the SQL to match plan 3, not the other way round.
- A second release while drafts are still unsent writes a second carried-over event; both stay listed until she keeps or discards, so My Tasks may show two lines for one piece. Done on either is safe.
- The feedback card's bottom offset depends on plan 4's bar height (Task 15 step 3); the assistant launcher sits at the bottom right (`z-index: 82`), so check the 375 px layout in Task 18 for overlap.
- The admin centre loads Maria's live seat permissions; if her seat is renamed or removed, `loadClientPiecePreview` throws and the page shows the error line above the layout instead of failing.

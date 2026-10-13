# Piece Page Plan 4a of 5: New Piece Page Layout, Review Gating and Read Views Implementation Plan


> **Deploy correction 2026-10-04 (overrides every deploy step below).** Pushing `feat/portal-audit-fixes-2026-09-15` builds a Vercel **Preview only**; production is NOT deployed by a push (found when plan 1 shipped: commit a942714 built as Preview, production unchanged). Production deploys with the Vercel CLI from the clean frozen checkout: `cp -R ~/thedot-site/.vercel <worktree>/.vercel && cd <worktree> && npx vercel --prod --yes`, after the push so git and production match. Agents cannot run the push or the deploy (Claude Code's auto-mode blocks production deploys): hand Anastasia both commands, then confirm the new `target: production` deployment is READY (Vercel `list_deployments`) and verify live with a browser user agent (plain curl gets 403).

**Approved spec; **plan approved by Anastasia 2026-10-03** with all decisions as recommended (switch per seat, preview seat first; server-side ticks gating Approve; DB approve guard on unsent drafts; Approve waits for media; phone nav hidden on the piece page, 767/1100 breakpoints; ProseMirror with our own Markdown codec; cut the line "I usually reply the same day"; Maria's switch flips with plan 5; media guard: design link counts per piece, new versions re-attach media, an approved no-media override silences the no-media alert, playback limits 1 per 10 min / 20 a day / 15 s stall, portal-ship gets --no-media).** Built and deployed to production on 2026-10-04 (commit 2d0de2f, migration 0094; CSP fix b0d3995).

Checkboxes were not maintained during execution; the commits above are the record.

> **Amended 2026-10-03 (media guard).** Playback failure reporting, approved by Anastasia. New tasks carry letter suffixes so no existing task moves; run them where they sit. **Task 2a** adds to 0094 the table `content_review_playback_failures` and its only writer `report_review_playback_failure` (the seat's own client, the released version and an existing preview only; one report per seat and preview every 10 minutes, 20 a day; a device and browser name from fixed lists, never the raw user agent). The first report per preview per Toronto day writes a client-actor activity row, which 0078 routes to the agency as one email plus one in-app row (never the client), and a `review_playback_failed` inbox event that plan 5 (amended) lists under "From Maria"; later reports that day are only recorded. **Task 2b** adds PB1 to PB5 (real JWT). **Task 12a** adds the pure `playback-failure.ts` and the server action `reportReviewPlaybackFailure`. **Task 21a** adds `v2/ReviewVideoPlayer.tsx` (one silent link refresh, then a report on a load error, a wait over 15 s after play, or an expired link; "This video didn't load. I've been notified." with **Retry**, which fetches fresh signed links) and wires it into `MediaArea`; `useSignedPreview` gains `forceRefresh` and its `refresh` now says whether new links arrived. **Task 29a** passes the report in client mode only and keeps the event out of her feed. Task 31 documents it. Plan 2 (amended) also adds a release guard: the fixture releases in this plan's tests already carry a design link or a preview, so they pass unchanged.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned client piece page (collapsing header with one status line, format-adaptive media area, copy switcher with per-seat per-version ticks that gate Approve, frame-by-frame on-screen text, structured YouTube and article read views, sticky decision bar, Questions & sources drawer, every review state, first-visit intro) behind a per-seat switch, so Anastasia can review it on the preview seat before Maria sees anything.

**Architecture:** A new component tree under `src/app/client/[slug]/piece/[contentId]/v2/` renders the page from the same server data the current page loads, plus the signed previews (plan 2), the seat's server drafts (plan 3) and the seat's tab ticks (new, migration 0094). Every decision the page makes lives in small pure modules under `src/lib/portal/piece-page/` (layout and tabs, lossless segmenters, YouTube and labelled-list codecs, header status line, the one derived action resolver, collapse hysteresis, the switch), each unit-tested. The current page (`PieceReviewScreen`) stays untouched and remains the default; `page.tsx` picks the new tree only for seats listed in `PORTAL_PIECE_PAGE_V2`. Copy editing in 4a goes through one interim sheet editor (plain text, used permanently for visual notes); plan 4b swaps in the document editor.

**Tech Stack:** Next.js 15 App Router (server components + client components, server actions), React 19, CSS Modules on `@thedot/design-system` tokens, Supabase Postgres (migration 0094, SECURITY DEFINER RPC, RLS), Vitest 2 + Testing Library (jsdom), `scripts/test-rls.ts` (real-JWT, disposable local stack), the codex runtime Playwright for scripted phone-width screenshots.

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md` sections 3, 4, 9.2, 10, 10a, 12 (plan 4b covers section 5). Contract: `~/Kanset/docs/superpowers/specs/2026-08-14-piece-review-flow-redesign-design.md` (every rule holds). Visual target: `.superpowers/brainstorm/mockups-2026-10-03/screens-v3/*.html` and `portal-v3.css` (its v2 brand pass, lines 462-552, and the v3 block, lines 554-596, are the approved look; `portal-v2.css` is the earlier pass the v3 file contains). The collapsing-header script is the `<script>` at the end of `screens-v3/01-reel-review.html`.

**Builds on (must be merged and live first):** plan 1 (`TickDot`, `ReviewDots`, `--dot-off-white`, `--dot-danger`, `--dot-grad-highlight`, `--dot-grad-highlight-soft`, `--dot-grad-glow`, yellow button glow, `piece-metadata.ts`), plan 2 (`content_review_previews`, `getClientReviewPreviews`, `SignedReviewPreview`, `ReviewPreviewMedia`, the client refresh route `/api/client/[slug]/review-previews/[previewId]`), plan 3 (`content_review_drafts`, `getMyReviewDrafts`, the `ReviewDraftProvider` server mode with `currentDrafts`, `carriedDrafts`, `keepCarriedDraft`, `removeDraft`, `flush`, `send`, `syncState`, `statusText`, `sendError`, `serverSync`).

**Split (why 4a and 4b):** one plan would be well over 12,000 lines. The boundary is clean: 4a is everything Maria reads and decides with, plus the plain sheet editor; 4b is "editing like a document" (spec 5: ProseMirror document editor with lossless Markdown round-trip, track changes, YouTube and LinkedIn structured editing, frame-by-frame and section-by-section in-place editing, the 50,000 character counter, mobile full-screen editor sheets). 4a can be deployed and reviewed on the preview seat on its own; Maria is switched on only after 4b (see 4b, Task 14).

**Plan 5 (assumed, not in this plan):** the Agency Ops side (admin piece page = this client tree plus the agency panel, requests view, My Tasks items, activity), the feedback pop-up (spec 9.1) and the in-portal rollout note (spec 9.5). 4a builds `PieceWorkspace` with a `mode` prop (`'client' | 'preview'`) so plan 5 can add `'agency'` without forking the tree.

---

## Decisions for Anastasia (answer before Task 1; each has a recommendation)

1. **Two plans, switch first.** 4a ships behind a per-seat switch to the preview seat only (`toodokie@gmail.com`). Maria keeps today's page until 4b is reviewed. **Recommend: yes.**
2. **The switch is a Vercel environment variable,** `PORTAL_PIECE_PAGE_V2`: `off` (default), `all`, or a comma list of seat emails. Changing it needs a redeploy (a push, or "Redeploy" in Vercel). No migration, no admin UI. **Recommend: yes.** The alternative (a per-seat database switch with an admin toggle) costs a migration and an admin surface for a switch used twice.
3. **Ticks are stored on the server** (new table `content_review_tab_ticks`, migration 0094), per seat, per piece, per version, so a tab ticked on the phone stays ticked on the computer, and a new version starts at "0 of 3 reviewed" by construction. The browser keeps a copy so a failed write never un-ticks a tab. The database does not enforce ticks; they gate the Approve button only. **Recommend: yes.**
4. **Database approve guard (deferred from plan 3, decision 7).** `record_content_decision` refuses an approval while the approving seat has unsent server drafts on that piece, under the same row lock the bundle and draft writes take. Only her own drafts count: another seat's drafts are invisible to her, so blocking on them would be a refusal she cannot explain. This fits the contract ("Approve only when ... there are no drafts") and changes nothing else. **Recommend: include it (0094).**
5. **Approve also waits for the media** when the page expects a video or pages and there is no preview, no review asset and no design link at all ("Video coming. You can review the text now."). Today such a piece is already "package incomplete" in almost every case; this closes the gap where a design link exists but nothing can be shown. Wait: a design link counts as media (it is the Drive fallback), so this only bites when nothing exists. **Recommend: yes.**
6. **Phone layout and breakpoints.** On a phone the portal's bottom navigation is hidden on the piece page; the decision bar takes its place and "Back to calendar" sits at the top. Breakpoints are 767 px (phone, matching the portal shell) and 1100 px (split view), not the mockup's 600 px, because the portal's 216 px sidebar leaves no room for the split view below 1100 px. Between 768 and 1099 px the media sits above the copy. **Recommend: yes.**
7. **"Approve", not "Approve package"** (the approved mockup). After approving she returns to the calendar, as today. **Recommend: yes.**
8. **"Request another date" shows when it does today** (after approval, for a seat with schedule rights). The mockup shows it during review; changing who may request dates is out of scope. **Recommend: keep today's rule.**
9. **Past edits reuses today's edit history cards** (before and after, replies) inside the drawer instead of the mockup's simplified card, so there is one implementation of request history. Plan 5 can restyle it. **Recommend: yes.**
10. **The Questions button shows the number of messages** in the conversation ("Questions & sources (3)"). There is no unread tracking today. **Recommend: yes.**
11. **Client microcopy.** Every new client-facing line in this plan (bar states, intro, drawer labels, placeholders) is a draft written to the approved mockups, first person singular, no em dashes. It goes through `kanset-copywriting` and your OK before the switch reaches Maria (4b, Task 14). **Recommend: yes.**
12. **Feedback card and rollout note stay in plan 5** (spec 9.1 and 9.5 say the note ships with the card). Maria's switch flips with plan 5 unless you say earlier. **Recommend: flip with plan 5.**

---

## Ground rules for whoever executes this

- **Playbook section 12** (`~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`): one editor owns the slice; frozen commit reviewed by hash; unit tests, build and real-JWT RLS tests; migration applied to production before any code that queries `content_review_tab_ticks` deploys; push the reviewed branch. **There is no Codex lane** (Anastasia, 2026-09-21): the frozen hash is reviewed with the `code-review` skill.
- **One editor owns** `src/app/client/[slug]/piece/`, `src/app/client/[slug]/tick-actions.ts`, `src/app/client/[slug]/actions.ts`, `src/app/client/[slug]/portal-shell.module.css`, `src/lib/portal/piece-page/`, `src/components/portal/ReviewPreviewMedia.tsx`, `scripts/test-rls.ts` while this runs.
- **Plans 1, 2 and 3 must be live in production.** Check before Task 0: `ls supabase/migrations | tail -3` shows `0092_review_media_previews.sql` and `0093_durable_review_drafts.sql`, and `packages/design-system/src/components/TickDot` exists.
- **Migration number:** `0094`. If something else took 0094 first, use the next free number and change the mentions inside the file and in Task 31.
- **`.env.local` points at production.** Every database command runs with the local-stack override from Task 0, step 3.
- **Nothing here emails Maria.** The tick RPC writes no activity. The approve guard only refuses. (Amended 2026-10-03: a failed review video play, Task 2a, emails the agency once per preview per day; never the client.)
- **Host discipline (`~/Kanset/CLAUDE.md`):** one worktree, removed after the reviewed branch is pushed and production is verified; one full `next build`, in Task 32; the local `next start` used for the layout check in Task 32 is stopped in the same step; Playwright only in Tasks 32 and 33 (explicitly required there), closed when the script exits.
- **Never `git add -A` or `git add .`;** add only the files each task names. Commits stay local until Task 33.
- **No em dashes** in any file this plan creates (Kanset hard rule). En dashes in number ranges and hyphens are fine.
- **Do not touch** `PieceReviewScreen.tsx`, `ReviewVerdict.tsx`, `SuggestEditForm.tsx`, `ReviewPackage.tsx`, `ReviewAssets.tsx`, `CopyBlock.tsx`, `SchedulePanel.tsx`, `PublicationPanel.tsx`, `ReviewFlowIntro.tsx`. They stay the default page until the switch is `all` and plan 5 retires them.

**Test commands (from the worktree root):**
- One file: `pnpm exec vitest run <path>` (quote paths with brackets).
- Full unit suite: `pnpm test`
- Types for your files only: `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]/v2|piece-page/|tick-actions|playback-actions|ReviewPreviewMedia|useSignedPreview' || echo clean`
- RLS: `pnpm test:rls:seed-local && pnpm test:rls`

---

## File map

**Database**
| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0094_piece_page_review_ticks.sql` | Create | `content_review_tab_ticks`, RLS, `tick_review_tabs` RPC, the unsent-draft approve guard in `record_content_decision`, `assert_review_tick_security()`, fold |
| `scripts/test-rls.ts` | Modify | TK1 to TK5, PB1 to PB5 (Task 2b) |
| `supabase/migrations/0094_piece_page_review_ticks.sql` (Task 2a) | Modify | `content_review_playback_failures`, `report_review_playback_failure`, `assert_review_playback_security()` in the fold |

**Pure logic (`src/lib/portal/piece-page/`)**
| File | Status | Responsibility |
|---|---|---|
| `piece-page-switch.ts` (+ `.test.ts`) | Create | Which seats get the new page |
| `segments.ts` (+ `.test.ts`) | Create | Lossless split of a block into frames, pages or sections; replace one segment |
| `youtube-fields.ts` (+ `.test.ts`) | Create | Lossless YouTube package codec (Title, Description, Tags), tags, chapters |
| `labeled-list.ts` (+ `.test.ts`) | Create | Lossless `- **Label:** value` codec (article Search & sharing) |
| `copy-tabs.ts` (+ `.test.ts`) | Create | Page layout from format and previews; the copy tabs and their blocks |
| `changed-passages.ts` (+ `.test.ts`) | Create | Which paragraphs changed against the previous version; which tabs carry the updated dot |
| `header-status.ts` (+ `.test.ts`) | Create | The one header status line and the condensed bar's key fact |
| `piece-action.ts` (+ `.test.ts`) | Create | The single derived action resolver (contract order, ticks, media) |
| `collapse.ts` (+ `.test.ts`) | Create | Collapsing-header hysteresis |
| `review-ticks.ts` (+ `.test.ts`) | Create | Server reader for the seat's ticks |

**App**
| File | Status | Responsibility |
|---|---|---|
| `src/app/client/[slug]/tick-actions.ts` (+ `.test.ts`) | Create | Server action: record ticks |
| `src/app/client/[slug]/actions.ts` (+ `actions.test.ts`) | Modify / Create | Plain message for the new approve refusal |
| `src/app/client/[slug]/request-actions.ts` (+ `piece-page-intro-action.test.ts`) | Modify / Create | `acknowledgePiecePageIntro` |
| `src/lib/portal/review-flow-announcement.ts` | Modify | `PIECE_PAGE_INTRO_KEY` |
| `src/lib/portal/review-preview-core.ts` (+ test) | Modify | `reviewAssetKey` on the signed preview |
| `src/lib/portal/piece-page/limits.ts` | Create | 50,000 limit and 45,000 counter threshold |
| `src/components/portal/useSignedPreview.ts` (+ `.test.tsx`) | Create | Signed-link refresh hook, shared |
| `src/components/portal/ReviewPreviewMedia.tsx` | Modify | Use the hook (behaviour unchanged) |
| `src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.tsx` (+ test) | Modify | `startOpen` for the ⋯ menu |
| `src/app/client/[slug]/portal-shell.module.css` (+ `portal-shell.css.test.ts`) | Modify / Create | Full-width main and hidden phone nav on the new piece page; sidebar width variable |
| `src/app/client/[slug]/piece/[contentId]/page.tsx` | Modify | Load previews and ticks, pick the tree |
| `src/app/admin/portal/pieces/[contentId]/maria-preview/page.tsx` | Modify | `?layout=v2` |
| `v2/derive.ts` (+ `.test.ts`) | Create | Server-side derivation: every rule the old screen decided inline, plus layout, tabs, media, header |
| `v2/PiecePageV2.tsx` | Create | Server wrapper: derive once, render the workspace |
| `v2/PieceWorkspace.tsx` (+ `.test.tsx`) | Create | Client orchestration: providers, active tab, drawer, editor host, layout |
| `v2/piece-page.module.css` (+ `piece-page.css.test.ts`) | Create | The v3 look on design-system tokens |
| `v2/ReviewTicksProvider.tsx` (+ `.test.tsx`) | Create | Tick state, persistence, browser copy |
| `v2/hooks.ts` (+ `hooks.test.tsx`), `v2/status-text.ts` (+ test) | Create | Collapsing header, keyboard inset, phone, swipe; device-aware status line |
| `v2/test-utils.tsx` | Create | Dialog stubs and the provider wrapper for component tests |
| `v2/EditorHost.tsx` (+ `.test.tsx`) | Create | Opens the sheet editor for copy and visual notes |
| `v2/PieceHeader.tsx`, `v2/MoreMenu.tsx`, `v2/ScheduleRequest.tsx` (+ tests) | Create | Header, status line, ⋯ menu, "Request another date" |
| `v2/MediaArea.tsx`, `v2/FrameGrid.tsx`, `v2/PageViewer.tsx` (+ `MediaArea.test.tsx`) | Create | Vertical, horizontal, pages, placeholder, Drive fallback |
| `v2/CopySwitcher.tsx` (+ `.test.tsx`) | Create | Tabs with ticks, draft counts, updated dots, keyboard |
| `v2/ChangedMarkdown.tsx`, `v2/CarriedDraftNotice.tsx` | Create | Changed paragraphs highlighted; keep, adjust or discard an edit from the previous version |
| `v2/panels/*.tsx`, `v2/panels/use-block-draft.ts` (+ `panels-part1.test.tsx`, `panels-part2.test.tsx`) | Create | On-screen text, copy, PDF text, YouTube, chapters, article, Search & sharing, cover |
| `v2/DecisionBar.tsx` (+ `.test.tsx`) | Create | Progress, the one action, every state line, note, Retry |
| `v2/QuestionsDrawer.tsx` (+ `.test.tsx`) | Create | Conversation, Sources, Past edits |
| `v2/FirstVisitIntro.tsx` (+ `.test.tsx`) | Create | Three lines, once per seat |
| `scripts/piece-page-phone-check.mjs` | Create | Scripted 375 px and 1440 px screenshots and layout assertions |
| `docs/PORTAL-AGENT-MANUAL.md` | Modify | Ledger row 0094, env var, recipe |
| `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` | Modify (outside git) | Section 9 row: ticks email nobody |
| `src/lib/portal/piece-page/playback-failure.ts` (+ `.test.ts`) (Task 12a) | Create | Playback error codes, media error mapping, device and browser summary from fixed lists, labels |
| `src/app/client/[slug]/playback-actions.ts` (+ `.test.ts`) (Task 12a) | Create | Server action: report a failed play for the seat |
| `v2/ReviewVideoPlayer.tsx` (+ `.test.tsx`) (Task 21a) | Create | Inline video with failure detection, report once, message and Retry |
| `src/components/portal/useSignedPreview.ts` (Task 21a) | Modify | `refresh` returns whether links arrived; `forceRefresh` for Retry |
| `src/lib/portal/data.ts` (Task 29a) | Modify | Keep `review_playback_failed` out of the client feed |

---

### Task 0: Workspace and local database

**Files:** none changed.

- [ ] **Step 1: Confirm plans 1 to 3 are on the branch**

```bash
git -C ~/thedot-site fetch origin
git -C ~/thedot-site log --oneline -1 origin/feat/portal-audit-fixes-2026-09-15 -- supabase/migrations/0093_durable_review_drafts.sql
git -C ~/thedot-site ls-tree -r --name-only origin/feat/portal-audit-fixes-2026-09-15 packages/design-system/src/components/TickDot src/components/portal/ReviewPreviewMedia.tsx | head
```

Expected: one commit line for 0093, and the TickDot and ReviewPreviewMedia files listed. If any is missing, stop: this plan cannot start.

- [ ] **Step 2: Create the one worktree**

```bash
git -C ~/thedot-site worktree add ~/worktrees/kanset-piece-page-ui -b feat/piece-page-ui origin/feat/portal-audit-fixes-2026-09-15
cd ~/worktrees/kanset-piece-page-ui && pnpm install --frozen-lockfile && supabase start && supabase db reset
```

Expected: install with no lockfile change; `Finished supabase db reset` with no `ERROR` (0001 to 0093 replay).

Cleanup condition: remove this worktree in Task 33 after the reviewed branch is pushed and production is verified (`git -C ~/thedot-site worktree remove ~/worktrees/kanset-piece-page-ui`).

- [ ] **Step 3: Export the provably local environment (every new shell)**

```bash
cd ~/worktrees/kanset-piece-page-ui
eval "$(supabase status -o env | awk -F= '
  /^API_URL=/{print "export NEXT_PUBLIC_SUPABASE_URL=" $2}
  /^ANON_KEY=/{print "export NEXT_PUBLIC_SUPABASE_ANON_KEY=" $2}
  /^SERVICE_ROLE_KEY=/{print "export SUPABASE_SERVICE_ROLE_KEY=" $2}')"
node -e 'const u=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); if(!["127.0.0.1","localhost"].includes(u.hostname)) {console.error("NOT LOCAL", u.hostname); process.exit(1)} console.log("local", u.host)'
```

Expected: `local 127.0.0.1:54321`.

---

### Task 1: Migration 0094, review ticks and the approve guard

**Files:**
- Create: `supabase/migrations/0094_piece_page_review_ticks.sql`

The in-migration assertion is the first failing test; behaviour is proven with real JWTs in Task 2.

**Read this before editing `record_content_decision`.** The 0081 wrapper's comment line `-- burned_in_verified and portal_core_record_content_decision.` and the one above it are load-bearing: earlier assertions in the fold (0050, 0073) search the function definition for those words. The new body below keeps both comment lines verbatim, keeps `'conflicted'` and `for update` (0081's assertion), and adds one check.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0094_piece_page_review_ticks.sql`:

```sql
-- Piece page review ticks and the unsent-draft approval guard (piece page redesign, spec
-- 2026-10-03 sections 4.3 and 6; plan 4a).
--
-- Ticks: the copy switcher shows one text at a time (On-screen text, Caption, YouTube). Each tab
-- gets a tick once the seat opens it, and Approve stays off until every tab is ticked, so an
-- unseen tab cannot be skipped (on 2026-10-02 Maria approved a reel's copy without seeing its
-- on-screen text). Ticks are per seat, per piece, per version: a new version starts at zero by
-- construction. A seat reads only its own rows; the only write is tick_review_tabs, which accepts
-- ticks only on the released version. The database does not enforce ticks; they gate the button.
--
-- Approve guard: 0093 made drafts server records. Approve was still gated only in the browser.
-- record_content_decision now refuses 'approved' while the approving seat has unsent drafts on the
-- piece, checked under the same content row lock the bundle (0081) and draft writes (0093) take,
-- so an approval and a draft save serialise. Only the approving seat's drafts count: other seats'
-- drafts are invisible to her by RLS, and their sent edits already block through the unresolved
-- request check. Nothing here emails anyone.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_review_drafts') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.client_users') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0094 requires durable review drafts (0093) and the unified review bundle (0081)';
  end if;
end;
$$;

select public.assert_portal_security();

create table public.content_review_tab_ticks (
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  tab_key text not null check (tab_key ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  ticked_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id, content_item_id, content_version, tab_key),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
create index content_review_tab_ticks_by_item
  on public.content_review_tab_ticks (content_item_id, content_version);

alter table public.content_review_tab_ticks enable row level security;
create policy content_review_tab_ticks_seat_read on public.content_review_tab_ticks
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.content_review_tab_ticks from public, anon, authenticated, service_role;
grant select (content_item_id, content_version, tab_key, ticked_at)
  on public.content_review_tab_ticks to authenticated;
grant select on public.content_review_tab_ticks to service_role;

create function public.tick_review_tabs(
  p_content_id uuid,
  p_content_version int,
  p_tab_keys text[]
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_count int;
begin
  if v_uid is null or p_content_id is null or p_content_version is null or p_tab_keys is null
     or pg_catalog.cardinality(p_tab_keys) not between 1 and 20
     or exists (
       select 1 from pg_catalog.unnest(p_tab_keys) as u(value)
       where u.value is null or u.value !~ '^[a-z0-9][a-z0-9:_-]{0,63}$'
     ) then
    raise exception 'invalid review tick';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found or not exists (
    select 1 from public.client_users cu
    where cu.auth_user_id = v_uid and cu.client_id = v_item.client_id
  ) then
    raise exception 'portal_action_not_allowed' using errcode = '42501';
  end if;
  if not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.archived_at is not null then
    raise exception 'review_tick_version_not_released';
  end if;
  insert into public.content_review_tab_ticks (
    client_id, auth_user_id, content_item_id, content_version, tab_key)
  select v_item.client_id, v_uid, v_item.id, p_content_version, k.value
  from (select distinct u.value from pg_catalog.unnest(p_tab_keys) as u(value)) k
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.tick_review_tabs(uuid,integer,text[]) from public, anon, service_role;
grant execute on function public.tick_review_tabs(uuid,integer,text[]) to authenticated;

-- Same wrapper as 0081, plus the unsent-draft check. create or replace keeps the grants.
create or replace function public.record_content_decision(
  p_content_id uuid,p_content_version integer,p_decision text,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_item public.content_items%rowtype;
begin
  -- Delegated package checks remain in the wrapped boundary: portal_require_client_action,
  -- content_item_versions, content_design_links, v_is_visible,
  -- final_package_design_required, content_review_assets, final_package_incomplete,
  -- burned_in_verified and portal_core_record_content_decision.
  select ci.* into v_item from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'not authorized for this content'; end if;
  if p_decision='approved' and exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id
      and r.request_type='edit' and r.base_version=p_content_version
      and r.status in ('pending','applying','prepared','conflicted')
  ) then raise exception 'unresolved client edit request'; end if;
  -- 0094: the approving seat's own unsent drafts block approval, including drafts carried over
  -- from an earlier version (plan 3, decision 4).
  if p_decision='approved' and exists (
    select 1 from public.content_review_drafts d
    where d.client_id=v_item.client_id and d.content_item_id=v_item.id
      and d.auth_user_id=(select auth.uid()) and d.status='unsent'
  ) then raise exception 'unsent_review_drafts' using errcode='23514'; end if;
  return public.portal_core_review_flow_record_content_decision(
    p_content_id,p_content_version,p_decision,p_note);
end;
$$;

create function public.assert_review_tick_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid='public.content_review_tab_ticks'::pg_catalog.regclass) then
    raise exception 'review ticks need row level security';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','DELETE')
     or pg_catalog.has_table_privilege('anon','public.content_review_tab_ticks','SELECT') then
    raise exception 'review tick table grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon','public.tick_review_tabs(uuid,integer,text[])','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.tick_review_tabs(uuid,integer,text[])','EXECUTE') then
    raise exception 'review tick function grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%content_review_drafts%' or v_def not ilike '%''unsent''%'
     or v_def not ilike '%''conflicted''%' or v_def not ilike '%for update%'
     or v_def not ilike '%portal_core_record_content_decision%' then
    raise exception 'approval unsent-draft guard is incomplete';
  end if;
end;
$$;
revoke all on function public.assert_review_tick_security() from public, anon, authenticated;
grant execute on function public.assert_review_tick_security() to service_role;

select public.assert_review_tick_security();

-- Cumulative fold, the 0081 rename pattern.
alter function public.assert_portal_security() rename to assert_portal_pre_review_ticks_security;
revoke all on function public.assert_portal_pre_review_ticks_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_ticks_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_pre_review_ticks_security();
  perform public.assert_review_tick_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
```

- [ ] **Step 2: Apply it locally and run the fold**

```bash
cd ~/worktrees/kanset-piece-page-ui && supabase migration up
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')" \
  -c "select public.assert_portal_security();" \
  -c "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_review_tick_security' as folded;"
```

Expected: `Applying migration 0094_piece_page_review_ticks.sql...` with no error; the assertion returns one empty row; `folded = t`.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add supabase/migrations/0094_piece_page_review_ticks.sql
git -C ~/worktrees/kanset-piece-page-ui commit -m "Store review tab ticks per seat and version, refuse approval over unsent drafts (0094)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Real-JWT tests for ticks and the approve guard

**Files:**
- Modify: `scripts/test-rls.ts`

- [ ] **Step 1: Insert the TK block**

In `scripts/test-rls.ts`, find the block that starts the tenant kill-switch test (unique text `p_reason: 'Exercise emergency tenant stop'`). Insert the block below immediately **before** the `    {` line that opens that block (after plan 3's DR block if it sits there):

```ts

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
        p_can_decide: true, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
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
      const draft = await tClient.rpc('save_review_draft', {
        p_content_id: tickItemId, p_base_version: 1, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
        p_quoted_text: null, p_body: 'A caption edit she has not sent.', p_saved_at: savedAt,
      })
      if (draft.error) throw new Error(`ticks draft: ${draft.error.message}`)
      const draftSavedAt = (draft.data as { draft?: { saved_at?: string } } | null)?.draft?.saved_at ?? savedAt
      const blocked = await tClient.rpc('record_content_decision', {
        p_content_id: tickItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      const decisionAfterBlock = await tClient.from('content_with_state')
        .select('current_decision').eq('id', tickItemId).single()
      check('TK4: approval is refused while the approving seat has an unsent draft',
        !!blocked.error && /unsent_review_drafts/.test(blocked.error.message)
          && decisionAfterBlock.data?.current_decision === null,
        blocked.error?.message ?? `decision=${decisionAfterBlock.data?.current_decision}`)

      const discarded = await tClient.rpc('discard_review_draft', {
        p_content_id: tickItemId, p_target_kind: 'copy_block', p_target_key: 'caption',
        p_anchor: '', p_reason: 'client_discarded', p_saved_at: draftSavedAt,
      })
      const approved = await tClient.rpc('record_content_decision', {
        p_content_id: tickItemId, p_content_version: 1, p_decision: 'approved', p_note: null,
      })
      check('TK5: once the draft is discarded the same seat can approve',
        !discarded.error && !approved.error,
        discarded.error?.message ?? approved.error?.message ?? '')
    }
```

- [ ] **Step 2: Run the RLS suite**

Run: `pnpm test:rls:seed-local && pnpm test:rls 2>&1 | grep -E 'TK[1-5]|FAIL|passed|failed'`
Expected: `TK1` to `TK5` each `PASS`; the summary shows no failures.

If TK5 fails with `final_package_incomplete`, the fixture lacks a review asset for its format: add, before `mark_content_ready`, a `set_content_review_asset` call exactly like plan 3's DR fixture (asset key `reel-cover`, channel `social`, kind `cover`, a Canva URL).

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add scripts/test-rls.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Prove review ticks and the unsent-draft approve guard with real JWTs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2a: Playback failure log in 0094 (amended 2026-10-03)

**Files:**
- Modify: `supabase/migrations/0094_piece_page_review_ticks.sql`

Drive video has failed for Maria since about 2026-09-07 and we heard only when she said so. The piece page now reports a failed play itself. The table lives here because its first writer is the client player this plan builds (Task 21a). The in-migration assertion is the first failing test; real-JWT behaviour is Task 2b.

- [ ] **Step 1: Insert the block**

In `supabase/migrations/0094_piece_page_review_ticks.sql`, insert the block below immediately **before** the line:

```sql
-- Cumulative fold, the 0081 rename pattern.
```

Block to insert:

```sql
-- ---------------------------------------------------------------------------------------------
-- Playback failure reports (amended 2026-10-03, Anastasia). The seat's browser calls
-- report_review_playback_failure when a review video fails to load, stalls after play, or its signed
-- link has expired and cannot be refreshed. It records the piece, version, preview, error code and a
-- device and browser name from fixed lists (never the raw user agent). A seat reports a preview at
-- most once every 10 minutes and 20 times a day. The first report per preview per Toronto day writes
-- a client-actor activity row, which portal_activity_notify (0078) routes to the agency as one email
-- and one in-app row, never to the client, plus a review_playback_failed inbox event for Ops (plan
-- 5). Later reports that day are recorded only. The seat reads only its own reports.

do $$
begin
  if pg_catalog.to_regclass('public.content_review_previews') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null then
    raise exception '0094 playback reports require review previews (0092) and the portal inbox';
  end if;
end;
$$;

insert into public.activity_event_types (event_type)
values ('review_playback_failed')
on conflict (event_type) do nothing;

create table public.content_review_playback_failures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  -- Not a foreign key: retention deletes previews (0092) and the failure log outlives them.
  preview_id uuid,
  preview_key text not null check (preview_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  error_code text not null check (error_code in ('media_err_aborted','media_err_network',
    'media_err_decode','media_err_src_not_supported','stalled','link_expired','unknown')),
  device text not null check (device in ('iPhone','iPad','Android phone','Android tablet','Mac',
    'Windows PC','Linux PC','Other device')),
  browser text not null check (browser in ('Safari','Chrome','Firefox','Edge','Samsung Internet',
    'In-app browser','Other browser')),
  occurred_at timestamptz not null default pg_catalog.now(),
  notified boolean not null default false,
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
create index content_review_playback_failures_by_seat
  on public.content_review_playback_failures (auth_user_id, preview_key, occurred_at desc);
create index content_review_playback_failures_by_item
  on public.content_review_playback_failures (content_item_id, preview_key, occurred_at desc);

alter table public.content_review_playback_failures enable row level security;
create policy content_review_playback_failures_seat_read on public.content_review_playback_failures
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));
revoke all on public.content_review_playback_failures from public, anon, authenticated, service_role;
grant select (id, content_item_id, content_version, preview_key, error_code, device, browser, occurred_at)
  on public.content_review_playback_failures to authenticated;
grant select on public.content_review_playback_failures to service_role;

create function public.report_review_playback_failure(
  p_content_id uuid,
  p_content_version int,
  p_preview_key text,
  p_error_code text,
  p_device text,
  p_browser text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_name text;
  v_preview public.content_review_previews%rowtype;
  v_title text;
  v_day date := (pg_catalog.now() at time zone 'America/Toronto')::date;
  v_id uuid;
  v_notify boolean;
  v_what text;
begin
  if v_uid is null then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if p_content_id is null or p_content_version is null
     or p_preview_key is null or p_preview_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_error_code is null or p_error_code not in ('media_err_aborted','media_err_network',
       'media_err_decode','media_err_src_not_supported','stalled','link_expired','unknown')
     or p_device is null or p_device not in ('iPhone','iPad','Android phone','Android tablet','Mac',
       'Windows PC','Linux PC','Other device')
     or p_browser is null or p_browser not in ('Safari','Chrome','Firefox','Edge','Samsung Internet',
       'In-app browser','Other browser') then
    raise exception 'invalid playback report';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_name
    from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_item.client_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if not v_item.client_visible or v_item.archived_at is not null
     or v_item.client_visible_version is distinct from p_content_version then
    raise exception 'review_playback_version_not_released';
  end if;
  select p.* into v_preview from public.content_review_previews p
    where p.client_id = v_item.client_id and p.content_item_id = v_item.id
      and p.content_version = p_content_version and p.preview_key = p_preview_key;
  if not found then raise exception 'review_playback_preview_not_found'; end if;

  -- One writer at a time per preview, so the rate limit and the once-a-day notice cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-playback:' || v_item.id::text || ':' || p_preview_key, 0));
  if exists (
       select 1 from public.content_review_playback_failures f
       where f.auth_user_id = v_uid and f.content_item_id = v_item.id and f.preview_key = p_preview_key
         and f.occurred_at > pg_catalog.now() - interval '10 minutes')
     or (select pg_catalog.count(*) from public.content_review_playback_failures f
         where f.auth_user_id = v_uid and f.occurred_at > pg_catalog.now() - interval '1 day') >= 20 then
    return pg_catalog.jsonb_build_object('outcome', 'rate_limited');
  end if;

  v_notify := not exists (
    select 1 from public.content_review_playback_failures f
    where f.content_item_id = v_item.id and f.preview_key = p_preview_key and f.notified
      and (f.occurred_at at time zone 'America/Toronto')::date = v_day);

  insert into public.content_review_playback_failures (client_id, auth_user_id, content_item_id,
    content_version, preview_id, preview_key, error_code, device, browser, notified)
  values (v_item.client_id, v_uid, v_item.id, p_content_version, v_preview.id, p_preview_key,
    p_error_code, p_device, p_browser, v_notify)
  returning id into v_id;

  if not v_notify then
    return pg_catalog.jsonb_build_object('outcome', 'recorded', 'failure_id', v_id);
  end if;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
      and cv.version = p_content_version;
  v_what := case when v_preview.media_kind = 'video' then 'video didn''t play' else 'pages didn''t load' end;
  -- actor_type 'client' routes this to the agency (0078): one email and one in-app row, never the client.
  insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name, related_url)
  values (v_item.client_id, v_item.id, p_content_version, 'review_playback_failed',
    'review-playback:' || v_id::text,
    pg_catalog.split_part(v_name, ' ', 1) || '''s ' || v_what || ': ' || p_device || ', ' || p_browser,
    coalesce(v_title, v_item.content_id) || ' v' || p_content_version::text || ', ' || p_preview_key
      || ' (' || pg_catalog.replace(p_error_code, '_', ' ')
      || '). Any further failures on this preview today are logged without another email.',
    'client', v_name,
    'https://www.thedotcreative.co/admin/portal/pieces/' || v_item.content_id)
  on conflict do nothing;
  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (v_item.client_id, 'review-playback:' || v_id::text, 'review_playback_failed',
    'content_review_playback_failure', v_id, 'client', v_name,
    pg_catalog.jsonb_build_object('content_item_id', v_item.id, 'content_key', v_item.content_id,
      'content_version', p_content_version, 'preview_key', p_preview_key,
      'media_kind', v_preview.media_kind, 'error_code', p_error_code,
      'device', p_device, 'browser', p_browser, 'auth_user_id', v_uid),
    false)
  on conflict (client_id, event_key) do nothing;
  return pg_catalog.jsonb_build_object('outcome', 'notified', 'failure_id', v_id);
end;
$$;
revoke all on function public.report_review_playback_failure(uuid,integer,text,text,text,text)
  from public, anon, service_role;
grant execute on function public.report_review_playback_failure(uuid,integer,text,text,text,text)
  to authenticated;

create function public.assert_review_playback_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid='public.content_review_playback_failures'::pg_catalog.regclass) then
    raise exception 'playback failures need row level security';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename='content_review_playback_failures') <> 1 then
    raise exception 'playback failures must carry exactly the seat read policy';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','DELETE')
     or pg_catalog.has_any_column_privilege('anon','public.content_review_playback_failures','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_playback_failures','auth_user_id','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_playback_failures','client_id','SELECT') then
    raise exception 'playback failure table grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon','public.report_review_playback_failure(uuid,integer,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.report_review_playback_failure(uuid,integer,text,text,text,text)','EXECUTE') then
    raise exception 'playback report function grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.report_review_playback_failure(uuid,integer,text,text,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%client_visible_version%' or v_def not ilike '%client_users%'
     or v_def not ilike '%interval ''10 minutes''%' or v_def not ilike '%f.notified%'
     or v_def not ilike '%portal_inbox_events%' then
    raise exception 'playback report guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t where t.event_type='review_playback_failed')
     or exists (select 1 from public.activity_event_types t
                where t.event_type='review_playback_failed' and t.agency_internal) then
    raise exception 'playback failures must reach the agency';
  end if;
end;
$$;
revoke all on function public.assert_review_playback_security() from public, anon, authenticated;
grant execute on function public.assert_review_playback_security() to service_role;

select public.assert_review_playback_security();

```

- [ ] **Step 2: Fold it**

In the same file's final `create function public.assert_portal_security()` body, replace:

```sql
  perform public.assert_review_tick_security();
end;
```

with:

```sql
  perform public.assert_review_tick_security();
  perform public.assert_review_playback_security();
end;
```

- [ ] **Step 3: Replay and prove the fold**

```bash
cd ~/worktrees/kanset-piece-page-ui && supabase db reset
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')" \
  -c "select public.assert_portal_security();" \
  -c "select pg_get_functiondef('public.assert_portal_security()'::regprocedure) ~ 'assert_review_playback_security' as folded;"
```

Expected: `Finished supabase db reset` with no `ERROR`; one empty row; `folded = t`.

- [ ] **Step 4: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add supabase/migrations/0094_piece_page_review_ticks.sql
git -C ~/worktrees/kanset-piece-page-ui commit -m "Log failed review video plays and tell the agency once a day per preview (0094)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2b: Real-JWT tests for playback failure reports (amended 2026-10-03)

**Files:**
- Modify: `scripts/test-rls.ts`

- [ ] **Step 1: Insert the PB block**

In `scripts/test-rls.ts`, insert the block below immediately after the closing `    }` of the TK block from Task 2 (the block whose last check is `TK5: once the draft is discarded the same seat can approve`):

```ts

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
        p_can_decide: true, p_can_comment: true, p_can_submit_requests: true, p_can_manage_schedule: false,
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
      const activity = await admin.from('activity_log').select('id, title, actor_type')
        .eq('content_id', playItemId).eq('event_type', 'review_playback_failed')
      const inbox = await admin.from('portal_inbox_events').select('payload, requires_reconciliation')
        .eq('client_id', bClientId!).eq('event_type', 'review_playback_failed')
        .eq('payload->>content_item_id', playItemId)
      check('PB1: the first failure is recorded for the seat and reaches the agency once',
        !first.error && outcome(first) === 'notified'
          && own.data?.length === 1 && own.data[0].device === 'iPhone' && own.data[0].browser === 'Safari'
          && activity.data?.length === 1 && activity.data[0].title === "Paula's video didn't play: iPhone, Safari"
          && activity.data[0].actor_type === 'client'
          && inbox.data?.length === 1 && inbox.data[0].requires_reconciliation === false,
        JSON.stringify({ first: first.data ?? first.error?.message, own: own.data, activity: activity.data, inbox: inbox.data }))

      const again = await report(pClient, { p_error_code: 'stalled' })
      const ownAfter = await pClient.from('content_review_playback_failures').select('id').eq('content_item_id', playItemId)
      check('PB2: the same seat is rate-limited on the same preview for 10 minutes',
        !again.error && outcome(again) === 'rate_limited' && ownAfter.data?.length === 1,
        JSON.stringify({ again: again.data ?? again.error?.message, rows: ownAfter.data?.length }))

      const second = await report(bClient, { p_device: 'Mac', p_browser: 'Chrome' })
      const activityAfter = await admin.from('activity_log').select('id')
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
    }
```

`SupabaseClient`, `clientForToken`, `tokenFor`, `sync`, `snapshot`, `bClient`, `kansetClient` and `anonClient` are already in scope (the TK block uses them). The release goes through the fixture wrapper from plan 2 (amended); the preview counts as media, so no override is recorded.

- [ ] **Step 2: Run the RLS suite**

Run: `pnpm test:rls:seed-local && pnpm test:rls 2>&1 | grep -E 'PB[1-5]|TK[1-5]|FAIL|SUMMARY'`
Expected: `PB1` to `PB5` and `TK1` to `TK5` each `PASS`; `=== SUMMARY: ALL ASSERTIONS PASSED ===`.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add scripts/test-rls.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Prove playback failure reports are seat-scoped, rate-limited and agency-only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A plain message when approval is refused over unsent drafts

**Files:**
- Modify: `src/app/client/[slug]/actions.ts`
- Create: `src/app/client/[slug]/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/client/[slug]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getContentItem: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`) }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { decide } from './actions'

function form() {
  const data = new FormData()
  data.set('slug', 'kanset')
  data.set('contentId', 'piece')
  data.set('decision', 'approved')
  return data
}

beforeEach(() => {
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1', canDecide: true })
  mocks.getContentItem.mockResolvedValue({ id: 'i1', version: 2, status: 'draft', canva_url: 'https://www.canva.com/x', drive_url: null })
  mocks.rpc.mockReset()
})

describe('decide', () => {
  it('explains an approval refused because edits are still unsent', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'unsent_review_drafts' } })
    expect(await decide(form())).toEqual({
      error: 'You have edits that are not sent yet. Send them or discard them, then approve.',
    })
  })

  it('keeps the generic message for any other refusal', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'unresolved client edit request' } })
    expect(await decide(form())).toEqual({ error: 'Could not save your decision. Please try again.' })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/actions.test.ts"`
Expected: FAIL on the first test (`Could not save your decision...` returned).

- [ ] **Step 3: Implement**

In `src/app/client/[slug]/actions.ts`, replace:

```ts
  if (error) return { error: 'Could not save your decision. Please try again.' }
```

with:

```ts
  if (error) {
    // 0094: the database refuses an approval while this seat still has unsent drafts.
    if (error.message.includes('unsent_review_drafts')) {
      return { error: 'You have edits that are not sent yet. Send them or discard them, then approve.' }
    }
    return { error: 'Could not save your decision. Please try again.' }
  }
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/actions.test.ts"`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/actions.ts" "src/app/client/[slug]/actions.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Say plainly why an approval waits for unsent edits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: The per-seat switch

**Files:**
- Create: `src/lib/portal/piece-page/piece-page-switch.ts`
- Create: `src/lib/portal/piece-page/piece-page-switch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { usesPiecePageV2 } from './piece-page-switch'

describe('usesPiecePageV2', () => {
  it('is off when unset, empty or off', () => {
    expect(usesPiecePageV2('maria@kanset.com', undefined)).toBe(false)
    expect(usesPiecePageV2('maria@kanset.com', '')).toBe(false)
    expect(usesPiecePageV2('maria@kanset.com', ' off ')).toBe(false)
  })

  it('is on for everyone when all', () => {
    expect(usesPiecePageV2('maria@kanset.com', 'ALL')).toBe(true)
  })

  it('is on only for listed seats, case and space insensitive', () => {
    const setting = ' Toodokie@Gmail.com , someone@example.com'
    expect(usesPiecePageV2('toodokie@gmail.com', setting)).toBe(true)
    expect(usesPiecePageV2('maria@kanset.com', setting)).toBe(false)
  })

  it('is off for a seat without an email', () => {
    expect(usesPiecePageV2(null, 'toodokie@gmail.com')).toBe(false)
    expect(usesPiecePageV2('', 'toodokie@gmail.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/piece-page-switch.test.ts`
Expected: FAIL, cannot resolve `./piece-page-switch`.

- [ ] **Step 3: Implement**

```ts
// Which seats see the redesigned piece page (spec 2026-10-03, plan 4a decision 2).
// PORTAL_PIECE_PAGE_V2: empty or 'off' = nobody, 'all' = every seat, otherwise a comma list of
// seat emails. Read on the server only. The value is not a secret.
export function usesPiecePageV2(
  email: string | null | undefined,
  setting: string | undefined = process.env.PORTAL_PIECE_PAGE_V2,
): boolean {
  const value = (setting ?? '').trim().toLowerCase()
  if (!value || value === 'off') return false
  if (value === 'all') return true
  const seat = (email ?? '').trim().toLowerCase()
  if (!seat) return false
  return value.split(',').map((entry) => entry.trim()).filter(Boolean).includes(seat)
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/piece-page-switch.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/piece-page-switch.ts src/lib/portal/piece-page/piece-page-switch.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the per-seat switch for the new piece page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Lossless segments (frames, pages, sections)

**Files:**
- Create: `src/lib/portal/piece-page/segments.ts`
- Create: `src/lib/portal/piece-page/segments.test.ts`

Canonical on-screen and document blocks are free-form Markdown in a dozen shapes (`**1.** ...`, `- Frame 1 (hook): ...`, `**Page 2, the fee**`, `### Slide 1: Cover`, `1. **Headline** ...`). The page needs them frame by frame and page by page, and an edit to one frame must compose back into the one block body the bundle sends. The rule that makes this safe: **segmenting never changes a character**. `preamble + every segment's raw` is the body, always; a block with no recognisable structure yields no segments and is shown whole. The fixtures below are synthetic copies of the real shapes (no client copy is committed); plan 4b, Task 3 runs the same invariant over every real canonical file.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { joinSegments, replaceSegment, segmentBlock, segmentText } from './segments'

const ROUNDUP = [
  'Seven frames, 30 seconds.',
  '',
  '**1.** YOUR WEEKLY UPDATE · **DRAWS: 6,000 INVITED** · OCTOBER EDITION',
  '',
  '**2.** **TRADES** · 3,000 INVITED · CRS 470',
  '',
  '**3.** End card: **IN THE POOL?** · BOOK A CONSULTATION',
].join('\n')

const LIST_FRAMES = [
  '- Frame 1 (hook): A question? Another one?',
  '- Frame 2: Three processes with different purposes.',
  '- Frame 3, the permit: Their authorization to work.',
].join('\n')

const MIXED_LIST = [
  '- **0 to 2s (hook):** Want to hire but not sure where to begin?',
  '- **Frame 2:** Start with one question.',
  '- **Frame 3:** Some roles need one.',
  '- **CTA:** Not sure which path is yours?',
].join('\n')

const BOLD_PAGES = [
  '12 pages, 1080 x 1350.',
  '',
  '**Page 1, cover**',
  '',
  'GUIDE, SEPTEMBER',
  '',
  '**Page 2, the fee**',
  '',
  '**PAID BEFORE HIRING.**',
  '',
  '- Paid by the employer.',
  '',
  '',
  '**Page 3, the wage**',
  '',
  'The employer must offer a wage.',
].join('\n')

const HEADING_PAGES = [
  '**Document title:** A guide',
  '',
  '### Page 1 | Cover',
  '',
  '**HIRING WITHOUT AN LMIA?**',
  '',
  '### What HR should confirm',
  '',
  '### Page 2 | Start with the right question',
  '',
  'Two situations.',
].join('\n')

const NUMBERED = [
  '1. **Is the paperwork in order?** Here is what to track.',
  '2. **A permit is not forever.** Every permit expires.',
].join('\n')

const ARTICLE = [
  '# How to Choose a Representative',
  '',
  'Opening paragraph one.',
  '',
  'Opening paragraph two.',
  '',
  '### Start with the one thing you can check',
  '',
  'Body of section one.',
  '',
  '### Official sources',
  '',
  '- [A source](https://www.canada.ca/a) (canada.ca)',
].join('\n')

const ALL = [ROUNDUP, LIST_FRAMES, MIXED_LIST, BOLD_PAGES, HEADING_PAGES, NUMBERED]

describe('segmentBlock is lossless', () => {
  it('joins back to the exact body for every shape', () => {
    for (const body of ALL) {
      expect(joinSegments(segmentBlock(body, 'frames'))).toBe(body)
      expect(joinSegments(segmentBlock(body, 'pages'))).toBe(body)
    }
    expect(joinSegments(segmentBlock(ARTICLE, 'sections'))).toBe(ARTICLE)
  })
})

describe('frames', () => {
  it('splits **1.** style frames and keeps the intro line as preamble', () => {
    const result = segmentBlock(ROUNDUP, 'frames')
    expect(result.preamble).toBe('Seven frames, 30 seconds.\n\n')
    expect(result.segments.map((s) => s.label)).toEqual(['Frame 1', 'Frame 2', 'Frame 3'])
    expect(segmentText(result.segments[1])).toBe('**2.** **TRADES** · 3,000 INVITED · CRS 470')
  })

  it('splits "- Frame N" list frames', () => {
    expect(segmentBlock(LIST_FRAMES, 'frames').segments.map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('uses every list item when only some carry a frame number', () => {
    const result = segmentBlock(MIXED_LIST, 'frames')
    expect(result.preamble).toBe('')
    expect(result.segments.map((s) => s.number)).toEqual([1, 2, 3, 4])
    expect(result.segments[3].raw).toBe('- **CTA:** Not sure which path is yours?')
  })

  it('numbers an ordered list from its own numbers', () => {
    expect(segmentBlock(NUMBERED, 'frames').segments.map((s) => s.label)).toEqual(['Frame 1', 'Frame 2'])
  })

  it('returns no segments for a block without structure', () => {
    expect(segmentBlock('Just one caption line.', 'frames')).toEqual({ preamble: 'Just one caption line.', segments: [] })
  })
})

describe('pages', () => {
  it('splits bold page headers, keeping blank lines with the page above', () => {
    const result = segmentBlock(BOLD_PAGES, 'pages')
    expect(result.segments.map((s) => s.label)).toEqual(['Page 1', 'Page 2', 'Page 3'])
    expect(result.segments[1].raw.endsWith('- Paid by the employer.\n\n\n')).toBe(true)
  })

  it('splits heading pages and leaves other headings inside the page', () => {
    const result = segmentBlock(HEADING_PAGES, 'pages')
    expect(result.segments.map((s) => s.label)).toEqual(['Page 1', 'Page 2'])
    expect(result.segments[0].raw).toContain('### What HR should confirm')
  })
})

describe('sections', () => {
  it('splits at headings and records the heading level and text', () => {
    const result = segmentBlock(ARTICLE, 'sections')
    expect(result.segments.map((s) => [s.level, s.label])).toEqual([
      [1, 'How to Choose a Representative'],
      [3, 'Start with the one thing you can check'],
      [3, 'Official sources'],
    ])
  })
})

describe('replaceSegment', () => {
  it('replaces one segment and leaves every other character alone', () => {
    const next = replaceSegment(BOLD_PAGES, 'pages', 1, '**Page 2, the fee**\n\n**PAID BY THE EMPLOYER.**\n')
    expect(next).toBe(BOLD_PAGES.replace('**PAID BEFORE HIRING.**\n\n- Paid by the employer.', '**PAID BY THE EMPLOYER.**'))
  })

  it('throws for a segment that does not exist', () => {
    expect(() => replaceSegment(ROUNDUP, 'frames', 9, 'x')).toThrow('No segment 9')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/segments.test.ts`
Expected: FAIL, cannot resolve `./segments`.

- [ ] **Step 3: Implement**

```ts
// Lossless segmentation of a copy block into frames, pages or article sections (spec 2026-10-03
// sections 4.3 and 4.4). The page shows on-screen text frame by frame and PDF text page by page,
// and an edit to one frame composes back into the one block body the bundle sends. Segmenting
// never changes a character: preamble + every segment's raw is the body. A block without a
// recognisable structure yields no segments and the page shows it whole.

export type SegmentMode = 'frames' | 'pages' | 'sections'
export type SegmentKind = 'Frame' | 'Page' | 'Slide' | 'Scene' | 'Card' | 'Section'

export type Segment = {
  index: number
  number: number
  kind: SegmentKind
  label: string
  // Heading level for sections (1 to 6); 0 for frames and pages.
  level: number
  // Exact source from the marker line to the next marker, trailing blank lines included.
  raw: string
}

export type Segmented = { preamble: string; segments: Segment[] }

type Line = { text: string; offset: number }
type Start = { line: number; number: number | null; word: string | null; level: number; heading: string | null }

const HEADING_NUMBERED = /^#{2,6}\s+(page|slide|frame|scene|card)\s*(\d+)/i
const BOLD_NUMBERED = /^\*\*\s*(page|slide|frame|scene|card)\s*(\d+)/i
const BOLD_DIGIT = /^\*\*(\d+)\.\*\*/
const PLAIN_NUMBERED = /^(?:[-*+]\s+)?(?:\*\*)?\s*(page|slide|frame|scene|card)\s*(\d+)/i
const LIST_ITEM = /^(?:[-*+]|(\d+)[.)])\s+\S/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

function splitLines(body: string): Line[] {
  const lines: Line[] = []
  let offset = 0
  for (const text of body.split('\n')) {
    lines.push({ text, offset })
    offset += text.length + 1
  }
  return lines
}

function numbered(lines: Line[], pattern: RegExp): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = pattern.exec(line.text)
    if (match) starts.push({ line: index, number: Number(match[2]), word: match[1], level: 0, heading: null })
  })
  return starts
}

function boldStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const named = BOLD_NUMBERED.exec(line.text)
    if (named) {
      starts.push({ line: index, number: Number(named[2]), word: named[1], level: 0, heading: null })
      return
    }
    const digit = BOLD_DIGIT.exec(line.text)
    if (digit) starts.push({ line: index, number: Number(digit[1]), word: null, level: 0, heading: null })
  })
  return starts
}

function listStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = LIST_ITEM.exec(line.text)
    if (!match) return
    const named = PLAIN_NUMBERED.exec(line.text)
    starts.push({
      line: index,
      number: named ? Number(named[2]) : match[1] ? Number(match[1]) : null,
      word: named ? named[1] : null,
      level: 0,
      heading: null,
    })
  })
  return starts
}

function frameStarts(lines: Line[]): Start[] {
  const list = listStarts(lines)
  for (const candidate of [numbered(lines, HEADING_NUMBERED), boldStarts(lines), numbered(lines, PLAIN_NUMBERED)]) {
    if (candidate.length < 2) continue
    const allListItems = candidate.every((start) => LIST_ITEM.test(lines[start.line].text))
    return allListItems && list.length > candidate.length ? list : candidate
  }
  return list.length >= 2 ? list : []
}

function sectionStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = HEADING.exec(line.text)
    if (match) {
      const heading = match[2].replace(/\*\*|__/g, '').trim()
      starts.push({ line: index, number: null, word: null, level: match[1].length, heading })
    }
  })
  return starts
}

function kindOf(word: string | null, mode: SegmentMode): SegmentKind {
  if (mode === 'sections') return 'Section'
  if (word) return (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) as SegmentKind
  return mode === 'pages' ? 'Page' : 'Frame'
}

export function segmentBlock(body: string, mode: SegmentMode): Segmented {
  const lines = splitLines(body)
  const starts = mode === 'sections' ? sectionStarts(lines) : frameStarts(lines)
  if (starts.length === 0 || (mode !== 'sections' && starts.length < 2)) return { preamble: body, segments: [] }
  const offsets = starts.map((start) => lines[start.line].offset)
  const segments = starts.map((start, index): Segment => {
    const kind = kindOf(start.word, mode)
    const number = start.number ?? index + 1
    return {
      index,
      number,
      kind,
      label: mode === 'sections' ? (start.heading ?? `Section ${index + 1}`) : `${kind} ${number}`,
      level: start.level,
      raw: body.slice(offsets[index], index + 1 < offsets.length ? offsets[index + 1] : body.length),
    }
  })
  return { preamble: body.slice(0, offsets[0]), segments }
}

export function joinSegments(segmented: Segmented): string {
  return segmented.preamble + segmented.segments.map((segment) => segment.raw).join('')
}

// The text an editor shows for one segment: its source without the blank lines that separate it
// from the next one. replaceSegment puts those blank lines back.
export function segmentText(segment: Segment): string {
  return segment.raw.replace(/\s+$/, '')
}

export function replaceSegment(body: string, mode: SegmentMode, index: number, text: string): string {
  const segmented = segmentBlock(body, mode)
  const target = segmented.segments[index]
  if (!target) throw new Error(`No segment ${index}`)
  const trailing = /\s*$/.exec(target.raw)?.[0] ?? ''
  const replacement = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '') + trailing
  return segmented.preamble + segmented.segments
    .map((segment) => (segment.index === index ? replacement : segment.raw)).join('')
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/segments.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/segments.ts src/lib/portal/piece-page/segments.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Split copy blocks into frames, pages and sections without changing a character

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: YouTube package codec, tags and chapters

**Files:**
- Create: `src/lib/portal/piece-page/youtube-fields.ts`
- Create: `src/lib/portal/piece-page/youtube-fields.test.ts`

Real packages use four label shapes (`**Title:** inline`, `**Title**` on its own line, `**Description:**` with the text below, plain `Title: inline`) and sometimes carry notes after the tags (`**Note for Maria on the title:** ...`). The codec maps Title, Description and Tags to the exact existing block body and keeps everything else verbatim. A package without a Title label returns `null` and the page shows the block whole.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  findChapters, formatTags, parseTags, parseYouTubePackage, replaceChapters,
  serializeYouTubePackage, setYouTubeField, youTubeFieldValue,
} from './youtube-fields'

const INLINE = [
  '**Title:** What does a permit cost?',
  '',
  '**Description:**',
  'Three things to know.',
  '',
  'Book a consultation: https://kanset.com/contact',
  '',
  '#LMIA #KansetServices',
  '',
  '**Tags:** LMIA, LMIA cost, foreign worker',
].join('\n')

const OWN_LINES = [
  '**Title**',
  '',
  'Ask Kanset: Does remote work count?',
  '',
  '**Description**',
  '',
  'For the Canadian Experience Class, it depends.',
  '',
  '**Tags**',
  '',
  'canadian experience, remote work canada, kanset',
  '',
  '**Related video:** episode 3, https://youtu.be/example',
  '',
  '**Note for Maria on the title:** kept to the series format.',
].join('\n')

const PLAIN = [
  'Title: Ask Kanset: Can I lay off a foreign worker?',
  '',
  'Description: You can, with one extra step. kanset.com/contact',
].join('\n')

const BOLD_INSIDE = [
  '**Title:** Two employer paths',
  '',
  '**Description:**',
  '',
  'Intro line.',
  '',
  '**Path 1: The worker has an open permit**',
  '',
  'Details.',
].join('\n')

describe('parseYouTubePackage', () => {
  it('round-trips every shape exactly', () => {
    for (const body of [INLINE, OWN_LINES, PLAIN, BOLD_INSIDE]) {
      const parsed = parseYouTubePackage(body)
      expect(parsed).not.toBeNull()
      expect(serializeYouTubePackage(parsed!)).toBe(body)
    }
  })

  it('reads inline, own-line and plain labels', () => {
    expect(youTubeFieldValue(parseYouTubePackage(INLINE)!, 'title')).toBe('What does a permit cost?')
    expect(youTubeFieldValue(parseYouTubePackage(INLINE)!, 'tags')).toBe('LMIA, LMIA cost, foreign worker')
    expect(youTubeFieldValue(parseYouTubePackage(OWN_LINES)!, 'title')).toBe('Ask Kanset: Does remote work count?')
    expect(youTubeFieldValue(parseYouTubePackage(PLAIN)!, 'description')).toBe('You can, with one extra step. kanset.com/contact')
  })

  it('keeps notes after the tags out of the tags', () => {
    const parsed = parseYouTubePackage(OWN_LINES)!
    expect(youTubeFieldValue(parsed, 'tags')).toBe('canadian experience, remote work canada, kanset')
    expect(parsed.rest).toContain('**Note for Maria on the title:**')
  })

  it('keeps bold lines inside the description', () => {
    expect(youTubeFieldValue(parseYouTubePackage(BOLD_INSIDE)!, 'description')).toContain('**Path 1:')
  })

  it('returns null without a title label', () => {
    expect(parseYouTubePackage('Just a description, no labels.')).toBeNull()
  })
})

describe('setYouTubeField', () => {
  it('changes one field and nothing else', () => {
    const next = serializeYouTubePackage(setYouTubeField(parseYouTubePackage(INLINE)!, 'title', 'A new title'))
    expect(next).toBe(INLINE.replace('What does a permit cost?', 'A new title'))
  })

  it('leaves a missing field missing', () => {
    const parsed = parseYouTubePackage(PLAIN)!
    expect(serializeYouTubePackage(setYouTubeField(parsed, 'tags', 'x'))).toBe(PLAIN)
  })
})

describe('tags', () => {
  it('parses commas and new lines and formats with comma space', () => {
    expect(parseTags('LMIA, LMIA cost,foreign worker\nkanset')).toEqual(['LMIA', 'LMIA cost', 'foreign worker', 'kanset'])
    expect(formatTags(['a', 'b c'])).toBe('a, b c')
  })
})

describe('chapters', () => {
  const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n1:03:43 Last one\n\nOutro.'

  it('finds the run of chapter lines', () => {
    const chapters = findChapters(DESCRIPTION)!
    expect(chapters.items).toEqual([
      { time: '00:00', title: 'Meet Maria and Mary' },
      { time: '01:31', title: 'Should a client bring questions?' },
      { time: '1:03:43', title: 'Last one' },
    ])
    expect(DESCRIPTION.slice(chapters.start, chapters.end)).toBe('00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n1:03:43 Last one')
  })

  it('replaces only the chapter lines', () => {
    const chapters = findChapters(DESCRIPTION)!
    const next = replaceChapters(DESCRIPTION, chapters, [{ time: '00:00', title: 'Hello' }, { time: '02:00', title: 'Bye' }])
    expect(next).toBe('Intro.\n\nChapters:\n00:00 Hello\n02:00 Bye\n\nOutro.')
  })

  it('needs at least two chapter lines', () => {
    expect(findChapters('00:00 Only one')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/youtube-fields.test.ts`
Expected: FAIL, cannot resolve `./youtube-fields`.

- [ ] **Step 3: Implement**

```ts
// Lossless YouTube package codec (spec 2026-10-03 section 5, structured fields). Title,
// Description and Tags map to the exact existing block body: preamble + every field's
// head + value + tail + rest is the body. Notes after the tags stay verbatim in rest.

export type YouTubeFieldName = 'title' | 'description' | 'tags'
export type YouTubeField = { name: YouTubeFieldName; head: string; value: string; tail: string }
export type YouTubePackage = { preamble: string; fields: YouTubeField[]; rest: string }

const BOLD_LABEL = /^\*\*(title|description|tags)(:?)\*\*(:?)[ \t]*(.*)$/i
const PLAIN_LABEL = /^(title|description|tags):[ \t]*(.*)$/i

type Label = { offset: number; lineEnd: number; name: YouTubeFieldName; inlineStart: number | null }

export function parseYouTubePackage(body: string): YouTubePackage | null {
  const labels: Label[] = []
  let offset = 0
  for (const line of body.split('\n')) {
    const bold = BOLD_LABEL.exec(line)
    const plain = bold ? null : PLAIN_LABEL.exec(line)
    if (bold || plain) {
      const name = (bold ?? plain)![1].toLowerCase() as YouTubeFieldName
      const inline = bold ? bold[4] : plain![2]
      if (!labels.some((label) => label.name === name)) {
        labels.push({
          offset,
          lineEnd: offset + line.length,
          name,
          inlineStart: inline.length > 0 ? offset + line.length - inline.length : null,
        })
      }
    }
    offset += line.length + 1
  }
  if (!labels.some((label) => label.name === 'title')) return null

  const fields: YouTubeField[] = []
  let end = 0
  labels.forEach((label, index) => {
    const next = labels[index + 1]?.offset ?? body.length
    const skip = /^\n(?:[ \t]*\n)*/.exec(body.slice(label.lineEnd))?.[0].length ?? 0
    const valueStart = label.inlineStart ?? Math.min(label.lineEnd + skip, next)
    let regionEnd = next
    if (label.name === 'tags' && index === labels.length - 1) {
      const blank = /\n[ \t]*\n/.exec(body.slice(valueStart))
      if (blank) regionEnd = valueStart + blank.index
    }
    const region = body.slice(valueStart, regionEnd)
    const value = region.replace(/\s+$/, '')
    fields.push({
      name: label.name,
      head: body.slice(label.offset, valueStart),
      value,
      tail: region.slice(value.length),
    })
    end = regionEnd
  })
  return { preamble: body.slice(0, labels[0].offset), fields, rest: body.slice(end) }
}

export function serializeYouTubePackage(pkg: YouTubePackage): string {
  return pkg.preamble + pkg.fields.map((field) => field.head + field.value + field.tail).join('') + pkg.rest
}

export function youTubeFieldValue(pkg: YouTubePackage, name: YouTubeFieldName): string | null {
  return pkg.fields.find((field) => field.name === name)?.value ?? null
}

export function setYouTubeField(pkg: YouTubePackage, name: YouTubeFieldName, value: string): YouTubePackage {
  const clean = value.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  return { ...pkg, fields: pkg.fields.map((field) => (field.name === name ? { ...field, value: clean } : field)) }
}

export function parseTags(value: string): string[] {
  return value.split(/\s*,\s*|\n+/).map((tag) => tag.trim()).filter(Boolean)
}

export function formatTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(', ')
}

const CHAPTER = /^((?:\d{1,2}:)?\d{1,2}:\d{2})[ \t]+(\S.*?)[ \t]*$/

export type ChapterItem = { time: string; title: string }
export type Chapters = { start: number; end: number; items: ChapterItem[] }

// The first run of two or more consecutive "00:00 Title" lines. start and end are character
// offsets of the run (end excludes the newline after the last chapter).
export function findChapters(text: string): Chapters | null {
  let offset = 0
  let run: Chapters | null = null
  for (const line of text.split('\n')) {
    const match = CHAPTER.exec(line)
    if (match) {
      if (!run) run = { start: offset, end: offset + line.length, items: [] }
      run.items.push({ time: match[1], title: match[2] })
      run.end = offset + line.length
    } else if (run) {
      if (run.items.length >= 2) return run
      run = null
    }
    offset += line.length + 1
  }
  return run && run.items.length >= 2 ? run : null
}

export function replaceChapters(text: string, chapters: Chapters, items: ChapterItem[]): string {
  const lines = items.map((item) => `${item.time.trim()} ${item.title.trim()}`).join('\n')
  return text.slice(0, chapters.start) + lines + text.slice(chapters.end)
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/youtube-fields.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/youtube-fields.ts src/lib/portal/piece-page/youtube-fields.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Read YouTube title, description, tags and chapters from the exact block body

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Labelled-list codec (article Search & sharing)

**Files:**
- Create: `src/lib/portal/piece-page/labeled-list.ts`
- Create: `src/lib/portal/piece-page/labeled-list.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  SEARCH_FIELDS, labeledValue, parseLabeledList, serializeLabeledList, setLabeledValue,
} from './labeled-list'

const SEO = [
  '- **Title / H1:** How to Choose a Representative',
  '- **SEO title:** How to Choose a Representative in Canada',
  '- **Slug:** `/news/how-to-choose`',
  '- **Meta description:** A license tells you who may help you.',
  'A stray line that is not a field.',
  '- **Excerpt:** Anyone you pay has to be licensed.',
].join('\n')

describe('labelled list', () => {
  it('round-trips exactly', () => {
    expect(serializeLabeledList(parseLabeledList(SEO))).toBe(SEO)
  })

  it('reads values, case-insensitive, without code ticks', () => {
    const list = parseLabeledList(SEO)
    expect(labeledValue(list, 'seo title')).toBe('How to Choose a Representative in Canada')
    expect(labeledValue(list, 'Slug')).toBe('/news/how-to-choose')
    expect(labeledValue(list, 'Missing')).toBeNull()
  })

  it('changes one value, keeping its code ticks and every other line', () => {
    const next = serializeLabeledList(setLabeledValue(parseLabeledList(SEO), 'Slug', '/news/choose'))
    expect(next).toBe(SEO.replace('`/news/how-to-choose`', '`/news/choose`'))
  })

  it('maps the four search fields with their guidance limits', () => {
    expect(SEARCH_FIELDS.map((field) => [field.label, field.title, field.limit])).toEqual([
      ['SEO title', 'Search title', 60],
      ['Meta description', 'Search description', 160],
      ['Slug', 'Web address', null],
      ['Excerpt', 'Preview text when shared', null],
    ])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/labeled-list.test.ts`
Expected: FAIL, cannot resolve `./labeled-list`.

- [ ] **Step 3: Implement**

```ts
// Lossless "- **Label:** value" codec for the article's publishing details block (spec 4.4,
// Search & sharing). Lines that are not fields are kept verbatim.

export type LabeledField = {
  kind: 'field'; lead: string; label: string; sep: string; wrap: '' | '`'; value: string; trail: string
}
export type LabeledItem = LabeledField | { kind: 'text'; raw: string }
export type LabeledList = { items: LabeledItem[] }

const FIELD = /^([ \t]*[-*+][ \t]+\*\*)([^*\n]+?)(:\*\*[ \t]*|\*\*:[ \t]*)(.*?)([ \t]*)$/

export function parseLabeledList(body: string): LabeledList {
  return {
    items: body.split('\n').map((line): LabeledItem => {
      const match = FIELD.exec(line)
      if (!match) return { kind: 'text', raw: line }
      const ticked = /^`([^`]*)`$/.exec(match[4])
      return {
        kind: 'field', lead: match[1], label: match[2], sep: match[3],
        wrap: ticked ? '`' : '', value: ticked ? ticked[1] : match[4], trail: match[5],
      }
    }),
  }
}

export function serializeLabeledList(list: LabeledList): string {
  return list.items.map((item) => (item.kind === 'text'
    ? item.raw
    : item.lead + item.label + item.sep + item.wrap + item.value + item.wrap + item.trail)).join('\n')
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function labeledValue(list: LabeledList, label: string): string | null {
  const field = list.items.find((item): item is LabeledField => item.kind === 'field' && same(item.label, label))
  return field ? field.value : null
}

export function setLabeledValue(list: LabeledList, label: string, value: string): LabeledList {
  const clean = value.replace(/\s*\n\s*/g, ' ').trim()
  return {
    items: list.items.map((item) => (item.kind === 'field' && same(item.label, label) ? { ...item, value: clean } : item)),
  }
}

// What Maria sees for the four fields search and sharing depend on. Limits are guidance counters,
// never enforced.
export const SEARCH_FIELDS = [
  { label: 'SEO title', title: 'Search title', limit: 60 },
  { label: 'Meta description', title: 'Search description', limit: 160 },
  { label: 'Slug', title: 'Web address', limit: null },
  { label: 'Excerpt', title: 'Preview text when shared', limit: null },
] as const
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/labeled-list.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/labeled-list.ts src/lib/portal/piece-page/labeled-list.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Read the article's search and sharing fields from the exact block body

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Page layout and copy tabs

**Files:**
- Create: `src/lib/portal/piece-page/copy-tabs.ts`
- Create: `src/lib/portal/piece-page/copy-tabs.test.ts`

Every block lands in a tab; none is merged, rewritten or dropped (the `review-package.ts` rule). Tab keys are the tick keys, so they match the database pattern `^[a-z0-9][a-z0-9:_-]{0,63}$`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { blockTabKind, buildCopyTabs, pieceLayout, primaryPreview } from './copy-tabs'

const block = (key: string | null, label = 'Label', body = 'Body') => ({ key, label, body })
const preview = (overrides: Partial<SignedReviewPreview>): SignedReviewPreview => ({
  id: 'p', contentItemId: 'i', contentVersion: 1, previewKey: 'reel', mediaKind: 'video', width: 1080, height: 1920,
  durationSeconds: 30, videoUrl: 'https://x/v.mp4', posterUrl: null, frames: [], expiresAt: '2026-10-03T00:10:00Z',
  ...overrides,
})
const asset = (asset_key: string, channel: ReviewAsset['channel'], asset_kind: ReviewAsset['asset_kind']): ReviewAsset => ({
  id: asset_key, content_version: 1, asset_key, label: asset_key, channel, asset_kind, url: 'https://drive.google.com/x',
  width_px: 1500, height_px: 1000, caption_status: 'not_applicable', review_note: null,
})

describe('pieceLayout', () => {
  it('reads the layout from the format first', () => {
    expect(pieceLayout('reel', [block('social-caption')], [])).toBe('vertical')
    expect(pieceLayout('podcast', [block('youtube-title')], [preview({ width: 1080, height: 1920 })])).toBe('horizontal')
    expect(pieceLayout('linkedin-post', [block('linkedin-caption')], [])).toBe('pages')
    expect(pieceLayout('podcast_article', [block('article-body')], [])).toBe('article')
  })

  it('falls back to previews, then blocks', () => {
    expect(pieceLayout('test', [block('caption')], [preview({ width: 1920, height: 1080 })])).toBe('horizontal')
    expect(pieceLayout('test', [block('caption')], [preview({ mediaKind: 'pages', videoUrl: null })])).toBe('pages')
    expect(pieceLayout(null, [block('reel-script')], [])).toBe('vertical')
    expect(pieceLayout(null, [block('caption')], [])).toBe('text')
  })

  it('needs an article body for the article layout', () => {
    expect(pieceLayout('article', [block('summary')], [])).toBe('text')
  })
})

describe('primaryPreview', () => {
  it('prefers a horizontal video for a horizontal layout', () => {
    const tall = preview({ id: 'tall' })
    const wide = preview({ id: 'wide', width: 1920, height: 1080 })
    expect(primaryPreview('horizontal', [tall, wide])?.id).toBe('wide')
    expect(primaryPreview('vertical', [wide, tall])?.id).toBe('tall')
    expect(primaryPreview('article', [preview({ id: 'cover', previewKey: 'website-cover', mediaKind: 'pages' })])?.id).toBe('cover')
  })
})

describe('buildCopyTabs', () => {
  it('orders a reel as On-screen text, Caption, YouTube', () => {
    const tabs = buildCopyTabs('vertical', [block('youtube-package'), block('social-caption'), block('reel-script')], [])
    expect(tabs.map((tab) => [tab.key, tab.label])).toEqual([
      ['onscreen', 'On-screen text'], ['caption', 'Caption'], ['youtube', 'YouTube'],
    ])
  })

  it('adds Chapters for an episode whose description carries chapters', () => {
    const description = block('youtube-description', 'YouTube description', 'Intro\n\n00:00 Hello\n01:00 Next')
    const tabs = buildCopyTabs('horizontal', [block('youtube-title'), description, block('ig-facebook-caption')], [])
    expect(tabs.map((tab) => tab.label)).toEqual(['YouTube', 'Caption', 'Chapters'])
    expect(tabs[2].blocks).toEqual([description])
  })

  it('names a LinkedIn document PDF text, with Post and First comment', () => {
    const tabs = buildCopyTabs('pages', [block('linkedin-caption'), block('linkedin-first-comment'), block('linkedin-document-copy')], [])
    expect(tabs.map((tab) => tab.label)).toEqual(['PDF text', 'Post', 'First comment'])
  })

  it('gives an article Article, Search & sharing and Cover image', () => {
    const tabs = buildCopyTabs('article', [block('article-seo'), block('article-body')], [asset('website-cover', 'website', 'cover')])
    expect(tabs.map((tab) => tab.label)).toEqual(['Article', 'Search & sharing', 'Cover image'])
  })

  it('never drops a block and keeps keys valid tick keys', () => {
    const blocks = [block('story', 'Story'), block('summary', 'Summary'), block(null, 'Caption'),
      block('a'.repeat(64), 'Long key'), block('reel-script'), block('ig-caption'), block('fb-caption')]
    const tabs = buildCopyTabs('vertical', blocks, [])
    const placed = tabs.flatMap((tab) => tab.blocks)
    for (const b of blocks) expect(placed).toContain(b)
    for (const tab of tabs) expect(tab.key).toMatch(/^[a-z0-9][a-z0-9:_-]{0,63}$/)
    expect(tabs.find((tab) => tab.key === 'caption')?.blocks.map((b) => b.key)).toEqual([null, 'ig-caption', 'fb-caption'])
  })

  it('classifies blocks by key and label', () => {
    expect(blockTabKind(block('onscreen-script'))).toBe('onscreen')
    expect(blockTabKind(block('x', 'On-screen copy'))).toBe('onscreen')
    expect(blockTabKind(block('carousel-slides'))).toBe('document')
    expect(blockTabKind(block('youtube-short'))).toBe('youtube')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/copy-tabs.test.ts`
Expected: FAIL, cannot resolve `./copy-tabs`.

- [ ] **Step 3: Implement**

```ts
// Page layout and copy tabs (spec 2026-10-03 sections 4.2 and 4.3). Presentation only: every
// block lands in exactly one content tab (a Chapters tab is an extra view of the description),
// nothing is merged, rewritten or dropped.
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { findChapters, parseYouTubePackage, youTubeFieldValue } from './youtube-fields'

export type PieceLayout = 'vertical' | 'horizontal' | 'pages' | 'article' | 'text'
export type TabKind =
  | 'onscreen' | 'caption' | 'youtube' | 'chapters' | 'document' | 'post' | 'first-comment'
  | 'article' | 'seo' | 'cover' | 'other'
export type CopyTab = { key: string; kind: TabKind; label: string; blocks: ReviewCopyBlock[] }

const ONSCREEN = new Set(['reel-script', 'onscreen-script', 'on-screen-copy', 'on-screen-text', 'video-script',
  'reel-dialogue', 'storyboard'])
const CAPTION = new Set(['social-caption', 'ig-facebook-caption', 'ig-caption', 'fb-caption', 'instagram-caption',
  'facebook-caption', 'caption', 'fb-adaptation', 'hashtags'])
const DOCUMENT = new Set(['linkedin-document-copy', 'document-copy', 'carousel-copy', 'carousel-slides', 'carousel', 'slides'])
const POST = new Set(['linkedin-caption', 'linkedin-post'])
const FIRST_COMMENT = new Set(['linkedin-first-comment', 'first-comment'])

const VERTICAL_FORMATS = new Set(['reel', 'vertical_video', 'short'])
const HORIZONTAL_FORMATS = new Set(['podcast', 'episode'])
const PAGES_FORMATS = new Set(['carousel', 'single', 'post', 'linkedin-post', 'graphic'])

export function blockTabKind(block: ReviewCopyBlock): TabKind {
  const key = (block.key ?? '').toLowerCase()
  const label = block.label.toLowerCase()
  if (key === 'article-body') return 'article'
  if (key === 'article-seo') return 'seo'
  if (DOCUMENT.has(key)) return 'document'
  if (POST.has(key)) return 'post'
  if (FIRST_COMMENT.has(key)) return 'first-comment'
  if (key.startsWith('youtube') || label.includes('youtube')) return 'youtube'
  if (ONSCREEN.has(key) || label.includes('on-screen') || label.includes('on screen')) return 'onscreen'
  if (CAPTION.has(key) || key === '') return 'caption'
  return 'other'
}

export function pieceLayout(
  format: string | null,
  blocks: ReviewCopyBlock[],
  previews: SignedReviewPreview[],
): PieceLayout {
  const kinds = new Set(blocks.map(blockTabKind))
  if (kinds.has('article')) return 'article'
  const f = (format ?? '').toLowerCase()
  if (HORIZONTAL_FORMATS.has(f)) return 'horizontal'
  if (VERTICAL_FORMATS.has(f)) return 'vertical'
  if (PAGES_FORMATS.has(f)) return 'pages'
  const video = previews.find((p) => p.mediaKind === 'video')
  if (video) return video.width > video.height ? 'horizontal' : 'vertical'
  if (previews.some((p) => p.mediaKind === 'pages') || kinds.has('document')) return 'pages'
  if (kinds.has('onscreen')) return 'vertical'
  return 'text'
}

export function primaryPreview(layout: PieceLayout, previews: SignedReviewPreview[]): SignedReviewPreview | null {
  const videos = previews.filter((p) => p.mediaKind === 'video' && p.videoUrl)
  if (layout === 'horizontal') return videos.find((p) => p.width > p.height) ?? videos[0] ?? null
  if (layout === 'vertical') return videos.find((p) => p.height >= p.width) ?? videos[0] ?? null
  if (layout === 'article') {
    return previews.find((p) => p.previewKey === 'website-cover') ?? previews.find((p) => p.mediaKind === 'pages') ?? null
  }
  if (layout === 'pages') return previews.find((p) => p.mediaKind === 'pages') ?? null
  return null
}

const ORDER: Record<PieceLayout, Array<Exclude<TabKind, 'other'>>> = {
  vertical: ['onscreen', 'caption', 'youtube', 'post', 'first-comment', 'document', 'chapters'],
  horizontal: ['youtube', 'caption', 'chapters', 'onscreen', 'post', 'first-comment', 'document'],
  pages: ['document', 'caption', 'post', 'first-comment', 'youtube', 'onscreen'],
  article: ['article', 'seo', 'cover', 'caption', 'post', 'first-comment', 'youtube', 'onscreen', 'document'],
  text: ['caption', 'post', 'first-comment', 'youtube', 'onscreen', 'document'],
}

const LABEL: Record<Exclude<TabKind, 'document' | 'other'>, string> = {
  onscreen: 'On-screen text', caption: 'Caption', youtube: 'YouTube', chapters: 'Chapters', post: 'Post',
  'first-comment': 'First comment', article: 'Article', seo: 'Search & sharing', cover: 'Cover image',
}

function documentLabel(blocks: ReviewCopyBlock[]): string {
  return blocks.some((b) => (b.key ?? '').includes('linkedin') || b.key === 'document-copy') ? 'PDF text' : 'Slide text'
}

function chaptersBlock(blocks: ReviewCopyBlock[]): ReviewCopyBlock | null {
  for (const block of blocks) {
    if (blockTabKind(block) !== 'youtube') continue
    const pkg = block.key === 'youtube-description' ? null : parseYouTubePackage(block.body)
    const description = block.key === 'youtube-description' ? block.body : pkg ? youTubeFieldValue(pkg, 'description') : null
    if (description && findChapters(description)) return block
  }
  return null
}

export function buildCopyTabs(layout: PieceLayout, blocks: ReviewCopyBlock[], assets: ReviewAsset[]): CopyTab[] {
  const grouped = new Map<Exclude<TabKind, 'other'>, ReviewCopyBlock[]>()
  const others: CopyTab[] = []
  for (const block of blocks) {
    const kind = blockTabKind(block)
    if (kind === 'other') {
      others.push({ key: `other:${block.key ?? 'body'}`.slice(0, 64), kind, label: block.label, blocks: [block] })
      continue
    }
    grouped.set(kind, [...(grouped.get(kind) ?? []), block])
  }
  const chapters = layout === 'horizontal' ? chaptersBlock(blocks) : null
  const hasCover = layout === 'article'
    && assets.some((a) => a.asset_key === 'website-cover' || (a.channel === 'website' && a.asset_kind === 'cover'))

  const tabs: CopyTab[] = []
  for (const kind of ORDER[layout]) {
    if (kind === 'chapters') {
      if (chapters) tabs.push({ key: 'chapters', kind, label: LABEL.chapters, blocks: [chapters] })
      continue
    }
    if (kind === 'cover') {
      if (hasCover) tabs.push({ key: 'cover', kind, label: LABEL.cover, blocks: [] })
      continue
    }
    const group = grouped.get(kind)
    if (!group) continue
    tabs.push({ key: kind, kind, label: kind === 'document' ? documentLabel(group) : LABEL[kind], blocks: group })
    grouped.delete(kind)
  }
  for (const [kind, group] of grouped) {
    if (kind === 'chapters' || kind === 'cover') continue
    tabs.push({ key: kind, kind, label: kind === 'document' ? documentLabel(group) : LABEL[kind], blocks: group })
  }
  return [...tabs, ...others]
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/copy-tabs.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/copy-tabs.ts src/lib/portal/piece-page/copy-tabs.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Decide each piece's layout and copy tabs without dropping a block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Updated after feedback (changed paragraphs, tab dots, header line)

**Files:**
- Create: `src/lib/portal/piece-page/changed-passages.ts`
- Create: `src/lib/portal/piece-page/changed-passages.test.ts`

The "before" text is the request's `base_copy_text` (migration 0071's narrow reader, already on every `ContentRequestRow`). A paragraph is "changed" when it does not appear, whitespace-normalised, among the previous version's paragraphs.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { CopyTab } from './copy-tabs'
import { appliedChanges, changedParagraphs, splitParagraphs, updatedAreasLine, updatedTabKeys } from './changed-passages'

function request(overrides: Partial<ContentRequestRow>): ContentRequestRow {
  return {
    id: 'r', client_id: 'c', content_id: 'i', request_type: 'edit', base_version: 1, payload: {},
    status: 'applied', requester_name: 'Maria', created_at: '', updated_at: '', reconciled_at: null,
    reconciled_by: null, canonical_version: 2, resolution_note: null, canonical_content_key: null,
    base_copy_text: null, ...overrides,
  }
}

const tabs: CopyTab[] = [
  { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel', body: '' }] },
  { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: '' }] },
  { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [{ key: 'youtube-package', label: 'YT', body: '' }] },
]

describe('changed paragraphs', () => {
  it('splits on blank lines', () => {
    expect(splitParagraphs('a\nb\n\n\nc\n')).toEqual(['a\nb', 'c'])
  })

  it('marks paragraphs that are new or edited', () => {
    expect(changedParagraphs('One.\n\nTwo.', 'One.\n\nTwo, edited.\n\nThree.')).toEqual([false, true, true])
    expect(changedParagraphs(null, 'One.')).toEqual([false])
  })
})

describe('applied changes on this version', () => {
  const requests = [
    request({ id: 'a', payload: { target_kind: 'copy_block', target_key: 'social-caption' }, base_copy_text: 'Old caption.' }),
    request({ id: 'b', payload: { target_kind: 'asset', target_key: 'reel-cover' } }),
    request({ id: 'c', payload: { target_key: 'youtube-package' }, canonical_version: 1 }),
    request({ id: 'd', payload: { target_key: 'reel-script' }, status: 'pending', canonical_version: null }),
  ]

  it('collects copy blocks with their previous text, and whether visuals changed', () => {
    const changes = appliedChanges(2, requests)
    expect([...changes.before.entries()]).toEqual([['social-caption', 'Old caption.']])
    expect(changes.visualsChanged).toBe(true)
  })

  it('puts the dot on changed tabs and names them under the title', () => {
    const changes = appliedChanges(2, requests)
    const keys = updatedTabKeys(tabs, changes)
    expect([...keys]).toEqual(['caption'])
    expect(updatedAreasLine(tabs, keys, changes.visualsChanged)).toBe('caption, visuals')
    expect(updatedAreasLine(tabs, new Set(['onscreen', 'youtube']), false)).toBe('on-screen text, YouTube')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/changed-passages.test.ts`
Expected: FAIL, cannot resolve `./changed-passages`.

- [ ] **Step 3: Implement**

```ts
// "Updated after your feedback" (spec 2026-10-03 sections 4.1, 4.3, 4.7): which tabs changed in
// this version and which paragraphs to mark. Read-only; derived from the request records.
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { CopyTab } from './copy-tabs'

export function splitParagraphs(body: string): string[] {
  return body.split(/\n[ \t]*\n+/).map((part) => part.replace(/^\n+/, '').replace(/\s+$/, '')).filter(Boolean)
}

function normal(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function changedParagraphs(before: string | null, after: string): boolean[] {
  const chunks = splitParagraphs(after)
  if (before === null) return chunks.map(() => false)
  const seen = new Set(splitParagraphs(before).map(normal))
  return chunks.map((chunk) => !seen.has(normal(chunk)))
}

export type AppliedChanges = { before: Map<string, string>; visualsChanged: boolean }

export function appliedChanges(version: number, requests: ContentRequestRow[]): AppliedChanges {
  const before = new Map<string, { text: string; base: number }>()
  let visualsChanged = false
  for (const request of requests) {
    if (request.request_type !== 'edit' || request.canonical_version !== version) continue
    if (!['applied', 'superseded'].includes(request.status)) continue
    if (request.base_version === null || request.base_version >= version) continue
    const kind = typeof request.payload.target_kind === 'string' ? request.payload.target_kind : 'copy_block'
    if (kind !== 'copy_block') { visualsChanged = true; continue }
    const key = typeof request.payload.target_key === 'string' ? request.payload.target_key
      : typeof request.payload.block_key === 'string' ? request.payload.block_key : null
    if (!key || typeof request.base_copy_text !== 'string') continue
    const seen = before.get(key)
    if (!seen || request.base_version < seen.base) before.set(key, { text: request.base_copy_text, base: request.base_version })
  }
  return { before: new Map([...before].map(([key, value]) => [key, value.text])), visualsChanged }
}

export function updatedTabKeys(tabs: CopyTab[], changes: AppliedChanges): Set<string> {
  return new Set(tabs.filter((tab) => tab.kind !== 'chapters'
    && tab.blocks.some((block) => block.key !== null && changes.before.has(block.key))).map((tab) => tab.key))
}

function areaName(label: string): string {
  if (label === 'YouTube' || label.startsWith('PDF')) return label
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export function updatedAreasLine(tabs: CopyTab[], updated: Set<string>, visualsChanged: boolean): string {
  const names = tabs.filter((tab) => updated.has(tab.key)).map((tab) => areaName(tab.label))
  if (visualsChanged) names.push('visuals')
  return names.join(', ')
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/changed-passages.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/changed-passages.ts src/lib/portal/piece-page/changed-passages.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Work out which tabs and paragraphs changed after her feedback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The header status line

**Files:**
- Create: `src/lib/portal/piece-page/header-status.ts`
- Create: `src/lib/portal/piece-page/header-status.test.ts`

One line replaces the Schedule and Publication sections (spec 4.1). Times are Toronto time.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ScheduleTargetRow } from '@/lib/portal/schedule'
import { destinationLabel, headerStatus, plannedDateLabel, torontoDateLabel, torontoTimeLabel } from './header-status'

const target = (destination: string, scheduled_at: string | null, status: ScheduleTargetRow['status'] = 'scheduled'): ScheduleTargetRow => ({
  id: destination, content_id: 'i', content_version: 1, destination, required: true, scheduled_at, status,
  verified_at: null, verification_label: '',
})
const live = (destination: string, live_url: string | null, published_at: string): PublicationTargetRow => ({
  id: destination, content_id: 'i', content_version: 1, destination, required: true, expected_visibility: 'public',
  status: 'live', live_url, published_at, first_verified_at: null, last_verified_at: null,
  reconciliation_status: 'verified', verification_label: '', current_provider_state: null,
} as PublicationTargetRow)

describe('labels', () => {
  it('formats Toronto dates and times the way the mockups read', () => {
    expect(torontoDateLabel('2026-10-02T22:00:00Z')).toBe('Fri Oct 2')
    expect(torontoTimeLabel('2026-10-02T22:00:00Z')).toBe('6 p.m.')
    expect(torontoTimeLabel('2026-10-02T13:30:00Z')).toBe('9:30 a.m.')
    expect(plannedDateLabel('2026-09-17')).toBe('Thu Sep 17')
    expect(plannedDateLabel('soon')).toBeNull()
    expect(destinationLabel('youtube')).toBe('YouTube')
    expect(destinationLabel('squarespace')).toBe('kanset.com')
  })
})

describe('headerStatus', () => {
  const base = { isPublished: false, publication: [], plannedDate: '2026-10-02', layout: 'vertical' as const }

  it('groups confirmed times by hour', () => {
    const status = headerStatus({ ...base, schedule: [
      target('instagram', '2026-10-02T22:00:00Z'), target('facebook', '2026-10-02T22:00:00Z'),
      target('youtube', '2026-10-02T23:00:00Z'),
    ] })
    expect(status).toEqual({
      kind: 'scheduled', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2',
      groups: [{ time: '6 p.m.', destinations: 'Instagram, Facebook' }, { time: '7 p.m.', destinations: 'YouTube' }],
    })
  })

  it('says times are not confirmed when any required time is missing', () => {
    const status = headerStatus({ ...base, schedule: [target('instagram', null, 'pending')] })
    expect(status).toEqual({ kind: 'unconfirmed', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2' })
  })

  it('uses Publishes for an article', () => {
    expect(headerStatus({ ...base, layout: 'article', schedule: [] }).keyFact).toBe('Publishes Fri Oct 2')
  })

  it('shows live links once published', () => {
    const status = headerStatus({ ...base, isPublished: true, schedule: [], publication: [
      live('instagram', 'https://instagram.com/p/x', '2026-10-02T22:01:00Z'), live('youtube', null, '2026-10-02T23:00:00Z'),
    ] })
    expect(status).toEqual({
      kind: 'live', keyFact: 'Live', postedLabel: 'Posted Fri Oct 2',
      links: [{ label: 'Instagram', url: 'https://instagram.com/p/x' }],
    })
  })

  it('has no date when nothing is planned', () => {
    expect(headerStatus({ ...base, plannedDate: null, schedule: [] })).toEqual({ kind: 'undated', keyFact: 'No date yet' })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/header-status.test.ts`
Expected: FAIL, cannot resolve `./header-status`.

- [ ] **Step 3: Implement**

```ts
// The one status line under the piece title (spec 2026-10-03 section 4.1). It replaces the
// Schedule and Publication sections. Toronto time throughout.
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ScheduleTargetRow } from '@/lib/portal/schedule'
import type { PieceLayout } from './copy-tabs'

const TZ = 'America/Toronto'
const NAMES: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn',
  squarespace: 'kanset.com', website: 'kanset.com', tiktok: 'TikTok',
}

export function destinationLabel(destination: string): string {
  const key = destination.trim().toLowerCase()
  return NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

function parts(iso: string): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  return Object.fromEntries(format.formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
}

export function torontoDateLabel(iso: string): string {
  const p = parts(iso)
  return `${p.weekday} ${p.month} ${p.day}`
}

export function torontoTimeLabel(iso: string): string {
  const p = parts(iso)
  return `${p.hour}${p.minute === '00' ? '' : `:${p.minute}`} ${p.dayPeriod.toUpperCase() === 'AM' ? 'a.m.' : 'p.m.'}`
}

export function plannedDateLabel(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(day).replace(',', '')
}

export type HeaderStatus =
  | { kind: 'live'; links: { label: string; url: string }[]; postedLabel: string | null; keyFact: string }
  | { kind: 'scheduled'; verb: 'Posts' | 'Publishes'; dateLabel: string; groups: { time: string; destinations: string }[]; keyFact: string }
  | { kind: 'unconfirmed'; verb: 'Posts' | 'Publishes'; dateLabel: string; keyFact: string }
  | { kind: 'undated'; keyFact: string }

const CONFIRMED = new Set<ScheduleTargetRow['status']>(['scheduled', 'reschedule_pending', 'cancel_pending'])

export function headerStatus(input: {
  isPublished: boolean
  publication: PublicationTargetRow[]
  schedule: ScheduleTargetRow[]
  plannedDate: string | null
  layout: PieceLayout
}): HeaderStatus {
  if (input.isPublished) {
    const liveTargets = input.publication.filter((t) => t.status === 'live')
    const first = liveTargets.map((t) => t.published_at).filter((v): v is string => Boolean(v)).sort()[0]
    return {
      kind: 'live',
      keyFact: 'Live',
      postedLabel: first ? `Posted ${torontoDateLabel(first)}` : null,
      links: liveTargets.filter((t) => t.live_url && /^https:\/\//i.test(t.live_url))
        .map((t) => ({ label: destinationLabel(t.destination), url: t.live_url as string })),
    }
  }
  const verb = input.layout === 'article' ? 'Publishes' : 'Posts'
  const required = input.schedule.filter((t) => t.required && t.status !== 'cancelled')
  const times = required.map((t) => t.scheduled_at).filter((v): v is string => Boolean(v)).sort()
  if (required.length > 0 && required.every((t) => t.scheduled_at && CONFIRMED.has(t.status))) {
    const groups = new Map<string, string[]>()
    for (const t of [...required].sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string))) {
      const time = torontoTimeLabel(t.scheduled_at as string)
      groups.set(time, [...(groups.get(time) ?? []), destinationLabel(t.destination)])
    }
    const dateLabel = torontoDateLabel(times[0])
    return {
      kind: 'scheduled', verb, dateLabel, keyFact: `${verb} ${dateLabel}`,
      groups: [...groups].map(([time, names]) => ({ time, destinations: names.join(', ') })),
    }
  }
  const dateLabel = (input.plannedDate ? plannedDateLabel(input.plannedDate) : null)
    ?? (times[0] ? torontoDateLabel(times[0]) : null)
  if (dateLabel) return { kind: 'unconfirmed', verb, dateLabel, keyFact: `${verb} ${dateLabel}` }
  return { kind: 'undated', keyFact: 'No date yet' }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/header-status.test.ts`
Expected: PASS, 6 tests. If `torontoTimeLabel` returns `6 PM`-style output, the Node ICU build lacks full data: run `node -e "console.log(process.versions.icu, Intl.DateTimeFormat().resolvedOptions().locale)"`; Node 20+ ships full ICU, so upgrade Node rather than changing the code.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/header-status.ts src/lib/portal/piece-page/header-status.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Say when a piece posts, or that it is live, in one line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The one derived action, and collapse hysteresis

**Files:**
- Create: `src/lib/portal/piece-page/piece-action.ts`
- Create: `src/lib/portal/piece-page/piece-action.test.ts`
- Create: `src/lib/portal/piece-page/collapse.ts`
- Create: `src/lib/portal/piece-page/collapse.test.ts`

The resolver keeps the 2026-08-14 order exactly (published, revision started, unsent drafts, sent edits unresolved, package incomplete, Approve) and the one-review rule (a decided piece never reads as awaiting review). Two things are new and only ever make Approve stricter: ticks and media. Carried drafts (plan 3, decision 4) block Approve until kept or discarded.

- [ ] **Step 1: Write the failing tests**

`piece-action.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolvePieceAction, type PieceActionInput } from './piece-action'

const clean: PieceActionInput = {
  isPublished: false, state: 'needs_review', revisionStarted: false, currentDraftCount: 0, carriedDraftCount: 0,
  sentUnresolvedCount: 0, packageReady: true, missing: [], canDecide: true, tabsTotal: 3, tabsTicked: 3,
  untickedLabels: [], mediaPending: false, sendFailed: false, overLimit: false,
}

describe('resolvePieceAction keeps the contract order', () => {
  it('approves a clean, complete, fully reviewed package', () => {
    expect(resolvePieceAction(clean)).toEqual({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] })
  })

  it('1. published beats everything', () => {
    expect(resolvePieceAction({ ...clean, isPublished: true, currentDraftCount: 2, revisionStarted: true }).kind).toBe('published')
  })

  it('2. revision started hides send and approve', () => {
    expect(resolvePieceAction({ ...clean, revisionStarted: true, currentDraftCount: 2 }).kind).toBe('revision')
  })

  it('3. unsent drafts mean Send, additional when sent edits exist, retry after a failure', () => {
    expect(resolvePieceAction({ ...clean, currentDraftCount: 2 })).toEqual({ kind: 'send', count: 2, additional: false, retry: false, blocked: null })
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, sentUnresolvedCount: 1, sendFailed: true }))
      .toEqual({ kind: 'send', count: 1, additional: true, retry: true, blocked: null })
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, overLimit: true })).toMatchObject({ blocked: 'over-limit' })
  })

  it('3. drafts can be sent while the package is incomplete', () => {
    expect(resolvePieceAction({ ...clean, currentDraftCount: 1, packageReady: false }).kind).toBe('send')
  })

  it('carried drafts block approve until kept or discarded', () => {
    expect(resolvePieceAction({ ...clean, carriedDraftCount: 1 })).toEqual({ kind: 'carried', count: 1 })
    expect(resolvePieceAction({ ...clean, carriedDraftCount: 1, currentDraftCount: 1 }).kind).toBe('send')
  })

  it('4. sent edits without new drafts show status only', () => {
    expect(resolvePieceAction({ ...clean, sentUnresolvedCount: 2 })).toEqual({ kind: 'sent', count: 2 })
  })

  it('a decided piece never reads as awaiting review', () => {
    for (const state of ['approved', 'scheduled', 'partially_scheduled', 'schedule_failed', 'reschedule_pending', 'cancel_pending', 'publish_failed'] as const) {
      expect(resolvePieceAction({ ...clean, state }).kind).toBe('decided')
    }
    expect(resolvePieceAction({ ...clean, state: 'with_dot' }).kind).toBe('none')
  })

  it('5. an incomplete package has no action', () => {
    expect(resolvePieceAction({ ...clean, packageReady: false, missing: ['website cover'] }))
      .toEqual({ kind: 'incomplete', missing: ['website cover'] })
  })

  it('only a deciding seat sees Approve', () => {
    expect(resolvePieceAction({ ...clean, canDecide: false }).kind).toBe('decider-only')
  })

  it('6. approve waits for every tab, then for the media', () => {
    expect(resolvePieceAction({ ...clean, tabsTicked: 2, untickedLabels: ['YouTube'] }))
      .toEqual({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['YouTube'] })
    expect(resolvePieceAction({ ...clean, mediaPending: true }))
      .toEqual({ kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] })
  })
})
```

`collapse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { COLLAPSE_AT, EXPAND_BELOW, nextCollapsed } from './collapse'

describe('nextCollapsed (hysteresis)', () => {
  it('collapses only past 120 and expands only under 40', () => {
    expect([COLLAPSE_AT, EXPAND_BELOW]).toEqual([120, 40])
    expect(nextCollapsed(false, 120)).toBe(false)
    expect(nextCollapsed(false, 121)).toBe(true)
    expect(nextCollapsed(true, 60)).toBe(true)
    expect(nextCollapsed(true, 40)).toBe(true)
    expect(nextCollapsed(true, 39)).toBe(false)
    expect(nextCollapsed(false, 80)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/piece-action.test.ts src/lib/portal/piece-page/collapse.test.ts`
Expected: FAIL, cannot resolve `./piece-action` and `./collapse`.

- [ ] **Step 3: Implement**

`piece-action.ts`:

```ts
// The single derived action for the decision bar (2026-08-14 contract section 4.1, spec
// 2026-10-03 sections 4.3, 4.6, 4.7). At most one action. Order:
//   published > revision started > unsent drafts (Send) > carried drafts > sent edits (status)
//   > decided (one-review rule) > package incomplete > non-decider > Approve.
// Ticks and media only ever make Approve stricter; they never add an action.
import type { ClientState } from '@/lib/portal/state'

export type PieceActionInput = {
  isPublished: boolean
  state: ClientState
  revisionStarted: boolean
  currentDraftCount: number
  carriedDraftCount: number
  sentUnresolvedCount: number
  packageReady: boolean
  missing: string[]
  canDecide: boolean
  tabsTotal: number
  tabsTicked: number
  untickedLabels: string[]
  mediaPending: boolean
  sendFailed: boolean
  overLimit: boolean
}

export type PieceAction =
  | { kind: 'published' }
  | { kind: 'revision' }
  | { kind: 'send'; count: number; additional: boolean; retry: boolean; blocked: 'over-limit' | null }
  | { kind: 'carried'; count: number }
  | { kind: 'sent'; count: number }
  | { kind: 'decided' }
  | { kind: 'none' }
  | { kind: 'incomplete'; missing: string[] }
  | { kind: 'decider-only' }
  | { kind: 'approve'; enabled: boolean; reason: 'ticks' | 'media' | null; untickedLabels: string[] }

const DECIDED = new Set<ClientState>([
  'approved', 'partially_scheduled', 'schedule_failed', 'scheduled', 'reschedule_pending', 'cancel_pending',
  'publish_failed',
])

export function resolvePieceAction(input: PieceActionInput): PieceAction {
  if (input.isPublished) return { kind: 'published' }
  if (input.revisionStarted) return { kind: 'revision' }
  if (input.currentDraftCount > 0) {
    return {
      kind: 'send',
      count: input.currentDraftCount,
      additional: input.sentUnresolvedCount > 0,
      retry: input.sendFailed,
      blocked: input.overLimit ? 'over-limit' : null,
    }
  }
  if (input.carriedDraftCount > 0) return { kind: 'carried', count: input.carriedDraftCount }
  if (input.sentUnresolvedCount > 0) return { kind: 'sent', count: input.sentUnresolvedCount }
  if (input.state !== 'needs_review') return DECIDED.has(input.state) ? { kind: 'decided' } : { kind: 'none' }
  if (!input.packageReady) return { kind: 'incomplete', missing: input.missing }
  if (!input.canDecide) return { kind: 'decider-only' }
  if (input.tabsTicked < input.tabsTotal) {
    return { kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: input.untickedLabels }
  }
  if (input.mediaPending) return { kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] }
  return { kind: 'approve', enabled: true, reason: null, untickedLabels: [] }
}
```

`collapse.ts`:

```ts
// Collapsing header (spec 2026-10-03 section 10a): the slim bar appears past 120 px of scroll and
// hides again under 40 px. The gap stops it flickering around one threshold.
export const COLLAPSE_AT = 120
export const EXPAND_BELOW = 40

export function nextCollapsed(current: boolean, scrollY: number): boolean {
  if (!current && scrollY > COLLAPSE_AT) return true
  if (current && scrollY < EXPAND_BELOW) return false
  return current
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/piece-action.test.ts src/lib/portal/piece-page/collapse.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/piece-action.ts src/lib/portal/piece-page/piece-action.test.ts src/lib/portal/piece-page/collapse.ts src/lib/portal/piece-page/collapse.test.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Resolve the one decision-bar action, with ticks and media only ever stricter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Read and record ticks on the server

**Files:**
- Create: `src/lib/portal/piece-page/review-ticks.ts`
- Create: `src/lib/portal/piece-page/review-ticks.test.ts`
- Create: `src/app/client/[slug]/tick-actions.ts`
- Create: `src/app/client/[slug]/tick-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`review-ticks.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from }) }))

import { getMyReviewTicks } from './review-ticks'

function query(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = []
  const builder = {
    filters,
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  }
  return builder
}

beforeEach(() => from.mockReset())

describe('getMyReviewTicks', () => {
  it('reads the seat ticks for one version through RLS', async () => {
    const q = query({ data: [{ tab_key: 'caption' }, { tab_key: 'youtube' }], error: null })
    from.mockReturnValue(q)
    expect(await getMyReviewTicks('item-1', 3)).toEqual(['caption', 'youtube'])
    expect(from).toHaveBeenCalledWith('content_review_tab_ticks')
    expect(q.filters).toEqual([['content_item_id', 'item-1'], ['content_version', 3]])
  })

  it('starts at zero when the read fails, so the page still loads', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    expect(await getMyReviewTicks('item-1', 3)).toEqual([])
  })
})
```

`tick-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), getContentItem: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { tickReviewTabs } from './tick-actions'

beforeEach(() => {
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', version: 2 })
  mocks.rpc.mockResolvedValue({ data: 1, error: null })
})

describe('tickReviewTabs', () => {
  it('records valid, de-duplicated keys on the current version', async () => {
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption', 'caption', 'Bad Key', 'other:story'] }))
      .toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('tick_review_tabs', {
      p_content_id: 'item-1', p_content_version: 2, p_tab_keys: ['caption', 'other:story'],
    })
  })

  it('refuses a stale version without calling the database', async () => {
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 1, tabKeys: ['caption'] })).toEqual({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses without a session or any valid key', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption'] })).toEqual({ ok: false })
    mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['NOPE'] })).toEqual({ ok: false })
  })

  it('reports a database refusal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_tick_version_not_released' } })
    expect(await tickReviewTabs({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['caption'] })).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/review-ticks.test.ts "src/app/client/[slug]/tick-actions.test.ts"`
Expected: FAIL, cannot resolve `./review-ticks` and `./tick-actions`.

- [ ] **Step 3: Implement**

`src/lib/portal/piece-page/review-ticks.ts`:

```ts
import 'server-only'
import { createSupabaseServer } from '@/lib/supabase/server'

// The seat's ticks for one version (migration 0094), read with the seat's own session so RLS
// returns only its rows. Ticks are a reading aid: a failed read starts at zero instead of
// failing the page, and the browser copy in ReviewTicksProvider fills the gap.
export async function getMyReviewTicks(contentItemId: string, contentVersion: number): Promise<string[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_tab_ticks').select('tab_key')
    .eq('content_item_id', contentItemId).eq('content_version', contentVersion)
  if (error || !data) return []
  return (data as Array<{ tab_key: string }>).map((row) => row.tab_key)
}
```

`src/app/client/[slug]/tick-actions.ts`:

```ts
'use server'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'

const TAB_KEY = /^[a-z0-9][a-z0-9:_-]{0,63}$/

// Records that the seat opened these copy tabs on this version (migration 0094). The database
// accepts ticks only on the released version; a stale page gets ok:false and keeps its local
// ticks until it reloads.
export async function tickReviewTabs(input: {
  slug: string
  contentId: string
  contentVersion: number
  tabKeys: string[]
}): Promise<{ ok: boolean }> {
  const keys = [...new Set(input.tabKeys)].filter((key) => TAB_KEY.test(key)).slice(0, 20)
  if (keys.length === 0 || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) return { ok: false }
  const session = await getClientSession(input.slug)
  if (!session) return { ok: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item || item.version !== input.contentVersion) return { ok: false }
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('tick_review_tabs', {
    p_content_id: item.id, p_content_version: input.contentVersion, p_tab_keys: keys,
  })
  return { ok: !error }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/review-ticks.test.ts "src/app/client/[slug]/tick-actions.test.ts"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/review-ticks.ts src/lib/portal/piece-page/review-ticks.test.ts "src/app/client/[slug]/tick-actions.ts" "src/app/client/[slug]/tick-actions.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Read and record review tab ticks for the signed-in seat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12a: Playback failure codes, device summary and the report action (amended 2026-10-03)

**Files:**
- Create: `src/lib/portal/piece-page/playback-failure.ts`
- Create: `src/lib/portal/piece-page/playback-failure.test.ts`
- Create: `src/app/client/[slug]/playback-actions.ts`
- Create: `src/app/client/[slug]/playback-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/portal/piece-page/playback-failure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isPlaybackErrorCode, mediaErrorCode, playbackErrorLabel, PLAYBACK_BROWSERS, PLAYBACK_DEVICES, summarizeUserAgent,
} from './playback-failure'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_CA)',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  pixelChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('summarizeUserAgent', () => {
  it('names the device and browser from fixed lists', () => {
    expect(summarizeUserAgent(UA.iphoneSafari)).toEqual({ device: 'iPhone', browser: 'Safari' })
    expect(summarizeUserAgent(UA.iphoneChrome)).toEqual({ device: 'iPhone', browser: 'Chrome' })
    expect(summarizeUserAgent(UA.iphoneInstagram)).toEqual({ device: 'iPhone', browser: 'In-app browser' })
    expect(summarizeUserAgent(UA.ipad)).toEqual({ device: 'iPad', browser: 'Safari' })
    expect(summarizeUserAgent(UA.pixelChrome)).toEqual({ device: 'Android phone', browser: 'Chrome' })
    expect(summarizeUserAgent(UA.samsungTablet)).toEqual({ device: 'Android tablet', browser: 'Samsung Internet' })
    expect(summarizeUserAgent(UA.macSafari)).toEqual({ device: 'Mac', browser: 'Safari' })
    expect(summarizeUserAgent(UA.windowsEdge)).toEqual({ device: 'Windows PC', browser: 'Edge' })
    expect(summarizeUserAgent(UA.linuxFirefox)).toEqual({ device: 'Linux PC', browser: 'Firefox' })
  })

  it('never returns anything outside the lists the database accepts', () => {
    expect(summarizeUserAgent(null)).toEqual({ device: 'Other device', browser: 'Other browser' })
    expect(summarizeUserAgent('curl/8.6.0')).toEqual({ device: 'Other device', browser: 'Other browser' })
    for (const ua of Object.values(UA)) {
      const { device, browser } = summarizeUserAgent(ua)
      expect(PLAYBACK_DEVICES).toContain(device)
      expect(PLAYBACK_BROWSERS).toContain(browser)
    }
  })
})

describe('error codes', () => {
  it('maps HTMLMediaElement error codes', () => {
    expect([1, 2, 3, 4, 9, undefined, null].map((code) => mediaErrorCode(code))).toEqual([
      'media_err_aborted', 'media_err_network', 'media_err_decode', 'media_err_src_not_supported',
      'unknown', 'unknown', 'unknown',
    ])
  })

  it('knows its own codes and labels them in plain words', () => {
    expect(isPlaybackErrorCode('stalled')).toBe(true)
    expect(isPlaybackErrorCode('drop table')).toBe(false)
    expect(playbackErrorLabel('link_expired')).toBe('signed link expired')
    expect(playbackErrorLabel('media_err_network')).toBe('network error')
    expect(playbackErrorLabel('something_new')).toBe('something new')
  })
})
```

`src/app/client/[slug]/playback-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(), getContentItem: vi.fn(), rpc: vi.fn(), userAgent: '' as string | null,
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(mocks.userAgent ? { 'user-agent': mocks.userAgent } : {}),
}))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { reportReviewPlaybackFailure } from './playback-actions'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const input = { slug: 'kanset', contentId: 'piece', contentVersion: 2, previewKey: 'reel', errorCode: 'media_err_network' }

beforeEach(() => {
  mocks.userAgent = IPHONE
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1' })
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', version: 2 })
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: { outcome: 'notified' }, error: null })
})

describe('reportReviewPlaybackFailure', () => {
  it('records the failure with only a device and browser name', async () => {
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('report_review_playback_failure', {
      p_content_id: 'item-1', p_content_version: 2, p_preview_key: 'reel',
      p_error_code: 'media_err_network', p_device: 'iPhone', p_browser: 'Safari',
    })
  })

  it('counts a rate-limited repeat as handled', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'rate_limited' }, error: null })
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: true })
  })

  it('refuses bad input, no session or a stale version without calling the database', async () => {
    expect(await reportReviewPlaybackFailure({ ...input, errorCode: 'drop table' })).toEqual({ ok: false })
    expect(await reportReviewPlaybackFailure({ ...input, previewKey: 'Not A Key' })).toEqual({ ok: false })
    expect(await reportReviewPlaybackFailure({ ...input, contentVersion: 1 })).toEqual({ ok: false })
    mocks.getClientSession.mockResolvedValue(null)
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reports a database refusal as not handled', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_playback_preview_not_found' } })
    expect(await reportReviewPlaybackFailure(input)).toEqual({ ok: false })
  })

  it('works without a user agent header', async () => {
    mocks.userAgent = null
    await reportReviewPlaybackFailure(input)
    expect(mocks.rpc).toHaveBeenCalledWith('report_review_playback_failure',
      expect.objectContaining({ p_device: 'Other device', p_browser: 'Other browser' }))
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/playback-failure.test.ts "src/app/client/[slug]/playback-actions.test.ts"`
Expected: FAIL, cannot resolve `./playback-failure` and `./playback-actions`.

- [ ] **Step 3: Implement**

`src/lib/portal/piece-page/playback-failure.ts`:

```ts
// Playback failure reports (migration 0094, amended 2026-10-03). Pure and browser-safe. The client
// player maps media errors to these codes; the server action maps the request's user agent to one
// device and one browser from fixed lists, so no raw user agent is ever stored. The lists match the
// check constraints on content_review_playback_failures exactly.

export const PLAYBACK_ERROR_CODES = [
  'media_err_aborted', 'media_err_network', 'media_err_decode', 'media_err_src_not_supported',
  'stalled', 'link_expired', 'unknown',
] as const
export type PlaybackErrorCode = (typeof PLAYBACK_ERROR_CODES)[number]

export const PLAYBACK_DEVICES = [
  'iPhone', 'iPad', 'Android phone', 'Android tablet', 'Mac', 'Windows PC', 'Linux PC', 'Other device',
] as const
export type PlaybackDevice = (typeof PLAYBACK_DEVICES)[number]

export const PLAYBACK_BROWSERS = [
  'Safari', 'Chrome', 'Firefox', 'Edge', 'Samsung Internet', 'In-app browser', 'Other browser',
] as const
export type PlaybackBrowser = (typeof PLAYBACK_BROWSERS)[number]

// A wait longer than this after she pressed play counts as a failed play.
export const STALL_TIMEOUT_MS = 15_000

export function isPlaybackErrorCode(value: unknown): value is PlaybackErrorCode {
  return typeof value === 'string' && (PLAYBACK_ERROR_CODES as readonly string[]).includes(value)
}

// HTMLMediaElement.error.code: 1 aborted, 2 network, 3 decode, 4 source not supported.
export function mediaErrorCode(code: number | null | undefined): PlaybackErrorCode {
  switch (code) {
    case 1: return 'media_err_aborted'
    case 2: return 'media_err_network'
    case 3: return 'media_err_decode'
    case 4: return 'media_err_src_not_supported'
    default: return 'unknown'
  }
}

function deviceOf(ua: string): PlaybackDevice {
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Linux|X11|CrOS/.test(ua)) return 'Linux PC'
  return 'Other device'
}

function browserOf(ua: string): PlaybackBrowser {
  if (/FBAN|FBAV|Instagram|LinkedInApp|GSA\//.test(ua)) return 'In-app browser'
  if (/EdgiOS|EdgA\/|Edg\//.test(ua)) return 'Edge'
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
  if (/FxiOS|Firefox\//.test(ua)) return 'Firefox'
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome'
  if (/Version\/[\d.]+.*Safari\//.test(ua)) return 'Safari'
  return 'Other browser'
}

export function summarizeUserAgent(userAgent: string | null | undefined): { device: PlaybackDevice; browser: PlaybackBrowser } {
  const ua = userAgent ?? ''
  return { device: deviceOf(ua), browser: browserOf(ua) }
}

const LABELS: Record<PlaybackErrorCode, string> = {
  media_err_aborted: 'loading stopped',
  media_err_network: 'network error',
  media_err_decode: 'could not decode',
  media_err_src_not_supported: 'format not supported',
  stalled: 'stalled while playing',
  link_expired: 'signed link expired',
  unknown: 'unknown error',
}

export function playbackErrorLabel(code: string): string {
  return isPlaybackErrorCode(code) ? LABELS[code] : code.replaceAll('_', ' ')
}
```

`src/app/client/[slug]/playback-actions.ts`:

```ts
'use server'
import { headers } from 'next/headers'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { isPlaybackErrorCode, summarizeUserAgent } from '@/lib/portal/piece-page/playback-failure'
import { createSupabaseServer } from '@/lib/supabase/server'

const PREVIEW_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/

// A review video failed for the signed-in seat (migration 0094, amended 2026-10-03). Records it with
// the seat's own session; the database checks the seat, the released version and the preview,
// rate-limits, and tells the agency once per preview per day. Only a device and browser name from
// fixed lists leaves this function, never the raw user agent. ok:true means the agency knows (a
// rate-limited repeat included); the player then tells her "I've been notified."
export async function reportReviewPlaybackFailure(input: {
  slug: string
  contentId: string
  contentVersion: number
  previewKey: string
  errorCode: string
}): Promise<{ ok: boolean }> {
  if (!isPlaybackErrorCode(input.errorCode) || !PREVIEW_KEY.test(input.previewKey)
      || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) return { ok: false }
  const session = await getClientSession(input.slug)
  if (!session) return { ok: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item || item.version !== input.contentVersion) return { ok: false }
  const { device, browser } = summarizeUserAgent((await headers()).get('user-agent'))
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('report_review_playback_failure', {
    p_content_id: item.id, p_content_version: input.contentVersion, p_preview_key: input.previewKey,
    p_error_code: input.errorCode, p_device: device, p_browser: browser,
  })
  return { ok: !error }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/playback-failure.test.ts "src/app/client/[slug]/playback-actions.test.ts"`
Expected: PASS (4 + 5 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/playback-failure.ts src/lib/portal/piece-page/playback-failure.test.ts "src/app/client/[slug]/playback-actions.ts" "src/app/client/[slug]/playback-actions.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Map playback errors and devices to fixed lists and report failed plays for the seat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Signed preview hook and the visual target on a preview

**Files:**
- Modify: `src/lib/portal/review-preview-core.ts`
- Modify: `src/lib/portal/review-preview-core.test.ts`
- Create: `src/components/portal/useSignedPreview.ts`
- Create: `src/components/portal/useSignedPreview.test.tsx`
- Modify: `src/components/portal/ReviewPreviewMedia.tsx`

The new media area needs the preview's linked review asset (so "Suggest a change" on frame 3 targets the right asset) and the signed-link refresh without the component's fixed layout. The refresh logic moves into a hook both use; `ReviewPreviewMedia`'s own tests must keep passing unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/portal/review-preview-core.test.ts`, inside `describe('signReviewPreview', ...)`:

```ts
  it('carries the linked review asset key so a visual edit can target it', async () => {
    const { storage: s } = storage()
    expect((await signReviewPreview(s, row())).reviewAssetKey).toBeNull()
    expect((await signReviewPreview(s, row({ review_asset_key: 'reel-video' }))).reviewAssetKey).toBe('reel-video')
  })
```

Create `src/components/portal/useSignedPreview.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from './useSignedPreview'

const PREVIEW: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i1', contentVersion: 2, previewKey: 'reel', mediaKind: 'video', width: 1080, height: 1920,
  durationSeconds: 24, videoUrl: 'https://signed.example/v.mp4?t=1', posterUrl: null, frames: [],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('useSignedPreview', () => {
  it('fetches fresh links once per expiry and swaps them in', async () => {
    const fresh = { ...PREVIEW, videoUrl: 'https://signed.example/v.mp4?t=2', expiresAt: '2026-10-03T12:20:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    await act(async () => { await result.current.refresh(); await result.current.refresh() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.preview?.videoUrl).toBe(fresh.videoUrl)
  })

  it('does nothing without a preview or a refresh URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(null, '/x'))
    await act(async () => { await result.current.refresh() })
    const second = renderHook(() => useSignedPreview(PREVIEW, null))
    await act(async () => { await second.result.current.refresh() })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/review-preview-core.test.ts src/components/portal/useSignedPreview.test.tsx`
Expected: FAIL: `reviewAssetKey` is `undefined`; `./useSignedPreview` cannot be resolved.

- [ ] **Step 3: Implement**

In `src/lib/portal/review-preview-core.ts`, add to the `SignedReviewPreview` type, after `previewKey: string`:

```ts
  // The review asset this preview renders (migration 0092 column review_asset_key), so a visual
  // edit on a frame targets that asset. Optional only so older fixtures still type-check.
  reviewAssetKey?: string | null
```

and in `signReviewPreview`'s returned object, after `previewKey: row.preview_key,`:

```ts
    reviewAssetKey: row.review_asset_key,
```

Create `src/components/portal/useSignedPreview.ts`:

```ts
'use client'

import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

// Signed preview links last ten minutes. When a media element fails to load, ask the refresh
// route once per set of links and swap the new ones in. A failed refresh keeps the current links;
// the Drive link beside the media stays the fallback.
export function useSignedPreview(initial: SignedReviewPreview | null, refreshUrl?: string | null) {
  const [preview, setPreview] = useState(initial)
  const refreshedFor = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!refreshUrl || !preview || refreshedFor.current === preview.expiresAt) return
    refreshedFor.current = preview.expiresAt
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (body.preview) setPreview(body.preview)
    } catch {
      // Keep the current links.
    }
  }, [preview, refreshUrl])

  return { preview, refresh }
}
```

In `src/components/portal/ReviewPreviewMedia.tsx`, replace the imports and the state and `refresh` block:

```tsx
import { useCallback, useRef, useState } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import styles from './ReviewPreviewMedia.module.css'
```

with:

```tsx
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from './useSignedPreview'
import styles from './ReviewPreviewMedia.module.css'
```

and replace everything from `  const [preview, setPreview] = useState(initial)` down to and including the closing `}, [refreshUrl, preview.expiresAt])` of `refresh` with:

```tsx
  const signed = useSignedPreview(initial, refreshUrl)
  const preview = signed.preview ?? initial
  const refresh = signed.refresh
```

- [ ] **Step 4: Run them, plus the component's own tests**

Run: `pnpm exec vitest run src/lib/portal/review-preview-core.test.ts src/components/portal/useSignedPreview.test.tsx src/components/portal/ReviewPreviewMedia.test.tsx`
Expected: PASS (core 9, hook 2, component 4).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/review-preview-core.ts src/lib/portal/review-preview-core.test.ts src/components/portal/useSignedPreview.ts src/components/portal/useSignedPreview.test.tsx src/components/portal/ReviewPreviewMedia.tsx
git -C ~/worktrees/kanset-piece-page-ui commit -m "Share the signed preview refresh and carry the preview's review asset

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: First-visit intro acknowledgment, and opening the removal form directly

**Files:**
- Modify: `src/lib/portal/review-flow-announcement.ts`
- Modify: `src/app/client/[slug]/request-actions.ts`
- Create: `src/app/client/[slug]/piece-page-intro-action.test.ts`
- Modify: `src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.test.tsx`

The intro (spec 9.2) shows once per seat and is acknowledged on the server, on any device, through the existing `acknowledge_portal_announcement` RPC (0081) with a new key. The removal form gains `startOpen` so the ⋯ menu can open it straight away.

- [ ] **Step 1: Write the failing tests**

Create `src/app/client/[slug]/piece-page-intro-action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), rpc: vi.fn(async () => ({ data: null, error: null })) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`) }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { acknowledgePiecePageIntro } from './request-actions'
import { PIECE_PAGE_INTRO_KEY } from '@/lib/portal/review-flow-announcement'

beforeEach(() => { mocks.rpc.mockClear(); mocks.getClientSession.mockResolvedValue({ clientId: 'c1' }) })

describe('acknowledgePiecePageIntro', () => {
  it('records the per-seat acknowledgment under the new key', async () => {
    expect(PIECE_PAGE_INTRO_KEY).toBe('piece_page_2026_10')
    await acknowledgePiecePageIntro('kanset')
    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_portal_announcement', {
      p_client_id: 'c1', p_announcement_key: 'piece_page_2026_10',
    })
  })

  it('sends a signed-out visitor to the login page', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    await expect(acknowledgePiecePageIntro('kanset')).rejects.toThrow('REDIRECT /client/login')
  })
})
```

Append to `src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.test.tsx`, inside the `describe`:

```tsx
  it('can start open when the page menu asks for it', () => {
    render(<RemovalRequestForm slug="kanset" contentId="piece-1" idempotencyKey="key-2" startOpen />)
    expect(screen.getByLabelText(/Why should this piece be removed/)).toHaveFocus()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece-page-intro-action.test.ts" "src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.test.tsx"`
Expected: FAIL: `acknowledgePiecePageIntro` is not exported; the removal test finds no field.

- [ ] **Step 3: Implement**

In `src/lib/portal/review-flow-announcement.ts`, add:

```ts
// The redesigned piece page's three-line intro (spec 2026-10-03 section 9.2), once per seat.
export const PIECE_PAGE_INTRO_KEY = 'piece_page_2026_10'
```

In `src/app/client/[slug]/request-actions.ts`, change the announcement import to:

```ts
import { PIECE_PAGE_INTRO_KEY, REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'
```

(if the file imports `REVIEW_FLOW_ANNOUNCEMENT_KEY` on its own line, replace that line) and add after `acknowledgeReviewFlowAnnouncement`:

```ts
export async function acknowledgePiecePageIntro(slug: string): Promise<void> {
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const supabase = await createSupabaseServer()
  await supabase.rpc('acknowledge_portal_announcement', {
    p_client_id: session.clientId,
    p_announcement_key: PIECE_PAGE_INTRO_KEY,
  })
}
```

In `src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.tsx`, change the signature and the first state line:

```tsx
export default function RemovalRequestForm({ slug, contentId, idempotencyKey, startOpen = false }: {
  slug: string; contentId: string; idempotencyKey: string; startOpen?: boolean
}) {
  const [open, setOpen] = useState(startOpen)
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece-page-intro-action.test.ts" "src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.test.tsx"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/review-flow-announcement.ts "src/app/client/[slug]/request-actions.ts" "src/app/client/[slug]/piece-page-intro-action.test.ts" "src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.tsx" "src/app/client/[slug]/piece/[contentId]/RemovalRequestForm.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Acknowledge the new piece page intro per seat; let the menu open the removal form

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The portal shell gives the new page the full width and the phone's bottom edge

**Files:**
- Modify: `src/app/client/[slug]/portal-shell.module.css`
- Create: `src/app/client/[slug]/portal-shell.css.test.ts`

Fixed elements on the new page (condensed header, decision bar) must start after the desktop sidebar, so the shell publishes its width as `--portal-sidebar-w`. On a phone the decision bar replaces the bottom navigation on the piece page only (decision 6).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./portal-shell.module.css', import.meta.url), 'utf8')

describe('portal shell and the new piece page', () => {
  it('publishes the sidebar width for fixed bars', () => {
    expect(css).toMatch(/\.shell\s*\{[^}]*--portal-sidebar-w:\s*0px/)
    expect(css).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.shell\s*\{[^}]*--portal-sidebar-w:\s*216px/)
  })

  it('lets the new piece page use the full content width', () => {
    expect(css).toMatch(/\.main:has\(\[data-piece-page-v2\]\)\s*\{[^}]*padding:\s*0[^}]*max-width:\s*none/)
  })

  it('hides the bottom navigation on a phone only while the new piece page is open', () => {
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.shell:has\(\[data-piece-page-v2\]\) \.nav\s*\{\s*display:\s*none;/)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/portal-shell.css.test.ts"`
Expected: FAIL on all three.

- [ ] **Step 3: Implement**

In `src/app/client/[slug]/portal-shell.module.css`, change the first `.shell` rule to:

```css
.shell {
  min-height: 100dvh;
  /* The brand grey misses AA contrast on cream at small portal text sizes. */
  --dot-grey: var(--dot-grey-accessible);
  /* Fixed bars on the piece page start after the desktop sidebar. */
  --portal-sidebar-w: 0px;
}
```

Inside the existing `@media (min-width: 768px)` block, change its `.shell` rule to:

```css
  .shell {
    display: flex;
    flex-direction: row;
    --portal-sidebar-w: 216px;
  }
```

Append at the end of the file:

```css
/* The redesigned piece page (plan 4a) lays out its own width, header and bottom bar. */
.main:has([data-piece-page-v2]) {
  padding: 0;
  max-width: none;
}

@media (max-width: 767px) {
  .shell:has([data-piece-page-v2]) .nav { display: none; }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/portal-shell.css.test.ts"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/portal-shell.module.css" "src/app/client/[slug]/portal-shell.css.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Let the new piece page own its width and the phone's bottom edge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: The page stylesheet (the approved v3 look)

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/piece-page.css.test.ts`

Ported from `portal-v3.css` (the v2 brand pass and the v3 block), renamed to camelCase, tokens only. The only literal colours are the mockup's approved yellow corner glows (rgba of `--dot-yellow` and `--dot-yellow-pale`, which have no token for those alphas) and black in the phone tab-fade mask. No decorative stripes (Anastasia: distracting).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./piece-page.module.css', import.meta.url), 'utf8')

describe('piece page stylesheet (spec 10, 10a; mockups v3)', () => {
  it('collapses the header with transform and opacity only, so the page height never changes', () => {
    expect(css).toMatch(/\.cbar\s*\{[^}]*position:\s*fixed[^}]*transform:\s*translateY\(-100%\)[^}]*opacity:\s*0/)
    expect(css).toMatch(/\.cbar\[data-collapsed='true'\]\s*\{[^}]*transform:\s*none[^}]*opacity:\s*1/)
    expect(css).not.toMatch(/\.cbar[^{]*\{[^}]*\bheight:\s*0/)
  })

  it('animates only when the viewer allows motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.cbar\s*\{\s*transition:/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps the decision bar above the safe area and after the sidebar', () => {
    expect(css).toMatch(/\.bar\s*\{[^}]*position:\s*fixed[^}]*left:\s*var\(--portal-sidebar-w, 0px\)[^}]*padding-bottom:\s*env\(safe-area-inset-bottom, 0px\)/)
  })

  it('lays frames four across with no horizontal scroll', () => {
    expect(css).toMatch(/\.fgrid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
  })

  it('gives every touch target at least 44px', () => {
    expect(css).toMatch(/\.link\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.tab\s*\{[^}]*min-height:\s*52px/)
    expect(css).toMatch(/\.menuItem\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.ghostButton\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/)
  })

  it('uses the highlighter token for changed passages and the danger token for failures', () => {
    expect(css).toMatch(/\.changed\s*\{[^}]*background:\s*var\(--dot-grad-highlight-soft\)/)
    expect(css).toMatch(/\.barErr\s*\{[^}]*var\(--dot-danger\)/)
    expect(css).not.toMatch(/#c0392b|#9f241b/i)
  })

  it('shows a visible focus ring and no decorative stripe', () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--dot-black\)/)
    expect(css).not.toMatch(/stripe/i)
  })

  it('switches to the split view only from 1100px and to the phone layout at 767px', () => {
    expect(css).toMatch(/@media \(min-width: 1100px\)\s*\{\s*\.split\s*\{[^}]*grid-template-columns:\s*var\(--media-col\)/)
    expect(css).toMatch(/@media \(max-width: 767px\)/)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/piece-page.css.test.ts"`
Expected: FAIL, `ENOENT ... piece-page.module.css`.

- [ ] **Step 3: Implement**

Create `src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css`:

```css
/* Piece page v2 (spec 2026-10-03; approved mockups screens-v3 + portal-v3.css).
   Design-system tokens only. Phone <= 767px (matches the portal shell), media above the copy at
   768-1099px, split view from 1100px. Literal colours: the mockup's yellow corner glows only. */
.root {
  --media-col: 340px;
  --bar-h: 80px;
  --cbar-h: 64px;
  position: relative;
  min-height: 100dvh;
  background: var(--dot-cream);
  color: var(--dot-black);
  font-family: var(--dot-font-text);
  font-weight: var(--dot-weight-book);
  font-size: 1rem;
  line-height: 1.6;
}
.root :focus-visible { outline: 3px solid var(--dot-black); outline-offset: 3px; }
.srOnly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Quiet text actions: underlined, 44px target */
.link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0; background: none; border: 0;
  cursor: pointer; font-family: var(--dot-font-text); font-size: 0.9375rem; font-weight: var(--dot-weight-regular);
  color: var(--dot-black); text-decoration: underline; text-decoration-color: var(--dot-grey-light); text-underline-offset: 5px; }
.linkGrey { color: var(--dot-graphite); }
.linkSmall { font-size: 0.875rem; }
.label { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase;
  letter-spacing: 0.18em; font-size: 0.7rem; color: var(--dot-grey-accessible); }
.meta { font-size: 0.875rem; color: var(--dot-grey-accessible); font-weight: var(--dot-weight-regular); }
.ghostButton { display: inline-flex; align-items: center; justify-content: center; gap: var(--dot-space-2);
  min-height: 44px; min-width: 44px; padding: 10px 16px; border: 2px solid var(--dot-black); border-radius: var(--dot-radius);
  background: transparent; color: var(--dot-black); cursor: pointer; font-family: var(--dot-font-display);
  font-weight: var(--dot-weight-demi); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.72rem; line-height: 1;
  white-space: nowrap; }
.iconOnly { width: 44px; padding: 0; }

/* Header: in flow, faint corner glow */
.phead { position: relative; background: var(--dot-cream); border-bottom: 1px solid var(--dot-hairline); }
.phead::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle farthest-corner at 100% 0%, rgba(218,255,0,.13), rgba(238,251,157,.10) 34%, rgba(250,249,246,0) 53%); }
.pheadIn { position: relative; max-width: 1344px; margin: 0 auto; padding: var(--dot-space-5) var(--dot-space-7) var(--dot-space-4);
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--dot-space-2) var(--dot-space-6); align-items: start; }
.crumb { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--dot-space-3); align-items: center; }
.crumb a { display: inline-flex; align-items: center; min-height: 44px; font-size: 0.875rem; color: var(--dot-graphite); white-space: nowrap; }
.crumbMeta { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase;
  letter-spacing: 0.16em; font-size: 0.7rem; color: var(--dot-grey-accessible); }
.title { margin: 0; font-family: var(--dot-font-display); font-weight: var(--dot-weight-light);
  font-size: clamp(2.25rem, 4vw, 3.25rem); line-height: 1.04; letter-spacing: -0.01em; max-width: 26ch; }
.status { margin: var(--dot-space-3) 0 0; font-size: 1rem; color: var(--dot-graphite); font-weight: var(--dot-weight-regular); }
.status strong { color: var(--dot-black); font-weight: var(--dot-weight-medium); }
.statusLink { display: inline; padding: 0; background: none; border: 0; cursor: pointer; font: inherit; color: var(--dot-black);
  white-space: nowrap; text-decoration: underline; text-decoration-color: var(--dot-grey-light); text-underline-offset: 5px; }
.status a { color: var(--dot-black); font-weight: var(--dot-weight-medium); white-space: nowrap; }
.sep { color: var(--dot-grey-light); padding: 0 2px; }
.seg { white-space: nowrap; }
.updated { display: flex; align-items: center; gap: var(--dot-space-2); margin: var(--dot-space-2) 0 0; font-size: 0.9375rem; }
.dotmark { width: 8px; height: 8px; border-radius: var(--dot-radius-circle); background: var(--dot-black); display: inline-block; flex: none; }
.hactions { display: flex; gap: var(--dot-space-2); align-items: center; padding-top: 2px; }

/* Condensed bar: fixed overlay shown with transform and opacity only; the page height never changes */
.cbar { position: fixed; top: 0; left: var(--portal-sidebar-w, 0px); right: 0; z-index: 25; background: var(--dot-cream);
  border-bottom: 1px solid var(--dot-hairline); transform: translateY(-100%); opacity: 0; visibility: hidden; }
.cbar[data-collapsed='true'] { transform: none; opacity: 1; visibility: visible; }
.cbarIn { max-width: 1344px; margin: 0 auto; height: var(--cbar-h); padding: 0 var(--dot-space-7); display: flex;
  align-items: center; justify-content: space-between; gap: var(--dot-space-5); }
.ctitle { display: flex; align-items: baseline; gap: var(--dot-space-5); min-width: 0; }
.ct { font-family: var(--dot-font-display); font-weight: var(--dot-weight-book); font-size: 1.375rem; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ck { flex: none; white-space: nowrap; font-size: 0.9375rem; color: var(--dot-graphite); }
.ck strong { color: var(--dot-black); font-weight: var(--dot-weight-medium); }
@media (prefers-reduced-motion: no-preference) {
  .cbar { transition: transform 200ms ease, opacity 200ms ease, visibility 0s linear 200ms; }
  .cbar[data-collapsed='true'] { transition: transform 200ms ease, opacity 200ms ease, visibility 0s; }
}

/* Menu */
.rel { position: relative; }
.menu { position: absolute; right: 0; top: 52px; width: 240px; background: var(--dot-white); border: 1px solid var(--dot-black);
  z-index: 30; padding: var(--dot-space-1) 0; margin: 0; list-style: none; }
.menuItem { display: flex; width: 100%; align-items: center; min-height: 44px; padding: 0 var(--dot-space-4); background: none;
  border: 0; text-align: left; cursor: pointer; font: inherit; font-size: 1rem; color: var(--dot-black); }
.menu li + li .menuItem { border-top: 1px solid var(--dot-hairline); }
.dialog { width: min(560px, calc(100vw - 32px)); padding: var(--dot-space-5); border: 1px solid var(--dot-black);
  background: var(--dot-cream); color: var(--dot-black); }
.dialog::backdrop { background: rgb(53 51 47 / 45%); }
.dialogHead { display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-3); margin-bottom: var(--dot-space-4); }
.dialogHead h2 { margin: 0; font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 1.75rem; }
.formRow { display: grid; gap: 6px; margin-bottom: var(--dot-space-4); font-size: 0.9375rem; }
.formRow input { min-height: 44px; padding: 9px 10px; font: inherit; border: 1px solid var(--dot-black); border-radius: var(--dot-radius); background: var(--dot-white); }
.error { color: var(--dot-danger); margin: var(--dot-space-2) 0 0; }

/* Page grid */
.page { max-width: 1344px; margin: 0 auto; padding: var(--dot-space-6) var(--dot-space-7) calc(var(--bar-h) + var(--dot-space-8)); }
.split { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--dot-space-6); align-items: start; }
.split > *, .stack > *, .readw > * { min-width: 0; }
.media { min-width: 0; }
.stack { display: block; max-width: 1040px; margin: 0 auto; }
.readw { max-width: 760px; margin: var(--dot-space-6) auto 0; }
.stack > .readw:first-child, .page > .readw:first-child { margin-top: 0; }
@media (min-width: 1100px) {
  .split { grid-template-columns: var(--media-col) minmax(0, 1fr); gap: var(--dot-space-8); }
  .media { position: sticky; top: calc(var(--cbar-h) + var(--dot-space-4));
    max-height: calc(100vh - var(--cbar-h) - var(--bar-h) - var(--dot-space-4)); overflow-y: auto; overflow-x: hidden; }
}
@media (min-width: 768px) and (max-width: 1099px) {
  .split > .media { max-width: 560px; width: 100%; margin: 0 auto; }
}

/* Player and placeholders */
.player { display: block; width: 100%; background: var(--dot-black); }
.playerV { width: 270px; max-width: 100%; aspect-ratio: 9 / 16; margin: 0 auto; object-fit: contain; }
.playerH { aspect-ratio: 16 / 9; object-fit: contain; }
.underMedia { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--dot-space-3); margin-top: var(--dot-space-2); }
.mediaNote { margin: var(--dot-space-2) 0 0; font-size: 0.9375rem; color: var(--dot-graphite); }
.phMedia { display: grid; place-items: center; text-align: center; min-height: 240px; background: var(--dot-off-white);
  border: 1px dashed var(--dot-grey-light); color: var(--dot-graphite); padding: var(--dot-space-5); }
.phMedia p { margin: 0; max-width: 24ch; font-size: 1.0625rem; }
.fallback { display: grid; gap: var(--dot-space-2); justify-items: start; }

/* Frame grid: four across, one-line labels, never a horizontal scroll */
.stripHead { display: flex; justify-content: space-between; align-items: baseline; margin: var(--dot-space-5) 0 var(--dot-space-2); }
.fgrid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--dot-space-4) var(--dot-space-3); }
.fg { min-width: 0; }
.thumb { display: block; width: 100%; aspect-ratio: 9 / 16; object-fit: cover; border: 1px solid var(--dot-hairline); background: var(--dot-black); }
.fgN { font-size: 0.75rem; color: var(--dot-graphite); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.fg .link { font-size: 0.75rem; line-height: 1.25; text-align: left; align-items: flex-start; padding-top: 4px; }
.fcollapsed { display: flex; align-items: center; gap: var(--dot-space-3); margin-top: var(--dot-space-5); padding: var(--dot-space-3) 0;
  border-top: 1px solid var(--dot-hairline); border-bottom: 1px solid var(--dot-hairline); font-size: 0.9375rem; color: var(--dot-graphite); }
.fcollapsed strong { color: var(--dot-black); font-weight: var(--dot-weight-medium); }

/* Page viewer */
.pager { position: relative; border: 1px solid var(--dot-hairline); background: var(--dot-white); }
.pagerButton { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; touch-action: pan-y; }
.pagerImage { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.pagerNav { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: var(--dot-space-2); margin-top: var(--dot-space-3); }
.count { text-align: center; font-variant-numeric: tabular-nums; font-size: 0.9375rem; }
.pthumbs { list-style: none; margin: var(--dot-space-4) 0 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--dot-space-2); }
.pthumb { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; background: none; cursor: pointer; }
.pthumb img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border: 1px solid var(--dot-hairline); }
.pthumb[aria-current='true'] img { outline: 2px solid var(--dot-black); outline-offset: 1px; }
.enlarge { width: min(900px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: var(--dot-space-4); border: 1px solid var(--dot-black); background: var(--dot-cream); }
.enlarge::backdrop { background: rgb(53 51 47 / 55%); }
.enlarge img { display: block; width: 100%; height: auto; }

/* Copy switcher */
.tabs { display: flex; gap: var(--dot-space-7); border-bottom: 1px solid var(--dot-hairline); overflow-x: auto; scrollbar-width: none; }
.tab { position: relative; display: inline-flex; align-items: center; gap: var(--dot-space-2); min-height: 52px; padding: 0;
  background: none; border: 0; cursor: pointer; white-space: nowrap; font-family: var(--dot-font-display);
  font-weight: var(--dot-weight-demi); text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.78rem; color: var(--dot-grey-accessible); }
.tab[aria-selected='true'] { color: var(--dot-black); box-shadow: inset 0 -2px 0 var(--dot-black); }
.cnt { display: inline-grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--dot-black);
  border-radius: var(--dot-radius-circle); background: var(--dot-grad-fill); font-size: 0.72rem; letter-spacing: 0; line-height: 1; color: var(--dot-black); }
.sheet { background: var(--dot-white); border: 1px solid var(--dot-hairline); border-top: 0;
  padding: var(--dot-space-6) var(--dot-space-7) var(--dot-space-7); touch-action: pan-y; }
.block + .block { margin-top: var(--dot-space-7); }
.blockHead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--dot-space-4); margin-bottom: var(--dot-space-3); }
.hint { font-size: 0.9375rem; color: var(--dot-grey-accessible); margin: 0 0 var(--dot-space-5); font-weight: var(--dot-weight-regular); }
.copy { font-size: 1.125rem; line-height: 1.7; max-width: 66ch; }
.copy p { margin: 0 0 1em; }
.changed { background: var(--dot-grad-highlight-soft); }
.saved { display: inline-flex; align-items: center; gap: 6px; font-size: 0.875rem; color: var(--dot-graphite); font-weight: var(--dot-weight-regular); }
.saved::before { content: ""; width: 10px; height: 10px; border-radius: var(--dot-radius-circle); border: 1px solid var(--dot-black); background: var(--dot-grad-fill); }
.closed { font-size: 0.875rem; color: var(--dot-grey-accessible); }
.blockActions { display: flex; flex-wrap: wrap; gap: var(--dot-space-4); margin-top: var(--dot-space-3); }
.preamble { color: var(--dot-graphite); font-size: 0.9375rem; margin-bottom: var(--dot-space-4); }

/* On-screen text, frame by frame; PDF text, page by page */
.frows, .ptext { list-style: none; margin: 0; padding: 0; }
.frow, .ptext > li { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: var(--dot-space-5);
  padding: var(--dot-space-5) 0; border-top: 1px solid var(--dot-hairline); align-items: start; }
.frow:first-child, .ptext > li:first-child { border-top: 0; padding-top: 0; }
.ft { width: 72px; aspect-ratio: 9 / 16; object-fit: cover; border: 1px solid var(--dot-hairline); background: var(--dot-off-white); }
.ftPage { aspect-ratio: 4 / 5; }
.fnum { display: flex; flex-wrap: wrap; gap: var(--dot-space-2); align-items: center; font-size: 0.8125rem;
  color: var(--dot-grey-accessible); margin-bottom: 6px; font-variant-numeric: tabular-nums; }
.editedTag { padding: 1px 6px; border: 1px solid var(--dot-black); font-size: 0.75rem; color: var(--dot-black); font-weight: var(--dot-weight-medium); }
.frameText { font-size: 1.0625rem; line-height: 1.5; }
.ractions { display: flex; flex-direction: column; align-items: flex-end; }
.ptext > li[aria-current='true'] { box-shadow: inset 3px 0 0 var(--dot-black); padding-left: var(--dot-space-4); margin-left: calc(-1 * var(--dot-space-4)); }

/* Structured read views */
.field { margin-bottom: var(--dot-space-6); }
.field:last-child { margin-bottom: 0; }
.fieldLabel { display: block; margin-bottom: var(--dot-space-2); }
.fieldValue { font-size: 1.125rem; line-height: 1.7; max-width: 66ch; }
.fieldTitle { font-family: var(--dot-font-display); font-weight: var(--dot-weight-regular); font-size: 1.375rem; line-height: 1.35; }
.chips { display: flex; flex-wrap: wrap; gap: var(--dot-space-2); list-style: none; margin: 0; padding: 0; }
.chip { display: inline-flex; align-items: center; min-height: 36px; padding: 0 var(--dot-space-3); border: 1px solid var(--dot-hairline); background: var(--dot-off-white); font-size: 0.9375rem; }
.charcount { font-size: 0.8125rem; color: var(--dot-grey-accessible); font-variant-numeric: tabular-nums; }
.chapters { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: var(--dot-space-7); }
.chapters li { break-inside: avoid; display: grid; grid-template-columns: 72px 1fr; gap: var(--dot-space-3); padding: 10px 0; border-bottom: 1px solid var(--dot-hairline); }
.chapters time { font-variant-numeric: tabular-nums; color: var(--dot-graphite); }

/* Article */
.cover { aspect-ratio: 3 / 2; width: 100%; object-fit: cover; display: block; background: var(--dot-graphite); }
.coverPlaceholder { aspect-ratio: 3 / 2; width: 100%; display: grid; place-items: end start; padding: var(--dot-space-6);
  background: radial-gradient(circle farthest-corner at 100% 0%, rgba(218,255,0,.22), rgba(53,51,47,0) 45%), linear-gradient(160deg, var(--dot-graphite), var(--dot-black));
  color: var(--dot-cream); font-family: var(--dot-font-display); letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.8rem; font-weight: var(--dot-weight-demi); }
.article { font-size: 1.125rem; line-height: 1.75; }
.articleTitle { font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 2.75rem; line-height: 1.12; margin: var(--dot-space-6) 0 var(--dot-space-5); }
.sec { padding: var(--dot-space-2) 0; }
.secH { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--dot-space-4); margin: var(--dot-space-6) 0 var(--dot-space-3); }
.secH h3 { font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: 1.625rem; line-height: 1.3; margin: 0; }
.article p, .article ul { max-width: 68ch; }
.serp { border: 1px solid var(--dot-hairline); background: var(--dot-white); padding: var(--dot-space-4); max-width: 600px; margin-bottom: var(--dot-space-6); }
.serpUrl { font-size: 0.875rem; color: var(--dot-graphite); overflow-wrap: anywhere; }
.serpTitle { font-size: 1.25rem; margin: 2px 0; }
.details { margin: 0; display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr); gap: var(--dot-space-2) var(--dot-space-4); font-size: 0.9375rem; }
.details dt { color: var(--dot-grey-accessible); }
.details dd { margin: 0; overflow-wrap: anywhere; }

/* Draft written against the previous version */
.carryNotice { margin: 0 0 var(--dot-space-5); padding: var(--dot-space-4); border: 1px solid var(--dot-black); background: var(--dot-off-white); }
.carry { display: grid; grid-template-columns: 1fr 1fr; gap: var(--dot-space-4); margin-top: var(--dot-space-2); }
.carry > div { border-top: 1px solid var(--dot-hairline); padding-top: var(--dot-space-2); min-width: 0; }

/* Decision bar */
.bar { position: fixed; left: var(--portal-sidebar-w, 0px); right: 0; bottom: 0; z-index: 30; background: var(--dot-white);
  border-top: 1px solid var(--dot-hairline); padding-bottom: env(safe-area-inset-bottom, 0px); }
@media (prefers-reduced-motion: no-preference) { .bar { transition: transform 150ms ease; } }
.barErr { border-top-color: var(--dot-danger); box-shadow: inset 0 1px 0 var(--dot-danger); }
.barIn { max-width: 1344px; margin: 0 auto; min-height: var(--bar-h); padding: var(--dot-space-3) var(--dot-space-7);
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dot-space-3) var(--dot-space-5); }
.prog { display: flex; align-items: center; gap: var(--dot-space-2) var(--dot-space-4); flex-wrap: wrap; min-width: 0; }
.progStrong, .unsent { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.8rem; }
.unsent { display: inline-flex; align-items: center; gap: 8px; }
.unsent::before { content: ""; width: 22px; height: 22px; border-radius: var(--dot-radius-circle); border: 1px solid var(--dot-black); background: var(--dot-grad-fill); }
.sub { font-size: 0.9375rem; color: var(--dot-graphite); font-weight: var(--dot-weight-regular); }
.errText { color: var(--dot-danger); font-weight: var(--dot-weight-medium); }
.act { display: flex; align-items: center; gap: var(--dot-space-4); flex: none; }
.noteBox { position: fixed; left: var(--portal-sidebar-w, 0px); right: 0; bottom: calc(var(--bar-h) + env(safe-area-inset-bottom, 0px));
  z-index: 31; background: var(--dot-white); border-top: 1px solid var(--dot-hairline); padding: var(--dot-space-4) var(--dot-space-7); }
.barMessage { margin: 0; flex-basis: 100%; }

/* Drawer: side panel on desktop, full-screen sheet on a phone */
.drawer { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(480px, 100vw); height: 100dvh; max-height: none; max-width: none;
  padding: 0; border: 0; border-left: 1px solid var(--dot-black); background: var(--dot-cream); color: var(--dot-black); }
.drawer[open] { display: flex; flex-direction: column; }
.drawer::backdrop { background: rgb(53 51 47 / 45%); }
.drawerH { padding: var(--dot-space-5) var(--dot-space-6) 0; border-bottom: 1px solid var(--dot-hairline); }
.drawerTop { display: flex; justify-content: space-between; align-items: start; gap: var(--dot-space-3); }
.drawerH h2 { margin: 0; font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 2rem; }
.notice { display: inline-flex; gap: 8px; align-items: center; margin-top: var(--dot-space-2); font-size: 0.9375rem; color: var(--dot-graphite); }
.drawerTabs { display: flex; gap: var(--dot-space-5); margin-top: var(--dot-space-4); }
.drawerB { flex: 1; overflow: auto; padding: var(--dot-space-5) var(--dot-space-6); }
.msgs { list-style: none; margin: 0; padding: 0; }
.msg { margin-bottom: var(--dot-space-5); max-width: 40ch; }
.msgMe { margin-left: auto; }
.who { font-size: 0.8125rem; color: var(--dot-grey-accessible); margin-bottom: 4px; }
.bub { background: var(--dot-white); border: 1px solid var(--dot-hairline); padding: var(--dot-space-3) var(--dot-space-4); font-size: 1rem; line-height: 1.55; white-space: pre-wrap; }
.msgMe .bub { background: var(--dot-off-white); border-color: var(--dot-grey-light); }
.quote { padding-left: 14px; background: linear-gradient(to right, var(--dot-yellow) 0 3px, transparent 3px); color: var(--dot-graphite); margin: 0 0 8px; font-size: 0.9375rem; }
.composer { border-top: 1px solid var(--dot-hairline); padding: var(--dot-space-4) var(--dot-space-6) calc(var(--dot-space-5) + env(safe-area-inset-bottom, 0px)); background: var(--dot-cream); }
.composerRow { display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-3); margin-top: var(--dot-space-3); }
.src { padding: var(--dot-space-4) 0; border-bottom: 1px solid var(--dot-hairline); }
.src p { margin: 0 0 6px; }
.src a { display: inline-flex; min-height: 44px; align-items: center; color: var(--dot-black); }

/* Editor sheet (plan 4a: plain text; plan 4b swaps in the document editor for copy) */
.editorSheet { width: min(760px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 1px solid var(--dot-black);
  background: var(--dot-cream); color: var(--dot-black); }
.editorSheet[open] { display: flex; flex-direction: column; }
.editorSheet::backdrop { background: rgb(53 51 47 / 45%); }
.sheetH { display: flex; align-items: center; gap: var(--dot-space-3); padding: var(--dot-space-3) var(--dot-space-4); border-bottom: 1px solid var(--dot-hairline); }
.sheetH img { width: 32px; aspect-ratio: 9 / 16; object-fit: cover; border: 1px solid var(--dot-hairline); }
.sheetTitle { flex: 1; margin: 0; font-size: 1rem; font-weight: var(--dot-weight-medium); line-height: 1.3; }
.sheetB { flex: 1; overflow: auto; padding: var(--dot-space-4); }
.sheetT { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--dot-space-3);
  padding: var(--dot-space-2) var(--dot-space-4) calc(var(--dot-space-2) + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--dot-hairline); background: var(--dot-white); }
.sheetActions { display: flex; flex-wrap: wrap; gap: var(--dot-space-3); align-items: center; }
.plainEditor { width: 100%; min-height: 40vh; font-family: var(--dot-font-text); font-size: 1.0625rem; line-height: 1.6; color: var(--dot-black);
  background: var(--dot-white); border: 1px solid var(--dot-black); border-radius: var(--dot-radius); padding: var(--dot-space-3) var(--dot-space-4); resize: vertical; }

/* First-visit intro */
.intro { width: min(560px, calc(100vw - 32px)); padding: var(--dot-space-6); border: 1px solid var(--dot-black); background: var(--dot-cream); color: var(--dot-black); }
.intro::backdrop { background: rgb(53 51 47 / 45%); }
.intro h2 { margin: 0 0 var(--dot-space-4); font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 2.25rem; line-height: 1.2; }
.steps { list-style: none; margin: 0 0 var(--dot-space-5); padding: 0; counter-reset: step; }
.steps li { counter-increment: step; display: grid; grid-template-columns: 32px 1fr; gap: var(--dot-space-3); padding: var(--dot-space-3) 0;
  border-top: 1px solid var(--dot-hairline); font-size: 1.0625rem; line-height: 1.55; }
.steps li::before { content: counter(step); font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: 1.5rem; }
.introFoot { display: flex; justify-content: space-between; align-items: center; gap: var(--dot-space-3); }
.signature { font-family: var(--dot-font-display); font-weight: var(--dot-weight-book); }

/* Phone */
@media (max-width: 767px) {
  .root { --bar-h: 72px; --cbar-h: 52px; }
  .pheadIn { padding: var(--dot-space-4); grid-template-columns: minmax(0, 1fr); gap: var(--dot-space-2); }
  .title { font-size: 2rem; }
  .status { font-size: 0.9375rem; }
  .page { padding: var(--dot-space-4) var(--dot-space-4) calc(var(--bar-h) + var(--dot-space-7) + env(safe-area-inset-bottom, 0px)); }
  .playerV { width: 236px; }
  .underMedia { justify-content: center; }
  .tabs { gap: var(--dot-space-4); -webkit-mask-image: linear-gradient(to right, #000 85%, transparent); mask-image: linear-gradient(to right, #000 85%, transparent); }
  .tab { letter-spacing: 0.08em; font-size: 0.7rem; gap: 6px; }
  .sheet { padding: var(--dot-space-5) var(--dot-space-4); border-left: 0; border-right: 0; margin: 0 calc(-1 * var(--dot-space-4)); }
  .copy, .fieldValue { font-size: 1.0625rem; }
  .frow, .ptext > li { grid-template-columns: 56px minmax(0, 1fr); gap: var(--dot-space-4); }
  .ft { width: 56px; }
  .ractions { grid-column: 2; flex-direction: row; gap: var(--dot-space-4); justify-self: start; }
  .chapters { columns: 1; }
  .cbarIn { padding: 0 var(--dot-space-4); gap: var(--dot-space-3); }
  .ctitle { display: block; }
  .ct { display: block; font-size: 1.0625rem; line-height: 1.3; }
  .ck { display: block; font-size: 0.8125rem; line-height: 1.3; }
  .qlabel { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .barIn { padding: var(--dot-space-3) var(--dot-space-4); gap: var(--dot-space-2) var(--dot-space-3); }
  .sub { display: none; }
  .progStrong, .unsent { font-size: 0.72rem; letter-spacing: 0.1em; }
  .drawer { width: 100vw; border-left: 0; }
  .drawerH, .drawerB, .composer { padding-left: var(--dot-space-4); padding-right: var(--dot-space-4); }
  .editorSheet { width: 100vw; height: 100dvh; max-width: 100vw; max-height: 100dvh; margin: 0; border: 0; }
  .intro { padding: var(--dot-space-5); margin: auto auto var(--dot-space-4); }
  .articleTitle { font-size: 2rem; }
  .secH h3 { font-size: 1.375rem; }
  .article { font-size: 1.0625rem; }
  .carry, .details { grid-template-columns: 1fr; }
  .noteBox { padding: var(--dot-space-3) var(--dot-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .root *, .root *::before, .root *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/piece-page.css.test.ts"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css" "src/app/client/[slug]/piece/[contentId]/v2/piece-page.css.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the approved v3 look for the new piece page on design-system tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Page hooks and the device-aware status line

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/hooks.ts`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/hooks.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/status-text.ts`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/status-text.test.ts`

- [ ] **Step 1: Write the failing tests**

`hooks.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useCollapsingHeader, useKeyboardInset, usePhone, useSwipe } from './hooks'

let scrollY = 0
beforeEach(() => {
  scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
})
afterEach(() => vi.unstubAllGlobals())

function scrollTo(y: number) {
  scrollY = y
  act(() => { window.dispatchEvent(new Event('scroll')) })
}

describe('useCollapsingHeader', () => {
  it('collapses past 120px and expands only under 40px', () => {
    const { result } = renderHook(() => useCollapsingHeader())
    expect(result.current).toBe(false)
    scrollTo(130)
    expect(result.current).toBe(true)
    scrollTo(60)
    expect(result.current).toBe(true)
    scrollTo(30)
    expect(result.current).toBe(false)
  })
})

describe('useKeyboardInset', () => {
  it('measures how much of the layout viewport the keyboard covers', () => {
    const listeners: Record<string, () => void> = {}
    const viewport = { height: 800, offsetTop: 0, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn }, removeEventListener: vi.fn() }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
    viewport.height = 500
    act(() => listeners.resize())
    expect(result.current).toBe(300)
  })
})

describe('usePhone', () => {
  it('follows the 767px media query', () => {
    let matches = true
    const listeners: Array<() => void> = []
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return matches }, media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn(),
    }))
    const { result } = renderHook(() => usePhone())
    expect(result.current).toBe(true)
    matches = false
    act(() => listeners.forEach((fn) => fn()))
    expect(result.current).toBe(false)
  })
})

describe('useSwipe', () => {
  function Probe({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
    return <div data-testid="area" {...useSwipe(onLeft, onRight)} />
  }

  it('calls left on a leftward swipe and ignores mostly vertical moves', () => {
    const onLeft = vi.fn()
    const onRight = vi.fn()
    render(<Probe onLeft={onLeft} onRight={onRight} />)
    const area = screen.getByTestId('area')
    fireEvent.pointerDown(area, { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(area, { pointerType: 'touch', clientX: 200, clientY: 110 })
    fireEvent.pointerDown(area, { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(area, { pointerType: 'touch', clientX: 230, clientY: 260 })
    expect(onLeft).toHaveBeenCalledTimes(1)
    expect(onRight).not.toHaveBeenCalled()
  })
})
```

`status-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { draftStatusLine } from './status-text'

describe('draftStatusLine', () => {
  it('says this phone on a phone and this device elsewhere (plan 3, decision 6)', () => {
    expect(draftStatusLine('offline', true)).toBe('Saved on this phone · will sync when online')
    expect(draftStatusLine('offline', false)).toBe('Saved on this device · will sync when online')
  })

  it('uses the plan 3 wording for every other state', () => {
    expect(draftStatusLine('saving', false)).toBe('Saving…')
    expect(draftStatusLine('saved', true)).toBe('Saved · not sent yet')
    expect(draftStatusLine('send_failed', true)).toBe("Couldn't send. Retry")
    expect(draftStatusLine('idle', true)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/hooks.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/status-text.test.ts"`
Expected: FAIL, cannot resolve `./hooks` and `./status-text`.

- [ ] **Step 3: Implement**

`hooks.ts`:

```ts
'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { nextCollapsed } from '@/lib/portal/piece-page/collapse'

// Collapsed header state with hysteresis (collapse past 120px, expand under 40px). A passive,
// requestAnimationFrame-throttled scroll listener; the bar is an overlay, so toggling it never
// changes the document height and cannot re-trigger itself.
export function useCollapsingHeader(): boolean {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    let current = false
    let ticking = false
    const apply = () => {
      ticking = false
      const next = nextCollapsed(current, window.scrollY)
      if (next !== current) {
        current = next
        setCollapsed(next)
      }
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(apply)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return collapsed
}

// How many pixels of the layout viewport the on-screen keyboard covers (spec 4.6: the decision
// bar sits above the keyboard on a phone). 0 where visualViewport is missing.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

export const PHONE_QUERY = '(max-width: 767px)'

export function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(PHONE_QUERY)
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

// Horizontal swipe for touch and pen; a mouse drag is ignored so text stays selectable.
export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 60) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return
      if (dx < 0) onLeft()
      else onRight()
    },
    onPointerCancel: () => { start.current = null },
  }
}
```

`status-text.ts`:

```ts
import { DRAFT_STATUS_TEXT, type DraftSyncState } from '@/lib/portal/review-drafts-core'

// Plan 3's status wording, with the offline line naming the device (Anastasia's decision 6 in
// plan 3: "this phone" on a phone, "this device" elsewhere).
export function draftStatusLine(state: DraftSyncState, isPhone: boolean): string | null {
  if (state === 'idle') return null
  if (state === 'offline') return `Saved on this ${isPhone ? 'phone' : 'device'} · will sync when online`
  return DRAFT_STATUS_TEXT[state]
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/hooks.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/status-text.test.ts"`
Expected: PASS, 6 tests. If the swipe test sees no pointer coordinates, the jsdom build lacks `PointerEvent`: add at the top of the test file `if (!('PointerEvent' in window)) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent` (pointerType then reads `undefined`, which the hook treats as touch).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/hooks.ts" "src/app/client/[slug]/piece/[contentId]/v2/hooks.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/status-text.ts" "src/app/client/[slug]/piece/[contentId]/v2/status-text.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the collapsing header, keyboard inset, phone and swipe hooks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Tick state that survives devices and failed writes

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.test.tsx`

Server rows (Task 12) are the record; the browser keeps a copy per seat and version so a tick never disappears when a write fails, and a tick saved only in the browser reaches the server on the next load. In the admin preview (`persist={false}`) nothing is written.

- [ ] **Step 1: Write the failing tests**

```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tickReviewTabs } = vi.hoisted(() => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs }))

import ReviewTicksProvider, { useReviewTicks } from './ReviewTicksProvider'

let api: ReturnType<typeof useReviewTicks>
function Probe() {
  api = useReviewTicks()
  return <output data-testid="ticked">{[...api.ticked].sort().join(',')}</output>
}

function mount(props: Partial<React.ComponentProps<typeof ReviewTicksProvider>> = {}) {
  return render(<ReviewTicksProvider slug="kanset" contentId="piece" version={2} scope="maria"
    initial={[]} persist {...props}><Probe /></ReviewTicksProvider>)
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  tickReviewTabs.mockReset()
  tickReviewTabs.mockResolvedValue({ ok: true })
})
afterEach(() => vi.useRealTimers())

describe('ReviewTicksProvider', () => {
  it('starts from the server ticks', () => {
    mount({ initial: ['caption'] })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption')
  })

  it('ticks at once and writes to the server shortly after, in one call', async () => {
    mount()
    act(() => { api.tick('onscreen'); api.tick('caption'); api.tick('caption') })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption,onscreen')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenCalledTimes(1)
    expect(tickReviewTabs).toHaveBeenCalledWith({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['onscreen', 'caption'] })
  })

  it('keeps a tick whose write failed and retries it with the next one', async () => {
    tickReviewTabs.mockResolvedValueOnce({ ok: false })
    mount()
    act(() => api.tick('caption'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption')
    act(() => api.tick('youtube'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenLastCalledWith(expect.objectContaining({ tabKeys: ['caption', 'youtube'] }))
  })

  it('restores ticks saved only in this browser and sends them', async () => {
    window.localStorage.setItem('piece-ticks:maria:kanset:piece:v2', JSON.stringify(['youtube']))
    mount({ initial: ['caption'] })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption,youtube')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenCalledWith(expect.objectContaining({ tabKeys: ['youtube'] }))
  })

  it('never writes in the read-only preview', async () => {
    mount({ persist: false })
    act(() => api.tick('caption'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(tickReviewTabs).not.toHaveBeenCalled()
  })

  it('keeps versions apart', () => {
    window.localStorage.setItem('piece-ticks:maria:kanset:piece:v1', JSON.stringify(['caption']))
    mount()
    expect(screen.getByTestId('ticked').textContent).toBe('')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.test.tsx"`
Expected: FAIL, cannot resolve `./ReviewTicksProvider`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { tickReviewTabs } from '../../../tick-actions'

// Copy-tab ticks (spec 2026-10-03 section 4.3): per seat, per version. The server rows
// (migration 0094) are the record; the browser copy keeps a tick when a write fails and sends
// it on the next tick or the next load. persist=false (the admin preview) writes nothing.

type TicksValue = { ticked: ReadonlySet<string>; tick: (tabKey: string) => void }
const TicksContext = createContext<TicksValue | null>(null)
const WRITE_DELAY_MS = 400

function readLocal(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeLocal(key: string, values: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values))
  } catch {
    // Storage blocked: the in-memory and server copies still hold.
  }
}

export default function ReviewTicksProvider({
  slug, contentId, version, scope, initial, persist, children,
}: {
  slug: string
  contentId: string
  version: number
  scope: string
  initial: string[]
  persist: boolean
  children: React.ReactNode
}) {
  const storageKey = `piece-ticks:${scope}:${slug}:${contentId}:v${version}`
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(initial))
  const tickedRef = useRef(ticked)
  const serverKnown = useRef(new Set(initial))
  const unsent = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    timer.current = null
    const keys = [...unsent.current]
    if (keys.length === 0) return
    unsent.current.clear()
    const result = await tickReviewTabs({ slug, contentId, contentVersion: version, tabKeys: keys })
      .catch(() => ({ ok: false }))
    if (result.ok) for (const key of keys) serverKnown.current.add(key)
    else for (const key of keys) unsent.current.add(key)
  }, [contentId, slug, version])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, WRITE_DELAY_MS)
  }, [flush])

  useEffect(() => {
    const local = readLocal(storageKey)
    if (local.length === 0) return
    const merged = new Set([...tickedRef.current, ...local])
    tickedRef.current = merged
    setTicked(merged)
    if (!persist) return
    const missing = local.filter((key) => !serverKnown.current.has(key))
    if (missing.length === 0) return
    for (const key of missing) unsent.current.add(key)
    schedule()
  }, [persist, schedule, storageKey])

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  const tick = useCallback((tabKey: string) => {
    if (tickedRef.current.has(tabKey)) return
    const next = new Set(tickedRef.current)
    next.add(tabKey)
    tickedRef.current = next
    setTicked(next)
    writeLocal(storageKey, [...next])
    if (!persist || serverKnown.current.has(tabKey)) return
    unsent.current.add(tabKey)
    schedule()
  }, [persist, schedule, storageKey])

  const value = useMemo(() => ({ ticked, tick }), [tick, ticked])
  return <TicksContext.Provider value={value}>{children}</TicksContext.Provider>
}

export function useReviewTicks(): TicksValue {
  const value = useContext(TicksContext)
  if (!value) throw new Error('Review ticks must be inside ReviewTicksProvider')
  return value
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.test.tsx"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ReviewTicksProvider.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Keep review ticks per seat and version across devices and failed writes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 19: The editor host (sheet editor for copy and visual notes) and shared test setup

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx`

One place opens every editor. A copy edit shows part of a block (one frame, one page, one section, or the whole block) and `compose` turns the edited part back into the whole block body the draft stores, so the bundle still sends one edit per block (the 2026-08-14 contract and plan 3's one-edit-per-target rule). A visual note stores a described change on the asset, optionally anchored to one frame or page (plan 3, decision 3). In 4a the editor is a plain text area in a sheet; plan 4b replaces the copy editor with the document editor and keeps this host's interface.

The draft rules come from plan 3's provider and are not re-implemented: autosave a few seconds after typing and on blur, "Saved · not sent yet", Done only closes, Discard asks first, going back to the released text records a revert.

- [ ] **Step 1: Write the shared test setup**

Create `src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx`:

```tsx
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import ReviewDraftProvider from '../ReviewDraftProvider'
import ReviewTicksProvider from './ReviewTicksProvider'
import EditorHost from './EditorHost'

// Every v2 component test that touches drafts mocks the server actions at the top of its own file
// (vi.mock is hoisted per file):
//   vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
//   vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(async () => ({ success: 'Your edit was sent to The Dot.' })), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
//   vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

export function stubDialogs(): void {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
}

// serverDrafts switches the provider to plan 3's server mode (needed for drafts carried over from
// an earlier version, which the browser-only mode never loads). Use PageProviders around the new
// element when a test calls rerender, so the providers (and their state) stay mounted.
type PageOptions = { version?: number; mode?: 'client' | 'preview'; serverDrafts?: ServerDraftRow[] }

export function PageProviders({ children, version = 2, mode = 'client', serverDrafts }: PageOptions & { children: React.ReactNode }) {
  return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={version}
    serverSync={serverDrafts !== undefined} initialServerDrafts={serverDrafts ?? null}>
    <ReviewTicksProvider slug="kanset" contentId="piece" version={version} scope="maria" initial={[]} persist={false}>
      <EditorHost mode={mode}>{children}</EditorHost>
    </ReviewTicksProvider>
  </ReviewDraftProvider>
}

export function renderInPage(ui: React.ReactNode, options: PageOptions = {}) {
  return render(<PageProviders {...options}>{ui}</PageProviders>)
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { useEditorHost, type EditorRequest } from './EditorHost'
import { renderInPage, stubDialogs } from './test-utils'

const SCRIPT = '**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three'
const copyTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: SCRIPT }
const noteTarget: ReviewTarget = {
  kind: 'asset', key: 'reel-video', label: 'Reel video', urlSnapshot: 'https://drive.google.com/x',
  anchor: 'frame:3', anchorLabel: 'Frame 3',
}

function Opener({ request }: { request: EditorRequest }) {
  const { open } = useEditorHost()
  return <button type="button" onClick={() => open(request)}>open</button>
}

function DraftProbe({ target }: { target: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(target)?.proposedText ?? ''}</output>
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
})

describe('EditorHost', () => {
  it('edits one frame and stores the whole block as the draft', async () => {
    renderInPage(<>
      <Opener request={{
        kind: 'copy', slotId: 'reel-script:frame:1', target: copyTarget, title: 'Frame 2 of 3 · On-screen text',
        initialText: '**2.** Frame two', baseText: '**2.** Frame two',
        compose: (text) => SCRIPT.replace('**2.** Frame two', text),
      }} />
      <DraftProbe target={copyTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 3 · On-screen text' })).toBeVisible()
    const field = screen.getByLabelText('Text')
    expect(field).toHaveValue('**2.** Frame two')
    fireEvent.change(field, { target: { value: '**2.** Frame 2, edited' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('**1.** Frame one **2.** Frame 2, edited **3.** Frame three'))
    expect(screen.getByText('Saved · not sent yet')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('draft')).toHaveTextContent('Frame 2, edited')
  })

  it('asks before discarding', async () => {
    renderInPage(<>
      <Opener request={{ kind: 'copy', slotId: 'reel-script:whole', target: copyTarget, title: 'Whole script', initialText: SCRIPT, baseText: SCRIPT, compose: (t) => t }} />
      <DraftProbe target={copyTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A new script' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Text')).toHaveValue('A new script')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('draft')).toHaveTextContent('')
  })

  it('stores a visual note on one frame of the asset', async () => {
    renderInPage(<>
      <Opener request={{ kind: 'note', target: noteTarget, title: 'Frame 3 of 8 · Suggest a change' }} />
      <DraftProbe target={noteTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Make the headline bigger.' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('Make the headline bigger.'))
  })

  it('treats Escape as Done', () => {
    renderInPage(<Opener request={{ kind: 'note', target: noteTarget, title: 'Note' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx"`
Expected: FAIL, cannot resolve `./EditorHost`.

- [ ] **Step 4: Implement**

Create `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@thedot/design-system'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

// One host opens every editor on the page (spec 2026-10-03 section 5). Plan 4a: a plain sheet.
// Plan 4b swaps the copy editor for the document editor and keeps this interface.

export type CopyEditRequest = {
  kind: 'copy'
  // The place on the page this edit belongs to, e.g. 'reel-script:frame:2'. Plan 4b edits in
  // place there on desktop; plan 4a always uses the sheet.
  slotId: string
  // A copy_block target whose currentText is the released block body.
  target: ReviewTarget
  title: string
  thumbUrl?: string | null
  // What the editor shows: one frame, one page, one section, or the whole block.
  initialText: string
  // The released text for this slot, for track changes (plan 4b).
  baseText: string
  // Turns the edited part back into the whole block body the draft stores.
  compose: (text: string) => string
}
export type NoteRequest = { kind: 'note'; target: ReviewTarget; title: string; thumbUrl?: string | null }
export type EditorRequest = CopyEditRequest | NoteRequest

type EditorHostValue = { open: (request: EditorRequest) => void; mode: 'client' | 'preview' }
const EditorHostContext = createContext<EditorHostValue | null>(null)

function requestKey(request: EditorRequest): string {
  return `${request.kind}:${request.target.kind}:${request.target.key}:${request.target.anchor ?? ''}:${request.title}`
}

export default function EditorHost({ mode, children }: { mode: 'client' | 'preview'; children: React.ReactNode }) {
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const open = useCallback((next: EditorRequest) => setRequest(next), [])
  const value = useMemo(() => ({ open, mode }), [mode, open])
  return <EditorHostContext.Provider value={value}>
    {children}
    {request && <EditorSheet key={requestKey(request)} request={request} onClose={() => setRequest(null)} />}
  </EditorHostContext.Provider>
}

// Wraps the read view of one editable place. Plan 4a edits in a sheet, so it renders the read view;
// plan 4b renders the editor here, in place, on desktop.
export function EditSlot({ children }: { slotId: string; children: React.ReactNode }) {
  return <>{children}</>
}

export function useEditorHost(): EditorHostValue {
  const value = useContext(EditorHostContext)
  if (!value) throw new Error('Editors must be opened inside EditorHost')
  return value
}

function EditorSheet({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closedRef = useRef(false)
  const { readDraft, saveDraft, removeDraft, flush, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  const [value, setValue] = useState(() => (request.kind === 'copy'
    ? request.initialText
    : readDraft(request.target)?.proposedText ?? ''))
  const [confirming, setConfirming] = useState(false)
  const hasDraft = readDraft(request.target) !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  function finish() {
    if (closedRef.current) return
    closedRef.current = true
    void flush()
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose()
  }

  function change(next: string) {
    setValue(next)
    saveDraft(request.target, request.kind === 'copy' ? request.compose(next) : next, null)
  }

  function discard() {
    removeDraft(request.target)
    finish()
  }

  const status = hasDraft
    ? draftStatusLine(syncState === 'idle' ? 'saved' : syncState, isPhone)
    : 'Your edits save as you type and stay unsent until you send them.'

  return <dialog ref={dialogRef} className={styles.editorSheet} aria-labelledby="editor-sheet-title"
    onCancel={(event) => { event.preventDefault(); finish() }} onClose={finish}>
    <div className={styles.sheetH}>
      {/* Signed, expiring storage links: next/image would cache and re-host them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {request.thumbUrl ? <img src={request.thumbUrl} alt="" /> : null}
      <h2 id="editor-sheet-title" className={styles.sheetTitle}>{request.title}</h2>
    </div>
    <div className={styles.sheetB}>
      <label className={styles.label} htmlFor="editor-sheet-text">
        {request.kind === 'copy' ? 'Text' : 'What should change?'}
      </label>
      <textarea id="editor-sheet-text" className={styles.plainEditor} value={value} autoFocus
        onChange={(event) => change(event.target.value)} onBlur={() => { void flush() }}
        placeholder={request.kind === 'note' ? 'Describe the change, for example: make the headline bigger' : undefined} />
    </div>
    <div className={styles.sheetT}>
      <span className={hasDraft ? styles.saved : styles.meta} role="status">{status}</span>
      {confirming
        ? <div className={styles.sheetActions}>
          <span>Discard this edit? It cannot be recovered.</span>
          <Button as="button" type="button" variant="black" size="sm" onClick={discard}>Yes, discard</Button>
          <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep editing</Button>
        </div>
        : <div className={styles.sheetActions}>
          {hasDraft && <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>}
          <Button as="button" type="button" variant="black" size="sm" onClick={finish}>Done</Button>
        </div>}
    </div>
  </dialog>
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx"`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx" "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Open every piece page editor from one host that composes the whole block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Header, status line, ⋯ menu and "Request another date"

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.test.tsx`

Schedule request and removal request keep their existing server actions and rules (`requestScheduleChange`, `requestContentRemoval`); only their place changes (spec 4.1).

- [ ] **Step 1: Write the failing tests**

`MoreMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/request-actions', () => ({ requestContentRemoval: vi.fn(async () => ({})) }))

import MoreMenu from './MoreMenu'
import { stubDialogs } from './test-utils'

const writeText = vi.fn(async () => undefined)
beforeEach(() => {
  stubDialogs()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

describe('MoreMenu', () => {
  it('opens a keyboard-navigable menu and closes on Escape', () => {
    render(<MoreMenu idPrefix="t" removal={{ slug: 'kanset', contentId: 'piece', idempotencyKey: 'k' }} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Copy link', 'Request removal'])
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('copies the page link', async () => {
    render(<MoreMenu idPrefix="t" removal={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Request removal' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('opens the removal request form in a dialog', () => {
    render(<MoreMenu idPrefix="t" removal={{ slug: 'kanset', contentId: 'piece', idempotencyKey: 'k' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Request removal' }))
    expect(screen.getByRole('dialog', { name: 'Request removal' })).toBeVisible()
    expect(screen.getByLabelText(/Why should this piece be removed/)).toHaveFocus()
  })
})
```

`ScheduleRequest.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestScheduleChange } = vi.hoisted(() => ({ requestScheduleChange: vi.fn(async () => ({ error: 'That time is skipped when the clocks change.' })) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange }))

import ScheduleRequest from './ScheduleRequest'
import { stubDialogs } from './test-utils'

beforeEach(() => stubDialogs())

describe('ScheduleRequest', () => {
  it('shows a pending request instead of the link', () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets active={{ kind: 'reschedule', when: 'Oct 3, 2026, 6:00 p.m.' }} />)
    expect(screen.getByText('New date requested for Oct 3, 2026, 6:00 p.m.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request another date' })).not.toBeInTheDocument()
  })

  it('shows nothing to a seat that cannot request', () => {
    const { container } = render(<ScheduleRequest slug="kanset" contentId="piece" canRequest={false} hasExternalTargets active={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens a small form and shows the server reason when refused', async () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets active={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request another date' }))
    expect(screen.getByRole('dialog', { name: 'Request another date' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Requested Toronto date and time'), { target: { value: '2026-10-05T18:00' } })
    fireEvent.submit(screen.getByLabelText('Requested Toronto date and time').closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That time is skipped when the clocks change.')
    const sent = requestScheduleChange.mock.calls[0][0] as FormData
    expect(sent.get('slug')).toBe('kanset')
    expect(sent.get('contentId')).toBe('piece')
    expect(sent.get('requestedLocal')).toBe('2026-10-05T18:00')
  })

  it('asks for an editorial date when nothing is scheduled externally', () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets={false} active={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request another date' }))
    expect(screen.getByLabelText('Editorial plan date')).toHaveAttribute('type', 'date')
  })
})
```

`PieceHeader.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/request-actions', () => ({ requestContentRemoval: vi.fn(async () => ({})) }))

import PieceHeader from './PieceHeader'
import type { HeaderStatus } from '@/lib/portal/piece-page/header-status'

let scrollY = 0
beforeEach(() => {
  scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
})
afterEach(() => vi.unstubAllGlobals())

const scheduled: HeaderStatus = {
  kind: 'scheduled', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2',
  groups: [{ time: '6 p.m.', destinations: 'Instagram, Facebook' }, { time: '7 p.m.', destinations: 'YouTube' }],
}

function subject(overrides: Partial<React.ComponentProps<typeof PieceHeader>> = {}) {
  return <PieceHeader title="What does hiring a foreign worker cost?" formatLabel="Reel · Instagram, Facebook, YouTube"
    backHref="/client/kanset" backLabel="Back to calendar" status={scheduled} updatedLine={null}
    questionsCount={1} onOpenQuestions={vi.fn()} scheduleSlot={null} removal={null} {...overrides} />
}

describe('PieceHeader', () => {
  it('shows one heading, the format and the one status line', () => {
    render(subject())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What does hiring a foreign worker cost?')
    expect(screen.getByText('Reel · Instagram, Facebook, YouTube')).toBeInTheDocument()
    const status = screen.getByTestId('status-line')
    expect(status).toHaveTextContent('Posts Fri Oct 2 · 6 p.m. Instagram, Facebook · 7 p.m. YouTube')
  })

  it('says times are not confirmed, and links each live destination once published', () => {
    const { rerender } = render(subject({ status: { kind: 'unconfirmed', verb: 'Posts', dateLabel: 'Thu Sep 17', keyFact: 'Posts Thu Sep 17' } }))
    expect(screen.getByTestId('status-line')).toHaveTextContent('Posts Thu Sep 17 · Times not confirmed yet')
    rerender(subject({ status: { kind: 'live', keyFact: 'Live', postedLabel: 'Posted Fri Oct 2', links: [{ label: 'Instagram', url: 'https://instagram.com/p/x' }] } }))
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/p/x')
    expect(screen.getByTestId('status-line')).toHaveTextContent('Live · Instagram · Posted Fri Oct 2')
  })

  it('names the areas updated after her feedback', () => {
    render(subject({ updatedLine: 'on-screen text, caption' }))
    expect(screen.getByText('Updated after your feedback: on-screen text, caption')).toBeInTheDocument()
  })

  it('opens Questions & sources', () => {
    const onOpenQuestions = vi.fn()
    render(subject({ onOpenQuestions }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Questions and sources, 1 message' })[0])
    expect(onOpenQuestions).toHaveBeenCalled()
  })

  it('shows the condensed bar past 120px and hides it under 40px, inert while hidden', () => {
    render(subject())
    const bar = screen.getByTestId('condensed-header')
    expect(bar).toHaveAttribute('data-collapsed', 'false')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toHaveAttribute('inert')
    scrollY = 200
    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(bar).toHaveAttribute('data-collapsed', 'true')
    expect(bar).not.toHaveAttribute('inert')
    expect(bar).toHaveTextContent('Posts Fri Oct 2')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.test.tsx"`
Expected: FAIL, cannot resolve the three modules.

- [ ] **Step 3: Implement**

`MoreMenu.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import RemovalRequestForm from '../RemovalRequestForm'
import styles from './piece-page.module.css'

// The ⋯ menu holds the rare actions (spec 4.1): Copy link, Request removal. Request removal keeps
// its existing form, action and confirmation; it only moves here.
export default function MoreMenu({ idPrefix, removal }: {
  idPrefix: string
  removal: { slug: string; contentId: string; idempotencyKey: string } | null
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [removing, setRemoving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (removing && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [removing])

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus() }
    else if (event.key === 'Tab') setOpen(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
    close(true)
  }

  return <div className={styles.rel}>
    <button ref={buttonRef} type="button" className={`${styles.ghostButton} ${styles.iconOnly}`}
      aria-label="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls={`${idPrefix}-menu`}
      onClick={() => setOpen((value) => !value)}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4" cy="10" r="1.6" fill="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" />
        <circle cx="16" cy="10" r="1.6" fill="currentColor" />
      </svg>
    </button>
    {open && <ul ref={menuRef} id={`${idPrefix}-menu`} role="menu" aria-label="More actions" className={styles.menu} onKeyDown={onMenuKey}>
      <li role="none"><button type="button" role="menuitem" className={styles.menuItem} onClick={copyLink}>Copy link</button></li>
      {removal && <li role="none">
        <button type="button" role="menuitem" className={styles.menuItem}
          onClick={() => { close(false); setRemoving(true) }}>Request removal</button>
      </li>}
    </ul>}
    <span className={styles.srOnly} role="status">
      {copied === 'copied' ? 'Link copied' : copied === 'failed' ? 'Could not copy the link' : ''}
    </span>
    {removing && removal && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${idPrefix}-removal-title`}
      onClose={() => { setRemoving(false); buttonRef.current?.focus() }}>
      <div className={styles.dialogHead}>
        <h2 id={`${idPrefix}-removal-title`}>Request removal</h2>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <RemovalRequestForm slug={removal.slug} contentId={removal.contentId} idempotencyKey={removal.idempotencyKey} startOpen />
    </dialog>}
  </div>
}
```

`ScheduleRequest.tsx`:

```tsx
'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createPortal, useFormStatus } from 'react-dom'
import { Button } from '@thedot/design-system'
import { requestScheduleChange } from '../../../schedule-actions'
import styles from './piece-page.module.css'

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending || !ready}>
    {pending ? 'Sending…' : 'Send request'}
  </Button>
}

// "Request another date" in the header status line (spec 4.1). Same action, same rules as the old
// Schedule panel: who may request is decided by the page (canRequest), the server re-checks.
export default function ScheduleRequest({ slug, contentId, canRequest, hasExternalTargets, active }: {
  slug: string
  contentId: string
  canRequest: boolean
  hasExternalTargets: boolean
  active: { kind: 'reschedule' | 'cancel'; when: string | null } | null
}) {
  if (active) {
    return <>
      <span className={styles.sep} aria-hidden="true"> · </span>
      <span className={styles.seg}>
        {active.kind === 'cancel' ? 'Unschedule requested' : 'New date requested'}{active.when ? ` for ${active.when}` : ''}
      </span>
    </>
  }
  if (!canRequest) return null
  return <ScheduleRequestForm slug={slug} contentId={contentId} hasExternalTargets={hasExternalTargets} />
}

function ScheduleRequestForm({ slug, contentId, hasExternalTargets }: {
  slug: string; contentId: string; hasExternalTargets: boolean
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, action] = useActionState(
    async (_previous: { error?: string; done?: boolean }, formData: FormData) => {
      const result = await requestScheduleChange(formData)
      return result.error ? { error: result.error } : { done: true }
    },
    {},
  )

  useEffect(() => setKey(`schedule-${crypto.randomUUID()}`), [])
  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [open])
  useEffect(() => {
    if (state.done) dialogRef.current?.close()
  }, [state.done])

  return <>
    <span className={styles.sep} aria-hidden="true"> · </span>
    <button type="button" className={styles.statusLink} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      Request another date
    </button>
    {state.done && <span className={styles.srOnly} role="status">Request sent</span>}
    {/* The link sits inside the status line's <p>; the dialog is portalled to <body> so it is never nested in a paragraph. */}
    {open && createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby="schedule-request-title" onClose={() => setOpen(false)}>
      <div className={styles.dialogHead}>
        <h2 id="schedule-request-title">Request another date</h2>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="contentId" value={contentId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        {hasExternalTargets
          ? <label className={styles.formRow}>Requested Toronto date and time
            <input name="requestedLocal" type="datetime-local" required /></label>
          : <label className={styles.formRow}>Editorial plan date
            <input name="plannedDate" type="date" required /></label>}
        <p className={styles.meta}>
          {hasExternalTargets
            ? 'Toronto time is applied automatically. Your confirmed times stay in place until I confirm the change.'
            : 'This moves the planned date on your calendar.'}
        </p>
        <Submit ready={Boolean(key)} />
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
      </form>
    </dialog>, document.body)}
  </>
}
```

`PieceHeader.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import type { HeaderStatus } from '@/lib/portal/piece-page/header-status'
import { useCollapsingHeader } from './hooks'
import MoreMenu from './MoreMenu'
import styles from './piece-page.module.css'

type Removal = { slug: string; contentId: string; idempotencyKey: string } | null

function Sep() {
  return <span className={styles.sep} aria-hidden="true"> · </span>
}

function StatusLine({ status, scheduleSlot }: { status: HeaderStatus; scheduleSlot: ReactNode }) {
  if (status.kind === 'live') {
    return <p className={styles.status} data-testid="status-line">
      <strong>Live</strong>
      {status.links.map((link) => <span key={link.url}><Sep /><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></span>)}
      {status.postedLabel && <><Sep /><span className={styles.seg}>{status.postedLabel}</span></>}
    </p>
  }
  if (status.kind === 'scheduled') {
    return <p className={styles.status} data-testid="status-line">
      <strong className={styles.seg}>{status.keyFact}</strong>
      {status.groups.map((group) => <span key={group.time}><Sep /><span className={styles.seg}>{group.time} {group.destinations}</span></span>)}
      {scheduleSlot}
    </p>
  }
  if (status.kind === 'unconfirmed') {
    return <p className={styles.status} data-testid="status-line">
      <strong className={styles.seg}>{status.keyFact}</strong><Sep /><span className={styles.seg}>Times not confirmed yet</span>
      {scheduleSlot}
    </p>
  }
  return <p className={styles.status} data-testid="status-line"><strong>{status.keyFact}</strong>{scheduleSlot}</p>
}

function QuestionsButton({ count, onClick, compact = false }: { count: number; onClick: () => void; compact?: boolean }) {
  return <button type="button" className={styles.ghostButton} aria-haspopup="dialog" onClick={onClick}
    aria-label={`Questions and sources, ${count} ${count === 1 ? 'message' : 'messages'}`}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M2 3h14v9H8l-4 3v-3H2z" stroke="currentColor" fill="none" strokeWidth="1.5" />
    </svg>
    {!compact && <span className={styles.qlabel}>Questions &amp; sources</span>}
    <span aria-hidden="true">({count})</span>
  </button>
}

// Spec 4.1 and 10a: the full header scrolls away in the page; a slim fixed bar slides in past 120px
// and hides under 40px (overlay, transform and opacity only). While hidden it is aria-hidden and
// inert, so keyboard and screen-reader users never meet two copies of the controls.
export default function PieceHeader({
  title, formatLabel, backHref, backLabel, status, updatedLine, questionsCount, onOpenQuestions, scheduleSlot, removal,
}: {
  title: string
  formatLabel: string
  backHref: string
  backLabel: string
  status: HeaderStatus
  updatedLine: string | null
  questionsCount: number
  onOpenQuestions: () => void
  scheduleSlot: ReactNode
  removal: Removal
}) {
  const collapsed = useCollapsingHeader()
  return <>
    <header className={styles.phead}>
      <div className={styles.pheadIn}>
        <div className={styles.crumb}>
          <a href={backHref}>{backLabel}</a>
          <span className={styles.crumbMeta}>{formatLabel}</span>
        </div>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <StatusLine status={status} scheduleSlot={scheduleSlot} />
          {updatedLine && <p className={styles.updated}>
            <span className={styles.dotmark} aria-hidden="true" />Updated after your feedback: {updatedLine}
          </p>}
        </div>
        <div className={styles.hactions}>
          <QuestionsButton count={questionsCount} onClick={onOpenQuestions} />
          <MoreMenu idPrefix="piece-header" removal={removal} />
        </div>
      </div>
    </header>
    <div className={styles.cbar} data-testid="condensed-header" data-collapsed={collapsed ? 'true' : 'false'}
      aria-hidden={!collapsed} inert={!collapsed}>
      <div className={styles.cbarIn}>
        <div className={styles.ctitle}>
          <span className={styles.ct}>{title}</span>
          <span className={styles.ck}><strong>{status.keyFact}</strong></span>
        </div>
        <div className={styles.hactions}>
          <QuestionsButton count={questionsCount} onClick={onOpenQuestions} compact />
          <MoreMenu idPrefix="piece-condensed" removal={removal} />
        </div>
      </div>
    </div>
  </>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.test.tsx"`
Expected: PASS, 12 tests. (`getAllByRole(... '1 message')[0]` is the expanded header's button: the condensed copy is `aria-hidden` and excluded from the accessibility tree, so the array has one element.)

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PieceHeader.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MoreMenu.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ScheduleRequest.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the collapsing piece header with one status line, menu and date request

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Media area, frame grid and page viewer

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/FrameGrid.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PageViewer.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx`

- [ ] **Step 1: Write the failing tests**

`MediaArea.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import MediaArea from './MediaArea'
import { stubDialogs } from './test-utils'

const frames = Array.from({ length: 8 }, (_, i) => ({ label: `${(i + 4) / 2} s`, url: `https://signed.example/f${i + 1}.jpg` }))
const reel: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: 'https://signed.example/p.jpg',
  frames, expiresAt: '2026-10-03T12:10:00.000Z',
}
const pages: SignedReviewPreview = { ...reel, id: 'p2', mediaKind: 'pages', videoUrl: null, posterUrl: null, width: 1080, height: 1350,
  frames: Array.from({ length: 12 }, (_, i) => ({ label: `Page ${i + 1}`, url: `https://signed.example/page${i + 1}.jpg` })) }

const base = {
  title: 'Foreign worker cost', refreshUrl: null, fallbackMedia: [], episodeDriveUrl: null, mediaPending: false,
  framesCollapsed: false, page: 0, onPageChange: vi.fn(), onSuggestWhole: vi.fn(), onSuggestAt: vi.fn(),
}

beforeEach(() => stubDialogs())

describe('MediaArea', () => {
  it('plays a vertical reel inline with a four-across frame grid', () => {
    const onSuggestAt = vi.fn()
    render(<MediaArea {...base} layout="vertical" preview={reel} onSuggestAt={onSuggestAt} />)
    expect(screen.getByLabelText('Foreign worker cost: video')).toHaveAttribute('src', reel.videoUrl)
    expect(screen.getByLabelText('Foreign worker cost: video')).toHaveAttribute('playsinline')
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 3' }))
    expect(onSuggestAt).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to the whole video' }))
    expect(base.onSuggestWhole).toHaveBeenCalled()
  })

  it('collapses the grid to one line while On-screen text is open', () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} framesCollapsed />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('8 frames')).toBeInTheDocument()
    expect(screen.getByText(/each shown beside its text in On-screen text/)).toBeInTheDocument()
  })

  it('plays an episode trailer full width and links the full episode in Drive', () => {
    render(<MediaArea {...base} layout="horizontal" preview={{ ...reel, width: 1920, height: 1080, frames: [] }}
      episodeDriveUrl="https://drive.google.com/full" />)
    expect(screen.getByLabelText('Foreign worker cost: trailer')).toBeInTheDocument()
    expect(screen.getByText('This is the trailer. The full episode stays on Drive.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the full episode in Drive' })).toHaveAttribute('href', 'https://drive.google.com/full')
  })

  it('pages through a PDF with arrows, thumbnails and the keyboard', () => {
    const onPageChange = vi.fn()
    const { rerender } = render(<MediaArea {...base} layout="pages" preview={pages} page={0} onPageChange={onPageChange} />)
    expect(screen.getByText('1 / 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    rerender(<MediaArea {...base} layout="pages" preview={pages} page={2} onPageChange={onPageChange} />)
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(screen.getByRole('region', { name: 'Foreign worker cost: pages' }), { key: 'ArrowLeft' })
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to page 3' }))
    expect(base.onSuggestAt).toHaveBeenCalledWith(2)
  })

  it('enlarges a page when tapped', () => {
    render(<MediaArea {...base} layout="pages" preview={pages} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge page 1 of 12' }))
    expect(screen.getByRole('dialog', { name: 'Page 1 of 12' })).toBeVisible()
  })

  it('shows a placeholder while the media is not ready', () => {
    render(<MediaArea {...base} layout="vertical" preview={null} mediaPending />)
    expect(screen.getByText('Video coming. You can review the text now.')).toBeInTheDocument()
  })

  it('falls back to the Drive buttons when no preview exists', () => {
    render(<MediaArea {...base} layout="vertical" preview={null} fallbackMedia={[{ label: 'Reel video', url: 'https://drive.google.com/r' }]} />)
    expect(screen.getByRole('link', { name: 'Open Reel video' })).toHaveAttribute('href', 'https://drive.google.com/r')
  })

  it('hides frame suggestions when the visual cannot take a frame note', () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} onSuggestAt={null} />)
    expect(screen.queryByRole('button', { name: /Suggest a change to frame/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"`
Expected: FAIL, cannot resolve `./MediaArea`.

- [ ] **Step 3: Implement**

`FrameGrid.tsx`:

```tsx
'use client'

import styles from './piece-page.module.css'

// Spec 4.2: the frame strip under a video is a 4-across grid (no horizontal scroll, one-line
// labels). While On-screen text is open it collapses to one line, because that tab shows every
// frame beside its text.
export default function FrameGrid({ title, frames, collapsed, onSuggest, onImageError }: {
  title: string
  frames: Array<{ label: string; url: string }>
  collapsed: boolean
  onSuggest: ((index: number) => void) | null
  onImageError?: () => void
}) {
  if (frames.length === 0) return null
  if (collapsed) {
    return <p className={styles.fcollapsed}>
      <span><strong>{frames.length} frames</strong>, each shown beside its text in On-screen text</span>
    </p>
  }
  return <section aria-label={`${title}: frames`}>
    <div className={styles.stripHead}>
      <span className={styles.label}>Frames</span>
      <span className={styles.meta}>{frames.length} frames</span>
    </div>
    <ol className={styles.fgrid}>
      {frames.map((frame, index) => <li key={`${index}-${frame.url}`} className={styles.fg}>
        {/* Signed, expiring storage links: next/image would cache and re-host them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.thumb} src={frame.url} alt={`Frame ${index + 1}`} loading="lazy" onError={onImageError} />
        <div className={styles.fgN}>{index + 1} · {frame.label}</div>
        {onSuggest && <button type="button" className={styles.link} aria-label={`Suggest a change to frame ${index + 1}`}
          onClick={() => onSuggest(index)}>Suggest a change</button>}
      </li>)}
    </ol>
  </section>
}
```

`PageViewer.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useSwipe } from './hooks'
import styles from './piece-page.module.css'

// Spec 4.2: carousels, singles and LinkedIn PDFs page through in the media column. Arrows, swipe,
// keyboard, a counter, thumbnails, and tap to enlarge. The page index is lifted so the PDF text tab
// can follow the page she is looking at.
export default function PageViewer({ title, pages, page, onPageChange, onSuggest, onImageError }: {
  title: string
  pages: Array<{ label: string; url: string }>
  page: number
  onPageChange: (page: number) => void
  onSuggest: ((index: number) => void) | null
  onImageError?: () => void
}) {
  const [enlarged, setEnlarged] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const swiped = useRef(false)
  const total = pages.length
  const go = (next: number) => onPageChange(Math.min(total - 1, Math.max(0, next)))
  const swipe = useSwipe(() => { swiped.current = true; go(page + 1) }, () => { swiped.current = true; go(page - 1) })

  useEffect(() => {
    if (enlarged && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [enlarged])

  const current = pages[page]
  if (!current) return null
  return <section aria-label={`${title}: pages`}
    onKeyDown={(event) => {
      if (event.key === 'ArrowRight') go(page + 1)
      if (event.key === 'ArrowLeft') go(page - 1)
    }}>
    <div className={styles.pager}>
      <button type="button" className={styles.pagerButton} aria-label={`Enlarge page ${page + 1} of ${total}`} {...swipe}
        onClick={() => {
          if (swiped.current) { swiped.current = false; return }
          setEnlarged(true)
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.pagerImage} src={current.url} alt={current.label} onError={onImageError} />
      </button>
    </div>
    <div className={styles.pagerNav}>
      <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Previous page"
        disabled={page === 0} onClick={() => go(page - 1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" fill="none" strokeWidth="1.6" /></svg>
      </button>
      <span className={styles.count} aria-live="polite">{page + 1} / {total}</span>
      <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Next page"
        disabled={page === total - 1} onClick={() => go(page + 1)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" fill="none" strokeWidth="1.6" /></svg>
      </button>
    </div>
    <div className={styles.underMedia}>
      {onSuggest && <button type="button" className={`${styles.link} ${styles.linkSmall}`} onClick={() => onSuggest(page)}>
        Suggest a change to page {page + 1}
      </button>}
      <span className={styles.meta}>Tap the page to enlarge</span>
    </div>
    <ol className={styles.pthumbs} aria-label="All pages">
      {pages.map((item, index) => <li key={`${index}-${item.url}`}>
        <button type="button" className={styles.pthumb} aria-label={`Page ${index + 1}`}
          aria-current={index === page ? 'true' : undefined} onClick={() => go(index)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" loading="lazy" />
        </button>
      </li>)}
    </ol>
    {enlarged && <dialog ref={dialogRef} className={styles.enlarge} aria-label={`Page ${page + 1} of ${total}`}
      onClose={() => setEnlarged(false)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.url} alt={current.label} />
      <div className={styles.underMedia}>
        <span className={styles.count}>{page + 1} / {total}</span>
        <button type="button" className={styles.ghostButton} autoFocus onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
    </dialog>}
  </section>
}
```

`MediaArea.tsx`:

```tsx
'use client'

import { Button } from '@thedot/design-system'
import type { PieceLayout } from '@/lib/portal/piece-page/copy-tabs'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { useSignedPreview } from '@/components/portal/useSignedPreview'
import FrameGrid from './FrameGrid'
import PageViewer from './PageViewer'
import styles from './piece-page.module.css'

// The format-adaptive media area (spec 4.2). Previews are portal-hosted signed links (plan 2);
// without a preview the Drive buttons stay, exactly as today (spec 7 fallback).
export default function MediaArea(props: {
  layout: PieceLayout
  title: string
  preview: SignedReviewPreview | null
  refreshUrl: string | null
  fallbackMedia: Array<{ label: string; url: string }>
  episodeDriveUrl: string | null
  mediaPending: boolean
  framesCollapsed: boolean
  page: number
  onPageChange: (page: number) => void
  onSuggestWhole: (() => void) | null
  onSuggestAt: ((index: number) => void) | null
}) {
  const { preview, refresh } = useSignedPreview(props.preview, props.refreshUrl)

  if (props.mediaPending) {
    return <div className={styles.phMedia}>
      <p>{props.layout === 'pages' ? 'Pages coming. You can review the text now.' : 'Video coming. You can review the text now.'}</p>
    </div>
  }

  if (preview && preview.mediaKind === 'pages') {
    return <PageViewer title={props.title} pages={preview.frames} page={props.page} onPageChange={props.onPageChange}
      onSuggest={props.onSuggestAt} onImageError={refresh} />
  }

  if (preview && preview.videoUrl) {
    const horizontal = preview.width > preview.height
    return <div>
      <video className={`${styles.player} ${horizontal ? styles.playerH : styles.playerV}`} src={preview.videoUrl}
        poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata"
        aria-label={`${props.title}: ${horizontal ? 'trailer' : 'video'}`} onError={refresh} />
      {horizontal && <p className={styles.mediaNote}>This is the trailer. The full episode stays on Drive.</p>}
      <div className={styles.underMedia}>
        {props.onSuggestWhole && <button type="button" className={`${styles.link} ${styles.linkSmall}`} onClick={props.onSuggestWhole}>
          {horizontal ? 'Suggest a change to the video' : 'Suggest a change to the whole video'}
        </button>}
        {horizontal && props.episodeDriveUrl && <a className={`${styles.link} ${styles.linkSmall}`} href={props.episodeDriveUrl}
          target="_blank" rel="noreferrer">Open the full episode in Drive</a>}
      </div>
      <FrameGrid title={props.title} frames={preview.frames} collapsed={props.framesCollapsed}
        onSuggest={props.onSuggestAt} onImageError={refresh} />
    </div>
  }

  if (props.fallbackMedia.length > 0) {
    return <div className={styles.fallback}>
      <p className={styles.mediaNote}>{props.layout === 'pages' ? 'Open the pages to review them.' : 'Open the video to watch it.'}</p>
      {props.fallbackMedia.map((media) => <Button key={media.url} as="a" href={media.url} target="_blank" rel="noreferrer"
        variant="ghost" size="sm">Open {media.label}</Button>)}
      {props.onSuggestWhole && <button type="button" className={styles.link} onClick={props.onSuggestWhole}>Suggest a change</button>}
    </div>
  }

  return null
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/FrameGrid.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PageViewer.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Play reels and trailers inline and page through PDFs on the piece page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21a: The review video reports a failed play, with Retry (amended 2026-10-03)

**Files:**
- Modify: `src/components/portal/useSignedPreview.ts`
- Modify: `src/components/portal/useSignedPreview.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx`

Behaviour: on a load error the player first asks for fresh signed links once (they expire after ten minutes), exactly as today. If the video still fails, or it waits more than 15 seconds after she pressed play, the player reports it once per page load (error code, or `link_expired` when the links had expired) and replaces the video with: "This video didn't load. I've been notified." and a **Retry** button. Retry always fetches fresh signed links and brings the video back. If the report itself failed, or the page is the admin preview, the message is only "This video didn't load." so it never claims a notice that did not happen. Frames and pages keep today's silent link refresh. Plan 2's `ReviewPreviewMedia` is not mounted on any client page and is left as is.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/portal/useSignedPreview.test.tsx`, inside `describe('useSignedPreview', ...)`:

```tsx
  it('reports whether new links arrived, and forceRefresh always asks again', async () => {
    const fresh = { ...PREVIEW, videoUrl: 'https://signed.example/v.mp4?t=3', expiresAt: '2026-10-03T12:30:00.000Z' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preview: fresh }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSignedPreview(PREVIEW, '/api/client/kanset/review-previews/p1'))
    let first = false
    let second = true
    // Two automatic refreshes for the same set of links fetch once; Retry fetches again.
    await act(async () => { first = await result.current.refresh(); second = await result.current.refresh() })
    await act(async () => { await result.current.forceRefresh() })
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
```

Create `src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { STALL_TIMEOUT_MS } from '@/lib/portal/piece-page/playback-failure'
import ReviewVideoPlayer from './ReviewVideoPlayer'

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'i', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 24, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [], expiresAt: '2999-01-01T00:00:00.000Z',
}

function setup(overrides: Partial<Parameters<typeof ReviewVideoPlayer>[0]> = {}) {
  const props = {
    preview, label: 'Reel: video', className: 'player',
    refresh: vi.fn(async () => false), forceRefresh: vi.fn(async () => true),
    report: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
  render(<ReviewVideoPlayer {...props} />)
  return props
}

function failVideo(code: number) {
  const video = screen.getByLabelText('Reel: video')
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  fireEvent.error(video)
}

afterEach(() => vi.useRealTimers())

describe('ReviewVideoPlayer', () => {
  it('tries one silent link refresh before calling anything a failure', async () => {
    const props = setup({ refresh: vi.fn(async () => true) })
    failVideo(2)
    await act(async () => {})
    expect(props.refresh).toHaveBeenCalledTimes(1)
    expect(props.report).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Reel: video')).toHaveAttribute('playsinline')
  })

  it('reports a failed load and tells her I have been notified', async () => {
    const props = setup()
    failVideo(2)
    expect(await screen.findByRole('alert')).toHaveTextContent("This video didn't load. I've been notified.")
    expect(props.report).toHaveBeenCalledWith({ contentVersion: 2, previewKey: 'reel', errorCode: 'media_err_network' })
  })

  it('names an expired signed link', async () => {
    const props = setup({ preview: { ...preview, expiresAt: '2000-01-01T00:00:00.000Z' } })
    failVideo(4)
    await screen.findByRole('alert')
    expect(props.report).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'link_expired' }))
  })

  it('treats a long wait after play as a failure, and a resumed play as fine', async () => {
    vi.useFakeTimers()
    const props = setup()
    const video = screen.getByLabelText('Reel: video')
    fireEvent.play(video)
    fireEvent.waiting(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS - 1) })
    fireEvent.playing(video)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS) })
    expect(props.report).not.toHaveBeenCalled()
    fireEvent.waiting(video)
    await act(async () => { vi.advanceTimersByTime(STALL_TIMEOUT_MS) })
    vi.useRealTimers()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(props.report).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'stalled' }))
  })

  it('does not wait for a stall before she presses play', () => {
    vi.useFakeTimers()
    const props = setup()
    fireEvent.stalled(screen.getByLabelText('Reel: video'))
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2) })
    expect(props.report).not.toHaveBeenCalled()
  })

  it('only says the video did not load when the report failed or there is no report', async () => {
    setup({ report: vi.fn(async () => ({ ok: false })) })
    failVideo(3)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This video didn't load.")
    expect(alert).not.toHaveTextContent('notified')
  })

  it('does not report from the admin preview', async () => {
    setup({ report: null })
    failVideo(3)
    expect(await screen.findByRole('alert')).not.toHaveTextContent('notified')
  })

  it('Retry fetches fresh links and brings the video back, reporting at most once per page load', async () => {
    const props = setup()
    failVideo(2)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Reel: video')).toBeInTheDocument()
    expect(props.forceRefresh).toHaveBeenCalledTimes(1)
    failVideo(2)
    expect(await screen.findByRole('alert')).toHaveTextContent("I've been notified.")
    expect(props.report).toHaveBeenCalledTimes(1)
  })
})
```

In `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx`, after the line `import { stubDialogs } from './test-utils'` add:

```tsx
import { reportReviewPlaybackFailure } from '@/app/client/[slug]/playback-actions'

vi.mock('@/app/client/[slug]/playback-actions', () => ({
  reportReviewPlaybackFailure: vi.fn(async () => ({ ok: true })),
}))
```

and append at the end of the file:

```tsx
describe('MediaArea playback failures (amended 2026-10-03)', () => {
  it('reports a failed play for the client and shows Retry', async () => {
    render(<MediaArea {...base} layout="vertical" preview={reel} playbackReport={{ slug: 'kanset', contentId: 'piece' }} />)
    const video = screen.getByLabelText('Foreign worker cost: video')
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    fireEvent.error(video)
    expect(await screen.findByRole('alert')).toHaveTextContent("This video didn't load. I've been notified.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(reportReviewPlaybackFailure).toHaveBeenCalledWith({
      slug: 'kanset', contentId: 'piece', contentVersion: 2, previewKey: 'reel', errorCode: 'media_err_network',
    })
  })

  it('reports nothing without a report target (the admin preview)', async () => {
    vi.mocked(reportReviewPlaybackFailure).mockClear()
    render(<MediaArea {...base} layout="vertical" preview={reel} />)
    const video = screen.getByLabelText('Foreign worker cost: video')
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    fireEvent.error(video)
    expect(await screen.findByRole('alert')).toHaveTextContent("This video didn't load.")
    expect(reportReviewPlaybackFailure).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/components/portal/useSignedPreview.test.tsx "src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"`
Expected: FAIL: `refresh()` returns `undefined` and `forceRefresh` is not a function; `./ReviewVideoPlayer` cannot be resolved; the two new MediaArea tests find no alert.

- [ ] **Step 3: `useSignedPreview` returns whether links arrived, and gains `forceRefresh`**

In `src/components/portal/useSignedPreview.ts`, replace:

```ts
  const refresh = useCallback(async () => {
    if (!refreshUrl || !preview || refreshedFor.current === preview.expiresAt) return
    refreshedFor.current = preview.expiresAt
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (body.preview) setPreview(body.preview)
    } catch {
      // Keep the current links.
    }
  }, [preview, refreshUrl])

  return { preview, refresh }
```

with:

```ts
  const load = useCallback(async (force: boolean): Promise<boolean> => {
    if (!refreshUrl || !preview) return false
    if (!force && refreshedFor.current === preview.expiresAt) return false
    refreshedFor.current = preview.expiresAt
    try {
      const response = await fetch(refreshUrl, { cache: 'no-store' })
      if (!response.ok) return false
      const body = (await response.json()) as { preview?: SignedReviewPreview }
      if (!body.preview) return false
      setPreview(body.preview)
      return true
    } catch {
      return false // Keep the current links.
    }
  }, [preview, refreshUrl])

  // refresh: automatic, at most once per set of links. forceRefresh: the Retry button after a failed
  // play (amended 2026-10-03), which always asks for fresh links. Both say whether new links arrived.
  const refresh = useCallback(() => load(false), [load])
  const forceRefresh = useCallback(() => load(true), [load])

  return { preview, refresh, forceRefresh }
```

Existing callers keep working: `onError={refresh}` and `onImageError={refresh}` ignore the returned promise.

- [ ] **Step 4: The player**

Create `src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { mediaErrorCode, STALL_TIMEOUT_MS, type PlaybackErrorCode } from '@/lib/portal/piece-page/playback-failure'
import styles from './piece-page.module.css'

export type PlaybackReport = (input: {
  contentVersion: number
  previewKey: string
  errorCode: PlaybackErrorCode
}) => Promise<{ ok: boolean }>

// The inline review video (spec 4.2) with failure reporting (amended 2026-10-03). A load error first
// gets one silent link refresh, because signed links expire after ten minutes. If the video still
// fails, or waits 15 seconds after she pressed play, the player reports it once per page load and
// shows a plain message with Retry, which always fetches fresh links. It never says "notified"
// unless the report was accepted.
export default function ReviewVideoPlayer({ preview, label, className, refresh, forceRefresh, report }: {
  preview: SignedReviewPreview
  label: string
  className: string
  refresh: () => Promise<boolean>
  forceRefresh: () => Promise<boolean>
  report: PlaybackReport | null
}) {
  const [failure, setFailure] = useState<{ notified: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const silentRefreshUsed = useRef(false)
  const reportedOk = useRef<boolean | null>(null)
  const playRequested = useRef(false)
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearStall() {
    if (stallTimer.current) clearTimeout(stallTimer.current)
    stallTimer.current = null
  }
  useEffect(() => clearStall, [])

  async function fail(code: PlaybackErrorCode) {
    clearStall()
    if (report && reportedOk.current === null) {
      try {
        reportedOk.current = (await report({
          contentVersion: preview.contentVersion, previewKey: preview.previewKey, errorCode: code,
        })).ok
      } catch {
        reportedOk.current = false
      }
    }
    setFailure({ notified: reportedOk.current === true })
  }

  async function onError(event: SyntheticEvent<HTMLVideoElement>) {
    // Read the code before awaiting: React clears currentTarget once the handler returns.
    const code = mediaErrorCode(event.currentTarget.error?.code)
    const expired = Date.now() >= Date.parse(preview.expiresAt)
    if (!silentRefreshUsed.current) {
      silentRefreshUsed.current = true
      if (await refresh()) return
    }
    await fail(expired ? 'link_expired' : code)
  }

  function armStall() {
    if (!playRequested.current || stallTimer.current) return
    stallTimer.current = setTimeout(() => {
      stallTimer.current = null
      void fail('stalled')
    }, STALL_TIMEOUT_MS)
  }

  async function retry() {
    await forceRefresh()
    silentRefreshUsed.current = false
    playRequested.current = false
    setFailure(null)
    setAttempt((value) => value + 1)
  }

  if (failure) {
    return <div className={styles.phMedia} role="alert">
      <p>{failure.notified ? "This video didn't load. I've been notified." : "This video didn't load."}</p>
      <button type="button" className={styles.ghostButton} onClick={() => void retry()}>Retry</button>
    </div>
  }
  return <video key={attempt} className={className} src={preview.videoUrl ?? undefined}
    poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata" aria-label={label}
    onError={(event) => void onError(event)} onPlay={() => { playRequested.current = true }}
    onWaiting={armStall} onStalled={armStall} onPlaying={clearStall} onTimeUpdate={clearStall} />
}
```

- [ ] **Step 5: Use it in `MediaArea`**

In `src/app/client/[slug]/piece/[contentId]/v2/MediaArea.tsx`:

1. After `import { useSignedPreview } from '@/components/portal/useSignedPreview'` add:

```tsx
import { reportReviewPlaybackFailure } from '../../../playback-actions'
import ReviewVideoPlayer, { type PlaybackReport } from './ReviewVideoPlayer'
```

2. In the props type, replace:

```tsx
  onSuggestAt: ((index: number) => void) | null
}) {
```

with:

```tsx
  onSuggestAt: ((index: number) => void) | null
  // Client mode only (amended 2026-10-03): report a failed play to the agency. Null in the admin preview.
  playbackReport?: { slug: string; contentId: string } | null
}) {
```

3. Replace:

```tsx
  const { preview, refresh } = useSignedPreview(props.preview, props.refreshUrl)
```

with:

```tsx
  const { preview, refresh, forceRefresh } = useSignedPreview(props.preview, props.refreshUrl)
  const target = props.playbackReport ?? null
  const report: PlaybackReport | null = target
    ? (input) => reportReviewPlaybackFailure({ slug: target.slug, contentId: target.contentId, ...input })
    : null
```

4. Replace:

```tsx
      <video className={`${styles.player} ${horizontal ? styles.playerH : styles.playerV}`} src={preview.videoUrl}
        poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata"
        aria-label={`${props.title}: ${horizontal ? 'trailer' : 'video'}`} onError={refresh} />
```

with:

```tsx
      <ReviewVideoPlayer preview={preview} className={`${styles.player} ${horizontal ? styles.playerH : styles.playerV}`}
        label={`${props.title}: ${horizontal ? 'trailer' : 'video'}`} refresh={refresh} forceRefresh={forceRefresh}
        report={report} />
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm exec vitest run src/components/portal/useSignedPreview.test.tsx src/components/portal/ReviewPreviewMedia.test.tsx "src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"`
Expected: PASS (hook 3, ReviewPreviewMedia unchanged, player 8, MediaArea 10).

- [ ] **Step 7: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/components/portal/useSignedPreview.ts src/components/portal/useSignedPreview.test.tsx "src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.tsx" "src/app/client/[slug]/piece/[contentId]/v2/ReviewVideoPlayer.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.tsx" "src/app/client/[slug]/piece/[contentId]/v2/MediaArea.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Tell Maria when a review video fails, report it, and offer Retry with fresh links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Copy switcher

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.test.tsx`

A WAI-ARIA tab list: roving tab index, Left/Right/Home/End, each tab's name says whether it is reviewed and how many unsent edits it holds; the tick is the `TickDot` from plan 1.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CopySwitcher, { tabDomId } from './CopySwitcher'

const tabs = [{ key: 'onscreen', label: 'On-screen text' }, { key: 'caption', label: 'Caption' }, { key: 'youtube', label: 'YouTube' }]

function subject(overrides: Partial<React.ComponentProps<typeof CopySwitcher>> = {}) {
  return <CopySwitcher idPrefix="piece" tabs={tabs} active="onscreen" onSelect={vi.fn()}
    ticked={new Set(['onscreen', 'caption'])} draftCounts={{ onscreen: 2 }} updated={new Set(['caption'])} {...overrides} />
}

describe('CopySwitcher', () => {
  it('is a tab list with one selected, focusable tab', () => {
    render(subject())
    expect(screen.getByRole('tablist', { name: 'Copy' })).toBeInTheDocument()
    const selected = screen.getByRole('tab', { selected: true })
    expect(selected).toHaveAccessibleName(/On-screen text/)
    expect(selected).toHaveAttribute('tabindex', '0')
    expect(selected).toHaveAttribute('aria-controls', 'piece-panel')
    expect(screen.getByRole('tab', { name: /YouTube/ })).toHaveAttribute('tabindex', '-1')
    expect(selected.id).toBe(tabDomId('piece', 'onscreen'))
  })

  it('says which tabs are reviewed, updated, and holding unsent edits', () => {
    render(subject())
    expect(screen.getByRole('tab', { name: /On-screen text.*2 unsent edits.*reviewed/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Caption.*updated.*reviewed/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /YouTube.*not reviewed yet/ })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-checked="true"]')).toHaveLength(2)
  })

  it('moves with the arrow keys, Home and End', () => {
    const onSelect = vi.fn()
    render(subject({ onSelect }))
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('caption')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('youtube')
    fireEvent.keyDown(list, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('youtube')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith('onscreen')
  })

  it('selects on click', () => {
    const onSelect = vi.fn()
    render(subject({ onSelect }))
    fireEvent.click(screen.getByRole('tab', { name: /YouTube/ }))
    expect(onSelect).toHaveBeenCalledWith('youtube')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.test.tsx"`
Expected: FAIL, cannot resolve `./CopySwitcher`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useRef, type KeyboardEvent } from 'react'
import { TickDot } from '@thedot/design-system'
import styles from './piece-page.module.css'

export function tabDomId(idPrefix: string, key: string): string {
  return `${idPrefix}-tab-${key.replace(/[^a-z0-9_-]/gi, '-')}`
}

// One text at a time (spec 4.3). A tab ticks once opened (the workspace records it); Approve
// stays off until every tab is ticked.
export default function CopySwitcher({ idPrefix, tabs, active, onSelect, ticked, draftCounts, updated }: {
  idPrefix: string
  tabs: Array<{ key: string; label: string }>
  active: string
  onSelect: (key: string) => void
  ticked: ReadonlySet<string>
  draftCounts: Record<string, number>
  updated: ReadonlySet<string>
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusAndSelect(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length]
    if (!tab) return
    onSelect(tab.key)
    refs.current[tab.key]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === active)
    if (event.key === 'ArrowRight') { event.preventDefault(); focusAndSelect(index + 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusAndSelect(index - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusAndSelect(0) }
    else if (event.key === 'End') { event.preventDefault(); focusAndSelect(tabs.length - 1) }
  }

  return <div className={styles.tabs} role="tablist" aria-label="Copy" onKeyDown={onKeyDown}>
    {tabs.map((tab) => {
      const selected = tab.key === active
      const count = draftCounts[tab.key] ?? 0
      const isTicked = ticked.has(tab.key)
      const isUpdated = updated.has(tab.key)
      return <button key={tab.key} ref={(element) => { refs.current[tab.key] = element }} type="button" role="tab"
        id={tabDomId(idPrefix, tab.key)} aria-selected={selected} aria-controls={`${idPrefix}-panel`}
        tabIndex={selected ? 0 : -1} className={styles.tab} onClick={() => onSelect(tab.key)}>
        {tab.label}
        {count > 0 && <span className={styles.cnt}>
          <span aria-hidden="true">{count}</span>
          <span className={styles.srOnly}>{count} unsent {count === 1 ? 'edit' : 'edits'}</span>
        </span>}
        {isUpdated && <><span className={styles.dotmark} aria-hidden="true" /><span className={styles.srOnly}>updated</span></>}
        <TickDot checked={isTicked} />
        <span className={styles.srOnly}>{isTicked ? 'reviewed' : 'not reviewed yet'}</span>
      </button>
    })}
  </div>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.test.tsx"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.tsx" "src/app/client/[slug]/piece/[contentId]/v2/CopySwitcher.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the copy switcher with ticks, unsent counts and updated dots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 23: Read views part 1 (changed passages, carried drafts, on-screen text, captions, PDF text)

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/ChangedMarkdown.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/CarriedDraftNotice.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/use-block-draft.ts`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/OnScreenTextPanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/CopyPanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/DocumentPanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx`

Each panel shows the released text, or her unsent draft of it with "Saved · not sent yet". Changed paragraphs (after her feedback) carry the soft highlighter. A draft written against the previous version (plan 3, decision 4) shows both texts with Keep my edit, Adjust and Discard.

- [ ] **Step 1: Write the failing tests**

`panels/panels-part1.test.tsx`:

```tsx
import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { renderInPage, stubDialogs } from '../test-utils'
import OnScreenTextPanel from './OnScreenTextPanel'
import CopyPanel from './CopyPanel'
import DocumentPanel from './DocumentPanel'

const SCRIPT = 'Three frames.\n\n**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION\n\n**3.** BOOK A CONSULTATION'
const onscreen: CopyTab = { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel, on screen', body: SCRIPT }] }
const frames = [1, 2, 3].map((n) => ({ label: `${n} s`, url: `https://signed.example/f${n}.jpg` }))
const caption: CopyTab = { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: 'First paragraph.\n\nSecond paragraph, edited.' }] }
const PDF = '**Page 1, cover**\n\nGUIDE\n\n**Page 2, the fee**\n\nPAID BEFORE HIRING.'
const pdf: CopyTab = { key: 'document', kind: 'document', label: 'PDF text', blocks: [{ key: 'linkedin-document-copy', label: 'LinkedIn PDF copy', body: PDF }] }

const writeText = vi.fn(async () => undefined)
beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

describe('OnScreenTextPanel', () => {
  it('lists every frame beside its thumbnail with Edit text and Suggest a change', () => {
    const onSuggestFrame = vi.fn()
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={onSuggestFrame} version={2} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Frame 2')).toBeInTheDocument()
    expect(rows[1].querySelector('img')).toHaveAttribute('src', 'https://signed.example/f2.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 2' }))
    expect(onSuggestFrame).toHaveBeenCalledWith(1)
  })

  it('edits one frame and marks it edited, not sent', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={null} version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    const field = screen.getByLabelText('Text')
    expect(field).toHaveValue('**2.** $1,000 PER POSITION')
    fireEvent.change(field, { target: { value: '**2.** $1,000 PER POSITION, PAID BY THE EMPLOYER' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByText('Edited, not sent')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Edited, not sent')).not.toBeInTheDocument()
    expect(screen.getByText('Saved · not sent yet')).toBeInTheDocument()
  })

  it('shows Editing is closed and no actions when editing is off', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit={false} onSuggestFrame={null} version={2} />)
    expect(screen.getByText('Editing is closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit text/ })).not.toBeInTheDocument()
  })

  it('shows a draft written against the previous version with Keep, Adjust and Discard', () => {
    const carried: ServerDraftRow = {
      id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 1, target_kind: 'copy_block',
      target_key: 'reel-script', anchor: '', anchor_label: null, target_label: 'Reel, on screen', url_snapshot: null,
      quoted_text: null, body: 'An edit from version 1', status: 'unsent', saved_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z', carried_over_at: '2026-10-02T10:00:00.000Z', carried_over_to_version: 2,
      send_failed_at: null, last_send_error: null,
    }
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={null} version={2} />,
      { serverDrafts: [carried] })
    const notice = screen.getByRole('region', { name: 'Edit written against version 1' })
    expect(within(notice).getByText('An edit from version 1')).toBeInTheDocument()
    expect(within(notice).getByRole('button', { name: 'Adjust' })).toBeInTheDocument()
    fireEvent.click(within(notice).getByRole('button', { name: 'Discard' }))
    expect(within(notice).getByText('Discard this edit? It cannot be recovered.')).toBeInTheDocument()
    fireEvent.click(within(notice).getByRole('button', { name: 'Keep it' }))
    fireEvent.click(within(notice).getByRole('button', { name: 'Keep my edit' }))
    expect(screen.queryByRole('region', { name: 'Edit written against version 1' })).not.toBeInTheDocument()
  })
})

describe('CopyPanel', () => {
  it('highlights the paragraphs that changed after her feedback', () => {
    renderInPage(<CopyPanel tab={caption} before={{ 'social-caption': 'First paragraph.\n\nSecond paragraph.' }} canEdit version={2} />)
    const changed = document.querySelectorAll('[data-changed="true"]')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toHaveTextContent('Second paragraph, edited.')
  })

  it('edits the whole caption and copies the plain text', async () => {
    renderInPage(<CopyPanel tab={caption} before={{}} canEdit version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    await act(async () => {})
    expect(writeText).toHaveBeenCalledWith('First paragraph.\n\nSecond paragraph, edited.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Caption' }))
    expect(screen.getByLabelText('Text')).toHaveValue('First paragraph.\n\nSecond paragraph, edited.')
  })
})

describe('DocumentPanel', () => {
  it('lists the text page by page, follows the page in view and jumps to a page', () => {
    const onPageChange = vi.fn()
    renderInPage(<DocumentPanel tab={pdf} page={1} onPageChange={onPageChange} pageThumbs={[]} before={{}} canEdit version={2} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show page 1' }))
    expect(onPageChange).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Page 2' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**Page 2, the fee**\n\nPAID BEFORE HIRING.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx"`
Expected: FAIL, cannot resolve the panels.

- [ ] **Step 3: Implement**

`ChangedMarkdown.tsx`:

```tsx
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import { changedParagraphs, splitParagraphs } from '@/lib/portal/piece-page/changed-passages'
import styles from './piece-page.module.css'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

// Markdown rendered as text (never as asterisks), with the paragraphs that changed since the
// previous version lightly highlighted (spec 4.3). before=null means nothing to compare.
export default function ChangedMarkdown({ body, before, className }: { body: string; before: string | null; className?: string }) {
  const chunks = splitParagraphs(body)
  const flags = changedParagraphs(before, body)
  return <div className={className ?? styles.copy}>
    {chunks.map((chunk, index) => flags[index]
      ? <div key={index} className={styles.changed} data-changed="true">
        <span className={styles.srOnly}>Updated: </span>
        <MarkdownCopy body={chunk} style={INHERIT} />
      </div>
      : <MarkdownCopy key={index} body={chunk} style={INHERIT} />)}
  </div>
}
```

`CarriedDraftNotice.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@thedot/design-system'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import { draftIdentity } from '@/lib/portal/review-drafts-core'
import { useReviewDrafts, type ReviewDraft } from '../ReviewDraftProvider'
import styles from './piece-page.module.css'

// Spec 6.2 and plan 3 decision 4: a draft written against the previous version is never dropped.
// She keeps it (rebased onto this version), adjusts it, or discards it after a confirm step.
export default function CarriedDraftNotice({ draft, currentText, version, onAdjust }: {
  draft: ReviewDraft
  currentText: string
  version: number
  onAdjust?: () => void
}) {
  const { keepCarriedDraft, removeDraft } = useReviewDrafts()
  const [confirming, setConfirming] = useState(false)
  const where = draft.anchorLabel ? `${draft.label} · ${draft.anchorLabel}` : draft.label
  return <section className={styles.carryNotice} id={`carried-${draftIdentity(draft)}`}
    aria-label={`Edit written against version ${draft.carriedFromVersion}`}>
    <p>
      You have an edit on {where} written against the previous version. I released version {version} while it
      was unsent. Keep it, adjust it, or discard it.
    </p>
    <div className={styles.carry}>
      <div>
        <span className={styles.label}>New in version {version}</span>
        {draft.kind === 'copy_block'
          ? <MarkdownCopy body={currentText} />
          : <p className={styles.meta}>The updated visual is shown on this page.</p>}
      </div>
      <div>
        <span className={styles.label}>Your unsent edit, on version {draft.carriedFromVersion}</span>
        <MarkdownCopy body={draft.proposedText} />
      </div>
    </div>
    {confirming
      ? <div className={styles.blockActions}>
        <span>Discard this edit? It cannot be recovered.</span>
        <Button as="button" type="button" variant="black" size="sm" onClick={() => removeDraft(draft)}>Yes, discard</Button>
        <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
      </div>
      : <div className={styles.blockActions}>
        <Button as="button" type="button" variant="black" size="sm" onClick={() => keepCarriedDraft(draft)}>Keep my edit</Button>
        {onAdjust && <button type="button" className={styles.link}
          onClick={() => { keepCarriedDraft(draft); onAdjust() }}>Adjust</button>}
        <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>
      </div>}
  </section>
}
```

`panels/use-block-draft.ts`:

```ts
'use client'

import { useMemo } from 'react'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import { segmentBlock, type SegmentMode } from '@/lib/portal/piece-page/segments'
import { useReviewDrafts, type ReviewDraft, type ReviewTarget } from '../../ReviewDraftProvider'

// The released block, her current-version draft of it (if any), and a draft carried from an
// earlier version (if any). source is what the panel shows: her draft when she has one.
export function useBlockDraft(block: ReviewCopyBlock): {
  target: ReviewTarget
  draft: ReviewDraft | null
  carried: ReviewDraft | null
  source: string
} {
  const { readDraft, carriedDrafts } = useReviewDrafts()
  const target = useMemo<ReviewTarget>(() => ({
    kind: 'copy_block', key: block.key ?? '', label: block.label, currentText: block.body,
  }), [block])
  const found = block.key ? readDraft(target) : null
  const draft = found && found.carriedFromVersion == null ? found : null
  const carried = carriedDrafts.find((d) => d.kind === 'copy_block' && d.key === block.key && !d.anchor) ?? null
  return { target, draft, carried, source: draft?.proposedText ?? block.body }
}

// Which segments of her draft differ from the released text. When the draft changed the
// structure (a frame added or removed), every segment counts as edited.
export function editedSegments(base: string, source: string, mode: SegmentMode): boolean[] {
  const before = segmentBlock(base, mode).segments
  const after = segmentBlock(source, mode).segments
  if (base === source) return after.map(() => false)
  if (before.length !== after.length) return after.map(() => true)
  return after.map((segment, index) => segment.raw.replace(/\s+$/, '') !== before[index].raw.replace(/\s+$/, ''))
}
```

`panels/OnScreenTextPanel.tsx`:

```tsx
'use client'

import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

type Props = {
  tab: CopyTab
  frames: Array<{ label: string; url: string }>
  before: Record<string, string>
  canEdit: boolean
  onSuggestFrame: ((index: number) => void) | null
  version: number
}

// Spec 4.3: on-screen text frame by frame, each line beside its frame, with Edit text (binding copy
// edit, composed back into the one block) and Suggest a change (binding visual note on that frame).
export default function OnScreenTextPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <OnScreenBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function OnScreenBlock({ block, frames, before, canEdit, onSuggestFrame, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'frames')
  const baseSegments = segmentBlock(block.body, 'frames').segments
  const edited = editedSegments(block.body, source, 'frames')
  const total = segmented.segments.length
  const editable = canEdit && Boolean(block.key)
  const wholeSlot = `${block.key}:whole`
  const openWhole = () => open({
    kind: 'copy', slotId: wholeSlot, target, title: 'On-screen text', initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>On-screen text, frame by frame</span>
      {draft ? <span className={styles.saved}>Saved · not sent yet</span>
        : <span className={styles.meta}>What the video shows, word for word</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    {editable
      ? <p className={styles.hint}>Edit a frame to change the words on screen. To change how a frame looks, use Suggest a change beside it.</p>
      : <p className={styles.closed}>Editing is closed</p>}
    {total === 0
      ? <div>
        <EditSlot slotId={wholeSlot}>
          <ChangedMarkdown body={source} before={draft ? null : before[block.key ?? ''] ?? null} />
        </EditSlot>
        {editable && <div className={styles.blockActions}>
          <button type="button" className={styles.link} onClick={openWhole}>Edit text</button>
        </div>}
      </div>
      : <>
        {segmented.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={segmented.preamble} style={INHERIT} /></div>}
        <ol className={styles.frows}>
          {segmented.segments.map((segment, index) => {
            const frame = frames[segment.number - 1] ?? null
            return <li key={index} className={styles.frow}>
              {frame
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className={styles.ft} src={frame.url} alt="" loading="lazy" />
                : <span className={styles.ft} aria-hidden="true" />}
              <div>
                <div className={styles.fnum}>
                  <span>{segment.label}</span>
                  {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
                </div>
                <EditSlot slotId={`${block.key}:frame:${index}`}>
                  <div className={styles.frameText}><MarkdownCopy body={segmentText(segment)} style={INHERIT} /></div>
                </EditSlot>
              </div>
              <div className={styles.ractions}>
                {editable && <button type="button" className={styles.link} aria-label={`Edit text, ${segment.label}`}
                  onClick={() => open({
                    kind: 'copy', slotId: `${block.key}:frame:${index}`, target,
                    title: `${segment.label} of ${total} · On-screen text`, thumbUrl: frame?.url ?? null,
                    initialText: segmentText(segment),
                    baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
                    compose: (text) => replaceSegment(source, 'frames', index, text),
                  })}>Edit text</button>}
                {canEdit && onSuggestFrame && <button type="button" className={`${styles.link} ${styles.linkGrey}`}
                  aria-label={`Suggest a change to ${segment.label.toLowerCase()}`}
                  onClick={() => onSuggestFrame(segment.number - 1)}>Suggest a change</button>}
              </div>
            </li>
          })}
        </ol>
      </>}
  </div>
}
```

`panels/CopyPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

type Props = { tab: CopyTab; before: Record<string, string>; canEdit: boolean; version: number }

// Captions, LinkedIn post and first comment, and any other block: shown as text, edited whole.
export default function CopyPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <CopyBlockView key={block.key ?? index} block={block} {...props} />)}</>
}

function CopyBlockView({ block, tab, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const label = tab.blocks.length > 1 ? block.label : tab.label
  const slotId = `${block.key}:whole`
  const openEditor = () => open({
    kind: 'copy', slotId, target, title: label, initialText: source, baseText: block.body, compose: (text) => text,
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainTextFromMarkdown(block.body))
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>{label}</span>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openEditor} />}
    <EditSlot slotId={slotId}>
      <ChangedMarkdown body={source} before={draft ? null : before[block.key ?? ''] ?? null} />
    </EditSlot>
    <div className={styles.blockActions}>
      {canEdit && block.key && <button type="button" className={styles.link} aria-label={`Edit ${label}`} onClick={openEditor}>Edit</button>}
      <button type="button" className={`${styles.link} ${styles.linkGrey}`} onClick={copy}>Copy text</button>
      <span className={styles.srOnly} role="status">{copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : ''}</span>
    </div>
  </div>
}
```

`panels/DocumentPanel.tsx`:

```tsx
'use client'

import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

type Props = {
  tab: CopyTab
  page: number
  onPageChange: (page: number) => void
  pageThumbs: Array<{ label: string; url: string }>
  before: Record<string, string>
  canEdit: boolean
  version: number
}

// PDF and carousel text, page by page, following the page shown in the viewer (spec 4.2, 4.3).
export default function DocumentPanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <DocumentBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function DocumentBlock({ block, tab, page, onPageChange, pageThumbs, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'pages')
  const baseSegments = segmentBlock(block.body, 'pages').segments
  const edited = editedSegments(block.body, source, 'pages')
  const editable = canEdit && Boolean(block.key)
  const wholeSlot = `${block.key}:whole`
  const openWhole = () => open({
    kind: 'copy', slotId: wholeSlot, target, title: tab.label, initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>{tab.label}, page by page</span>
      {draft ? <span className={styles.saved}>Saved · not sent yet</span>
        : pageThumbs.length > 0 && <span className={styles.meta}>Synced to the page you are viewing</span>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    {segmented.segments.length === 0
      ? <div>
        <EditSlot slotId={wholeSlot}>
          <ChangedMarkdown body={source} before={draft ? null : before[block.key ?? ''] ?? null} />
        </EditSlot>
        {editable && <div className={styles.blockActions}><button type="button" className={styles.link} onClick={openWhole}>Edit text</button></div>}
      </div>
      : <>
        {segmented.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={segmented.preamble} style={INHERIT} /></div>}
        <ol className={styles.ptext}>
          {segmented.segments.map((segment, index) => {
            const pageIndex = segment.number - 1
            const thumb = pageThumbs[pageIndex] ?? null
            return <li key={index} aria-current={pageIndex === page ? 'true' : undefined}>
              <button type="button" className={styles.pthumb} aria-label={`Show page ${segment.number}`} onClick={() => onPageChange(pageIndex)}>
                {thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumb.url} alt="" loading="lazy" />
                  : <span className={styles.pn}>{segment.label}</span>}
              </button>
              <div>
                <div className={styles.fnum}>
                  <span>{segment.label}</span>
                  {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
                </div>
                <EditSlot slotId={`${block.key}:page:${index}`}>
                  <div className={styles.frameText}><MarkdownCopy body={segmentText(segment)} style={INHERIT} /></div>
                </EditSlot>
              </div>
              <div className={styles.ractions}>
                {editable && <button type="button" className={styles.link} aria-label={`Edit text, ${segment.label}`}
                  onClick={() => open({
                    kind: 'copy', slotId: `${block.key}:page:${index}`, target,
                    title: `${segment.label} of ${segmented.segments.length} · ${tab.label}`,
                    thumbUrl: thumb?.url ?? null, initialText: segmentText(segment),
                    baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
                    compose: (text) => replaceSegment(source, 'pages', index, text),
                  })}>Edit text</button>}
              </div>
            </li>
          })}
        </ol>
      </>}
  </div>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx"`
Expected: PASS, 8 tests. The carried-draft test runs the provider in plan 3's server mode, because the browser-only mode loads only the current version's drafts.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/ChangedMarkdown.tsx" "src/app/client/[slug]/piece/[contentId]/v2/CarriedDraftNotice.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/use-block-draft.ts" "src/app/client/[slug]/piece/[contentId]/v2/panels/OnScreenTextPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/CopyPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/DocumentPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Show on-screen text frame by frame, captions and PDF text page by page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Read views part 2 (YouTube, chapters, article, search and sharing, cover image)

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/YouTubePanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/ChaptersPanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/ArticlePanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/SearchSharingPanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/CoverImagePanel.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx`

Label lines (`**Title:**`) render as field labels, never as text (spec 5). In 4a, Edit opens the whole block in the sheet; 4b replaces that with field-by-field and section-by-section editing.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { renderInPage, stubDialogs } from '../test-utils'
import YouTubePanel from './YouTubePanel'
import ChaptersPanel from './ChaptersPanel'
import ArticlePanel from './ArticlePanel'
import SearchSharingPanel from './SearchSharingPanel'
import CoverImagePanel from './CoverImagePanel'

const PACKAGE = '**Title:** What does a permit cost?\n\n**Description:**\nThree things to know.\n\n**Tags:** LMIA, LMIA cost, foreign worker'
const youtube: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [{ key: 'youtube-package', label: 'YouTube Short package', body: PACKAGE }] }
const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?'
const episode: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [
  { key: 'youtube-title', label: 'YouTube title', body: 'How to Choose an Immigration Consultant' },
  { key: 'youtube-description', label: 'YouTube description', body: DESCRIPTION },
  { key: 'youtube-tags', label: 'YouTube tags', body: 'canada immigration, RCIC' },
] }
const chapters: CopyTab = { key: 'chapters', kind: 'chapters', label: 'Chapters', blocks: [episode.blocks[1]] }
const ARTICLE = '# How to Choose a Representative\n\nOpening paragraph.\n\n### Start with the one thing you can check\n\nSection body.'
const article: CopyTab = { key: 'article', kind: 'article', label: 'Article', blocks: [{ key: 'article-body', label: 'Article', body: ARTICLE }] }
const SEO = '- **SEO title:** How to Choose a Representative in Canada\n- **Slug:** `/news/how-to-choose`\n- **Meta description:** A license tells you who may help you.\n- **Category:** News'
const seo: CopyTab = { key: 'seo', kind: 'seo', label: 'Search & sharing', blocks: [{ key: 'article-seo', label: 'SEO and publishing details', body: SEO }] }

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('YouTubePanel', () => {
  it('shows Title, Description and Tags as fields, never the label markup', () => {
    renderInPage(<YouTubePanel tab={youtube} before={{}} canEdit version={2} />)
    expect(screen.getByText('What does a permit cost?')).toBeInTheDocument()
    expect(screen.getByText('Three things to know.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['LMIA', 'LMIA cost', 'foreign worker'])
    expect(document.body.textContent).not.toContain('**Title')
    fireEvent.click(screen.getByRole('button', { name: 'Edit YouTube Short package' }))
    expect(screen.getByLabelText('Text')).toHaveValue(PACKAGE)
  })

  it('shows separate episode blocks as the same three fields', () => {
    renderInPage(<YouTubePanel tab={episode} before={{}} canEdit={false} version={2} />)
    expect(screen.getByText('How to Choose an Immigration Consultant')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['canada immigration', 'RCIC'])
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
  })
})

describe('ChaptersPanel', () => {
  it('lists chapter times and titles from the description', () => {
    renderInPage(<ChaptersPanel tab={chapters} canEdit version={2} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]).getByText('01:31')).toBeInTheDocument()
    expect(within(items[1]).getByText('Should a client bring questions?')).toBeInTheDocument()
  })
})

describe('ArticlePanel', () => {
  it('reads like the article with the headline, the opening and each section editable', () => {
    renderInPage(<ArticlePanel tab={article} coverUrl={null} before={{}} canEdit version={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'How to Choose a Representative' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Start with the one thing you can check' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('###')
    fireEvent.click(screen.getByRole('button', { name: 'Edit section, Start with the one thing you can check' }))
    expect(screen.getByLabelText('Text')).toHaveValue('### Start with the one thing you can check\n\nSection body.')
  })
})

describe('SearchSharingPanel', () => {
  it('previews the search result and counts the search fields', () => {
    renderInPage(<SearchSharingPanel tab={seo} canEdit version={2} />)
    const serp = screen.getByRole('group', { name: 'How it looks in Google' })
    expect(serp).toHaveTextContent('kanset.com/news/how-to-choose')
    expect(serp).toHaveTextContent('How to Choose a Representative in Canada')
    expect(screen.getByText('40 of 60 characters')).toBeInTheDocument()
    expect(screen.getByText('Web address')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
  })
})

describe('CoverImagePanel', () => {
  it('shows the cover, opens it in Drive and takes a visual note', () => {
    const onSuggest = vi.fn()
    renderInPage(<CoverImagePanel cover={{ label: 'Website cover', url: 'https://drive.google.com/c', previewUrl: 'https://signed.example/c.jpg', width: 1500, height: 1000 }} onSuggest={onSuggest} />)
    expect(screen.getByRole('img', { name: 'Website cover' })).toHaveAttribute('src', 'https://signed.example/c.jpg')
    expect(screen.getByRole('link', { name: 'Open the cover in Drive' })).toHaveAttribute('href', 'https://drive.google.com/c')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
    expect(onSuggest).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx"`
Expected: FAIL, cannot resolve the panels.

- [ ] **Step 3: Implement**

`panels/YouTubePanel.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { parseTags, parseYouTubePackage } from '@/lib/portal/piece-page/youtube-fields'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

type Props = { tab: CopyTab; before: Record<string, string>; canEdit: boolean; version: number }

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.field}>
    <span className={`${styles.label} ${styles.fieldLabel}`}>{label}</span>
    {children}
  </div>
}

export function Chips({ tags }: { tags: string[] }) {
  return <ul className={styles.chips} aria-label="Tags">{tags.map((tag) => <li key={tag} className={styles.chip}>{tag}</li>)}</ul>
}

// Spec 5: YouTube as Title, Description, Tags. One package block or three separate blocks.
export default function YouTubePanel(props: Props) {
  return <>{props.tab.blocks.map((block, index) => <YouTubeBlock key={block.key ?? index} block={block} {...props} />)}</>
}

function YouTubeBlock({ block, before, canEdit, version }: Props & { block: ReviewCopyBlock }) {
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const slotId = `${block.key}:whole`
  const openEditor = () => open({
    kind: 'copy', slotId, target, title: block.label, initialText: source, baseText: block.body, compose: (text) => text,
  })
  const previous = draft ? null : before[block.key ?? ''] ?? null

  let content: ReactNode
  if (block.key === 'youtube-title') {
    content = <Field label="Title"><p className={`${styles.fieldValue} ${styles.fieldTitle}`}>{source}</p></Field>
  } else if (block.key === 'youtube-tags') {
    content = <Field label="Tags"><Chips tags={parseTags(source)} /></Field>
  } else if (block.key === 'youtube-description') {
    content = <Field label="Description"><ChangedMarkdown body={source} before={previous} className={styles.fieldValue} /></Field>
  } else {
    const pkg = parseYouTubePackage(source)
    content = pkg === null
      ? <ChangedMarkdown body={source} before={previous} />
      : <>
        {pkg.preamble.trim() && <div className={styles.preamble}><MarkdownCopy body={pkg.preamble} /></div>}
        {pkg.fields.map((field) => field.name === 'title'
          ? <Field key="title" label="Title"><p className={`${styles.fieldValue} ${styles.fieldTitle}`}>{field.value}</p></Field>
          : field.name === 'tags'
            ? <Field key="tags" label="Tags"><Chips tags={parseTags(field.value)} /></Field>
            : <Field key="description" label="Description"><ChangedMarkdown body={field.value} before={null} className={styles.fieldValue} /></Field>)}
        {pkg.rest.trim() && <div className={styles.preamble}><MarkdownCopy body={pkg.rest} /></div>}
      </>
  }

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>{block.label}</span>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label={`Edit ${block.label}`} onClick={openEditor}>Edit</button>}
    </div>
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openEditor} />}
    <EditSlot slotId={slotId}>{content}</EditSlot>
  </div>
}
```

`panels/ChaptersPanel.tsx`:

```tsx
'use client'

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { findChapters, parseYouTubePackage, youTubeFieldValue } from '@/lib/portal/piece-page/youtube-fields'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { useBlockDraft } from './use-block-draft'

// Episode chapters, read from the YouTube description (spec 4.3, episode tabs).
export default function ChaptersPanel({ tab, canEdit }: { tab: CopyTab; canEdit: boolean; version: number }) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, source } = useBlockDraft(block)
  const pkg = block.key === 'youtube-description' ? null : parseYouTubePackage(source)
  const description = block.key === 'youtube-description' ? source : pkg ? youTubeFieldValue(pkg, 'description') : null
  const chapters = description ? findChapters(description) : null

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>Chapters</span>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label="Edit chapters"
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:chapters`, target, title: `${block.label}, chapters`, initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
    </div>
    <p className={styles.hint}>These show under the episode on YouTube. Edit a title or a time and I will match it to the cut.</p>
    <EditSlot slotId={`${block.key}:chapters`}>
      {chapters
        ? <ol className={styles.chapters}>
          {chapters.items.map((item) => <li key={`${item.time}-${item.title}`}><time>{item.time}</time><span>{item.title}</span></li>)}
        </ol>
        : <p className={styles.meta}>No chapters in this version.</p>}
    </EditSlot>
  </div>
}
```

`panels/ArticlePanel.tsx`:

```tsx
'use client'

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { replaceSegment, segmentBlock, segmentText } from '@/lib/portal/piece-page/segments'
import ChangedMarkdown from '../ChangedMarkdown'
import CarriedDraftNotice from '../CarriedDraftNotice'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { editedSegments, useBlockDraft } from './use-block-draft'

// Spec 4.4: reads like a kanset.com article; edited section by section, composed into the one
// article block. The piece title is the page's h1, so the article headline is an h2 here.
export default function ArticlePanel({ tab, coverUrl, before, canEdit, version }: {
  tab: CopyTab
  coverUrl: string | null
  before: Record<string, string>
  canEdit: boolean
  version: number
}) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, carried, source } = useBlockDraft(block)
  const segmented = segmentBlock(source, 'sections')
  const baseSegments = segmentBlock(block.body, 'sections').segments
  const edited = editedSegments(block.body, source, 'sections')
  const previous = draft ? null : before[block.key ?? ''] ?? null
  const editable = canEdit && Boolean(block.key)
  const openWhole = () => open({
    kind: 'copy', slotId: `${block.key}:whole`, target, title: 'Article', initialText: source, baseText: block.body,
    compose: (text) => text,
  })

  return <div className={styles.block}>
    {coverUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={styles.cover} src={coverUrl} alt="Cover image" />
      : <div className={styles.coverPlaceholder}>Cover image</div>}
    {draft && <p className={styles.saved}>Saved · not sent yet</p>}
    {carried && <CarriedDraftNotice draft={carried} currentText={block.body} version={version} onAdjust={openWhole} />}
    <article className={styles.article}>
      {segmented.preamble.trim() && <ChangedMarkdown body={segmented.preamble} before={previous} className={styles.copy} />}
      {segmented.segments.map((segment, index) => {
        const body = segment.raw.replace(/^[^\n]*\n?/, '')
        const name = segment.level === 1 ? 'Opening' : segment.label
        const editButton = editable && <button type="button" className={styles.link} aria-label={`Edit section, ${name}`}
          onClick={() => open({
            kind: 'copy', slotId: `${block.key}:section:${index}`, target, title: `${name} · Article`,
            initialText: segmentText(segment),
            baseText: baseSegments[index] ? segmentText(baseSegments[index]) : '',
            compose: (text) => replaceSegment(source, 'sections', index, text),
          })}>Edit section</button>
        return <section key={index} className={styles.sec} id={`article-section-${index}`}>
          {segment.level === 1 && <h2 className={styles.articleTitle}>{segment.label}</h2>}
          <div className={styles.secH}>
            {segment.level === 1 ? <span className={styles.label}>Opening</span> : <h3>{segment.label}</h3>}
            {edited[index] && <span className={styles.editedTag}>Edited, not sent</span>}
            {editButton}
          </div>
          <EditSlot slotId={`${block.key}:section:${index}`}>
            <ChangedMarkdown body={body} before={previous} className={styles.copy} />
          </EditSlot>
        </section>
      })}
    </article>
  </div>
}
```

`panels/SearchSharingPanel.tsx`:

```tsx
'use client'

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { SEARCH_FIELDS, labeledValue, parseLabeledList, type LabeledField } from '@/lib/portal/piece-page/labeled-list'
import { EditSlot, useEditorHost } from '../EditorHost'
import styles from '../piece-page.module.css'
import { Field } from './YouTubePanel'
import { useBlockDraft } from './use-block-draft'

const SEARCH_LABELS = new Set<string>(SEARCH_FIELDS.map((field) => field.label.toLowerCase()))

// Spec 4.4: Search & sharing (search title, description, web address, preview text when shared).
export default function SearchSharingPanel({ tab, canEdit }: { tab: CopyTab; canEdit: boolean; version: number }) {
  const block = tab.blocks[0]
  const { open } = useEditorHost()
  const { target, draft, source } = useBlockDraft(block)
  const list = parseLabeledList(source)
  const slug = labeledValue(list, 'Slug') ?? ''
  const others = list.items.filter((item): item is LabeledField => item.kind === 'field' && !SEARCH_LABELS.has(item.label.trim().toLowerCase()))

  return <div className={styles.block}>
    <div className={styles.blockHead}>
      <span className={styles.label}>Search and sharing</span>
      {draft && <span className={styles.saved}>Saved · not sent yet</span>}
      {canEdit && block.key && <button type="button" className={styles.link} aria-label="Edit search and sharing"
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:whole`, target, title: 'Search and sharing', initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
    </div>
    <div className={styles.serp} role="group" aria-label="How it looks in Google">
      <div className={styles.serpUrl}>kanset.com{slug}</div>
      <div className={styles.serpTitle}>{labeledValue(list, 'SEO title')}</div>
      <div>{labeledValue(list, 'Meta description')}</div>
    </div>
    <EditSlot slotId={`${block.key}:whole`}>
      {SEARCH_FIELDS.map((field) => {
        const value = labeledValue(list, field.label)
        if (value === null) return null
        return <Field key={field.label} label={field.title}>
          <p className={styles.fieldValue}>{field.label === 'Slug' ? `kanset.com${value}` : value}</p>
          {field.limit !== null && <span className={styles.charcount}>{value.length} of {field.limit} characters</span>}
        </Field>
      })}
    </EditSlot>
    {others.length > 0 && <dl className={styles.details}>
      {others.map((item) => <div key={item.label} style={{ display: 'contents' }}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>}
  </div>
}
```

`panels/CoverImagePanel.tsx`:

```tsx
'use client'

import styles from '../piece-page.module.css'

export type CoverInfo = { label: string; url: string; previewUrl: string | null; width: number; height: number }

export default function CoverImagePanel({ cover, onSuggest }: { cover: CoverInfo | null; onSuggest: (() => void) | null }) {
  if (!cover) return <p className={styles.meta}>The cover image is not ready yet.</p>
  return <div className={styles.block}>
    {cover.previewUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={styles.cover} src={cover.previewUrl} alt={cover.label} />
      : <div className={styles.coverPlaceholder}>{cover.label}</div>}
    <p className={styles.meta}>{cover.label} · {cover.width} × {cover.height}</p>
    <div className={styles.blockActions}>
      <a className={styles.link} href={cover.url} target="_blank" rel="noreferrer">Open the cover in Drive</a>
      {onSuggest && <button type="button" className={styles.link} onClick={onSuggest}>Suggest a change</button>}
    </div>
  </div>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx"`
Expected: PASS, 6 tests. ("40 of 60 characters": "How to Choose a Representative in Canada" is 40 characters.)

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/panels/YouTubePanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/ChaptersPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/ArticlePanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/SearchSharingPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/CoverImagePanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Show YouTube fields, chapters, the article, search and sharing, and the cover

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 25: Decision bar

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.test.tsx`

The bar renders the resolver's one action (Task 11) and nothing else. Approve calls the existing `decide` action (the database is the hard boundary, now including 0094); Send goes through plan 3's provider `send`, which keeps drafts on any failure, records the failure and reuses the bundle key on Retry. On a phone the bar sits above the keyboard (visualViewport inset) and the safe area.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
const { sendReviewBundle, decide } = vi.hoisted(() => ({
  sendReviewBundle: vi.fn(async () => ({ success: 'Your edit was sent to The Dot.' })),
  decide: vi.fn(async () => ({})),
}))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle, acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { PieceAction } from '@/lib/portal/piece-page/piece-action'
import { useReviewDrafts } from '../ReviewDraftProvider'
import DecisionBar from './DecisionBar'
import { PageProviders, renderInPage, stubDialogs } from './test-utils'

function AddDraft() {
  const { saveDraft } = useReviewDrafts()
  return <button type="button" onClick={() => saveDraft({ kind: 'copy_block', key: 'caption', label: 'Caption', currentText: 'Old' }, 'New')}>add</button>
}

function bar(action: PieceAction, overrides: Partial<React.ComponentProps<typeof DecisionBar>> = {}) {
  return <DecisionBar action={action} ticks={{ total: 3, done: 2 }} version={2} reReview={false}
    approvedLabel="Approved · posts Fri Oct 2" postedLabel="Posted Fri Oct 2" sentSummary={{ count: 2, dateLabel: 'Sep 30' }}
    slug="kanset" contentId="piece" mode="client" onOpenPastEdits={vi.fn()} onShowCarried={vi.fn()} {...overrides} />
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  sendReviewBundle.mockClear()
  decide.mockClear()
})

describe('DecisionBar', () => {
  it('keeps Approve off until every tab is reviewed and names the tab still to open', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['YouTube'] }))
    expect(screen.getByRole('region', { name: 'Your review' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByText('Open YouTube to finish your review.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription('Open YouTube to finish your review.')
  })

  it('says the earlier ticks were cleared on a new version', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['On-screen text', 'Caption', 'YouTube'] },
      { ticks: { total: 3, done: 0 }, reReview: true }))
    expect(screen.getByText('0 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByText('New version 2. Your earlier ticks are cleared for this version.')).toBeInTheDocument()
  })

  it('waits for the media', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] }, { ticks: { total: 3, done: 3 } }))
    expect(screen.getByText('You can approve once the video is here. I will let you know.')).toBeInTheDocument()
  })

  it('approves with an optional note', async () => {
    renderInPage(bar({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] }, { ticks: { total: 3, done: 3 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    fireEvent.change(screen.getByLabelText('Add a note (optional)'), { target: { value: 'Lovely.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(decide).toHaveBeenCalled())
    const form = decide.mock.calls[0][0] as FormData
    expect([form.get('slug'), form.get('contentId'), form.get('decision'), form.get('note')]).toEqual(['kanset', 'piece', 'approved', 'Lovely.'])
  })

  it('sends the drafts with one button and shows the result', async () => {
    renderInPage(<><AddDraft />{bar({ kind: 'send', count: 1, additional: false, retry: false, blocked: null })}</>)
    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByText('1 unsent edit')).toBeInTheDocument()
    expect(screen.getByText('Saved, not sent yet. Nothing reaches me until you send.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send my edits (1)' }))
    await waitFor(() => expect(sendReviewBundle).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toHaveTextContent('Your edit was sent to The Dot.')
  })

  it('labels follow-up and retry sends, and blocks an over-limit send', () => {
    const { rerender } = renderInPage(bar({ kind: 'send', count: 2, additional: true, retry: false, blocked: null }))
    expect(screen.getByRole('button', { name: 'Send additional edits (2)' })).toBeEnabled()
    rerender(<PageProviders>{bar({ kind: 'send', count: 2, additional: false, retry: true, blocked: null })}</PageProviders>)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.getByText('Your 2 edits did not send. They are still saved here.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'send', count: 1, additional: false, retry: false, blocked: 'over-limit' })}</PageProviders>)
    expect(screen.getByRole('button', { name: 'Send my edits (1)' })).toBeDisabled()
    expect(screen.getByText('One edit is over the 50,000 character limit. Shorten it, then send.')).toBeInTheDocument()
  })

  it('shows each status state with no action', () => {
    const onOpenPastEdits = vi.fn()
    const { rerender } = renderInPage(bar({ kind: 'revision' }, { onOpenPastEdits }))
    expect(screen.getByText("I'm applying your edits")).toBeInTheDocument()
    expect(screen.getByText('You sent 2 edits on Sep 30. The new version will show here. Editing is paused until then.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See what you sent' }))
    expect(onOpenPastEdits).toHaveBeenCalled()
    rerender(<PageProviders>{bar({ kind: 'sent', count: 2 })}</PageProviders>)
    expect(screen.getByText('Your edits are with me')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'decided' })}</PageProviders>)
    expect(screen.getByText('Approved · posts Fri Oct 2')).toBeInTheDocument()
    expect(screen.getByText('Thank you. Nothing else needed from you.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'published' })}</PageProviders>)
    expect(screen.getByText('Posted Fri Oct 2')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'incomplete', missing: ['website cover'] })}</PageProviders>)
    expect(screen.getByText('I still need to add: website cover.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'decider-only' })}</PageProviders>)
    expect(screen.getByText('Only Maria can approve this piece. You can still edit the text.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('points to drafts written against the previous version', () => {
    const onShowCarried = vi.fn()
    renderInPage(bar({ kind: 'carried', count: 1 }, { onShowCarried }))
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }))
    expect(onShowCarried).toHaveBeenCalled()
  })

  it('never sends or approves from the read-only preview', async () => {
    renderInPage(bar({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] }, { mode: 'preview', ticks: { total: 3, done: 3 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Read-only preview: nothing was sent.')).toBeInTheDocument()
    expect(decide).not.toHaveBeenCalled()
  })

  it('renders nothing when there is nothing to do', () => {
    renderInPage(bar({ kind: 'none' }))
    expect(screen.queryByRole('region', { name: 'Your review' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.test.tsx"`
Expected: FAIL, cannot resolve `./DecisionBar`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Button, ReviewDots, Textarea } from '@thedot/design-system'
import type { PieceAction } from '@/lib/portal/piece-page/piece-action'
import { decide } from '../../../actions'
import { useReviewDrafts } from '../ReviewDraftProvider'
import { useKeyboardInset, usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

function edits(count: number): string {
  return count === 1 ? 'edit' : 'edits'
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

const SUB_ID = 'decision-bar-sub'

// Spec 4.6 and 4.7: progress, the single derived action, or the state line. Client wording is a
// draft for kanset-copywriting (first person singular, no em dashes).
export default function DecisionBar({
  action, ticks, version, reReview, approvedLabel, postedLabel, sentSummary, slug, contentId, mode,
  onOpenPastEdits, onShowCarried,
}: {
  action: PieceAction
  ticks: { total: number; done: number }
  version: number
  reReview: boolean
  approvedLabel: string
  postedLabel: string
  sentSummary: { count: number; dateLabel: string | null }
  slug: string
  contentId: string
  mode: 'client' | 'preview'
  onOpenPastEdits: () => void
  onShowCarried: () => void
}) {
  const { send, sendError, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  const inset = useKeyboardInset()
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (action.kind === 'none') return null

  function blockedInPreview(): boolean {
    if (mode !== 'preview') return false
    setMessage({ kind: 'success', text: 'Read-only preview: nothing was sent.' })
    return true
  }

  function sendEdits() {
    setMessage(null)
    if (blockedInPreview()) return
    startTransition(async () => {
      const outcome = await send(note)
      if (!outcome.ok) {
        setMessage({ kind: 'error', text: outcome.message })
        return
      }
      setNote('')
      setNoteOpen(false)
      setMessage({ kind: 'success', text: outcome.message })
    })
  }

  function approve() {
    setMessage(null)
    if (blockedInPreview()) return
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

  const noteLink = <button type="button" className={styles.link} aria-expanded={noteOpen} onClick={() => setNoteOpen((v) => !v)}>
    {noteOpen ? 'Hide note' : 'Add a note'}
  </button>
  const progress = <>
    <ReviewDots total={ticks.total} filled={ticks.done} />
    <strong className={styles.progStrong}>{ticks.done} of {ticks.total} reviewed</strong>
  </>
  const pastLink = <button type="button" className={styles.link} onClick={onOpenPastEdits}>See what you sent</button>

  let error = false
  let allowsNote = false
  let prog: ReactNode
  let act: ReactNode = null

  switch (action.kind) {
    case 'approve': {
      allowsNote = true
      const sub = action.reason === 'ticks'
        ? (reReview && ticks.done === 0
          ? `New version ${version}. Your earlier ticks are cleared for this version.`
          : `Open ${joinLabels(action.untickedLabels)} to finish your review.`)
        : action.reason === 'media'
          ? 'You can approve once the video is here. I will let you know.'
          : 'Everything looks right? Approve sends it to scheduling.'
      prog = <>{progress}<span className={styles.sub} id={SUB_ID}>{sub}</span></>
      act = <>{noteLink}
        <Button as="button" type="button" variant="yellow" disabled={!action.enabled || pending} aria-describedby={SUB_ID} onClick={approve}>
          {pending ? 'Approving…' : 'Approve'}
        </Button></>
      break
    }
    case 'send': {
      allowsNote = true
      error = action.retry
      const sub = action.blocked === 'over-limit'
        ? 'One edit is over the 50,000 character limit. Shorten it, then send.'
        : syncState === 'offline'
          ? draftStatusLine('offline', isPhone)
          : 'Saved, not sent yet. Nothing reaches me until you send.'
      prog = action.retry
        ? <>
          <span className={styles.errText}>Your {action.count} {edits(action.count)} did not send. They are still saved here.</span>
          <span className={styles.sub} id={SUB_ID}>{sendError ?? 'The connection dropped before the portal confirmed.'}</span>
        </>
        : <><span className={styles.unsent}>{action.count} unsent {edits(action.count)}</span><span className={styles.sub} id={SUB_ID}>{sub}</span></>
      act = <>{noteLink}
        <Button as="button" type="button" variant="yellow" disabled={pending || action.blocked !== null} aria-describedby={SUB_ID} onClick={sendEdits}>
          {pending ? 'Sending…' : action.retry ? 'Retry'
            : action.additional ? `Send additional edits (${action.count})` : `Send my edits (${action.count})`}
        </Button></>
      break
    }
    case 'carried':
      prog = <><span className={styles.unsent}>{action.count} unsent {edits(action.count)}</span>
        <span className={styles.sub}>Written against the previous version. Keep, adjust or discard it in the text above.</span></>
      act = <Button as="button" type="button" variant="ghost" size="sm" onClick={onShowCarried}>Show me</Button>
      break
    case 'sent':
      prog = <><strong className={styles.progStrong}>Your edits are with me</strong>
        <span className={styles.sub}>I will send back a revised version for your review.</span></>
      act = pastLink
      break
    case 'revision':
      prog = <><strong className={styles.progStrong}>I&apos;m applying your edits</strong>
        <span className={styles.sub}>
          {sentSummary.dateLabel
            ? `You sent ${sentSummary.count} ${edits(sentSummary.count)} on ${sentSummary.dateLabel}. The new version will show here. Editing is paused until then.`
            : 'The new version will show here. Editing is paused until then.'}
        </span></>
      act = pastLink
      break
    case 'decided':
      prog = <><strong className={styles.progStrong}>{approvedLabel}</strong><span className={styles.sub}>Thank you. Nothing else needed from you.</span></>
      break
    case 'published':
      prog = <><strong className={styles.progStrong}>{postedLabel}</strong>
        <span className={styles.sub}>Need it taken down? Use Request removal in the menu at the top.</span></>
      break
    case 'incomplete':
      prog = <><strong className={styles.progStrong}>Still being put together</strong>
        <span className={styles.sub}>I still need to add: {action.missing.join(', ')}.</span></>
      break
    case 'decider-only':
      prog = <>{progress}<span className={styles.sub}>Only Maria can approve this piece. You can still edit the text.</span></>
      break
  }

  const lift = inset > 0 ? { transform: `translateY(-${inset}px)` } : undefined
  return <>
    {noteOpen && allowsNote && <div className={styles.noteBox} style={lift}>
      <Textarea id="decision-note" label="Add a note (optional)" rows={3} maxLength={2000}
        value={note} onChange={(event) => setNote(event.target.value)} />
    </div>}
    <div className={`${styles.bar} ${error ? styles.barErr : ''}`} role="region" aria-label="Your review" style={lift}>
      <div className={styles.barIn}>
        <div className={styles.prog}>{prog}</div>
        {act && <div className={styles.act}>{act}</div>}
        {message && <p className={`${styles.barMessage} ${message.kind === 'error' ? styles.errText : styles.sub}`}
          role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      </div>
    </div>
  </>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.test.tsx"`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.tsx" "src/app/client/[slug]/piece/[contentId]/v2/DecisionBar.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the sticky decision bar with one derived action and every state line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Questions & sources drawer

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.test.tsx`

The conversation never changes the piece and says so (2026-08-14 section 5.3). Historical comments keep their original labels ("Asset feedback", quoted text). Past edits is today's request history with replies (decision 9).

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addComment } = vi.hoisted(() => ({ addComment: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({
  default: ({ requests }: { requests: unknown[] }) => <div data-testid="history">{requests.length} requests</div>,
}))

import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import QuestionsDrawer from './QuestionsDrawer'
import { stubDialogs } from './test-utils'

const comment = (overrides: Partial<CommentRow>): CommentRow => ({
  id: 'c', content_version: 2, copy_block_key: null, author_type: 'client', author_name: 'Maria', body: 'Is this for all of Ontario?',
  quoted_text: null, target_kind: 'copy', target_url: null, reply_to_comment_id: null, resolved: false,
  created_at: '2026-09-30T20:58:00Z', ...overrides,
})

const ledger = [{
  claim_key: 'fee', claim: 'The LMIA processing fee is $1,000 for each position requested.', status: 'confirmed',
  checked_at: '2026-09-25', checked_by_role: 'agency_fact_checker', source_type: 'primary_source',
  source_url: 'https://www.canada.ca/x', source_title: 'Program requirements, ESDC',
}] as ContentRow['fact_check_ledger']

function subject(overrides: Partial<React.ComponentProps<typeof QuestionsDrawer>> = {}) {
  return <QuestionsDrawer open tab="conversation" onTabChange={vi.fn()} onClose={vi.fn()} slug="kanset" contentId="piece"
    comments={[comment({ id: 'a' }), comment({ id: 'b', author_type: 'anastasia', author_name: 'Anastasia', body: 'All of Ontario.' }),
      comment({ id: 'd', target_kind: 'design', target_url: 'https://drive.google.com/x', body: 'Old asset note' })]}
    canComment ledger={ledger} factCheckScope="required" factCheckExemption={null} requests={[]} requestMessages={[]}
    item={{} as ContentRow} canReply {...overrides} />
}

beforeEach(() => { stubDialogs(); addComment.mockClear() })

describe('QuestionsDrawer', () => {
  it('is labelled and says it does not change the piece', () => {
    render(subject())
    const drawer = screen.getByRole('dialog', { name: 'Questions & sources' })
    expect(within(drawer).getByText("Doesn't change the piece. To change it, edit the text.")).toBeInTheDocument()
  })

  it('shows the conversation, keeping historical labels', () => {
    render(subject())
    expect(screen.getByText('Is this for all of Ontario?')).toBeInTheDocument()
    expect(screen.getByText('All of Ontario.')).toBeInTheDocument()
    expect(screen.getByText(/Asset feedback/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the referenced asset' })).toHaveAttribute('href', 'https://drive.google.com/x')
  })

  it('posts a question through the existing comment action', async () => {
    render(subject())
    fireEvent.change(screen.getByLabelText('Ask a question or leave a note'), { target: { value: 'When does it post?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await waitFor(() => expect(addComment).toHaveBeenCalled())
    const form = addComment.mock.calls[0][0] as FormData
    expect([form.get('slug'), form.get('contentId'), form.get('body'), form.get('targetKind')]).toEqual(['kanset', 'piece', 'When does it post?', 'copy'])
  })

  it('is read-only for a seat that cannot comment', () => {
    render(subject({ canComment: false }))
    expect(screen.getByText('Questions are read-only for your account.')).toBeInTheDocument()
  })

  it('lists the sources behind the facts', () => {
    render(subject({ tab: 'sources' }))
    expect(screen.getByText('The LMIA processing fee is $1,000 for each position requested.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Checked 2026-09-25 · Program requirements, ESDC' })).toHaveAttribute('href', 'https://www.canada.ca/x')
  })

  it('shows past edits from the request history', () => {
    render(subject({ tab: 'past', requests: [{ id: 'r' } as never] }))
    expect(screen.getByTestId('history')).toHaveTextContent('1 requests')
  })

  it('switches tabs and closes', () => {
    const onTabChange = vi.fn()
    const onClose = vi.fn()
    render(subject({ onTabChange, onClose }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sources (1)' }))
    expect(onTabChange).toHaveBeenCalledWith('sources')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.test.tsx"`
Expected: FAIL, cannot resolve `./QuestionsDrawer`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Textarea } from '@thedot/design-system'
import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import { torontoDateLabel, torontoTimeLabel } from '@/lib/portal/piece-page/header-status'
import type { ContentRequestMessage, ContentRequestRow } from '@/lib/portal/requests'
import { addComment } from '../../../comment-actions'
import RequestHistory from '../../../requests/RequestHistory'
import styles from './piece-page.module.css'

export type DrawerTab = 'conversation' | 'sources' | 'past'

function SendButton() {
  const { pending } = useFormStatus()
  return <Button as="button" type="submit" variant="black" size="sm" disabled={pending}>{pending ? 'Sending…' : 'Send question'}</Button>
}

function when(iso: string): string {
  return `${torontoDateLabel(iso)}, ${torontoTimeLabel(iso)}`
}

function Conversation({ comments }: { comments: CommentRow[] }) {
  if (comments.length === 0) return <p className={styles.meta}>No questions yet. Ask anything about this piece below.</p>
  return <ol className={styles.msgs}>
    {comments.map((c) => {
      const mine = c.author_type === 'client'
      return <li key={c.id} className={`${styles.msg} ${mine ? styles.msgMe : ''}`}>
        <div className={styles.who}>{c.author_name} · <time dateTime={c.created_at}>{when(c.created_at)}</time></div>
        {c.target_kind === 'design' && <p className={styles.quote}>
          Asset feedback{c.target_url && <> · <a href={c.target_url} target="_blank" rel="noreferrer">Open the referenced asset</a></>}
        </p>}
        {c.target_kind !== 'design' && c.quoted_text && <p className={styles.quote}>“{c.quoted_text}”</p>}
        <div className={styles.bub}>{c.body}{mine && c.resolved ? ' (answered)' : ''}</div>
      </li>
    })}
  </ol>
}

function Composer({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(
    async (_previous: { error?: string; sent?: number }, formData: FormData) => {
      const result = await addComment(formData)
      return result?.error ? { error: result.error } : { sent: Date.now() }
    },
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.sent) formRef.current?.reset() }, [state.sent])
  return <form ref={formRef} action={action} className={styles.composer}>
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="contentId" value={contentId} />
    <input type="hidden" name="quotedText" value="" />
    <input type="hidden" name="copyBlockKey" value="" />
    <input type="hidden" name="targetKind" value="copy" />
    <input type="hidden" name="designUrl" value="" />
    <Textarea id="question-body" name="body" label="Ask a question or leave a note" rows={3} maxLength={4000}
      invalid={Boolean(state.error)} aria-describedby={state.error ? 'question-error' : undefined} />
    {state.error && <p id="question-error" role="alert" className={styles.error}>{state.error}</p>}
    <div className={styles.composerRow}>
      <span className={styles.meta}>I usually reply the same day.</span>
      <SendButton />
    </div>
  </form>
}

function Sources({ ledger, scope, exemption }: {
  ledger: ContentRow['fact_check_ledger']; scope: ContentRow['fact_check_scope']; exemption: string | null
}) {
  if (scope === 'not_applicable') return <p className={styles.meta}>{exemption ?? 'No factual or regulatory claim in this piece.'}</p>
  if (ledger.length === 0) return <p className={styles.meta}>The sources are still being confirmed.</p>
  return <>
    <h3 className={styles.label}>Sources behind the facts</h3>
    <ul className={styles.msgs}>
      {ledger.map((entry) => <li key={entry.claim_key} className={styles.src}>
        <p>{entry.claim}</p>
        {entry.source_url && entry.source_title
          ? <a href={entry.source_url} target="_blank" rel="noreferrer">Checked {entry.checked_at} · {entry.source_title}</a>
          : entry.source_type === 'agency_attested' && entry.source_title
            ? <span className={styles.meta}>{entry.source_title} · checked {entry.checked_at}</span>
            : null}
      </li>)}
    </ul>
  </>
}

// Spec 4.5: side drawer on desktop, full-screen sheet on a phone (CSS). A native modal dialog
// traps focus and closes on Escape.
export default function QuestionsDrawer({
  open, tab, onTabChange, onClose, slug, contentId, comments, canComment, ledger, factCheckScope, factCheckExemption,
  requests, requestMessages, item, canReply,
}: {
  open: boolean
  tab: DrawerTab
  onTabChange: (tab: DrawerTab) => void
  onClose: () => void
  slug: string
  contentId: string
  comments: CommentRow[]
  canComment: boolean
  ledger: ContentRow['fact_check_ledger']
  factCheckScope: ContentRow['fact_check_scope']
  factCheckExemption: string | null
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  item: ContentRow
  canReply: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const tabs: Array<{ key: DrawerTab; label: string }> = [
    { key: 'conversation', label: 'Conversation' },
    { key: 'sources', label: `Sources (${factCheckScope === 'not_applicable' ? 0 : ledger.length})` },
    { key: 'past', label: `Past edits (${requests.length})` },
  ]

  return <dialog ref={ref} className={styles.drawer} aria-labelledby="questions-title" onClose={onClose}>
    <div className={styles.drawerH}>
      <div className={styles.drawerTop}>
        <div>
          <h2 id="questions-title">Questions &amp; sources</h2>
          <p className={styles.notice}>Doesn&apos;t change the piece. To change it, edit the text.</p>
        </div>
        <button type="button" className={`${styles.ghostButton} ${styles.iconOnly}`} aria-label="Close"
          onClick={() => { ref.current?.close(); onClose() }}>×</button>
      </div>
      <div className={styles.drawerTabs} role="tablist" aria-label="Questions and sources">
        {tabs.map((entry) => <button key={entry.key} type="button" role="tab" id={`questions-tab-${entry.key}`}
          aria-selected={tab === entry.key} aria-controls="questions-panel" tabIndex={tab === entry.key ? 0 : -1}
          className={styles.tab} onClick={() => onTabChange(entry.key)}>{entry.label}</button>)}
      </div>
    </div>
    <div className={styles.drawerB} role="tabpanel" id="questions-panel" aria-labelledby={`questions-tab-${tab}`}>
      {tab === 'conversation' && <Conversation comments={comments} />}
      {tab === 'sources' && <Sources ledger={ledger} scope={factCheckScope} exemption={factCheckExemption} />}
      {tab === 'past' && (requests.length > 0
        ? <RequestHistory slug={slug} requests={requests} messages={requestMessages} content={[item]} canReply={canReply} />
        : <p className={styles.meta}>No edits sent yet.</p>)}
    </div>
    {tab === 'conversation' && (canComment
      ? <Composer slug={slug} contentId={contentId} />
      : <div className={styles.composer}><p className={styles.meta}>Questions are read-only for your account.</p></div>)}
  </dialog>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.test.tsx"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.tsx" "src/app/client/[slug]/piece/[contentId]/v2/QuestionsDrawer.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the Questions & sources drawer: conversation, sources, past edits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: First-visit intro

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.test.tsx`

Spec 9.2: three lines, once per seat, first person singular from Anastasia. **Draft wording** (from the approved mockup `09b-first-visit-intro.html`; it goes through `kanset-copywriting` and Anastasia before Maria's switch flips, 4b Task 14):

> **Your review page, rebuilt**
> 1. Watch the video and page through every frame right here. No Drive needed.
> 2. Tap any text to edit it in place, on your phone or computer. I save your edits as you type.
> 3. When you are done, send your edits or approve. One button at the bottom does either.
>
> Anastasia · [Got it]

The acknowledgment is written on the server per seat (Task 14); Got it, the close gesture and Escape all acknowledge; a failed write fails open (she may see it once more), and it never blocks the page.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { acknowledgePiecePageIntro } = vi.hoisted(() => ({ acknowledgePiecePageIntro: vi.fn(async () => undefined) }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ acknowledgePiecePageIntro }))

import FirstVisitIntro, { PIECE_PAGE_INTRO_LINES } from './FirstVisitIntro'
import { stubDialogs } from './test-utils'

beforeEach(() => { stubDialogs(); acknowledgePiecePageIntro.mockClear() })

describe('FirstVisitIntro', () => {
  it('shows three lines signed by Anastasia, with no em dashes', () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    expect(screen.getByRole('dialog', { name: 'Your review page, rebuilt' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Anastasia')).toBeInTheDocument()
    for (const line of PIECE_PAGE_INTRO_LINES) expect(line).not.toMatch(/\u2014/)
  })

  it('acknowledges on Got it and closes', async () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalledWith('kanset'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('acknowledges on Escape', async () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalled())
  })

  it('fails open when the acknowledgment cannot be written', async () => {
    acknowledgePiecePageIntro.mockRejectedValueOnce(new Error('offline'))
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('writes nothing in the preview and does not show once acknowledged', () => {
    const { unmount } = render(<FirstVisitIntro slug="kanset" show persist={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(acknowledgePiecePageIntro).not.toHaveBeenCalled()
    unmount()
    render(<FirstVisitIntro slug="kanset" show={false} persist />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.test.tsx"`
Expected: FAIL, cannot resolve `./FirstVisitIntro`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@thedot/design-system'
import { acknowledgePiecePageIntro } from '../../../request-actions'
import styles from './piece-page.module.css'

// Draft wording from the approved mockup (09b). Client copy: kanset-copywriting and Anastasia
// approve it before Maria's switch flips. First person singular, no em dashes.
export const PIECE_PAGE_INTRO_TITLE = 'Your review page, rebuilt'
export const PIECE_PAGE_INTRO_LINES = [
  'Watch the video and page through every frame right here. No Drive needed.',
  'Tap any text to edit it in place, on your phone or computer. I save your edits as you type.',
  'When you are done, send your edits or approve. One button at the bottom does either.',
] as const

export default function FirstVisitIntro({ slug, show, persist }: { slug: string; show: boolean; persist: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [visible, setVisible] = useState(show)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (visible && ref.current && !ref.current.open) ref.current.showModal()
  }, [visible])

  function acknowledge() {
    if (!visible) return
    setVisible(false)
    if (ref.current?.open) ref.current.close()
    if (!persist) return
    startTransition(async () => {
      try {
        await acknowledgePiecePageIntro(slug)
      } catch {
        // Fail open: she may see the intro once more; it never blocks the page.
      }
    })
  }

  if (!visible) return null
  return <dialog ref={ref} className={styles.intro} aria-labelledby="piece-intro-title"
    onCancel={(event) => { event.preventDefault(); acknowledge() }}>
    <h2 id="piece-intro-title">{PIECE_PAGE_INTRO_TITLE}</h2>
    <ol className={styles.steps}>{PIECE_PAGE_INTRO_LINES.map((line) => <li key={line}>{line}</li>)}</ol>
    <div className={styles.introFoot}>
      <span className={styles.signature}>Anastasia</span>
      <Button as="button" type="button" variant="black" autoFocus onClick={acknowledge}>Got it</Button>
    </div>
  </dialog>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.test.tsx"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.tsx" "src/app/client/[slug]/piece/[contentId]/v2/FirstVisitIntro.test.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Add the three-line first-visit intro, once per seat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 28: Derive the page's data on the server

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/derive.ts`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/derive.test.ts`
- Create: `src/lib/portal/piece-page/limits.ts`

Everything the current `PieceReviewScreen` decides inline (blocks fallback, published, readiness, unresolved edits, revision started, who may edit, schedule and removal rights, design links) moves into one pure, tested function, plus the new facts (layout, tabs, preview, visual target, media pending, header status, updated areas). The rules are copied, not changed.

- [ ] **Step 1: Write the failing tests**

`derive.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))

import type { ContentRow } from '@/lib/portal/data'
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, pieceFormatLabel, type DeriveInput } from './derive'

function item(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook', 'youtube'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: [
      { key: 'reel-script', label: 'Reel, on screen', body: '**1.** A\n\n**2.** B' },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
      { key: 'youtube-package', label: 'YouTube Short', body: '**Title:** T' },
    ],
    state: 'needs_review', ...overrides,
  } as ContentRow
}

function asset(asset_key: string, asset_kind: ReviewAsset['asset_kind']): ReviewAsset {
  return { id: asset_key, content_version: 2, asset_key, label: 'Reel video', channel: 'social', asset_kind,
    url: 'https://drive.google.com/reel', width_px: 1080, height_px: 1920, caption_status: 'not_applicable', review_note: null }
}

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '4.5 s', url: 'https://signed.example/f2.jpg' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

function request(overrides: Partial<ContentRequestRow>): ContentRequestRow {
  return {
    id: 'r1', client_id: 'c', content_id: 'item-1', request_type: 'edit', base_version: 2,
    payload: { target_kind: 'copy_block', target_key: 'social-caption', target_label: 'Caption', proposed_text: 'New' },
    status: 'pending', requester_name: 'Maria', created_at: '2026-09-30T17:20:00Z', updated_at: '', reconciled_at: null,
    reconciled_by: null, canonical_version: null, resolution_note: null, canonical_content_key: null, base_copy_text: null,
    ...overrides,
  }
}

function input(overrides: Partial<DeriveInput> = {}): DeriveInput {
  return {
    slug: 'kanset', item: item(), comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: [],
    requestMessages: [], reviewAssets: [asset('reel-video', 'video')], previews: [preview],
    capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar',
    previewRefreshBase: '/api/client/kanset/review-previews', removalKey: 'key-1', ...overrides,
  }
}

describe('deriveWorkspaceData', () => {
  it('lays out a reel with its preview, tabs and frame-level visual target', () => {
    const data = deriveWorkspaceData(input())
    expect(data.layout).toBe('vertical')
    expect(data.tabs.map((tab) => tab.key)).toEqual(['onscreen', 'caption', 'youtube'])
    expect(data.previewRefreshUrl).toBe('/api/client/kanset/review-previews/p1')
    expect(data.visualTarget).toEqual({ kind: 'asset', key: 'reel-video', label: 'Reel video', url: 'https://drive.google.com/reel', anchors: true })
    expect(data.mediaPending).toBe(false)
    expect(data.fallbackMedia).toEqual([])
    expect(data.packageReady).toBe(true)
    expect(data.formatLabel).toBe('Reel · Instagram, Facebook, YouTube')
    expect(data.canEdit).toBe(true)
    expect(data.removal).toEqual({ slug: 'kanset', contentId: 'kanset-2026-10-reel', idempotencyKey: 'key-1' })
  })

  it('falls back to the design link, which cannot take a frame note', () => {
    const data = deriveWorkspaceData(input({ previews: [], reviewAssets: [], item: item({ canva_url: 'https://www.canva.com/design/x/view' }) }))
    expect(data.fallbackMedia).toEqual([{ label: 'Canva', url: 'https://www.canva.com/design/x/view' }])
    expect(data.visualTarget).toEqual({ kind: 'design_link', key: 'canva', label: 'Canva design', url: 'https://www.canva.com/design/x/view', anchors: false })
    expect(data.mediaPending).toBe(false)
  })

  it('waits for media when there is nothing to show', () => {
    const data = deriveWorkspaceData(input({ previews: [], reviewAssets: [] }))
    expect(data.mediaPending).toBe(true)
    expect(data.visualTarget).toBeNull()
    expect(data.packageReady).toBe(false)
    expect(data.missing).toEqual(['linked design'])
  })

  it('locks editing once the revision has started and summarises what was sent', () => {
    const data = deriveWorkspaceData(input({ requests: [request({ status: 'applying' })] }))
    expect(data.revisionStarted).toBe(true)
    expect(data.canEdit).toBe(false)
    expect(data.sentSummary).toEqual({ count: 1, dateLabel: 'Sep 30' })
  })

  it('reads an approved, scheduled piece as approved with its date', () => {
    const data = deriveWorkspaceData(input({
      item: item({ state: 'scheduled' }),
      schedule: { targets: [{ id: 't', content_id: 'item-1', content_version: 2, destination: 'instagram', required: true,
        scheduled_at: '2026-10-02T22:00:00Z', status: 'scheduled', verified_at: null, verification_label: '' }], requests: [] },
    }))
    expect(data.approvedLabel).toBe('Approved · posts Fri Oct 2')
    expect(data.canRequestSchedule).toBe(true)
    expect(data.scheduleHasExternalTargets).toBe(true)
  })

  it('names what changed after her feedback and keeps the previous text for highlighting', () => {
    const data = deriveWorkspaceData(input({ requests: [request({
      base_version: 1, status: 'applied', canonical_version: 2, base_copy_text: 'Old caption.',
    })] }))
    expect(data.reReview).toBe(true)
    expect(data.updatedTabKeys).toEqual(['caption'])
    expect(data.updatedLine).toBe('caption')
    expect(data.beforeByBlock).toEqual({ 'social-caption': 'Old caption.' })
  })

  it('hides removal while one is pending and the date request without schedule rights', () => {
    const data = deriveWorkspaceData(input({
      requests: [request({ id: 'a', request_type: 'archive', status: 'pending', payload: {} })],
      capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: false },
      item: item({ state: 'approved' }),
    }))
    expect(data.removal).toBeNull()
    expect(data.canRequestSchedule).toBe(false)
  })

  it('labels formats plainly', () => {
    expect(pieceFormatLabel('podcast_article', ['squarespace'])).toBe('Website article · kanset.com')
    expect(pieceFormatLabel('linkedin-post', ['linkedin'])).toBe('LinkedIn post · LinkedIn')
    expect(pieceFormatLabel(null, [])).toBe('Piece')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/derive.test.ts"`
Expected: FAIL, cannot resolve `./derive`.

- [ ] **Step 3: Implement**

`src/lib/portal/piece-page/limits.ts`:

```ts
// Per-block edit limit (migration 0088): the send refuses more; the editor never truncates.
export const MAX_EDIT_CHARS = 50_000
// The length counter appears from here (spec 2026-10-03 section 5).
export const COUNTER_FROM_CHARS = 45_000
```

`src/app/client/[slug]/piece/[contentId]/v2/derive.ts`:

```ts
// Server-side derivation for the redesigned piece page (spec 2026-10-03). The rules copied from
// PieceReviewScreen are unchanged: published, readiness, unresolved edits, revision started,
// who may edit, schedule and removal rights. Pure; the page passes everything in.
import type { ClientSession } from '@/lib/portal/auth'
import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import { appliedChanges, updatedAreasLine, updatedTabKeys } from '@/lib/portal/piece-page/changed-passages'
import { buildCopyTabs, pieceLayout, primaryPreview, type CopyTab, type PieceLayout } from '@/lib/portal/piece-page/copy-tabs'
import { destinationLabel, headerStatus, type HeaderStatus } from '@/lib/portal/piece-page/header-status'
import { contentReviewPackageReadiness } from '@/lib/portal/podcast-review'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import { reReviewContext } from '@/lib/portal/re-review'
import { contentRequestTarget, isUnresolvedContentRequest, type ContentRequestMessage, type ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import type { ScheduleRequestRow, ScheduleTargetRow } from '@/lib/portal/schedule'
import type { ClientState } from '@/lib/portal/state'
import type { CoverInfo } from './panels/CoverImagePanel'

export type WorkspaceMode = 'client' | 'preview'
export type VisualTarget = { kind: 'asset' | 'design_link'; key: string; label: string; url: string | null; anchors: boolean }

export type WorkspaceData = {
  slug: string
  contentId: string
  version: number
  title: string
  formatLabel: string
  layout: PieceLayout
  tabs: CopyTab[]
  updatedTabKeys: string[]
  updatedLine: string | null
  beforeByBlock: Record<string, string>
  reReview: boolean
  preview: SignedReviewPreview | null
  previewRefreshUrl: string | null
  fallbackMedia: Array<{ label: string; url: string }>
  episodeDriveUrl: string | null
  mediaPending: boolean
  visualTarget: VisualTarget | null
  cover: CoverInfo | null
  status: HeaderStatus
  approvedLabel: string
  postedLabel: string
  canRequestSchedule: boolean
  scheduleHasExternalTargets: boolean
  activeScheduleRequest: { kind: 'reschedule' | 'cancel'; when: string | null } | null
  removal: { slug: string; contentId: string; idempotencyKey: string } | null
  canEdit: boolean
  canDecide: boolean
  canComment: boolean
  canSubmitRequests: boolean
  isPublished: boolean
  state: ClientState
  revisionStarted: boolean
  sentSummary: { count: number; dateLabel: string | null }
  packageReady: boolean
  missing: string[]
  comments: CommentRow[]
  ledger: ContentRow['fact_check_ledger']
  factCheckScope: ContentRow['fact_check_scope']
  factCheckExemption: string | null
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  item: ContentRow
  showIntro: boolean
  backHref: string
  backLabel: string
}

export type DeriveInput = {
  slug: string
  item: ContentRow
  comments: CommentRow[]
  schedule: { targets: ScheduleTargetRow[]; requests: ScheduleRequestRow[] }
  publication: PublicationTargetRow[]
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  reviewAssets: ReviewAsset[]
  previews: SignedReviewPreview[]
  capabilities: Pick<ClientSession, 'canDecide' | 'canComment' | 'canSubmitRequests' | 'canManageSchedule'>
  showIntro: boolean
  backHref: string
  backLabel: string
  // '/api/client/<slug>/review-previews' for a client seat, '/api/admin/portal/review-previews' for the preview.
  previewRefreshBase: string
  removalKey: string
}

const FORMAT_NAMES: Record<string, string> = {
  reel: 'Reel', vertical_video: 'Vertical video', podcast: 'Podcast episode', podcast_article: 'Website article',
  article: 'Website article', carousel: 'Carousel', single: 'Single post', post: 'Post', 'linkedin-post': 'LinkedIn post',
}

export function pieceFormatLabel(format: string | null, platforms: string[]): string {
  const name = FORMAT_NAMES[(format ?? '').toLowerCase()] ?? 'Piece'
  const where = [...new Set(platforms.map(destinationLabel))].join(', ')
  return where ? `${name} · ${where}` : name
}

function isHttps(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\//i.test(url)
}

// Copied from SchedulePanel: the requested Toronto wall time, shown as entered.
function displayRequestedLocal(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return value.slice(0, 16).replace('T', ' ')
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))),
  )
}

function torontoMonthDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }).format(new Date(iso))
}

const SCHEDULE_REQUEST_STATES = new Set<ClientState>(['approved', 'partially_scheduled', 'schedule_failed', 'scheduled'])

function pickVisualTarget(
  layout: PieceLayout,
  preview: SignedReviewPreview | null,
  assets: ReviewAsset[],
  designLinks: Array<{ key: 'canva' | 'drive'; label: string; url: string }>,
): VisualTarget | null {
  const kinds: ReviewAsset['asset_kind'][] = layout === 'pages' ? ['document', 'cover']
    : layout === 'article' ? ['cover'] : ['video']
  const byKey = preview?.reviewAssetKey ? assets.find((a) => a.asset_key === preview.reviewAssetKey) : undefined
  const chosen = byKey ?? assets.find((a) => kinds.includes(a.asset_kind))
  if (chosen) {
    return {
      kind: 'asset', key: chosen.asset_key, label: chosen.label, url: chosen.url,
      anchors: Boolean(preview && preview.frames.length > 0),
    }
  }
  const link = designLinks.find((l) => l.key === 'drive') ?? designLinks[0]
  return link ? { kind: 'design_link', key: link.key, label: `${link.label} design`, url: link.url, anchors: false } : null
}

export function deriveWorkspaceData(input: DeriveInput): WorkspaceData {
  const { item, capabilities } = input
  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Caption', body: item.client_body }] : [])
  const layout = pieceLayout(item.format, blocks, input.previews)
  const preview = primaryPreview(layout, input.previews)
  const tabs = buildCopyTabs(layout, blocks, input.reviewAssets)

  const isPublished = input.publication.some((target) => target.status === 'live')
    || ['live', 'partially_live'].includes(item.state)
  const readiness = contentReviewPackageReadiness({ ...item, copy_blocks: blocks }, input.reviewAssets)
  const unresolved = input.requests.filter((r) => r.base_version === item.version
    && isUnresolvedContentRequest(r.status) && contentRequestTarget(r) !== null)
  const revisionStarted = unresolved.some((r) => ['applying', 'prepared'].includes(r.status))
  const firstSent = unresolved.map((r) => r.created_at).filter(Boolean).sort()[0]

  const reReview = reReviewContext(item.version, item.state, item.current_decision, input.requests)
  const changes = appliedChanges(item.version, input.requests)
  const updated = reReview ? updatedTabKeys(tabs, changes) : new Set<string>()

  const designLinks = [
    isHttps(item.canva_url) ? { key: 'canva' as const, label: 'Canva', url: item.canva_url } : null,
    isHttps(item.drive_url) ? { key: 'drive' as const, label: 'Google Drive', url: item.drive_url } : null,
  ].filter((link): link is { key: 'canva' | 'drive'; label: string; url: string } => link !== null)
  const expectsMedia = layout === 'vertical' || layout === 'horizontal' || layout === 'pages'
  const mediaKinds: ReviewAsset['asset_kind'][] = layout === 'pages' ? ['document', 'cover'] : ['video']
  const mediaAssets = input.reviewAssets.filter((a) => mediaKinds.includes(a.asset_kind))
  const fallbackMedia = expectsMedia && !preview
    ? (mediaAssets.length > 0
      ? mediaAssets.map((a) => ({ label: a.label, url: a.url }))
      : designLinks.map((l) => ({ label: l.label, url: l.url })))
    : []

  const coverAsset = input.reviewAssets.find((a) => a.asset_key === 'website-cover' || (a.channel === 'website' && a.asset_kind === 'cover'))
  const cover: CoverInfo | null = layout === 'article' && coverAsset
    ? { label: coverAsset.label, url: coverAsset.url, previewUrl: preview?.frames[0]?.url ?? null,
      width: coverAsset.width_px, height: coverAsset.height_px }
    : null

  const status = headerStatus({
    isPublished, publication: input.publication, schedule: input.schedule.targets, plannedDate: item.planned_date, layout,
  })
  const active = input.schedule.requests.find((r) => ['pending', 'applying', 'partially_applied'].includes(r.status))
  const removalPending = input.requests.some((r) => r.request_type === 'archive' && ['pending', 'applying'].includes(r.status))

  return {
    slug: input.slug,
    contentId: item.content_id,
    version: item.version,
    title: item.title,
    formatLabel: pieceFormatLabel(item.format, item.platforms ?? []),
    layout,
    tabs,
    updatedTabKeys: [...updated],
    updatedLine: reReview ? (updatedAreasLine(tabs, updated, changes.visualsChanged) || null) : null,
    beforeByBlock: reReview ? Object.fromEntries(changes.before) : {},
    reReview: reReview !== null,
    preview,
    previewRefreshUrl: preview ? `${input.previewRefreshBase}/${preview.id}` : null,
    fallbackMedia,
    episodeDriveUrl: layout === 'horizontal' && isHttps(item.drive_url) ? item.drive_url : null,
    mediaPending: expectsMedia && !preview && fallbackMedia.length === 0,
    visualTarget: pickVisualTarget(layout, preview, input.reviewAssets, designLinks),
    cover,
    status,
    approvedLabel: status.kind === 'scheduled' || status.kind === 'unconfirmed'
      ? `Approved · ${status.keyFact.charAt(0).toLowerCase()}${status.keyFact.slice(1)}`
      : 'Approved',
    postedLabel: status.kind === 'live' && status.postedLabel ? status.postedLabel : 'Posted',
    canRequestSchedule: capabilities.canManageSchedule && SCHEDULE_REQUEST_STATES.has(item.state),
    scheduleHasExternalTargets: input.schedule.targets.some((t) => t.required),
    activeScheduleRequest: active
      ? { kind: active.request_kind, when: active.requested_local ? displayRequestedLocal(active.requested_local) : null }
      : null,
    removal: capabilities.canSubmitRequests && !removalPending
      ? { slug: input.slug, contentId: item.content_id, idempotencyKey: input.removalKey }
      : null,
    canEdit: capabilities.canSubmitRequests && !isPublished && !revisionStarted,
    canDecide: capabilities.canDecide,
    canComment: capabilities.canComment,
    canSubmitRequests: capabilities.canSubmitRequests,
    isPublished,
    state: item.state,
    revisionStarted,
    sentSummary: { count: unresolved.length, dateLabel: firstSent ? torontoMonthDay(firstSent) : null },
    packageReady: readiness.ready,
    missing: readiness.missing,
    comments: input.comments,
    ledger: item.fact_check_ledger,
    factCheckScope: item.fact_check_scope,
    factCheckExemption: item.fact_check_exemption,
    requests: input.requests,
    requestMessages: input.requestMessages,
    item,
    showIntro: input.showIntro,
    backHref: input.backHref,
    backLabel: input.backLabel,
  }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/derive.test.ts"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add src/lib/portal/piece-page/limits.ts "src/app/client/[slug]/piece/[contentId]/v2/derive.ts" "src/app/client/[slug]/piece/[contentId]/v2/derive.test.ts"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Derive the new piece page's data in one tested place, same rules as today

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: The workspace, the page switch and the admin preview

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/PiecePageV2.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/page.tsx`
- Modify: `src/app/admin/portal/pieces/[contentId]/maria-preview/page.tsx`

- [ ] **Step 1: Write the failing integration test**

`PieceWorkspace.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
const { tickReviewTabs } = vi.hoisted(() => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment: vi.fn(async () => ({})) }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({ default: () => <div data-testid="history" /> }))

import type { ContentRow } from '@/lib/portal/data'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData, type DeriveInput } from './derive'
import PieceWorkspace from './PieceWorkspace'
import { stubDialogs } from './test-utils'

const preview: SignedReviewPreview = {
  id: 'p1', contentItemId: 'item-1', contentVersion: 2, previewKey: 'reel', reviewAssetKey: 'reel-video', mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed.example/v.mp4', posterUrl: null,
  frames: [{ label: '4.5 s', url: 'https://signed.example/f1.jpg' }, { label: '4.5 s', url: 'https://signed.example/f2.jpg' }],
  expiresAt: '2026-10-03T12:10:00.000Z',
}

function data(overrides: Partial<ContentRow> = {}, extra: Partial<DeriveInput> = {}) {
  const item = {
    id: 'item-1', content_id: 'kanset-2026-10-reel', title: 'What does hiring cost?', format: 'reel', pillar: 'employer',
    platforms: ['instagram', 'facebook', 'youtube'], status: 'draft', planned_date: '2026-10-02', schedule_state: 'unverified',
    publication_state: 'unverified', canva_url: null, drive_url: null, client_body: null, fact_check: 'confirmed', version: 2,
    current_decision: null, fact_check_scope: 'required', fact_check_exemption: null, fact_check_ledger: [],
    copy_blocks: [
      { key: 'reel-script', label: 'Reel, on screen', body: '**1.** FOR EMPLOYERS\n\n**2.** $1,000' },
      { key: 'social-caption', label: 'Caption', body: 'Caption.' },
      { key: 'youtube-package', label: 'YouTube Short', body: '**Title:** T' },
    ],
    state: 'needs_review', ...overrides,
  } as ContentRow
  return deriveWorkspaceData({
    slug: 'kanset', item, comments: [], schedule: { targets: [], requests: [] }, publication: [], requests: [],
    requestMessages: [], reviewAssets: [{ id: 'a', content_version: 2, asset_key: 'reel-video', label: 'Reel video', channel: 'social',
      asset_kind: 'video', url: 'https://drive.google.com/r', width_px: 1080, height_px: 1920, caption_status: 'not_applicable', review_note: null }],
    previews: [preview], capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
    showIntro: false, backHref: '/client/kanset', backLabel: 'Back to calendar', previewRefreshBase: '/api/client/kanset/review-previews',
    removalKey: 'k', ...extra,
  })
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  tickReviewTabs.mockClear()
})

describe('PieceWorkspace', () => {
  it('ticks the open tab and enables Approve only after every tab was opened', async () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(document.querySelector('[data-piece-page-v2]')).toHaveAttribute('data-layout', 'vertical')
    expect(screen.getByText('1 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    await waitFor(() => expect(tickReviewTabs).toHaveBeenCalledWith(expect.objectContaining({ tabKeys: ['onscreen'] })))
    fireEvent.click(screen.getByRole('tab', { name: /Caption/ }))
    fireEvent.click(screen.getByRole('tab', { name: /YouTube/ }))
    expect(screen.getByText('3 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('starts from the seat ticks on this version', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={['caption', 'youtube']} />)
    expect(screen.getByText('3 of 3 reviewed')).toBeInTheDocument()
  })

  it('collapses the frame grid while On-screen text is open and suggests a change on one frame', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(screen.getByText('2 frames')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 2' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 2 · Suggest a change' })).toBeVisible()
  })

  it('opens Questions & sources from the header', () => {
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Questions and sources, 0 messages' }))
    expect(screen.getByRole('dialog', { name: 'Questions & sources' })).toBeVisible()
  })

  it('takes no edits on a published piece and points to removal', () => {
    render(<PieceWorkspace data={data({ state: 'live' })} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    expect(screen.queryByRole('button', { name: /Edit text/ })).not.toBeInTheDocument()
    const bar = screen.getByRole('region', { name: 'Your review' })
    expect(within(bar).getByText('Need it taken down? Use Request removal in the menu at the top.')).toBeInTheDocument()
  })

  it('never writes ticks in the read-only preview', async () => {
    render(<PieceWorkspace data={data()} mode="preview" draftScope="read-only-preview:Maria" serverDrafts={null} ticks={[]} />)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(tickReviewTabs).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx"`
Expected: FAIL, cannot resolve `./PieceWorkspace`.

- [ ] **Step 3: Implement the workspace and the server wrapper**

`PieceWorkspace.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { MAX_EDIT_CHARS } from '@/lib/portal/piece-page/limits'
import { resolvePieceAction } from '@/lib/portal/piece-page/piece-action'
import { draftIdentity, type ServerDraftRow } from '@/lib/portal/review-drafts-core'
import ReviewDraftProvider, { useReviewDrafts, type ReviewDraft } from '../ReviewDraftProvider'
import CarriedDraftNotice from './CarriedDraftNotice'
import CopySwitcher, { tabDomId } from './CopySwitcher'
import DecisionBar from './DecisionBar'
import type { WorkspaceData, WorkspaceMode } from './derive'
import EditorHost, { useEditorHost } from './EditorHost'
import FirstVisitIntro from './FirstVisitIntro'
import { usePhone, useSwipe } from './hooks'
import MediaArea from './MediaArea'
import PieceHeader from './PieceHeader'
import QuestionsDrawer, { type DrawerTab } from './QuestionsDrawer'
import ReviewTicksProvider, { useReviewTicks } from './ReviewTicksProvider'
import ScheduleRequest from './ScheduleRequest'
import ArticlePanel from './panels/ArticlePanel'
import ChaptersPanel from './panels/ChaptersPanel'
import CopyPanel from './panels/CopyPanel'
import CoverImagePanel from './panels/CoverImagePanel'
import DocumentPanel from './panels/DocumentPanel'
import OnScreenTextPanel from './panels/OnScreenTextPanel'
import SearchSharingPanel from './panels/SearchSharingPanel'
import YouTubePanel from './panels/YouTubePanel'
import styles from './piece-page.module.css'

// The redesigned client piece page (spec 2026-10-03). One component tree for the client seat and
// the read-only "View as Maria" preview (mode), so plan 5 can add the agency view without a fork.
export default function PieceWorkspace({ data, mode, draftScope, serverDrafts, ticks }: {
  data: WorkspaceData
  mode: WorkspaceMode
  draftScope: string
  serverDrafts: ServerDraftRow[] | null
  ticks: string[]
}) {
  return <ReviewDraftProvider draftScope={draftScope} slug={data.slug} contentId={data.contentId} version={data.version}
    serverSync={mode === 'client' && Array.isArray(serverDrafts)} initialServerDrafts={serverDrafts}>
    <ReviewTicksProvider slug={data.slug} contentId={data.contentId} version={data.version} scope={draftScope}
      initial={ticks} persist={mode === 'client'}>
      <EditorHost mode={mode}>
        <WorkspaceBody data={data} mode={mode} />
      </EditorHost>
    </ReviewTicksProvider>
  </ReviewDraftProvider>
}

function countDraftsByTab(tabs: CopyTab[], drafts: ReviewDraft[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tab of tabs) {
    if (tab.kind === 'chapters') continue
    const keys = new Set(tab.blocks.map((block) => block.key).filter((key): key is string => Boolean(key)))
    const count = drafts.filter((draft) => draft.kind === 'copy_block' && keys.has(draft.key)).length
    if (count > 0) counts[tab.key] = count
  }
  return counts
}

function WorkspaceBody({ data, mode }: { data: WorkspaceData; mode: WorkspaceMode }) {
  const { currentDrafts, carriedDrafts, syncState } = useReviewDrafts()
  const { ticked, tick } = useReviewTicks()
  const { open } = useEditorHost()
  const isPhone = usePhone()
  const [active, setActive] = useState(data.tabs[0]?.key ?? '')
  const [page, setPage] = useState(0)
  const [drawer, setDrawer] = useState<{ open: boolean; tab: DrawerTab }>({ open: false, tab: 'conversation' })

  useEffect(() => { if (active) tick(active) }, [active, tick])

  const index = Math.max(0, data.tabs.findIndex((tab) => tab.key === active))
  const activeTab = data.tabs[index] ?? null
  const select = (next: number) => {
    const tab = data.tabs[Math.min(data.tabs.length - 1, Math.max(0, next))]
    if (tab) setActive(tab.key)
  }
  const swipe = useSwipe(() => select(index + 1), () => select(index - 1))

  const draftCounts = useMemo(() => countDraftsByTab(data.tabs, [...currentDrafts, ...carriedDrafts]),
    [carriedDrafts, currentDrafts, data.tabs])
  const unticked = data.tabs.filter((tab) => !ticked.has(tab.key))
  const action = resolvePieceAction({
    isPublished: data.isPublished,
    state: data.state,
    revisionStarted: data.revisionStarted,
    currentDraftCount: currentDrafts.length,
    carriedDraftCount: carriedDrafts.length,
    sentUnresolvedCount: data.sentSummary.count,
    packageReady: data.packageReady,
    missing: data.missing,
    canDecide: data.canDecide,
    tabsTotal: data.tabs.length,
    tabsTicked: data.tabs.length - unticked.length,
    untickedLabels: unticked.map((tab) => tab.label),
    mediaPending: data.mediaPending,
    sendFailed: syncState === 'send_failed',
    overLimit: currentDrafts.some((draft) => draft.proposedText.length > MAX_EDIT_CHARS),
  })

  const visual = data.visualTarget
  const frames = data.preview?.frames ?? []
  const canSuggest = data.canEdit && visual !== null
  function suggest(at: number | null) {
    if (!visual) return
    const anchored = at !== null && visual.anchors
    const word = data.layout === 'pages' ? 'page' : 'frame'
    const label = `${word === 'page' ? 'Page' : 'Frame'} ${(at ?? 0) + 1}`
    open({
      kind: 'note',
      target: {
        kind: visual.kind, key: visual.key, label: visual.label, urlSnapshot: visual.url,
        anchor: anchored ? `${word}:${(at as number) + 1}` : '', anchorLabel: anchored ? label : null,
      },
      title: anchored ? `${label} of ${frames.length} · Suggest a change` : `${visual.label} · Suggest a change`,
      thumbUrl: anchored ? frames[at as number]?.url ?? null : null,
    })
  }

  function showCarried() {
    const first = carriedDrafts[0]
    if (!first) return
    const tab = first.kind === 'copy_block'
      ? data.tabs.find((t) => t.kind !== 'chapters' && t.blocks.some((block) => block.key === first.key))
      : null
    if (tab) setActive(tab.key)
    window.requestAnimationFrame(() => {
      document.getElementById(`carried-${draftIdentity(first)}`)?.scrollIntoView?.({ block: 'center' })
    })
  }

  const before = data.beforeByBlock
  let panel = <p className={styles.meta}>No copy for this piece yet.</p>
  if (activeTab) {
    switch (activeTab.kind) {
      case 'onscreen':
        panel = <OnScreenTextPanel tab={activeTab} frames={frames} before={before} canEdit={data.canEdit}
          onSuggestFrame={canSuggest && visual?.anchors ? (at) => suggest(at) : null} version={data.version} />
        break
      case 'youtube':
        panel = <YouTubePanel tab={activeTab} before={before} canEdit={data.canEdit} version={data.version} />
        break
      case 'chapters':
        panel = <ChaptersPanel tab={activeTab} canEdit={data.canEdit} version={data.version} />
        break
      case 'document':
        panel = <DocumentPanel tab={activeTab} page={page} onPageChange={setPage}
          pageThumbs={data.preview?.mediaKind === 'pages' ? data.preview.frames : []} before={before}
          canEdit={data.canEdit} version={data.version} />
        break
      case 'article':
        panel = <ArticlePanel tab={activeTab} coverUrl={data.cover?.previewUrl ?? null} before={before}
          canEdit={data.canEdit} version={data.version} />
        break
      case 'seo':
        panel = <SearchSharingPanel tab={activeTab} canEdit={data.canEdit} version={data.version} />
        break
      case 'cover':
        panel = <CoverImagePanel cover={data.cover} onSuggest={canSuggest ? () => suggest(null) : null} />
        break
      default:
        panel = <CopyPanel tab={activeTab} before={before} canEdit={data.canEdit} version={data.version} />
    }
  }

  const visualCarried = carriedDrafts.filter((draft) => draft.kind !== 'copy_block')
  const copy = <section aria-label="Copy">
    {visualCarried.map((draft) => <CarriedDraftNotice key={draftIdentity(draft)} draft={draft} currentText="" version={data.version} />)}
    {data.tabs.length > 0 && <CopySwitcher idPrefix="piece" tabs={data.tabs} active={activeTab?.key ?? ''} onSelect={setActive}
      ticked={ticked} draftCounts={draftCounts} updated={new Set(data.updatedTabKeys)} />}
    <div role="tabpanel" id="piece-panel" aria-labelledby={activeTab ? tabDomId('piece', activeTab.key) : undefined}
      className={styles.sheet} tabIndex={0} {...(isPhone ? swipe : {})}>
      {panel}
    </div>
  </section>

  const media = data.layout === 'vertical' || data.layout === 'horizontal' || data.layout === 'pages'
    ? <MediaArea layout={data.layout} title={data.title} preview={data.preview} refreshUrl={data.previewRefreshUrl}
      fallbackMedia={data.fallbackMedia} episodeDriveUrl={data.episodeDriveUrl} mediaPending={data.mediaPending}
      framesCollapsed={activeTab?.kind === 'onscreen'} page={page} onPageChange={setPage}
      onSuggestWhole={canSuggest ? () => suggest(null) : null}
      onSuggestAt={canSuggest && visual?.anchors ? (at) => suggest(at) : null} />
    : null

  return <div className={styles.root} data-piece-page-v2="" data-layout={data.layout}>
    <PieceHeader title={data.title} formatLabel={data.formatLabel} backHref={data.backHref} backLabel={data.backLabel}
      status={data.status} updatedLine={data.updatedLine} questionsCount={data.comments.length}
      onOpenQuestions={() => setDrawer({ open: true, tab: 'conversation' })} removal={data.removal}
      scheduleSlot={<ScheduleRequest slug={data.slug} contentId={data.contentId} canRequest={data.canRequestSchedule}
        hasExternalTargets={data.scheduleHasExternalTargets} active={data.activeScheduleRequest} />} />
    <div className={styles.page}>
      {data.layout === 'vertical' || data.layout === 'pages'
        ? <div className={styles.split}><aside className={styles.media} aria-label="Media">{media}</aside>{copy}</div>
        : data.layout === 'horizontal'
          ? <div className={styles.stack}>{media}<div className={styles.readw}>{copy}</div></div>
          : <div className={styles.readw}>{copy}</div>}
    </div>
    <DecisionBar action={action} ticks={{ total: data.tabs.length, done: data.tabs.length - unticked.length }}
      version={data.version} reReview={data.reReview} approvedLabel={data.approvedLabel} postedLabel={data.postedLabel}
      sentSummary={data.sentSummary} slug={data.slug} contentId={data.contentId} mode={mode}
      onOpenPastEdits={() => setDrawer({ open: true, tab: 'past' })} onShowCarried={showCarried} />
    <QuestionsDrawer open={drawer.open} tab={drawer.tab} onTabChange={(tab) => setDrawer((d) => ({ ...d, tab }))}
      onClose={() => setDrawer((d) => ({ ...d, open: false }))} slug={data.slug} contentId={data.contentId}
      comments={data.comments} canComment={data.canComment} ledger={data.ledger} factCheckScope={data.factCheckScope}
      factCheckExemption={data.factCheckExemption} requests={data.requests} requestMessages={data.requestMessages}
      item={data.item} canReply={data.canSubmitRequests} />
    <FirstVisitIntro slug={data.slug} show={data.showIntro} persist={mode === 'client'} />
  </div>
}
```

`PiecePageV2.tsx`:

```tsx
import { randomUUID } from 'node:crypto'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import PieceWorkspace from './PieceWorkspace'
import { deriveWorkspaceData, type DeriveInput, type WorkspaceMode } from './derive'

export type PiecePageV2Props = Omit<DeriveInput, 'removalKey'> & {
  mode: WorkspaceMode
  draftScope: string
  serverDrafts: ServerDraftRow[] | null
  ticks: string[]
}

// Server component: derives the page once per request, then hands serialisable data to the
// client workspace.
export default function PiecePageV2({ mode, draftScope, serverDrafts, ticks, ...input }: PiecePageV2Props) {
  const data = deriveWorkspaceData({ ...input, removalKey: randomUUID() })
  return <PieceWorkspace data={data} mode={mode} draftScope={draftScope} serverDrafts={serverDrafts} ticks={ticks} />
}
```

- [ ] **Step 4: Run the workspace test**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Route seats on the switch to the new page**

Replace the whole of `src/app/client/[slug]/piece/[contentId]/page.tsx` with (this is today's file after plans 1 and 3, plus the switch):

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getComments } from '@/lib/portal/comments'
import { getScheduleDetails } from '@/lib/portal/schedule'
import { getPublicationDetails } from '@/lib/portal/publication'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import { getReviewAssets } from '@/lib/portal/review-assets'
import { getMyReviewDrafts } from '@/lib/portal/review-drafts'
import { getClientReviewPreviews } from '@/lib/portal/review-previews'
import { getMyReviewTicks } from '@/lib/portal/piece-page/review-ticks'
import { usesPiecePageV2 } from '@/lib/portal/piece-page/piece-page-switch'
import { PIECE_PAGE_INTRO_KEY, REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'
import { createSupabaseServer } from '@/lib/supabase/server'
import PieceReviewScreen from './PieceReviewScreen'
import PiecePageV2 from './v2/PiecePageV2'
import { getPieceItem, resolvePieceMetadata } from './piece-metadata'

export async function generateMetadata({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}): Promise<Metadata> {
  const { slug, contentId } = await params
  return resolvePieceMetadata(slug, contentId)
}

export default async function Piece({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getPieceItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)
  const v2 = usesPiecePageV2(session.email)
  const supabase = await createSupabaseServer()
  const [comments, schedule, publication, requests, reviewAssets, acknowledgment, serverDrafts] = await Promise.all([
    getComments(session.clientId, item.id),
    getScheduleDetails(session.clientId, item.id, item.version),
    getPublicationDetails(session.clientId, item.id, item.version),
    getContentRequests(session.clientId, item.id),
    getReviewAssets(session.clientId, item.id, item.version),
    supabase.from('portal_announcement_acknowledgments').select('acknowledged_at')
      .eq('client_id', session.clientId)
      .eq('announcement_key', v2 ? PIECE_PAGE_INTRO_KEY : REVIEW_FLOW_ANNOUNCEMENT_KEY)
      .maybeSingle(),
    // A seat that cannot send edits has no drafts to sync. null keeps the page browser-only.
    session.canSubmitRequests ? getMyReviewDrafts(item.id) : Promise.resolve(null),
  ])
  const requestMessages = await getContentRequestMessages(
    session.clientId,
    requests.map((request) => request.id),
  )

  if (v2) {
    const [previews, ticks] = await Promise.all([
      // A preview read failure falls back to the Drive buttons; it never fails the page.
      getClientReviewPreviews(session.clientId, item.id, item.version).catch((error: unknown) => {
        console.error('review previews unavailable', error)
        return []
      }),
      getMyReviewTicks(item.id, item.version),
    ])
    return <PiecePageV2
      mode="client"
      slug={slug}
      item={item}
      comments={comments}
      schedule={schedule}
      publication={publication}
      requests={requests}
      requestMessages={requestMessages}
      reviewAssets={reviewAssets}
      previews={previews}
      capabilities={session}
      showIntro={!acknowledgment.data}
      backHref={`/client/${slug}`}
      backLabel="Back to calendar"
      previewRefreshBase={`/api/client/${slug}/review-previews`}
      draftScope={session.userId}
      serverDrafts={serverDrafts}
      ticks={ticks}
    />
  }

  return <PieceReviewScreen
    slug={slug}
    item={item}
    comments={comments}
    schedule={schedule}
    publication={publication}
    requests={requests}
    requestMessages={requestMessages}
    reviewAssets={reviewAssets}
    capabilities={session}
    draftScope={session.userId}
    showReviewIntro={!acknowledgment.data}
    serverDrafts={serverDrafts}
    backHref={`/client/${slug}`}
  />
}
```

Before saving, diff against the file on the branch (`git -C ~/worktrees/kanset-piece-page-ui diff HEAD -- "src/app/client/[slug]/piece/[contentId]/page.tsx"` after writing): the only changes must be the four new imports, `v2`, the announcement key expression and the `if (v2)` block. If plans 1 or 3 left anything else in the file that is not above, keep it.

- [ ] **Step 6: Let the admin "View as Maria" preview show the new page with `?layout=v2`**

In `src/app/admin/portal/pieces/[contentId]/maria-preview/page.tsx`, add the imports:

```tsx
import PiecePageV2 from '@/app/client/[slug]/piece/[contentId]/v2/PiecePageV2'
import { getAgencyReviewPreviews } from '@/lib/portal/review-previews'
```

change the signature to accept `searchParams`:

```tsx
export default async function MariaPiecePreviewPage({ params, searchParams }: {
  params: Promise<{ contentId: string }>
  searchParams: Promise<{ layout?: string }>
}) {
```

and immediately after `if (!preview) notFound()` insert:

```tsx
  const { layout } = await searchParams
  if (layout === 'v2') {
    const previews = await getAgencyReviewPreviews(preview.item.id, preview.item.version).catch(() => [])
    return (
      <ReadOnlyPreview>
        <div style={{ padding: '12px 32px 0', fontFamily: 'var(--dot-font-text)', color: 'var(--dot-graphite)', fontSize: 13 }}>
          Exact permissions loaded from {preview.seatName}&apos;s live portal seat. New piece page (plan 4).
        </div>
        <PiecePageV2
          mode="preview"
          slug={preview.slug}
          item={preview.item}
          comments={preview.comments}
          schedule={preview.schedule}
          publication={preview.publication}
          requests={preview.requests}
          requestMessages={preview.requestMessages}
          reviewAssets={preview.reviewAssets}
          previews={previews}
          capabilities={preview.capabilities}
          showIntro={false}
          backHref={`/admin/portal/pieces/${encodeURIComponent(decoded)}`}
          backLabel="Back to Agency Ops"
          previewRefreshBase="/api/admin/portal/review-previews"
          draftScope={`read-only-preview:${preview.seatName}`}
          serverDrafts={null}
          ticks={[]}
        />
      </ReadOnlyPreview>
    )
  }
```

The preview writes nothing: `mode="preview"` turns off tick writes, server drafts, Send and Approve; `ReadOnlyPreview` still blocks every form submit.

- [ ] **Step 7: Run the whole piece folder, the admin preview tests and types**

Run: `pnpm exec vitest run "src/app/client/[slug]" src/lib/portal/piece-page src/components/portal "src/app/admin/portal/pieces"`
Expected: PASS for every file, old and new. The old page's tests (`ReviewVerdict`, `SuggestEditForm`, `ReviewAssets`, `ReviewFlowIntro`, `DecideForm`, `RemovalRequestForm`, `ReviewDraftProvider`) are untouched and still pass.

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]|piece-page/|tick-actions|playback-actions|ReviewPreviewMedia|useSignedPreview|maria-preview|actions\.ts' || echo clean`
Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PiecePageV2.tsx" "src/app/client/[slug]/piece/[contentId]/page.tsx" "src/app/admin/portal/pieces/[contentId]/maria-preview/page.tsx"
git -C ~/worktrees/kanset-piece-page-ui commit -m "Serve the new piece page to switched-on seats and in the admin preview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29a: Report failed plays from the client page only, and keep them out of her feed (amended 2026-10-03)

**Files:**
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx`
- Modify: `src/lib/portal/data.ts`

- [ ] **Step 1: Write the failing test**

In `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx`, after the line `vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs }))` add:

```tsx
const { reportReviewPlaybackFailure } = vi.hoisted(() => ({ reportReviewPlaybackFailure: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/playback-actions', () => ({ reportReviewPlaybackFailure }))
```

and append at the end of the file:

```tsx
describe('PieceWorkspace playback reports (amended 2026-10-03)', () => {
  function failTheVideo() {
    const video = screen.getByLabelText('What does hiring cost?: video')
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    fireEvent.error(video)
  }

  it('reports a failed play from the client page', async () => {
    reportReviewPlaybackFailure.mockClear()
    render(<PieceWorkspace data={data()} mode="client" draftScope="maria" serverDrafts={[]} ticks={[]} />)
    failTheVideo()
    await waitFor(() => expect(reportReviewPlaybackFailure).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'kanset-2026-10-reel', contentVersion: 2, previewKey: 'reel',
    })))
  })

  it('never reports from the admin preview', async () => {
    reportReviewPlaybackFailure.mockClear()
    render(<PieceWorkspace data={data()} mode="preview" draftScope="read-only-preview:Maria" serverDrafts={null} ticks={[]} />)
    failTheVideo()
    expect(await screen.findByText("This video didn't load.")).toBeInTheDocument()
    expect(reportReviewPlaybackFailure).not.toHaveBeenCalled()
  })
})
```

`data()` is the file's own fixture: a vertical reel at version 2 with the `reel` preview, for the `kanset` slug.

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx"`
Expected: FAIL on the first new test (no report: `MediaArea` gets no `playbackReport`).

- [ ] **Step 2: Pass the report target in client mode only**

In `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx`, replace:

```tsx
      onSuggestAt={canSuggest && visual?.anchors ? (at) => suggest(at) : null} />
    : null
```

with:

```tsx
      onSuggestAt={canSuggest && visual?.anchors ? (at) => suggest(at) : null}
      playbackReport={mode === 'client' ? { slug: data.slug, contentId: data.contentId } : null} />
    : null
```

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx"`
Expected: PASS, including the two new tests.

- [ ] **Step 3: Keep the failure out of her activity feed**

The `review_playback_failed` activity row is a client-actor row (it is how the agency gets its email), so the tenant can read it; the feed must not show it. In `src/lib/portal/data.ts`, append `'review_playback_failed'` as the last entry of `CLIENT_FEED_EXCLUDED_EVENTS` (after the entries plans 2 and 3 added), with this comment line directly above the entry:

```ts
  // 'review_playback_failed' (0094, amended 2026-10-03): her own failed play, reported to the agency.
```

Run: `pnpm test`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx" "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx" src/lib/portal/data.ts
git -C ~/worktrees/kanset-piece-page-ui commit -m "Report failed plays from the client piece page only, outside her feed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 30: Scripted phone-width and desktop check

**Files:**
- Create: `scripts/piece-page-phone-check.mjs`

jsdom has no layout, so the component tests prove structure, roles and states; this script proves layout. It drives the read-only admin preview (`?layout=v2`), so it needs no client seat and cannot write anything. It uses the codex runtime Playwright (no new project dependency) and is run in Task 32 against a local production build and in Task 33 against production.

- [ ] **Step 1: Write the script**

```js
// Layout checks for the redesigned piece page (plan 4a). Drives the read-only "View as Maria"
// preview with ?layout=v2 at 375px (phone) and 1440px (desktop):
//   - no horizontal scroll on the phone
//   - every button, link and tab outside running text is at least 44px tall on the phone
//   - one h1; body copy at least 16px
//   - the decision bar is inside the viewport
//   - the condensed header collapses past 120px, stays at 60px, expands under 40px, and the page
//     height never changes while it does
//   - with reduced motion the condensed bar has no transition
// Writes PNGs to OUT. Exits 1 on any failure.
//
//   BASE=http://localhost:3000 PIECES=<reel id>,<podcast id>,<linkedin id>,<article id> node scripts/piece-page-phone-check.mjs
import { SignJWT } from 'jose'
import { mkdirSync, readFileSync } from 'node:fs'

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE
  || '/Users/anastasiavolkova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(PLAYWRIGHT)
const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = process.env.OUT || '/tmp/kanset-piece-page-check'
const PIECES = (process.env.PIECES || '').split(',').map((id) => id.trim()).filter(Boolean)
if (PIECES.length === 0) throw new Error('Set PIECES to a comma list of content ids: one reel, one podcast, one LinkedIn PDF, one article')
mkdirSync(OUT, { recursive: true })

const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('ADMIN_JWT_SECRET='))
if (!line) throw new Error('ADMIN_JWT_SECRET not found in .env.local')
const secret = line.slice('ADMIN_JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '')
const token = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' })
  .setSubject('admin').setIssuer('thedot-site').setAudience('thedot-admin')
  .setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret))

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
]
const failures = []
const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2,
    })
    await context.addCookies([{ name: 'session', value: token, domain: new URL(BASE).hostname, path: '/',
      httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax' }])
    const page = await context.newPage()
    for (const id of PIECES) {
      const label = `${vp.name} ${id}`
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(`${BASE}/admin/portal/pieces/${encodeURIComponent(id)}/maria-preview?layout=v2`, { waitUntil: 'networkidle', timeout: 60000 })
      if (page.url().includes('/admin/login')) { failures.push(`${label}: bounced to login`); continue }
      await page.waitForSelector('[data-piece-page-v2]', { timeout: 20000 })
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-top.png` })

      const facts = await page.evaluate(() => {
        const root = document.querySelector('[data-piece-page-v2]')
        const overflow = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth
        const small = [...root.querySelectorAll('button, a, [role="tab"]')].filter((el) => {
          if (el.closest('[inert]') || el.closest('p') || el.closest('dialog:not([open])')) return false
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && rect.height < 44
        }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().height)}px`)
        const panel = document.querySelector('[role="tabpanel"]')
        const bar = document.querySelector('[aria-label="Your review"]')
        return {
          overflow,
          small,
          h1: document.querySelectorAll('h1').length,
          bodyFont: panel ? parseFloat(getComputedStyle(panel).fontSize) : 16,
          barInView: bar ? bar.getBoundingClientRect().bottom <= window.innerHeight + 1 : true,
          tall: document.scrollingElement.scrollHeight > window.innerHeight + 200,
        }
      })
      if (facts.h1 !== 1) failures.push(`${label}: ${facts.h1} h1 elements`)
      if (facts.bodyFont < 16) failures.push(`${label}: body copy ${facts.bodyFont}px`)
      if (!facts.barInView) failures.push(`${label}: decision bar outside the viewport`)
      if (vp.name === 'phone') {
        if (facts.overflow > 0) failures.push(`${label}: horizontal scroll of ${facts.overflow}px`)
        for (const item of facts.small) failures.push(`${label}: touch target under 44px: ${item}`)
      }

      if (facts.tall) {
        const states = []
        const heights = []
        for (const y of [0, 130, 60, 30]) {
          await page.evaluate((top) => window.scrollTo(0, top), y)
          await page.waitForTimeout(350)
          states.push(await page.evaluate(() => document.querySelector('[data-collapsed]')?.getAttribute('data-collapsed')))
          heights.push(await page.evaluate(() => document.scrollingElement.scrollHeight))
        }
        if (states.join(',') !== 'false,true,true,false') failures.push(`${label}: header states ${states.join(',')}`)
        if (new Set(heights).size !== 1) failures.push(`${label}: page height changed ${heights.join(',')}`)
        await page.evaluate(() => window.scrollTo(0, 400))
        await page.waitForTimeout(350)
        await page.screenshot({ path: `${OUT}/${vp.name}-${id}-scrolled.png` })
      }

      await page.emulateMedia({ reducedMotion: 'reduce' })
      const transition = await page.evaluate(() => getComputedStyle(document.querySelector('[data-collapsed]')).transitionDuration)
      if (!/^0s(, 0s)*$/.test(transition)) failures.push(`${label}: condensed bar animates with reduced motion (${transition})`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-full.png`, fullPage: true })
      console.log(`${label}: checked`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}
for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(failures.length === 0 ? `PASS: ${PIECES.length} pieces at 375px and 1440px` : `${failures.length} failures`)
process.exit(failures.length === 0 ? 0 : 1)
```

- [ ] **Step 2: Check it parses**

Run: `node --check scripts/piece-page-phone-check.mjs && echo ok`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-ui add scripts/piece-page-phone-check.mjs
git -C ~/worktrees/kanset-piece-page-ui commit -m "Script phone-width and desktop layout checks for the new piece page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: Documentation

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`
- Modify (outside git): `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md`

- [ ] **Step 1: Manual**

In `docs/PORTAL-AGENT-MANUAL.md` section 5, add after the last migration row (0093 if present):

```markdown
| `0094_piece_page_review_ticks` | n/a | Stores per-seat, per-version copy-tab ticks for the redesigned piece page (a seat reads only its own rows; the only write is `tick_review_tabs`, on the released version) and makes `record_content_decision` refuse an approval while the approving seat has unsent server drafts. Amended 2026-10-03: `content_review_playback_failures` logs failed review video plays through `report_review_playback_failure` (seat-scoped, released version, rate-limited; the first per preview per Toronto day emails the agency and raises a `review_playback_failed` inbox event, never the client). |
```

In section 16's table, add:

```markdown
| `PORTAL_PIECE_PAGE_V2` | which client seats see the redesigned piece page: `off` (default), `all`, or a comma list of seat emails. A change needs a redeploy. |
```

In section 18 (Common recipes), add:

```markdown
**See the redesigned piece page as Maria (read-only).** Open `/admin/portal/pieces/<content id>/maria-preview?layout=v2`. Nothing is written: ticks, drafts, Send and Approve are off in the preview.

**Turn the redesigned piece page on for a seat.** Set `PORTAL_PIECE_PAGE_V2` in Vercel (Production) to the seat email list, for example `toodokie@gmail.com`, then redeploy. `all` turns it on for every seat; `off` restores today's page everywhere. The old page stays the default until plan 5 retires it.

**When Maria's review video does not play (since 0094).** Her player reports it itself: the first failure per preview per day emails the agency ("Maria's video didn't play: iPhone, Safari") and shows under From Maria in My Tasks (plan 5). She sees "This video didn't load. I've been notified." and a Retry button that fetches fresh links. Read the log with `select occurred_at, preview_key, error_code, device, browser, notified from content_review_playback_failures order by occurred_at desc limit 20` (service role). Only a device and browser name is stored, never the user agent.

**Check the new page's layout at phone width.** `BASE=<origin> PIECES=<reel>,<podcast>,<linkedin>,<article> node scripts/piece-page-phone-check.mjs` (read-only, through the admin preview; screenshots in `/tmp/kanset-piece-page-check`).
```

- [ ] **Step 2: Playbook**

In `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` section 9, add a bullet after "If a client action seems absent...":

```markdown
- **Review ticks on the redesigned piece page (plan 4a, migration `0094`):** opening a copy tab ticks it for that seat and version. Ticks write no activity, raise no inbox event and email nobody. They gate the Approve button only. The database separately refuses an approval while the approving seat still has unsent drafts.
- **Failed review video plays (0094, amended 2026-10-03):** Maria's player reports a failed play. The agency gets one email and a My Tasks item per preview per day; Maria gets no email, only the on-page message with Retry.
```

- [ ] **Step 3: Commit (manual only; the playbook is outside git)**

```bash
git -C ~/worktrees/kanset-piece-page-ui add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-piece-page-ui commit -m "Document 0094, the piece page switch and the phone check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 32: Full verification, one build, layout check, freeze

**Files:** none changed (fixes, if any, go back to the task that owns the file).

- [ ] **Step 1: Unit suite**

Run: `pnpm test`
Expected: all files pass, including every pre-existing test.

- [ ] **Step 2: Types for this plan's files**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]|piece-page/|tick-actions|playback-actions|ReviewPreviewMedia|useSignedPreview|maria-preview|portal-shell|client/\[slug\]/actions' || echo clean`
Expected: `clean`.

- [ ] **Step 3: RLS suite against the local stack (Task 0, step 3 environment exported)**

Run: `pnpm test:rls:seed-local && pnpm test:rls 2>&1 | tail -5`
Expected: no failures; TK1 to TK5 pass alongside the plan 2 and 3 blocks.

- [ ] **Step 4: The one production build**

Run: `pnpm build`
Expected: the design-system build, the portfolio sync and `next build` finish without errors.

- [ ] **Step 5: Layout check against the local build, then stop the server**

```bash
cd ~/worktrees/kanset-piece-page-ui
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY   # read-only check uses .env.local's production project through the admin preview
pnpm start -p 3100 > /tmp/kanset-piece-page-ui-start.log 2>&1 &
echo $! > /tmp/kanset-piece-page-ui-start.pid
until curl -s -o /dev/null http://localhost:3100; do sleep 1; done
BASE=http://localhost:3100 PIECES=kanset-2026-10-foreign-worker-cost-reel,kanset-2026-09-podcast-ep3,kanset-2026-09-linkedin-foreign-worker-cost,kanset-2026-09-podcast-ep3-article node scripts/piece-page-phone-check.mjs
kill "$(cat /tmp/kanset-piece-page-ui-start.pid)" && rm /tmp/kanset-piece-page-ui-start.pid
```

Expected: `PASS: 4 pieces at 375px and 1440px`. The local server reads production through the admin service role but only renders; nothing is written (`mode="preview"`, `ReadOnlyPreview`). Before this step, plans 2 and 3 and migration 0094 must be live in production, or the preview's preview read and the page's tick read fail soft (no media, no ticks) and the layout check is not meaningful. If 0094 is not live yet, run this step after Task 33, step 2.

Cleanup condition: the `pnpm start` process is killed by the last command; confirm with `lsof -i :3100` (no output).

- [ ] **Step 6: Look at the screenshots**

Open `/tmp/kanset-piece-page-check/phone-*-top.png`, `phone-*-scrolled.png` and the desktop ones with the Read tool and compare each with the matching mockup in `.superpowers/brainstorm/mockups-2026-10-03/png-v3/`. Note every visible difference in the hand-off (Task 33); fix only what contradicts the approved mockups, in the task that owns the file, and re-run Steps 1, 2, 4 and 5.

- [ ] **Step 7: UI/UX checklist pass**

Invoke the `ui-ux-pro-max:ui-ux-pro-max` skill in review mode on `src/app/client/[slug]/piece/[contentId]/v2/` and the Step 6 screenshots, and check at least: one primary action per screen (the yellow Approve or Send only); body text at least 16px and line length about 60 to 75 characters in panels; visible focus on every control (Tab through the page at 1440px: header, menu, tabs with arrow keys, panel, bar, drawer with focus kept inside and Escape closing it); no hover-only actions; reduced motion honoured; touch targets at least 44px at 375px (the script checks this); colour contrast of grey text on cream and white (`--dot-grey-accessible`). Fix findings in the owning task's files and re-run Steps 1, 2, 4 and 5.

- [ ] **Step 8: Freeze**

```bash
git -C ~/worktrees/kanset-piece-page-ui status --short
git -C ~/worktrees/kanset-piece-page-ui log --oneline origin/feat/portal-audit-fixes-2026-09-15..HEAD
git -C ~/worktrees/kanset-piece-page-ui rev-parse HEAD
```

Expected: a clean tree (build output is gitignored), the plan's commits listed, one hash. That hash is what gets reviewed.

---

### Task 33: Review and rollout to the preview seat (needs Anastasia; not done by the executing agent alone)

- [ ] **Step 1: Code review of the frozen hash.** Run the `code-review` skill on `git diff origin/feat/portal-audit-fixes-2026-09-15...<frozen hash>` (no Codex lane, Anastasia 2026-09-21). Fix findings in new commits on the same branch, re-run Task 32 steps 1 to 4, re-freeze.
- [ ] **Step 2: Apply 0094 to production** through the manual's section 15 tier-1 runbook (back up first, apply, capture the migration output and `select public.assert_portal_security()`). Plans 2 and 3 (0092, 0093) must already be live. The migration must be live before the code that reads `content_review_tab_ticks` deploys (playbook section 12, step 4).
- [ ] **Step 3: Set the switch for the preview seat only:** in Vercel, Production environment, `PORTAL_PIECE_PAGE_V2=toodokie@gmail.com`. Anastasia approves this setting; it changes nothing for Maria.
- [ ] **Step 4: Deploy by pushing the reviewed branch:** `git -C ~/thedot-site fetch origin && git -C ~/thedot-site checkout feat/portal-audit-fixes-2026-09-15 && git -C ~/thedot-site merge --ff-only feat/piece-page-ui && git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15`. Watch the Vercel deployment to Ready.
- [ ] **Step 5: Verify production, read-only:**
  1. Maria's seat is unchanged: open `/admin/portal/pieces/<id>/maria-preview` (no `layout`), which renders today's page.
  2. The new page renders for each format: `BASE=https://www.thedotcreative.co PIECES=... node scripts/piece-page-phone-check.mjs` passes.
  3. On the preview seat (admin-minted `token_hash` link, per the "test the portal as a client seat" rule; never Maria's account): open a released reel, a podcast, a LinkedIn PDF and an article; confirm ticks persist after a reload and on a second browser; confirm the intro shows once and not again after Got it. The preview seat cannot decide, so Approve shows the non-decider line; send and approve are proven by the real-JWT tests (TK4, TK5, plan 3's DR block) and by the component tests.
- [ ] **Step 6: Anastasia reviews the new page on the preview seat** and lists changes. Agreed changes become a short follow-up on this branch before 4b starts.
- [ ] **Step 7: Clean up:** `git -C ~/thedot-site worktree remove ~/worktrees/kanset-piece-page-ui`; `supabase stop` in the worktree before removing it if it is still running; delete `/tmp/kanset-piece-page-check` after Anastasia has seen the screenshots.

---

## Self-review

**Spec coverage (sections named in the brief):**
- 3 (contract): one derived action in the contract order, unsent tray semantics as the bar's unsent line, Approve gated by readiness + no drafts + no unresolved edits (now also in the database for the seat's drafts), revision started hides editing and sending, published takes no edits, conversation labelled non-binding, one-review rule (Tasks 11, 25, 29, 1). The edit composer contract (full block as the editor's source, binding visual edits, atomic send through plan 3) is kept: every editor composes the whole block (Task 19).
- 4.1 header: h1, format, one status line, Request another date, Questions, ⋯ menu with Request removal and Copy link, updated line (Tasks 10, 20). Live links in the header once published (Task 10, 20).
- 4.2 media: 9:16 split with sticky media and the 4-across grid collapsing on On-screen text; 16:9 full width with trailer and Drive link; 4:5 page viewer with arrows, swipe, counter, enlarge; article layout; Suggest a change per frame and page plus one general note; Drive fallback (Tasks 8, 21, 29).
- 4.3 copy switcher: tabs per format, ticks per seat and version persisted server-side, "n of N reviewed", Approve gated, updated dots and highlighted passages, on-screen text frame by frame with Edit text and Suggest a change (Tasks 1, 8, 9, 12, 18, 22, 23).
- 4.4 articles: Article / Search & sharing / Cover image, section-by-section edit composing one block (Tasks 7, 24). "Jump to my edits" is in 4b.
- 4.5 drawer: side drawer / full-screen sheet, labelled, conversation, sources, Past edits (Task 26).
- 4.6 and 4.7 bar and states: sticky, safe area, above the keyboard; media not ready, revision in progress, approved, published, send failed with Retry, updated after feedback with tab dots, carried drafts (Tasks 17, 23, 25, 29).
- 9.2 intro (Task 27). 10 and 10a design system and v3 look, collapsing header with hysteresis, reduced motion (Tasks 11, 16, 17, 20). 12 tests: tick gating, resolver, structured-field mapping (read side), RLS, phone-width checks (Tasks 2, 11, 6, 7, 30, 32). Round-trip editor tests, track changes, structured editing, the 50,000 counter and mobile editor sheets: plan 4b.

**Playback failure reporting (amended 2026-10-03):** detection (error, stall after play, expired link) with one silent refresh first, report once per page load, honest message and Retry with fresh links (Tasks 12a, 21a); table and RPC with seat-only insert for the released version of an existing preview, own-row read, rate limit, once-a-day agency notice, never the client (Task 2a); real-JWT PB1 to PB5 (Task 2b); client mode only, kept out of her feed (Task 29a); agency surfacing in plan 5 (amended).

**Placeholder scan:** no TBD or "similar to"; every code step has the code; Task 29 step 5 replaces a file whose exact post-plan-3 state is inferred from plans 1 and 3, and the step says how to check the diff.

**Type consistency:** `ReviewTarget` gains no fields here (plan 3 already added `anchor` and `anchorLabel`); `SignedReviewPreview.reviewAssetKey` is optional (Task 13) and read in Tasks 28 and 21; `CopyTab`, `PieceLayout`, `HeaderStatus`, `PieceAction`, `WorkspaceData` are each defined once and imported by name; `EditorRequest` (`kind: 'copy' | 'note'`) is used identically by panels and the workspace; `MAX_EDIT_CHARS` lives in `limits.ts` (Task 28) and 4b imports it from there.

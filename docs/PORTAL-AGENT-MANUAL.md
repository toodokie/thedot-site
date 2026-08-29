# Kanset Portal — Agent Build Manual

**Audience:** any agent (or engineer) taking over the Kanset client portal. This is the "how it's
actually built" reference: architecture, code map, data/security model, the content flow, the
design system, the deploy discipline, and the hard-won lessons. Read this top to bottom once;
after that use the table of contents.

**Last verified against the codebase and production:** 2026-08-16 (migrations `0001` through `0081`).

> This manual documents the **code** (the `~/thedot-site` repo). The **business/engagement**
> context (client, pricing, content strategy, cadence, brand voice) lives in the `~/Kanset`
> workspace — start there with [`~/Kanset/START-HERE.md`](../../Kanset/START-HERE.md) and
> `~/Kanset/CLAUDE.md`. The two are complementary: this = how the machine is built, that = what
> we're using it for.

---

## 0. Table of contents

1. Orientation — the two portals, one repo
2. Repo map
3. Tech stack
4. Data & security model (Supabase) — the part to respect most
5. The migration ledger (`0001` through `0081`)
6. The client portal (`/client/[slug]`)
7. The admin ops portal (`/admin/portal`)
8. The content lifecycle — canonical repo → portal
9. The gate / "My tasks" system
10. Publication, evidence & the historical importer
11. Calendar sync, invoices, notifications, projections
12. The Client Work Assistant (OpenAI)
13. **Design & UI** — the design system, the shell, the rules
14. Ownership model (Claude / Codex) & the frozen-hash review
15. Deploy discipline (two-tier) + the launch gate
16. Environment & config
17. Testing
18. Common recipes (add a surface, a migration, an approval, a deploy)
19. Hard-won lessons (read before you touch prod)

---

## 1. Orientation — the two portals, one repo

The portal is **two surfaces built from one Next.js app and one Supabase database**:

- **Client portal** — `/client/[slug]` (Maria's side). Magic-link login, read-mostly, shows her
  content pipeline, calendar, ideas, reports, strategy, library, billing, and lets her comment /
  approve / request changes. **This is the official approve/comment/reschedule channel** once
  launched.
- **Admin ops portal** — `/admin/portal` (The Dot's side, "Agency ops"). Password login, agency-only,
  **never visible to a client**. Shows what needs doing (My tasks), where every piece stands
  (Pieces + gates), the real posting record (Publication), calendar health, invoices, and Maria's
  change requests.

**Supabase is the system of record** for workflow / approvals / schedule / activity. Notion,
Google Calendar, and the `~/Kanset` markdown docs are **one-way projections**, not inputs. The
portal is the source of truth; everything else mirrors it.

**Live status (2026-08-16):** production has migrations `0001` through `0081` applied. LinkedIn is a
first-class destination, while weekly LinkedIn adaptations and website articles remain independent
content identities. Unresolved client edits immediately project their released pieces as `with_dot`.
Client edit intake and legacy bundle reconciliation now share canonical line-ending and invisible
line-end whitespace normalization, while canonical Git writes keep `git diff --check` strict.
Piece review now presents copy, visual assets, comments, and the final decision as one guided flow.
Binding copy and visual changes submit as one atomic review bundle, while comments remain
nonbinding. An authenticated reviewer sees the short review-flow explanation once per seat.
Maria's live seat is active at `maria@kanset.com`; `toodokie@gmail.com` remains
a separate preview seat. The client and admin portals are live, with Supabase holding workflow,
report, notification, and per-seat view state.
Agency notifications now group one client's same-piece editing session into a linked digest after
a five-minute quiet window. The worker checks every minute, and the notification audit includes
both client and agency rows.

---

## 2. Repo map

```
~/thedot-site/
├── src/
│   ├── app/
│   │   ├── client/[slug]/          # CLIENT portal (surfaces + shell + server actions)
│   │   ├── admin/portal/           # ADMIN ops portal (this manual's §7)
│   │   ├── admin/{login,dashboard} # admin auth + the non-portal marketing dashboard
│   │   └── api/
│   │       ├── client/[slug]/…     # client-side API (assistant, auth request-link)
│   │       ├── admin/portal/…      # agency write endpoints (operation, evidence, billing, …)
│   │       └── cron/portal-*        # scheduled workers (assistant, calendar)
│   ├── lib/
│   │   ├── portal/                 # ALL portal domain logic (pure-ish TS) — §6–§12
│   │   ├── supabase/               # admin.ts / server.ts / client.ts / middleware.ts
│   │   └── auth.ts                 # admin JWT session (verifySession / createSession)
│   └── data/portfolio/…            # marketing-site content (NOT portal; do not touch for portal work)
├── packages/design-system/         # @thedot/design-system — tokens + components (§13)
├── supabase/migrations/00NN_*.sql  # the ONLY way schema/security changes (§4–§5)
├── scripts/                        # portal tooling (sync, write, inbox, import, test-rls) (§18)
├── docs/                           # runbooks, specs, THIS manual
│   └── superpowers/specs/          # signed design specs (design FROM these, not from memory)
└── next.config.ts                  # note: ignoreBuildErrors + ignoreDuringBuilds = TRUE
```

`~/Kanset/portal-content/` (separate private repo, remote `toodokie/kanset-portal-content`) is the
**canonical authored-copy repo** — client-safe content only, synced into Supabase. The broad
`~/Kanset/content/` holds emails/invoices/PII and is **never** a sync root (the PII wall, §19).

---

## 3. Tech stack

- **Next.js 15** App Router, **React 19**, **TypeScript**. Server Components by default; `'use client'`
  only where there's interactivity (forms, nav active-state).
- **Plain CSS Modules** (`*.module.css`). **No Tailwind.** Everything themes through the
  `@thedot/design-system` `--dot-*` custom properties (§13).
- **Supabase** (Postgres + RLS + Storage + Auth). Access via three clients in `src/lib/supabase/`:
  - `admin.ts` → `createSupabaseAdmin()` — **service-role**, bypasses RLS. Server-only. Used by the
    admin portal + scripts. Never expose to the browser.
  - `server.ts` → `createSupabaseServer()` — anon key + the client's cookie session, **RLS-enforced**.
    Used by the client portal.
  - `client.ts` → `createSupabaseBrowser()` — browser anon client (only for signed-URL storage
    uploads in the publication evidence flow).
- **Vercel** hosting. Project link lives in `.vercel/`.
- **Vitest** unit tests; a real-JWT two-tenant RLS suite (`scripts/test-rls.ts`).
- **jose** (admin JWT) + **bcryptjs** (admin password hash) for `/admin` auth.

`next.config.ts` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to `true`.
The repo has **pre-existing** TS errors in unrelated marketing routes; the build tolerates them.
**This does not license sloppy types in portal code** — run `npx tsc --noEmit` and confirm *your*
files are clean (grep the output for your paths).

---

## 4. Data & security model (Supabase) — the part to respect most

This is where mistakes are expensive. The portal holds one tenant today (Kanset) but is built
multi-tenant, and the security model is defended in-migration.

**Principles:**

1. **All schema/security change goes through a numbered migration** in `supabase/migrations/`.
   Never hand-edit prod. Migrations are append-only and apply in order.
2. **RLS on every table.** Clients see only their own rows, enforced by policies that call
   `my_client_ids()` (the set of client_ids the current auth user is a member of).
3. **Writes go through `SECURITY DEFINER` RPCs**, never direct table DML from the client. Every
   such function pins `set search_path = ''` (schema-qualify everything) to prevent search-path
   hijacking. Client callable functions validate their inputs and re-check membership.
4. **Column-scoped grants.** The client role gets `SELECT` on specific columns of specific views,
   not `SELECT *`. New tables start with `REVOKE ALL` then explicit grants (see the poisoned-defaults
   lesson, §19).
5. **In-migration security assertions.** Each slice defines an `assert_portal_*_security()` function
   and calls it at the end of the migration (16 assertion functions exist). They fail the migration
   if a grant/policy/column is wrong. There is a cumulative `assert_portal_security()` fold. **A
   migration that changes access must extend the assertions.**
6. **The launch/mutation feature switches** (`portal_feature_switches`, migration `0013`) are
   **fail-closed**. `client_portal_launch` must be enabled at **both** the global scope
   (`client_id IS NULL`) and the tenant scope, or `portal_client_session` resolves to an empty
   membership and the client bounces to login. `client_mutations` / `agency_mutations` gate writes.
   Set via `set_portal_feature_switch(...)`. **If login "loops," it is almost always this switch,
   not auth** (see [[portal-launch-switch-gates-login]] in `~/Kanset` memory).

**Verification bar for any DB change (non-negotiable):**
- Fresh `0001`→N replay passes + upgrade replay passes.
- The migration's in-migration assertions pass.
- `npm run test:rls` (two-tenant, real-JWT) proves tenant A cannot see tenant B and cannot call a
  write RPC for B.
- Exact grant + column assertions match intent.
- **Codex reviews the frozen migration hash BEFORE it is applied to prod** (§14).

---

## 5. The migration ledger (`0001` through `0081`)

Each file's top comment states its purpose. Summary:

| File | Slice | What it establishes |
|---|---|---|
| `0001_portal` | foundation | Tables, RLS, the decision RPC, the derived content view, seed. |
| `0002_content_id_per_tenant` | — | `content_id` unique **per client**, not globally. |
| `0003_copy_blocks_and_comments` | — | Copy blocks + client/agency comments. |
| `0004_surfaces` | — | Recommendations, links, report snapshots, ideas (surface tables). |
| `0005_polish` | — | Cleanup/constraints. |
| `0006_versioned_content` | 1 | Immutable authored snapshots + explicit client release pointer. |
| `0007_release_quality` | 2 | Deterministic fact-check evidence + a release-quality boundary. |
| `0008_scheduling` | 3 | Destination-level schedule intent + durable reschedule requests. |
| `0009_publication_evidence` | 4 | Evidence-backed provider truth + immutable publication observations. |
| `0010_google_calendar_sync` | 5 | Two-way Google Calendar coordination. |
| `0011_agency_writes` | 6 | Atomic agency-owned surface writes + durable agency inbox. |
| `0012_invoices` | 7 | Client-safe invoices + billing administration. |
| `0013_access_control` | — | Fail-closed launch/mutation switches, membership, primary-decider transfer. |
| `0014_content_requests` | — | Client edit/create/archive requests + local-reconciliation boundary. |
| `0015_notifications` | — | Durable client/agency alerts; `activity_log` is the single mutation funnel. |
| `0016_projection_consumer` | — | Notion projection consumer (drains `projection_outbox`). |
| `0017_assistant` | — | Assistant usage plane (first build, Claude). |
| `0018_assistant_openai` | — | Assistant rebuilt on OpenAI (spec §5.6 + 3.18). |
| `0019_assistant_ops` | — | Assistant ops round (Codex blockers + launch orders). |
| `0020_design_links` | — | Item-level design links. |
| `0021_design_link_index` | — | Design links become the 13th assistant-indexed source. |
| `0022_production_gates` | — | Production gates + ops tasks (gate-system phase 1). |
| `0067_report_view_receipts` | — | Per-seat durable report views for overview prompts; authenticated RPC-only writes. |
| `0068_linkedin_destination` | — | LinkedIn destination constraints, mapping, provider URLs, requests, reports, and guarded agency tooling. |
| `0069_open_edit_client_state` | n/a | Pending, applying, and prepared client edits project the released piece as `with_dot` while preserving its released snapshot and design-link overlay. |
| `0070_client_copy_whitespace_normalization` | n/a | Canonicalizes browser line endings and invisible line-end whitespace at edit intake and legacy bundle reconciliation without relaxing Git whitespace checks. |
| `0071_content_request_base_copy_reader` | n/a | Gives an authenticated client a narrow tenant-scoped read of the exact historical copy block referenced by their own edit request, without opening historical version rows generally. |
| `0072_client_visible_canada_sources` | n/a | Permits reviewed `canada.ca` and subdomain citations in client-visible canonical copy while preserving dot-boundary rejection of lookalike hosts. |
| `0073_podcast_review_packs` | n/a | Adds version-bound multi-asset review packs, fail-closed podcast and podcast-article readiness, exact asset comments, and automatic YouTube transcript-review tasks. |
| `0074_reviewed_research_source_hosts` | n/a | Extends reviewed primary-source hosts used by the client-safe fact ledger. |
| `0075_plan_date_placeholder_audit` | n/a | Audits agency plan-date changes, including versionless plan placeholders. |
| `0076_abandon_unrequested_aug9_review_emails` | n/a | Abandons narrowly identified unrequested client email rows while preserving portal history. |
| `0077_abandon_unrequested_askkanset_v2_email` | n/a | Abandons the exact pending Ask Kanset v2 client email that was not authorized. |
| `0078_agency_piece_edit_digests` | n/a | Groups same-piece client edits and comments into one linked agency digest after a five-minute quiet window, and exposes service-only agency notification audit rows. |
| `0079_agency_edit_review_candidates` | n/a | Adds agency-only safe-merge drafts and internal approvals for client copy requests. Candidates stay invisible to the client and do not advance a request, canonical copy or release. |
| `0080_reviewed_bundle_reconciliation` | n/a | Makes an approved complete safe-merge candidate the exact audited copy boundary for bundled edit reconciliation while preserving Maria's original proposal and the legacy exact-block path. |
| `0081_unified_piece_review_bundles` | n/a | Unifies copy and visual edits into one atomic client review bundle, aligns unresolved-state guards, adds visual revision lifecycle controls, and records the one-time per-seat review-flow acknowledgment. |

**Full v1 architecture + phasing spec:** `~/Kanset/portal-integration-task.md`.
**Gate-system spec:** `docs/superpowers/specs/2026-07-21-portal-gate-system-design.md`.

---

## 6. The client portal (`/client/[slug]`)

**Auth:** magic link. `POST /api/client/auth/request-link` emails a link; `getClientSession(slug)`
(`src/lib/portal/auth.ts`) resolves the cookie → membership via the `portal_client_session` RPC.
`null` = logged out **or** not a member → redirect to `/client/login`.

**Shell:** `src/app/client/[slug]/layout.tsx` renders `PortalNav` + a topbar + `<main>`, styled by
`portal-shell.module.css`. Left sidebar on desktop, fixed bottom tab bar on mobile (§13).

**Surfaces (each its own routed folder):**

| Route | File | Shows |
|---|---|---|
| `` (overview) | `page.tsx` | Landing: buckets by state (needs review / with Dot / approved / scheduled / published / in progress) + activity + communication feed. |
| `calendar` | `calendar/` | Month grid of scheduled/planned content. |
| `plan` | `plan/` | The plan-direction approval + schedule. |
| `ideas` | `ideas/` | Shared idea board (client can add). |
| `reports` | `reports/` | Report snapshots (metrics). |
| `requests` | `requests/` | Change requests she has raised, with the edited area named in client language and a high-contrast before/requested comparison bound to the exact base and applied versions. |
| `strategy` | `strategy/` | Recommendations. |
| `library` | `library/` | Brand + video links. |
| `billing` | `billing/` | Invoices (Date / Amount / Status / Document). |
| `piece/[id]` | `piece/` | One guided review surface for the complete piece: copy, visual assets, comments, final decision, versions, fact-check evidence, and publication state. |
| `assistant` | `assistant/` | The Client Work Assistant (gated; §12). |

**Client server actions** live beside the pages (`*-actions.ts`: `comment-actions`,
`idea-actions`, `request-actions`, `schedule-actions`, `seen-actions`). They call the guarded RPCs
(`add_comment`, `add_idea`, `request_content_reschedule`, `mark_notification_seen`, …) through the
RLS-enforced server client. **Client code never touches the service-role client.**

Podcast pieces add version-bound rows from `content_review_assets` to this same page. The episode
piece shows the social cover, captioned teaser, and YouTube cover beside separately editable social
caption, YouTube title, description, and tags blocks. The website companion stays a separate
`podcast_article` item with its own 1500x1000 cover, article block, and client decision.

The piece page keeps draft copy and visual edits in one client-side review session. The final
resolver offers one action: approve when no binding edits exist, or submit all requested changes
when they do. `request_content_edit_bundle` validates and records the complete set atomically.
General comments are intentionally separate and do not block approval. Once a visual request moves
into agency production, the client cannot silently replace it; the agency uses the explicit visual
revision lifecycle instead.

**Domain logic** for the client read paths is in `src/lib/portal/`: `data.ts` (content + activity
fetch), `state.ts` (`clientStateLabel`, state machine), `seen.ts` (last-seen tracking),
`comments.ts`, `ideas.ts`, `reports.ts`, `recommendations.ts`, `links.ts`, `invoices.ts`,
`requests.ts`.

---

## 7. The admin ops portal (`/admin/portal`)

**Rebuilt 2026-07-21 to mirror the client portal's structure** (was one long-scroll page). Same
shell shape as the client (sidebar desktop / bottom bar mobile), split into organized routed pages.

**Auth:** `verifySession()` (`src/lib/auth.ts`) — admin JWT in a cookie, `role === 'admin'`.
The `layout.tsx` guards once; **each page re-guards before it fetches** (defense in depth, and
because a page's data fetch runs concurrently with the layout).

**Shell:** `layout.tsx` + `AdminNav.tsx` + `admin-shell.module.css` (a faithful copy of the client's
`portal-shell.module.css`). `admin-shell.module.css`'s `.main` also **hosts the `--admin-*` design
tokens**, so every routed page's cards inherit them (§13).

**Nav / routed pages** (`AdminNav.tsx` `ITEMS`):

| Nav item | Route | Component | Loader (`data.ts`) |
|---|---|---|---|
| My tasks | `/admin/portal` | `MyTasksAdmin` | `loadMyTasksData()` |
| Pieces | `/admin/portal/pieces` | `PiecesAdmin` | `loadPieces()` |
| Publication | `/admin/portal/publication` | `PublicationAdmin` | `loadPublicationTargets()` |
| Calendar | `/admin/portal/calendar` | `CalendarAdmin` | `loadCalendarData()` |
| Billing | `/admin/portal/billing` | `BillingAdmin` | `loadInvoices()` |
| Requests | `/admin/portal/requests` | `RequestAdmin` | `loadRequests()` with a three-way released/requested/safe-merge comparison and internal candidate approval. |

Plus a quiet **Dashboard** link out to `/admin/dashboard`.

**Data split:** the old monolithic page did one giant `Promise.all`. Now `src/app/admin/portal/data.ts`
exposes **one loader per surface** — each page fetches only its own slice via `createSupabaseAdmin()`.
The transforms were lifted **verbatim** from the old page (behaviour-preserving); only the split is new.
When you edit a loader, keep the transform identical unless you intend a behavior change.

**`GatesAdmin.tsx`** exports two components sharing module-level helpers:
- `MyTasksAdmin` — the hero card. Renders `deriveMyTasks(...)` grouped into Actions / Waiting on Maria
  / Waiting on studio / Ops buckets / "Posted · link-confirm pending" + recently-completed ops.
- `PiecesAdmin` — every piece as a table with a **9-gate strip** (done / open / n/a / not-tracked
  squares) + a stage pill. `multiClient` hides the client column when there's only one tenant.

**The admin components' forms are behavior-locked:** field `name`s + endpoint URLs must not change
without intent — they map to the API routes in `src/app/api/admin/portal/*`. `PublicationAdmin`
self-wraps in `.card`; `Calendar/Billing/Request` are wrapped in `<section className={styles.card}>`
by their page.

**Agency write endpoints** (`src/app/api/admin/portal/`): `operation` (confirm/correct publication),
`evidence` + `evidence/upload` + `evidence/finalize` + `evidence/[id]` (the evidence store),
`billing`, `requests`, `calendar/*`. These call the audited agency RPCs.

---

## 8. The content lifecycle — canonical repo → portal

The canonical model (from `~/Kanset/CLAUDE.md` "content-to-portal flow"):

**Lifecycle amendment, approved 2026-07-25:** read
`~/Kanset/docs/superpowers/specs/2026-07-25-content-id-lifecycle.md` before changing this
flow. A selected piece now receives its permanent `content_id` as a versionless idea-stage
`content_item`, before a canonical file exists. The first canonical sync attaches version 1
to that same identity. The authoring sequence below begins after selection and no longer
defines when the piece identity is created.

1. **Author** client-safe copy in `~/Kanset/portal-content/` (the private repo). The broad
   `~/Kanset/content/` pack is **never** the portal file — it's translated into a clean
   `portal-content/` file so email/invoice/PII regions stay out (the D3 classification gate reuses
   `~/Kanset/portal-allowlists.md` + the `<!-- portal-block:KEY -->` / `<!-- internal -->` convention).
2. **Sync** into Supabase: `npm run sync-content` (`scripts/sync-content-to-supabase.ts`). Always
   `--dry-run` first (zero writes) — the content-safety gate (`src/lib/portal/content-safety.ts`)
   blocks any file carrying email/phone/dollar-invoice/intake patterns outside the billing surface.
   Sync creates or updates an agency working snapshot only. The client-facing view cannot read
   that snapshot, so do not describe it as ready for Maria or ask her to approve it yet.
3. **Release** a confirmed piece: `mark_content_ready` (only when the fact-check ledger is
   release-valid — `portal_fact_check_ledger_release_valid`). Versions are immutable snapshots;
   the **first verified-live version is permanently frozen** — corrections are a new linked version,
   never a rewrite (`portal_enforce_publication_lock`).
   This is the visibility boundary: Maria sees the copy only after this command succeeds and
   advances `client_visible_version`. For a brand-only piece with no factual claim, close the
   gate explicitly with `fact_check: confirmed`, `fact_check_scope: not_applicable`, a short
   `fact_check_exemption`, and `fact_check_ledger: []`; it still needs the same release command.
   `portal-inbox apply-edit`, `apply-edit-batch`, `resume-edit`, and `apply-create` reconcile from
   a temporary clean checkout of the latest canonical remote. Active unrelated drafts in the
   authoring checkout remain untouched. The worker validates the expected private remote, commits
   only the reviewed target, and rejects a remote-head race before its non-forced push.
4. **Two approval gates, both in the portal:** (a) the **plan direction**, then (b) **each post**.
   Until launch, approvals are recorded from Maria's documented email decisions via
   `record_external_decision(...)` (evidence ledger:
   `~/Kanset/content/portal-external-approvals-ledger-2026-07-20.md`). Post-launch she clicks
   Approve and it calls `record_content_decision`.
5. **Fact-check standard:** MG-authored (RCIC) content is `agency_attested`, owner-attested and NOT
   re-verified against a government URL. **Agent-asserted IRCC facts still need an official
   `primary_source` URL** from canada.ca, ontario.ca, gazette.gc.ca, or college-ic.ca. Reviewed
   original research and ranking claims may use the separately governed Henley, U.S. News, World
   Bank, WHO, or Transparency International host list. General news, blogs, and aggregators remain
   excluded (`portal-allowlists.md §4`; `primary-source-policy.ts`; migration 0074).

**One command for the day-to-day:** "update portal" reconciles new/changed/planned content
per-change (not weekly), wired into the `kanset-production-workflow` skill. New post links enter via
the agency confirm/import tooling (§10), **not** by editing repo files.

**Client edit pre-apply review (`0079` through `0081`):** Agency Ops stores a private complete safe-merge candidate and change map beside each pending edit. Saving creates a draft. Internal approval records the exact candidate revision but does not touch the request status, canonical repository, released copy, activity or client notifications. The internal `~/Kanset/content/*.md` package mirrors the same complete current/requested/candidate comparison. When `portal-inbox` applies an explicit package candidate, every block must match its approved Agency Ops candidate exactly. Bundled reconciliation then verifies the synced immutable version against those approved candidates while preserving Maria's original proposal as request history. Visual requests expose separate start-revision and mark-prepared controls so their working lifecycle remains auditable.

---

## 9. The gate / "My tasks" system

**Todos are a VIEW, not a document.** Per-piece state is derived, never hand-maintained. Two data
sources, one derivation layer:

- **Tables** (`0022`): `content_production_gates` (current gate state per piece/destination),
  `production_gate_events` (append-only history), `ops_tasks` (non-content todos). Writes:
  `set_production_gate`, `add_ops_task` / `complete_ops_task` (via `scripts/portal-write.ts`).
- **Pure derivations** in `src/lib/portal/gates.ts` (fully unit-tested in `gates.test.ts`):
  - `resolveNineGates(piece)` — the 9-gate strip state.
  - `deriveContentStage(piece)` — the human stage label (Draft / In production / Awaiting Maria /
    Approved / Scheduled / Posted / Live / Done / Issue). Handles `direction_approved` for H&C-style
    "direction approved, still in production."
  - `deriveMyTasks(pieces, opsTasks, todayIso)` — the admin My-tasks list (Actions / waiting_maria /
    waiting_studio / reconciliation / link_pending / ops buckets). Provider state outranks stale
    production gates: a scheduled piece never resurfaces as "Send to Maria" or "Post." On its
    planned day it stays in the calendar; after that day, missing publication evidence moves to
    **Evidence cleanup**, outside the urgent action count. Post-publish proof gaps use the same
    quiet reconciliation bucket.
  - `canonicalScheduleDestination` / `canonicalDestinations` / `selectCurrentDecision` /
    `businessDaysBetween` / `renderStatusGatesBlock`.
- **The loader** `src/lib/portal/gates-loader.ts` → `loadAgencyStagePieces(admin, clientId?)` runs
  the service-role queries over `content_items` + the working version and returns `StagePiece[]`
  (with `clientName`). Used by both admin gate surfaces.

**The 9 gates (locked grammar):** fact-check → source-in-hand → design-built → proofed →
approval-sent → copy-approved → scheduled → posted → link-confirmed. Owner + date + provenance per
line. Maria gates close only on her explicit decision. `done` = every destination link-confirmed
(incl. the portal confirm-in). The publish pack's `STATUS GATES` block in `~/Kanset` content packs
is the human mirror of this; `renderStatusGatesBlock` generates it.

---

## 10. Publication, evidence & the historical importer

**A scheduled time is not proof.** The publication model separates intent from truth:

- Instagram, Facebook, YouTube, LinkedIn, and Squarespace are independent destination records.
- A weekly LinkedIn adaptation always has its own `content_id`. Do not add LinkedIn to the
  Instagram/Facebook/YouTube piece, even when its topic or creative is adapted from that piece.
- Every website article has its own `content_id` and `platforms: [squarespace]`. A podcast episode
  and its companion article are separate pieces with separate approval, schedule, and publication
  evidence.
- New podcast episodes use `format: podcast`. Their final decision fails closed until
  `social-cover`, `social-teaser`, and `youtube-cover` review assets are attached to the exact
  released version, the teaser is marked `burned_in_verified`, and the social caption plus separate
  YouTube title, description, and tags blocks exist. The companion article uses
  `format: podcast_article` and requires `article-body` plus `website-cover`.

- `content_schedule_targets` (`0008`) — per-destination schedule intent. RPCs `confirm_schedule_target`,
  `request_content_reschedule`, `mark_schedule_target_failed`, `portal_ensure_schedule_targets`,
  `portal_resolve_schedule_time`.
- `content_publication_targets` + append-only `content_publication_observations` (`0009`) — the real
  posting record, platform by platform. Confirming a post **registers evidence first**, then records
  an observation. Corrections **add a new observation** rather than overwriting. RPCs:
  `record_publication_observation`, `register_publication_evidence`, `portal_sync_publication_target`,
  `preview_publication_observation`.
- **Evidence store:** admin-only signed Supabase Storage (`portal-publication-evidence` bucket).
  Upload flow: `evidence/upload` (signed URL) → browser `uploadToSignedUrl` → `evidence/finalize`.
- **Admin UI:** `PublicationAdmin.tsx` — per-destination "Confirm / correct" form (confirm scheduled,
  confirm live, mark failed/unavailable/removed) with proof upload or reviewed link.
- **Podcast transcript follow-up (`0073`):** when a `podcast` YouTube target is first confirmed
  scheduled, or first confirmed live when it skipped scheduling, a deterministic open Ops task asks
  the agent to review and correct YouTube automatic captions. The task is idempotent across both
  triggers and remains agency-only.

**Historical importer** (`scripts/import-portal-history.ts` + `src/lib/portal/history-import.ts`):
brings the pre-portal timeline in with **honest provenance** (D1): YouTube rows get real
`yt-check` evidence + the verified label; IG/FB rows land as `source_type='imported'`,
`reconciliation_status='legacy_unverified'` — never labeled "manually verified." Dry-run
(`preview_historical_publication_batch`) → Anastasia reviews → apply (`apply_historical_publication_batch`).
The 22-post history is already imported.

---

## 11. Calendar sync, invoices, notifications, projections

- **Google Calendar (`0010`, Slice 5):** `calendar_integrations`, event mappings, `calendar_sync_state`,
  conflicts, unmapped events. OAuth for the durable The Dot owner of the "Kanset Social" calendar;
  Maria as calendar manager (`owner` ACL role, **Make changes and manage sharing**). Etag-guarded
  outbound, watch/incremental inbound, conflict resolution. Worker:
  `src/lib/portal/google-calendar-worker.ts`, cron at `/api/cron/portal-calendar`, webhook at
  `/api/portal/google-calendar/webhook`. Admin UI: `CalendarAdmin.tsx`. Runbook:
  `docs/portal-google-calendar-runbook.md`. **A calendar change can nudge a planned date but never
  approves copy or confirms a post.**
- **Invoices (`0012`, Slice 7):** `invoices` table (client-safe fields only: number, dates, amount,
  currency, status paid|unpaid|void, `document_url`). RPCs `attach_invoice_document`, set-status.
  Client sees Date/Amount/Status/Document; **no hours, no rates, no fee math** (D2 / the
  client-pricing-dollars-only rule). Admin UI: `BillingAdmin.tsx`. Invoice #0137 is seeded.
- **Notifications (`0015`, decision inbox `0034`):** `activity_log` is the **single mutation funnel**
  — the only RPC that writes activity; alerts derive from it. `record_content_idea_decision` and
  plan-cycle decisions also emit durable `portal_inbox_events`, including a migration backfill for
  decisions recorded before `0034`, so `npm run portal-inbox -- list kanset` cannot miss an idea or
  batch-plan approval. Idea inbox promotion (`set_idea_status(..., 'became_piece', ...)`) emits an
  `idea_promoted` agency inbox event after `0035`; agents should consume it with
  `npm run portal-inbox -- list kanset`, inspect it with `show`, and acknowledge it after locating
  or authoring the canonical Markdown pack. Email is drained by `scripts/portal-notification-consumer.ts` or the
  `/api/cron/portal-notifications` route, which runs every minute. Client edits and piece comments
  keep their immediate event-level portal notifications, but their agency email is grouped by piece
  and sent after a five-minute quiet window. Production needs `AGENCY_EMAIL`, SMTP settings, and
  `CRON_SECRET`; missing `AGENCY_EMAIL` returns a failing health response and leaves rows pending.
  `pnpm portal-notification-audit -- <slug> --days 7` reads both client and agency delivery rows.
  Agency digest rows include counts, due time, attempts, status, and the exact Ops piece link.
  A completed standalone monthly report uses `npm run portal-write -- report-notify <payload.json>`
  after the report page is live. This writes one idempotent `monthly_report_ready` activity and one
  dedicated client email with a direct report link. Individual `report` snapshot writes remain
  portal-only and never trigger client email.
- **Projections (`0016`):** `projection_outbox` drains to Notion via
  `scripts/portal-projection-consumer.ts` + `src/lib/portal/notion-projection*.ts`. **No dual writes:**
  integrations call one shared surface (`portal-write` / `portal-inbox`), never independent
  Supabase + Notion calls.

---

## 12. The Client Work Assistant (OpenAI)

Built on **OpenAI, not Claude** (Anastasia's decision — see [[design-from-signed-specs]]). Spec:
`~/Kanset/portal-integration-task.md §5.6 + §3.18`. Migrations `0017` (usage plane) → `0018` (OpenAI
rebuild) → `0019` (ops). A per-tenant usage ledger (`assistant_usage`), reservation/settle RPCs
(`portal_assistant_reserve_run` / `settle_run` / `report_answer`), a budget check
(`portal_assistant_check_budget`), and a **retrieval index over ~13 sources** (content, reports,
recs, ideas, links, design links — the 13th, `0021`) via `portal_assistant_search` /
`portal_assistant_reindex`. Endpoint: `/api/client/[slug]/assistant`; cron
`/api/cron/portal-assistant`. Guardrails: `src/lib/portal/assistant-guardrails.ts` (tested).

**Live status, verified 2026-07-30:** Bird, the OpenAI Client Work Assistant, is enabled globally
and for Kanset. Maria, Anastasia, and the `Maria (preview)` seat hold `can_use_assistant`.
The nav entry and floating widget appear only when the member holds that capability **and** the
`assistant` switch is on (`portal_assistant_gate`). Production therefore requires
`OPENAI_PORTAL_API_KEY` + `PORTAL_ASSISTANT_HMAC_SECRET` in Vercel. Do not disable the live
assistant without Anastasia's explicit approval. Reporting-API automation (Meta/YouTube/GA4
metrics) remains **v2 / manual in v1** (`~/Kanset/portal-v2-deferred.md`).

---

## 13. Design & UI — the design system, the shell, the rules

This portal is deliberately, consistently designed. **Do not hand-roll a bespoke look for a new
surface** — reuse the language below. (This is a scar: the admin portal was once built with an
ad-hoc design instead of the client's proven one, and had to be redone.)

### 13.1 The design system package — `@thedot/design-system`

Lives in `packages/design-system/`. Import components + tokens from `@thedot/design-system`.
`pnpm --filter @thedot/design-system build` builds it before the Next app. The root package must
declare `@thedot/design-system: workspace:*`; do not rely on a warm install to make an undeclared
workspace import resolve.

- **Tokens** (`src/tokens/tokens.css` + `tokens.ts`) — the `--dot-*` custom properties. **Everything
  themes through these; never raw hex in a component** (the one sanctioned exception is the admin
  `--admin-danger: #b4502f` rust, a semantic danger color). Key tokens:
  - Color: `--dot-cream` (ground), `--dot-white`, `--dot-black`, `--dot-charcoal`/`--dot-graphite`
    (ink), `--dot-grey` (muted), `--dot-hairline` (borders), `--dot-yellow` (the one accent),
    `--dot-yellow-pale` (soft accent). Portal shells remap muted text to
    `--dot-grey-accessible`; the lighter brand grey does not meet normal-text AA contrast on cream.
  - Type: `--dot-font-display`, `--dot-font-text`; weights `--dot-weight-light/book/regular/medium/demi`;
    sizes `--dot-text-hero/h1/h2/h3/h4/section/body/eyebrow`.
  - Space: `--dot-space-1..8`. Radius: `--dot-radius` (used sparingly — the portal is mostly sharp).
- **Components** (`src/components/`): `Heading`, `Text`, `Eyebrow`, `Button`, `Card`, `Tag`,
  `ReadMore`, `Input`, `Textarea`, `Selector`, `Dot`, `DotGrid`, `Stripe`, `Arrow`, `Logo`. Use
  these for typography and form primitives. `Heading variant="display"` is the big greeting size —
  **don't shrink it**; sub-page titles use `Heading level={2}`.

### 13.2 The visual language (the "Dot" look)

- **Cream-filled panels** (`--dot-cream`) with a **1px hairline border**, **sharp corners**, **no
  shadows, no rounding**. Elevation is communicated by the border, not a drop shadow.
- **Quiet chips**: capitalized, hairline-bordered, transparent fill. Exactly **one accent** —
  `--dot-yellow-pale` for the single actionable/highlighted chip; `--dot-yellow` for the
  count "highlighter" pop and the active-nav marker. Color is never the only signal (glyph/label too).
- **Type hierarchy** (anchored by Anastasia, 2026-07-21): section **heading 24px display demi** >
  description **16px grey** > group **kicker 13px uppercase graphite** > **body/reading text 20px** >
  chips/meta **15–16px**. Reading text sits at **20px**. The hierarchy must never invert (a heading
  smaller than body is the specific bug that got flagged — headings dominate).
- **Copy is plain English, never engineer jargon.** "Build design," not "design-built +12";
  "where each piece went live," not "provider-truth records." Write labels a non-technical person
  reads correctly on the first pass.
- **Interactive controls have a 44px minimum target** and a visible keyboard focus ring. This
  includes compact buttons, navigation links, section jumps, and source links.
- **Toronto schedule forms never ask the client to choose EDT or EST.** Derive the offset from the
  requested local date and time, and reject skipped or repeated clock-change times with a plain
  explanation.
- **Brand voice hard rule (applies to UI copy too):** **no em dashes** anywhere. Use commas, colons,
  periods, or parentheses.

### 13.3 The shell (client and admin mirror each other)

Two near-identical CSS modules implement the responsive frame:
`src/app/client/[slug]/portal-shell.module.css` (client) and
`src/app/admin/portal/admin-shell.module.css` (admin, a faithful copy).

- **Mobile-first:** a top header (`.topbar`, logo + seat label) + a **fixed bottom nav bar**
  (`.nav`) with **scrolling-shadow** edges (the `background-attachment: local/scroll` pair) that hint
  at off-screen items.
- **Desktop (`@media min-width: 768px`):** `.shell` becomes `display:flex; flex-direction:row`;
  `.topbar` hides; `.nav` becomes a **sticky 216px left sidebar** (`flex: 0 0 216px`) with the logo +
  seat in `.brand`; `.item` is left-aligned; `.active` gets a **yellow left-border + white fill**;
  `.main` is `padding: 40px 48px; max-width: 1120px`.
- **Nav components:** client `PortalNav.tsx`, admin `AdminNav.tsx` — both `'use client'`, both derive
  active state from `usePathname()`, both map an `ITEMS` array of `{label, seg}` to `<Link>`s.
- **The admin `.main` hosts the `--admin-*` tokens** so all admin cards inherit them; the client
  surfaces use the design-system components + their own `*.module.css` (e.g. `overview.module.css`,
  `billing.module.css`).

### 13.4 Admin content styling — `portal-admin.module.css`

Styles the content *inside* an admin page (the shell owns the frame). Panels (`.card`, `.hero` =
charcoal-bordered lead card), heads (`.cardTitle` 24 / `.cardSub` 16 / `.count` + `.countPop`
highlighter), task rows (`.taskRow` / `.taskMain` / `.taskTrail` — title left, status inline right),
the pieces table + 9-gate strip (`.gateCell` / `.gateDone/.gateOpen/.gateNa/.gateAbsent`), quiet
`.pill` chips (via `StatusPill.tsx`), and the publication confirm/correct `.form`. `StatusPill.tsx`
maps tones (done/open/na/muted/info/pending/scheduled/live/verified/failed/nudge) to the quiet-chip
styles — reuse it for any admin status chip.

### 13.5 UI review discipline

There is a UI/UX skill (`ui-ux-pro-max`) available; the design specs live in
`docs/superpowers/specs/2026-07-21-admin-portal-redesign.md` and `-client-view-audit.md`. When a
change "looks wrong," check hierarchy (does the heading dominate?), reading size (20px?), chip
placement (inline with its row, not flung right by `space-between`), and jargon (would Maria read it
right?). **Design from the signed spec, not from compacted memory** ([[design-from-signed-specs]]).

---

## 14. Ownership model (Claude / Codex) & the frozen-hash review

Single-pen discipline — only one agent edits a given checkout at a time:

- **Codex** owns SQL/migrations/RPCs, the historical importer, `portal-write.ts` / `portal-inbox.ts`
  tooling, and server actions. It commits its own files and hands over a **frozen commit hash**.
- **Claude** owns content authoring + client-safe classification, the `~/Kanset/portal-content/` repo
  pen, the display-plane UI, and **review of Codex's frozen hashes** (never the live tree).
- **Review the hash, not the working tree.** A DB/security change is reviewed by Codex **before**
  prod apply. A display-plane change deploys, then gets Codex post-hoc review.

---

## 15. Deploy discipline (two-tier) + the launch gate

**Two tiers, different rules:**

1. **DB / security plane** (migrations, RPCs, grants): Codex review of the frozen hash **before**
   applying to prod. Apply in order. Back up first (`git bundle` per `BACKUP-RESTORE.txt`), catalog-
   compare prod vs local.
2. **Display plane** (UI, copy, client/admin components, CSS): deploy, then Codex post-hoc review.

**The display-plane deploy recipe (used for the admin rebuild):**

```bash
# from ~/thedot-site, HEAD = the currently-deployed prod commit
WT=~/worktrees/kanset-deploy
git worktree add "$WT" <deployed-commit>       # clean checkout at prod's commit
rm -rf "$WT/src/app/<your-changed-subtree>"     # sync ONLY your intended files in
cp -R src/app/<your-changed-subtree> "$WT/src/app/<your-changed-subtree>"
cp -R .vercel "$WT/.vercel"                      # bring the Vercel project link
git -C "$WT" status --short                      # CONFIRM: only your files, no unrelated drift
cd "$WT" && npx vercel --prod --yes              # Vercel builds remotely
git worktree remove "$WT" --force
```

**Why the worktree:** it isolates exactly your intended change on top of the known-good prod commit,
so unrelated working-tree drift (e.g. a Notion `sync-portfolio` regen of `src/data/portfolio/*.json`)
**cannot ride along**. Smoke-test after: the admin routes should 307 → `/admin/login`, not 404.

**Commit/push:** do **not** commit to the branch or push unless Anastasia asks. The worktree deploy
needs no branch commit.

**The launch gate (§3.17):** the `client_portal_launch` switch stays **OFF** until every v1 surface,
import, security assertion, and end-to-end check passes. Flipping it (both scopes) is what makes the
portal visible to Maria. Launch-day items: restricted `OPENAI_PORTAL_API_KEY` +
`PORTAL_ASSISTANT_HMAC_SECRET` in Vercel, Maria capability grants + primary-decider transfer, a
durable sign-in rate limiter, phone-flow re-verify, and the assistant switch after review.

---

## 16. Environment & config

Set in Vercel (and `.env.local` for dev). Key vars:

| Var | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | `createSupabaseAdmin()` (server-only) |
| `ADMIN_PASSWORD_HASH` | `/admin` login (`src/lib/auth.ts`, bcrypt) |
| `PORTAL_PUBLIC_ORIGIN` | magic-link + email origins |
| `OPENAI_PORTAL_API_KEY` / `OPENAI_API_KEY` | the assistant |
| `PORTAL_ASSISTANT_HMAC_SECRET`, `PORTAL_MODE_INSTRUCTIONS`, `PORTAL_ANSWER_SCHEMA`, `PORTAL_INPUT_CHARS` | assistant runtime |
| `GOOGLE_CALENDAR_CLIENT_ID/SECRET`, `_CLIENT_READER_EMAIL`, `_SCOPES`, `_TOKEN_ENCRYPTION_KEY` | calendar sync |

`.vercel/project.json` links the repo to the Vercel project. Prod domain: `www.thedotcreative.co`.

---

## 17. Testing

- `pnpm test` (vitest): gates, schedule, state, assistant guardrails,
  content-safety, frontmatter, history-import, agency-write, redirect, notion-projection, plus the
  design-system + the calendar MonthGrid component test. Run before every deploy.
- `pnpm exec tsc --noEmit` — the repo has pre-existing errors in marketing routes; **grep the output for
  your files** and confirm they're clean.
- `pnpm test:rls` (`scripts/test-rls.ts`): real-JWT two-tenant isolation. Mandatory after any
  RLS/grant change. `pnpm test:rls:seed-local` seeds a local two-tenant fixture.
- `pnpm exec next build` — full compile; catches JSX/route errors the unit tests don't.

---

## 18. Common recipes

**Add a client surface (nav item + page):** add `{label, seg}` to `PortalNav.tsx` `ITEMS`; create
`app/client/[slug]/<seg>/page.tsx` (guard with `getClientSession`, fetch via the RLS server client,
render with design-system components + a `<seg>.module.css`); if it needs data, add a reader in
`src/lib/portal/`.

**Add an admin surface:** add to `AdminNav.tsx` `ITEMS`; create `app/admin/portal/<seg>/page.tsx`
(guard with `verifySession`, `export const dynamic = 'force-dynamic'`, call a loader); add the loader
to `data.ts`; render the component wrapped in `<section className={styles.card}>` (unless it
self-wraps). Reuse `StatusPill` + `portal-admin.module.css` classes.

**Add a schema/security change:** write `supabase/migrations/00NN_*.sql` (next number). Start new
tables with `REVOKE ALL` then explicit grants. Add an `assert_portal_*_security()` and call it at the
end + extend the cumulative fold. Add real-JWT tests in `test-rls.ts`. Fresh replay + upgrade replay
must pass. Hand the **frozen hash** to Codex for review **before** prod apply.

**Record a client approval (pre-launch):** `record_external_decision(...)` with Maria's documented
email date; log it in the approvals ledger. Post-launch she clicks Approve → `record_content_decision`.

**Confirm a publication:** bring the **verified live URL** to the Publication surface (or the confirm
tooling in `scripts/`), attach evidence, record the observation. **Do not** edit repo files to add a
link — the DB is the record.

**Attach a podcast review asset:** run `portal-write review-asset` with the exact `contentVersion`,
stable `assetKey`, channel, kind, Canva or Drive URL, pixel dimensions, and caption status. Use
`burned_in_verified` only after the teaser captions were proofed. A generic item-level design link
does not satisfy the podcast readiness contract.

**Deploy a display change:** §15 worktree recipe.

---

## 19. Hard-won lessons (read before you touch prod)

- **Coordinator state is a cache — re-derive from the source.** Don't assert "X is pending/done" from
  memory or a subagent's last report; query Supabase (or grep the workspace). The ep2-links incident:
  the coordinator was "unaware" of links already in the codebase because it trusted memory over the DB.
  [[coordinator-state-is-a-cache]].
- **Never ship code whose safety depends on an unapplied migration.** A display deploy once carried a
  guard removal that re-exposed demo fixtures live for ~1h. Caught by Codex. If a safety property
  needs migration N, don't deploy the code until N is applied.
- **Poisoned defaults:** prod's service_role has default DML grants that local doesn't. Every new
  table must `REVOKE ALL` then grant explicitly, or a client can write it (the `0017` incident).
- **False-verification:** verify with markers unique to the intended page/state, never a URL-echo
  substring. Reconcile contradictory probes before shipping. [[claude-false-verification-lesson]].
- **The publication lock is permanent:** never rewrite a version that has ever shipped. Corrections =
  a new linked version. `portal_enforce_publication_lock` enforces it.
- **The PII wall:** `~/Kanset/content/` mixes client-safe copy with emails/invoices/PII. Only
  `~/Kanset/portal-content/` (classified, client-safe) syncs to the portal. Never point the sync at
  the broad content dir; never send it to a contractor.
- **Defer to the RCIC's own content:** don't re-verify or reword Maria's immigration copy
  (`agency_attested`); catch only clear mechanical errors, gently. Agent-asserted IRCC facts still
  need a primary source. [[defer-to-maria-expert-content]].
- **Discuss before changing** on standardization / system-design / skill work: present findings +
  proposed edits first, edit after her ok. Direct build requests (like "copy the client's onto mine")
  are not that case. [[discuss-before-changing]].

---

*Keep this manual current: when you add a migration, a surface, or change the design language or the
deploy recipe, update the relevant section. An out-of-date manual is a trap for the next agent.*

# The Dot Creative, Client Portal, Build Plan

**Status:** Brainstorming / architecture agreed in principle. Not yet a spec, not yet building.
**Started:** 2026-07-15
**Owner:** Anastasia (The Dot Creative)
**Lives in:** the existing `thedot-site` repo (`github.com/toodokie/thedot-site`)
**Pilot client:** Kanset Services Inc.

This is a living working doc. We add to it and refine as we go. It is not client-facing.

---

## 1. Why we are building this

**The real problem (Maria / Kanset):**
- Maria is confused by the volume of email from The Dot. She loses the thread on what is urgent, what needs her, what is done.
- The only current fix is Anastasia calling her and pointing at the urgent items by phone. That costs Anastasia time every week.
- Maria is uncomfortable with Notion. She tries, but it is not her surface.

**The decision (2026-07-15): build for BOTH, sequenced.**
1. **Now, serve Maria better.** One branded place she looks instead of chasing email. Fewer "lost the thread" phone calls. Build thin.
2. **Later, a sales asset.** If Maria is happy she refers her business friends. A real portal makes The Dot look like a serious agency and becomes the thing client #2, #3 log into.

Sequencing keeps scope honest: prove it with Kanset, then generalise.

---

## 2. The core insight (this resolves the Notion tension)

The portal is a **client-facing skin over Notion.**
- Notion stays the internal backend that the agent maintains (Anastasia's / the agent's comfort zone).
- Maria **never touches Notion.** She sees a clean, branded view: what needs her, what is scheduled, what is live.
- No double-entry: the portal reads the Notion data we already keep. The only new data the portal creates (approvals, comments, activity) is created *by using the portal*, not re-typed.

---

## 3. What already exists (the big unlock)

`thedot-site` is already a Next.js app with most of the hard parts built. The portal is a feature on an app Anastasia already runs and deploys, not a new system.

| The portal needs | Already in `thedot-site` |
|---|---|
| Read from Notion | `@notionhq/client`, `scripts/sync-portfolio-from-notion.ts`, Notion troubleshooting doc |
| Auth + gated dashboard | `jose` (JWT) + `bcryptjs`, `/admin` route, `ADMIN_DASHBOARD_SETUP.md`, admin password generator |
| Send email | `nodemailer` (lead capture) |
| Generate PDFs | `@react-pdf/renderer`, `jspdf`, `html2canvas` |
| Hosting + analytics | Vercel, `@vercel/analytics`, `@vercel/speed-insights`, Google Analytics Data API |
| Design system | `VISUAL-STYLEGUIDE.md` |

**Stack in place:** Next.js 15 (App Router), React 19, TypeScript, plain CSS (`globals.css` with `:root` brand tokens, PostCSS + autoprefixer, NO Tailwind), Turbopack. Import alias `@/*` → `src/*`.
**Not in place yet:** a database. Today it is Notion + JWT + email only.

---

## 4. Architecture decision: the hybrid

> ⚠️ SUPERSEDED by section 15 (Architecture v2, repo/Supabase-first, 2026-07-15). Notion is no longer the source of truth. Kept here for history.

Two data layers, each doing what it is good at:

| Layer | Tool | Holds | Why |
|---|---|---|---|
| Content source of truth | **Notion** (existing) | Content calendar, pieces, statuses, captions | Anastasia/agent already maintain it; Maria never sees it |
| App-owned state | **Supabase (Postgres), new** | Client users/logins, approval events (audit trail), comments, activity log, notification prefs | Relational, needs isolation and audit; does not belong in Notion |
| Live feed | **Supabase Realtime** | subscription on `activity_log` | The live "recent activity" feed, near-zero custom code |
| Assets | **Links to Drive / Canva** (MVP) | brand files, design previews | No file storage = no PII risk, no storage maintenance |
| Client isolation | **Supabase Row-Level Security** | per-client row scoping | Ready for client #2 without a rebuild |

Sync burden is minimal by design: the portal reads Notion live; the only writes are portal-native actions (approvals, comments) that happen in the app.

---

## 5. Recommended stack (summary)

- **App:** reuse `thedot-site`, Next.js 15 App Router + React 19 + TypeScript + plain CSS (no Tailwind). Portal = new route group (`/client/[slug]`).
- **Content:** Notion via existing `@notionhq/client`.
- **Database:** Supabase (Postgres + Realtime + RLS). The one net-new piece.
- **Auth:** magic-link email login for clients (no password to lose). Extend existing `jose`/`bcryptjs` setup or use Supabase Auth.
- **Email/notifications:** existing `nodemailer`, or Resend later.
- **Assets:** links out to Drive/Canva for MVP.
- **Client assistant:** Anthropic Managed Agents (Phase 2).
- **Deploy:** Vercel (existing) + managed Supabase. No servers to maintain.

---

## 6. Scope: one complete launch (no phased rollout)

Anastasia's call (2026-07-15): no MVP, no thin slice. The full product ships together in one launch. Maria never sees a half-built version. Any "phase" labels elsewhere in this doc are now an internal build order only (a dependency sequence), not a release plan.

**Everything in v1:**
- Client login (magic link) to `/client/kanset`
- Overview dashboard (from the Notion content calendar): awaiting approval / scheduled / live
- Live activity feed (Supabase Realtime)
- Approvals: approve or request a change, with a comment, full audit trail
- Comments on individual pieces
- Client assistant (grounded in approved materials, compliance-gated)
- Content assistant doubles as a "rater": reviews outbound content before it posts or sends
- Content calendar view (month / list)
- Brand library (links to Drive / Canva)
- Recommendations / Strategy section (from the Notion "SM Recommendations" page + weekly plan)
- Communication feed (agent bridges relevant email + meeting recaps via Spark into clean events)
- Email notifications ("you have something to approve")
- Reports (social + website performance, manual/agent-fed to start)
- Mobile-friendly, branded to The Dot (`VISUAL-STYLEGUIDE.md`)

**One care note, not a phase:** the client assistant is the only regulated surface (an AI answering a client's questions in a regulated industry). It ships in v1, but with hard guardrails (approved materials only, refuses case-specific immigration questions, no guaranteed-outcome language) and Anastasia's compliance sign-off before go-live. That is care on one component, not a deferral.

**Internal build order (how it is built, not how it ships):**
1. Foundation: Supabase schema + auth + the Notion read layer. Everything depends on this.
2. Surfaces: Overview, feed, approvals, comments, calendar, brand library, recommendations, reports.
3. Assistant + rater: the grounded review/answer layer and its guardrails, built last because it depends on the approved-content corpus existing.

Nothing goes to Maria until all three layers are done and reviewed.

---

## 7. Live activity feed (the centrepiece)

Direct antidote to "Maria loses the thread."
- Reverse-chronological stream of everything happening on her account.
- Events written by the agent as part of the weekly workflow (posted X, scheduled Y, published Z) and by Maria's own actions (approved, requested change, commented).
- Backed by an append-only `activity_log` table; the browser subscribes via Supabase Realtime so it updates live.
- She opens one page instead of reading ten emails.

---

## 8. The client assistant + rater (in v1, built last)

- Runs on **OpenAI** (The Dot's shared `OPENAI_API_KEY`, already used by `thedot-site`), via server-side calls from the portal. Per-client isolation comes from scoping every call to that client's portal data (RLS + retrieval), not a per-client hosted agent.
- Grounded only in **approved materials**: brand kit, approved posts, strategy docs, podcast transcripts, FAQs. Never another client's data.
- **Compliance guardrails (immigration is regulated):** no case-specific advice, no guaranteed-outcome language, approved material only. Anastasia (lawyer) gates it.
- Built last in the sequence because it depends on the approved-content corpus existing, and it goes live only after Anastasia signs off on its guardrails.
- Doubles as the **"rater"**: the same engine reviews outbound content (on-brand voice, no em dashes, immigration-fact flags, "reads human not AI") before it posts or sends. This answers the r8r question, folded into v1.

---

## 9. Future ideas (beyond v1)

Genuinely later, because they need things that do not exist yet (a second client, granted API access), not because we are phasing v1.
- Multi-client onboarding flow (needs client #2).
- Live API integrations for the reports section (Meta Graph, YouTube Analytics, GA4 + Search Console), each needing Kanset access. v1 reports are manual/agent-fed.
- Multiple client contacts + roles.
- Content repurposing, semantic search, coverage analysis.
- **r8r ([r8r.sh](https://r8r.sh/)) as the automation / orchestration engine** once the workflow graph gets complex or we go multi-client: declarative YAML workflows in the repo, deterministic + LLM nodes, model-agnostic, open source. Not in v1 (it is a server to host, and overlaps with what we already have). v1 automation runs on the agent + Next.js server actions + Vercel Cron + Managed Agents. Re-evaluate its repo and maturity before adopting.

---

## 10. Cost and maintenance (the downsides, honestly)

- **Token burn:** build tokens are one-time and smaller than the spec implied (extending, not scaffolding). Runtime tokens are only Maria's assistant (Phase 2), low volume, cents per query.
- **Hosting $:** Vercel + Supabase free/low tiers cover one client. Expect roughly $0 to $25/mo until volume grows.
- **Maintenance:** one codebase Anastasia already runs, managed hosting (no servers). Net-new surface is one database + a few routes. The agent owns dependency updates and monitoring. This is the risk to watch; scope discipline keeps it small.

---

## 11. Guardrails (hard rules)

- **PII:** the portal's storage must NEVER touch the Kanset Drive intake files (real client names + payments). Brand and content assets only. Designed in from day one.
- **Compliance:** the client assistant is a regulated surface. Educational/general only, no case-specific advice, no guaranteed outcomes. Anastasia rules.
- **Client isolation:** RLS from the first table, so client #2 is safe by construction.

---

## 12. Decisions (locked + open)

Locked (2026-07-15):
- [x] Scope: one complete launch, no MVP, no phased rollout. Everything in v1.
- [x] Architecture v2 (repo/Supabase-first) LOCKED 2026-07-15 (Anastasia confirmed): content files = source of truth, Supabase = app state + runtime read-model, Notion demoted to optional. Full detail in section 15.
- [x] Route: `/client/kanset` (slug, future-proofs for client #2).
- [x] Auth: Supabase magic link.
- [x] Overview source: `content_items` synced from the content files (not Notion; see section 15).
- [x] Client assistant + rater + Recommendations section: all in v1.

Still open:
- [ ] Verify Spark is currently working (live read test), so the agent can feed communication events.
- [ ] Keep the plan doc here in `thedot-site`, or mirror a copy into the Kanset workspace?

---

## 13. Additions, 2026-07-15 pass (permissions, email surfacing, performance, recs)

**Notion permissions (done):** all Notion MCP tools added explicitly to the allowlist in `Kanset/.claude/settings.json`, so they stop interrupting the flow. If a prompt still appears after this, it is a connector-auth prompt (a different mechanism from permission rules) and we handle that separately.

**Email communication in the portal (Spark):**
- Verified against the CLI's own help (`spark --help`, v1.2.2, checked 2026-07-15): the tool is the "Spark email client CLI" and "Requires a running Spark Desktop instance." It is a local reader of Spark Desktop's data. All subcommands are read-only (emails, search, thread, attachments, plus meeting transcripts, calendar, contacts, templates). There is no server, API, or cloud mode. So a Vercel-hosted portal genuinely cannot call it directly. (Earlier this was asserted before checking; now confirmed from the tool.)
- Pattern: the agent (which has Spark access) reads the relevant Maria threads on the Mac and writes clean, summarized "communication" events into the activity feed / Supabase. The decision thread shows up in the portal without dumping raw email, which would reintroduce the clutter the portal exists to remove.
- Bonus: the CLI also reads meeting transcripts, summaries, and notes, so the same "communication" feed could surface call recaps, not just email.
- To do: a live read (e.g. `spark accounts`) needs Spark Desktop open and the Bash sandbox off. The CLI is installed and responding.

**Performance data (social + website), how we get it:**
- MVP: manual, agent-fed. The agent pulls the numbers and writes them to the existing Kanset SM Metrics Notion DB and `SM-analytics-tracking-2026.md`; the portal reads and displays them. This matches the spec's "manually entered data first, service abstractions for integrations later."
- Later (Phase 3): real API integrations, each needing Kanset access.
  - Social: Meta Graph API (Instagram + Facebook), YouTube Analytics API.
  - Website (kanset.com): Google Analytics 4 + Search Console.
- Attribution stays phone-first (front desk "how did you hear about us?"), entered manually.

**Dedicated Recommendations / Strategy section (client-side):**
- A standing client-side section that surfaces The Dot's social + content recommendations to Maria in one place.
- Source: the existing Notion "SM Recommendations (client-facing)" page plus the weekly content plan.
- Purpose: Maria always has one place to see the strategy and what we recommend next, instead of scattered across emails.

---

## 14. Integration map (from the flow study, 2026-07-15)

How the portal plugs into the existing Kanset system. Distilled from the flow-study agent's full map. Verify the exact Notion IDs when wiring.

**The spine the portal reads:**
- **Notion "Kanset Content Calendar" DB is the master** (`27464dca-49b9-4404-bec5-fe4f67390154`, data source `91aba2c0-822f-4438-bb2b-e7966dc6928d`). One row per post. Status pipeline: **Idea → Draft → Approved → Scheduled → Posted**. Fields: Name, Date, Format, Pillar, Platform (multi), Producer (The Dot / Studio), Status, Notes, Link.
- Overview maps straight onto Status: Draft = awaiting approval, Approved = greenlit, Scheduled = scheduled, Posted = live.
- Reports = Notion "SM Metrics" DB (`7acb4709e3da4b0a9069dcc28b31f5c2`). Recommendations = "SM Recommendations" page (`380d0f0c254481baa89ce851d8d7f162`) + Content Ideas DB (`333b03142a5648f7972531d0a286f609`).

**Finding that shapes the detail view:** the actual copy, slides, captions, and fact-check ledgers live in **`content/*.md` files, not in Notion.** The calendar row only carries Name / Status / Link / Notes. So the tap-in detail view has to surface the real copy from those files (ingest them); the DB alone is not enough.

**Approvals today happen in two places, both outside any portal:** email threads (primary) + Notion comments on the client plan page. The portal replaces both with a per-piece Approve / Request-change + inline comment. Email drafts become notifications, not the decision channel.

**Activity-feed events already exist as real transitions:** drafted, fact-check flagged, packaged, approved, commented, scheduled, posted, metrics recorded, invoice sent, idea captured. Each is a clean event the feed logs.

**The load-bearing constraint:** posting/scheduling is manual (Meta Business Suite / YouTube Studio / Squarespace, no API write-back), so Status is a human flip with no system-of-record event. The feed is only as live as that flip is disciplined. This confirms the commitment that **the agent owns writing the events and status** as part of the weekly workflow.

**Decisions this surfaced:**
- [ ] Bind the portal to the master calendar DB (`91aba2c0…`) and retire/ignore the duplicates (a stray inline "Social Media Calendar" DB, the shared Google Doc, the Google Calendar) and clean the known duplicate row.
- [ ] Pick one "Content Ideas" object (there is both a DB and a page).
- [ ] Confirm the portal ingests `content/*.md` for the detail view.
- [ ] Add structured approval metadata in Supabase (approved-by / date / revision-round), which Notion lacks.
- [ ] Set expectation: Reports are **twice a month, one per platform** (H1/H2 periods) and manual (no real-time reach) until API integrations (future). (Corrected 2026-07-18 to match the built portal + the 2026-07-17 spec. If you'd rather under-promise "monthly" to Maria, that's a comms call, flag it.)

---

## 15. Architecture v2 — repo/Supabase-first (2026-07-15, after external review)

Supersedes the "Notion as source of truth" stance in sections 4 and 14. External review + the flow study point the same way: the real copy already lives in files, Notion held only thin status, and the agent already authors files in the workspace. So the spine moves to repo files + Supabase, with Notion demoted to optional planning.

### Product framing (sharpened)
The portal is a **shared memory and approval system** for The Dot and Kanset, not a fancy dashboard. The promise: *you no longer have to remember where we discussed something, the portal remembers the work.* One place for what needs Maria, what was approved, what changed, what is scheduled, what went live, what The Dot recommended, and what the results show.

### The architecture
1. **Structured content files = content source of truth.** Frontmatter + body: captions, post copy, article/slide drafts, Canva/Drive links, fact-check notes, internal notes, metadata. Git-versioned, agent-authored (the agent already writes these).
2. **Supabase = app state AND the runtime read-model.** Users, auth, approvals, comments, revision rounds, activity log, notification prefs, report snapshots, audit trail, plus a synced `content_items` index (frontmatter + body) the deployed portal reads at runtime.
3. **Portal = Maria-facing views** over Supabase.
4. **Notion = optional internal planning only.** Not a system of record. Nothing load-bearing reads it. Avoids a third truth.

**The implementation detail the external review skipped (and it matters):** the portal is a Vercel-deployed app; it cannot read files on the Mac, and the content files live in the Kanset workspace, not the `thedot-site` repo. So files stay canonical (git-versioned, agent-maintained), and a **sync step** (the agent in the weekly workflow, or a small script / git hook) parses each file's frontmatter + body and upserts a `content_items` row into Supabase. The portal reads Supabase, never the laptop. PII rule still applies: never sync client intake data; brand/content only.

### Content frontmatter schema (authoring)
```yaml
---
content_id: kanset-2026-07-oinp-employer     # stable slug
client: kanset
title: "OINP employer job offer carousel"
format: carousel            # reel | carousel | single | story | article
pillar: employer            # employer | news | success-story | how-to | qa | roundup
platforms: [instagram, facebook]
scheduled_date: 2026-07-16
status: draft               # idea | draft | approved | scheduled | posted
canva_url: https://...
drive_url: https://...
version: 3
fact_check: confirmed       # confirmed | needs-confirm | flagged
---
# body: approval-ready caption / slide copy / article draft / fact-check ledger / internal notes
```

### Supabase tables (v1)
- `clients` (id, name, slug, logo_url)
- `client_users` (id, client_id, email, name, role)
- `content_items` (id, content_id, client_id, title, format, pillar, platforms, scheduled_date, status, canva_url, drive_url, version, fact_check, body, source_path, updated_at) — synced from files
- `approvals` (id, content_id, client_id, state, approved_by, approved_at, revision_round)
- `comments` (id, content_id, client_id, author_type, author_name, body, anchor, created_at)
- `revision_rounds` (id, content_id, round_no, requested_by, note, created_at)
- `activity_log` (see event shape below) — append-only
- `notification_prefs` (id, user_id, channel, event_types)
- `report_snapshots` (id, client_id, period, platform, metrics jsonb, summary, created_at)

All client-owned tables carry `client_id`; RLS enforces per-client isolation from row one.

### Activity events
Every meaningful transition = one event; the agent is the primary writer, humans can add manually. Each event names the action AND the exact object (not "Approved" but "Approved: 'Why a checklist is not enough', version 3").
Types: `needs_review | approved | change_requested | scheduled | posted | recommendation_added | monthly_report_added | meeting_email_note_added | idea_captured`.
```ts
type ActivityEvent = {
  id: string
  client_id: string
  content_id?: string
  event_type: "needs_review" | "approved" | "change_requested" | "scheduled"
    | "posted" | "recommendation_added" | "monthly_report_added"
    | "meeting_email_note_added" | "idea_captured"
  title: string
  summary: string
  actor_type: "client" | "anastasia" | "agent"
  actor_name: string
  created_at: string
  related_url?: string
}
```
Realtime is not the core promise. A reliable, recent, reverse-chron feed matters more than live movement. Supabase Realtime stays as cheap polish, not the product's spine.

### The Client Work Assistant (renamed, redefined)
The client-facing assistant is a **Client Work Assistant** (a navigator), NOT an immigration-advice assistant. It helps Maria navigate The Dot's work: past ideas, approvals, drafts, links, recommendations, report highlights, communication summaries. It answers ONLY from portal/work data (content files, activity log, approvals, comments, recommendations, reports, summarized notes). It refuses immigration/legal/case-specific questions and redirects those to Kanset's own team. This resolves the earlier compliance worry: by definition it does not touch regulated advice. (Alt name if you want the branded feel: "The Dot Work Navigator.")

**AI provider (decided 2026-07-15): OpenAI.** The assistant and the rater both run on OpenAI using The Dot's shared project key (`OPENAI_API_KEY`, already in `thedot-site`), called server-side from the portal. The site already uses the `openai` SDK, so this keeps one AI provider across `thedot-site`. Per-client isolation is enforced by RLS + retrieval scoping (never a hosted agent), and the guardrails (navigator-only, no immigration advice, grounded strictly in portal data) are provider-agnostic and unchanged.

### Rater vs Client Work Assistant (separate things)
| Tool | Audience | Purpose | Risk |
|---|---|---|---|
| Rater | Anastasia / agent (internal) | QC content before it is sent, posted, or shown (on-brand? too AI? em dash? claim too strong? CTA? ready for Maria?) | Low, internal |
| Client Work Assistant | Maria (client-facing) | Navigate work, approvals, history, links, recommendations, reports | Medium, client-facing |
| Immigration assistant | (public) | Answer immigration questions | High, regulated, NOT being built |

### Reporting (v1, simple)
Twice a month (per platform, H1/H2 periods), client-useful, answers "what changed, what worked, what next." Social: reach, engagement, saves, profile visits, follower growth, top posts, vs baseline + vs previous period. Website: traffic vs baseline + previous period, top pages, contact clicks / form submissions. Not a complex analytics dashboard.

### Email-to-portal rule
Email still happens, but the **portal is the official decision channel.** Email reminders point Maria back to the portal; approvals and change requests are only final inside the portal. If Maria replies by email anyway, the agent summarizes the decision/note into the portal as a clean activity event or comment, never dumps raw email in.

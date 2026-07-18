# Client Portal, Reconstructed Initial Spec + Surface Design

**Date:** 2026-07-17
**Owner:** Anastasia (The Dot Creative)
**Status:** Reconstruction of a lost doc + live surface design. Not yet fully reconciled to a build plan (see §7).

## 0. Why this doc exists (provenance, read first)

The original portal spec was a 28-section document Anastasia wrote on 2026-07-15. It was **lost**: its conversation transcript was compacted, and the layout mockup was rendered in a browser preview that was never saved to disk. Neither is recoverable verbatim.

This doc reconstructs it so it can never be lost again. Every claim is tagged by source:
- **[recovered]** = from the claude-mem observation record (a detailed summary of the original, not its verbatim text): obs #12337, #12353, #12385, #12392.
- **[Anastasia]** = her direct instruction (dated).
- **[shipped]** = what is actually built and in production today.
- **[open]** = a decision still needed.

What is genuinely gone: the exact original wording, the list of 20 screen names, and the layout mockup image. Everything below is the recovered structure, not the lost pixels.

## 1. Concept [recovered]

A branded **"client operating system"** at `/client/[client-slug]` (e.g. `/client/kanset`), inside the existing `thedot-site` Next.js app. Not a generic file portal: one calm, premium, editorial workspace per client that combines content, approvals, calendar, brand, strategy, and reports. Must extend The Dot brand, never read as generic SaaS. Kanset is the first tenant.

The sharpened framing (current): a **shared memory and approval system**, "you no longer have to remember where we discussed something, the portal remembers the work."

## 2. Navigation & layout [Anastasia, 2026-07-17]

- **Desktop: left vertical nav** (sidebar down the left edge).
- **Mobile: bottom nav bar** (tab bar, max 5 primary items).
- **Items:** Overview, Calendar, Plan, Ideas, Strategy, Reports, Library (Brand + Video). The Client Work Assistant joins later.
- That is more than 5, so **mobile bottom bar shows the primary 5** (Overview, Calendar, Strategy, Reports, Library) with Plan / Ideas / Assistant under a "More" entry; desktop left nav shows all. Grouping is a proposal, open to change.
- Branded to The Dot (cream ground, yellow accent, sharp corners, the `@thedot/design-system` tokens). The nav is a net-new piece: today only the Overview exists, so building the nav is part of this surface pass.

> Note: an earlier recollection put the nav on the right. Corrected 2026-07-17: left on desktop, bottom on mobile.

## 3. Roles [recovered] vs [shipped]

| Role | Original spec | Shipped today |
|---|---|---|
| Agency Admin (Anastasia) | full control | via service role + local scripts (no in-portal admin UI) |
| Agency Team Member (assigned clients, no billing/delete) | defined | **not built** (solo operator; deferred) |
| Client User (own workspace: read / approve / request / comment) | defined | **built** (magic-link, RLS-scoped) |

The original 3-role RBAC was simplified to "client user + service-role admin." Re-add Team Member only when there is a second person on The Dot side.

## 4. Feature sections: original vision vs current status

| # | Section | Original spec [recovered] | Status |
|---|---|---|---|
| 1 | Overview / dashboard | awaiting / scheduled / live snapshot | **shipped** |
| 2 | Live activity feed | reverse-chron stream, Realtime | **shipped** (Realtime = optional polish, not wired) |
| 3 | Approvals | approve / request change + audit trail | **shipped** (transactional RPC) |
| 4 | Comments | per-piece | **shipped** + two-way (client ↔ The Dot) |
| 5 | Email notifications | "you have something to approve" | **shipped** |
| 6 | Content calendar | month / list | **to build** (see §5) |
| 7 | Strategy / recommendations | strategy docs surface | **to build** (see §5) |
| 8 | Brand library | brand assets | **to build**, as Drive/Canva links (see §5) |
| 9 | Reports | social + website performance | **to build** (see §5) |
| 10 | Communication feed | email/meeting recaps as clean events | **to build**, as a feed filter (see §5) |
| 11 | Client requests | client asks The Dot for content/design | **not in current plan** (see §7) |
| 12 | Social media library | browse all social pieces | folded into calendar + overview |
| 13 | Video library | video projects | **to build**, as **links** (studio reels, cuts, podcast) [Anastasia] |
| 14 | Plan page | upcoming plan + draft content pages | **to build** (calendar deep-links here) [Anastasia] |
| 15 | Ideas dump | content-idea collection | **to build** (mirrors the Notion ideas board) [Anastasia] |
| 16 | Client Work Assistant | client-scoped navigator (AI) | **to build, last** (regulated, needs compliance sign-off) |
| 17 | Rater | internal QC before posting | **to build, last** |

## 5. Surface design (this build pass) [Anastasia 2026-07-17 + design discussion]

### Calendar, `/client/kanset/calendar`
- **Super informative** entries: date, title, format + pillar, platforms, status, fact-check flag.
- **Click routing by state:** a **produced** piece (draft → posted) opens **that piece's page**; a **future / planned** slot opens **the plan page**.
- Views: month grid (status color-coded) + list by week. Read + click through; no drag-reschedule (posting is manual).
- A **future / planned / drafted** slot deep-links to that piece's **subpage under the Plan page** (see Plan page below), NOT to a finished piece page.

### Strategy / Recommendations, `/client/kanset/strategy`
- **Agent-authored using the marketing skills** (content-strategy, seo-audit, competitor-profiling, analytics/ab-testing) through the Kanset voice + compliance gate; stored for the portal to display.
- **Wired to SM performance reviews that renew twice a month**: performance data drives the recommendations, regenerated ~every two weeks. Strategy and Reports share one performance engine.
- **Read-only** [Anastasia 2026-07-17]: Maria reads them, no Accept / Not-now. Each card has a **Copy** button (reuses the piece `CopyBlock`). Recommendation **categories include a `copy` type** (copywriting recs) alongside content / platform / growth.

### Reports, `/client/kanset/reports` [Anastasia 2026-07-17: confirmed]
- The report **is** the **twice-monthly** SM performance review (feeds Strategy), agent-fed from the Kanset SM Metrics Notion DB + SM-analytics doc. No live API in v1.
- **Per platform:** Instagram, Facebook, YouTube shown separately, not aggregated.
- Metrics: social (reach, engagement, saves, profile visits, follower growth, top posts) + website (traffic, top pages, contact clicks), each vs previous period + baseline, plus a short written summary.

### Library, `/client/kanset/brand` + `/client/kanset/video` [Anastasia 2026-07-17]
Both are **link-sharing** surfaces (no file hosting, sidesteps the PII/storage risk):
- **Brand library:** links to the Drive/Canva brand assets + brand colors/fonts shown inline. **Hard PII guardrail:** brand assets only, never the Drive intake folder.
- **Video library:** links to video content / production (studio reels, cuts, the podcast). Links out to Drive/YouTube/Canva.
- One `links` table with a `category` (brand / video / ...) can back both; grouped into a "Library" nav section.

### Plan page, `/client/kanset/plan` [Anastasia 2026-07-17]
- The Plan page holds the **draft content pages**: one **subpage per planned / drafted piece** (the upcoming content plan Maria reviews, the portal-native version of the client content-plan docs).
- The calendar deep-links a future/drafted slot to that piece's **subpage here**. Once a piece is produced/approved/live it reads as a finished **piece page** instead.
- Content source: the same `content_items` rows in `idea` / `draft` status (their draft body), grouped by period.
- **[open, architecture]** Anastasia wants drafts to be **editable** in the portal ("same as drafts have the edit capability"). But draft bodies currently come from Markdown files (the source of truth), so a portal edit would be overwritten on the next file sync. Decide the flow: (a) portal edits are captured as **suggestions / comments** (safe, non-destructive), (b) draft bodies become **Supabase-native + editable** (the portal is the editor, files stop being the source for drafts), or (c) a per-piece **portal override** the sync respects. Ideas do not have this issue (Supabase-native). This is the one thing gating the Plan-page edit build.

### Ideas dump, `/client/kanset/ideas` [Anastasia 2026-07-17]
- A collection surface for content ideas (Maria's + The Dot's), the portal-native version of the existing Notion "Kanset Content Ideas" board (`333b03142a5648f7972531d0a286f609`).
- **Maria can add AND edit ideas** [Anastasia 2026-07-17: "same as Notion's page now but better", "same as drafts have the edit capability"]: mirrors and improves the Notion board. Client write path via `add_idea` + `edit_idea` `security definer` RPCs; add logs an `idea_captured` activity. Any member of the client can edit any idea in that client (shared board). Seed from the 7 ideas already on the Notion board.

### Communication feed
- A "Communication" filter on the overview activity feed. Agent writes clean `meeting_email_note_added` summaries (Spark cannot be reached from Vercel; the agent bridges it). Never raw email.

## 6. Data model

**Shipped tables:** `clients`, `client_users`, `content_items`, `approvals`, `activity_log`, `comments`.
**New tables this pass:** `recommendations`, `brand_links`, `report_snapshots` (all `client_id` + RLS, same pattern).
**Original spec had ~23 tables** [recovered] incl. `client_memberships`, `social_posts`, `video_projects`, `calendar_items`, `approval_requests`, `approval_events`, `assets`, `documents`, `client_requests`. The current model is deliberately leaner (§7).

## 7. Reconciliation: original vision vs current plan (needs a decision)

The shipped portal follows a **leaner, repo/Supabase-first** evolution (`CLIENT-PORTAL-PLAN.md` §15). Reconciled 2026-07-17:
- **Back IN, as links:** the **video library** (studio reels / cuts / podcast). Links only, no hosted files, so no PII/storage risk.
- **Still dropped / backlog:** private file storage + signed URLs (brand, video, reports are ALL links), the 3-role RBAC Team Member (solo operator; add when a second person exists), client requests as a full section.
- **Reason on record:** PII safety (no hosted client files), solo operator, "build thin, prove with Kanset."

**Target for this pass:** the surface set in §5, Calendar, Plan, Ideas, Strategy, Reports, Library (Brand + Video), Communication feed, then the assistant + rater last. File storage, Team Member role, and client-requests stay backlog.

## 8. Open decisions (consolidated)

1. RESOLVED, reconciliation: video library in as links; file storage / Team Member / client-requests = backlog (§7).
2. RESOLVED, recommendations: **read-only** + Copy button; a `copy` recommendation category.
3. RESOLVED, reports: twice-monthly, **per platform**, metric set as listed.
4. RESOLVED, plan page: holds per-piece **draft subpages**; calendar deep-links there.
5. RESOLVED, ideas dump: **Maria can add** (client write path via `add_idea` RPC); mirrors the Notion board.
6. Client Work Assistant + rater: dedicated follow-up phase (compliance sign-off), after the surfaces.

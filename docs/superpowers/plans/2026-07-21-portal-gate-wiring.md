# Portal gate wiring plan (from the 2026-07-20 content-flow handoff)

Source of truth: `~/Kanset/handoff-portal-agent-content-flow-2026-07-20.md` (the standardization
session's output, aligned with Anastasia; her rulings in `docs/superpowers/specs/2026-07-20-my-tasks-design.md` §12).
That document describes; this plan wires. Scope and sequencing are Anastasia's call; the phases
below are the recommendation.

## Mapping: the 9 gates vs what the portal already has

| Gate | Portal home today | Wiring needed |
|---|---|---|
| 1 fact-check | frontmatter + ledger + release gate | none (rendered as the fact-checked chip) |
| 2 source-in-hand | none | NEW: production gate record |
| 3 design-built | none (design link exists but is not a gate) | NEW: production gate record; auto-close candidate when a design link is set |
| 4 proofed | none | NEW: production gate record |
| 5 approval-sent | review_ready_at exists | NEW: gate record with channel + thread provenance; ties to the change-note rule |
| 6 copy-approved | approvals + record_external_decision | none; per-version semantics already enforced |
| 7 scheduled[:dest] | content_schedule_targets (manual confirm) | none |
| 8 posted[:dest] | publication target transition | none |
| 9 link-confirmed[:dest] | publication targets + observations + lock | none |

Plan-cycle gates (plan-drafted/sent/approved) have NO portal entity today. Ideas-lane statuses
(logged/triaged/slotted/parked/declined/promoted) do not match the current portal enum
(new/considering/planned/archived). Podcast lane: excluded until its ep-2 gate set exists.

## Phase 1 (recommended now): per-piece production gates + honest stage

1. **Migration 0022**: `content_production_gates` (client_id, content_item, gate_key in
   [source_in_hand, design_built, proofed, approval_sent], state in [open, done, na], na_reason,
   owner_label, note, occurred_at, provenance/source ref, audited receipts). Tenant RLS read for
   the client; writes ONLY via a new audited agency RPC (0011 conventions). Revoke-then-grant
   pattern from the 0017 incident. Gate rows are append-current (one row per gate per piece,
   updates audited via activity events `gate_closed` / `gate_reopened`).
2. **Derived stage** (view or shared function) combining: fact_check + production gates +
   approval state + schedule targets + publication targets into ONE honest label per piece:
   `In production (needs: design, proof)` / `Waiting on client approval` / `Approved, scheduling`
   / `Scheduled (IG, FB; YT pending)` / `Posted, link confirmation pending` / `Done` /
   `Direction approved, copy in progress` (the H&C case: piece approval exists at plan/direction
   level but production gates are open).
3. **portal-write `gate` command**: the agents' single write surface for gate transitions (the
   pack's STATUS GATES block stays the agency working record; portal-write is the same-action
   Supabase write per the no-dual-writes rule).
4. **UI**: piece page gets a compact gate strip (done/open/na with dates, client-safe wording);
   overview's Waiting-on-approval counts a piece ONLY when approval_sent is closed and the
   decision is pending (fixes "why is this waiting on me when nothing was sent to me"); the
   Approved bucket shows the derived stage instead of a bare "approved".
5. **Backfill (data, not schema)**: for the 16 live pieces, close gates from documented reality
   (posted pieces: all gates done with import provenance; the decoder/ep2: per the publish packs'
   STATUS GATES blocks; H&C: approval_sent open, design_built open, honest stage "direction
   approved, copy in progress" WITHOUT touching the recorded external decision, whose provenance
   note already says what it was).
6. Auto-close hook: setting a design link via set_content_design_links closes design_built with
   provenance (one less manual step; still audit-visible).

## Phase 2: plan entity + ideas-lane alignment

- Plan cycles as a small entity (week start, gates plan-drafted/sent/approved, decision via the
  existing approval machinery; the client-safe per-day directions render from released pieces).
- Ideas status remap to logged/triaged/slotted/parked/declined/promoted + promoted-piece linkage
  (idea -> piece back-reference exists as source_idea_id already); a parked/declined ruling is
  never re-asked (enforce in UI + assistant index).
- The change-note rule rendered in the portal ask (a change note field on release/re-release when
  a seen version changed materially).

## Phase 3 (later, aligned to real events)

- Podcast lane gate set (before ep 2, ~mid-Aug).
- Reporting-cycle states (pulled/analyzed/logged/sent) on report snapshots.
- The "studio bonus cut" class (gives the parked Slam Dunk URL its portal home).
- My-tasks render (agency-side, reads first-open-gate per piece; likely lives outside the client
  portal surface).

## Rules that bind the build (from the handoff, restated)

Scheduled/posted states are recorded on Anastasia's report, never inferred. Destinations stay
separate. Shipped versions stay locked. Email decisions keep honest provenance. Nothing outbound
without her send. No em dashes. Codex reviews frozen hashes; the local verification bar
(replay + poisoned-defaults check + test-rls + vitest + build) applies to 0022 like everything else.

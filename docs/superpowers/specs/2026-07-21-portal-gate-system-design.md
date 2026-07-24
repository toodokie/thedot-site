# Portal gate system: full design spec (v1, with self-doubt review record)

**Date:** 2026-07-21 · **Author:** Claude (portal build pen) · **Reviewers:** Anastasia (rulings + go), Codex (frozen hashes at build time)
**Sources of truth, in precedence order:** `~/Kanset/docs/superpowers/specs/2026-07-20-my-tasks-design.md` (v2, ALIGNED, her §12 rulings) > `~/Kanset/handoff-portal-agent-content-flow-2026-07-20.md` > `portal-integration-task.md` (signed architecture). Where this spec makes a new call, it is marked **[call]** and listed in §11 for her ok. Per her standing process rule (§12): nothing here builds until she says go.

## 1. What this wires

The my-tasks spec defines the flow; the portal already stores gates 1, 6, 7, 8, 9 faithfully (fact-check, copy-approved, scheduled/posted/link-confirmed per destination). This spec adds the missing storage and views:

- **Production gates** (source-in-hand, design-built, proofed, approval-sent): new agency-only storage.
- **Ops tasks**: new agency-only storage (title/category/due/trigger/owner/status/source).
- **`my_tasks`**: a derived view (never a document), rendered on the agency/admin surface.
- **Honest per-piece stage**: derived, agency-side.
- Later phases: plan-cycle gates, ideas-status upgrade, reporting cycles, podcast gate set.

Explicit NON-goals (per §10 of the aligned spec): no client visibility of production gates or ops tasks; Maria's end keeps its exact current semantics (released content, Approve / Request a change, comments, live links). No new client-side chips or stages.

## 2. Data model (migration 0022, target `feat/thedot-design-system`)

### 2.1 `content_production_gates`

One CURRENT row per (client_id, content_item_id, gate_key, dest):

- `gate_key` enum: `source_in_hand | design_built | proofed | approval_sent`
- `dest` nullable enum `instagram | facebook | youtube | squarespace` (production gates are normally destination-less; the column exists for forward-compat and stays NULL in v1 **[call: keep NULL-only in v1; the four production gates are per-piece facts]**)
- `state` enum: `open | done | na`; `na_reason` text NOT NULL when state = na (grammar's `[~]` with mandatory reason)
- `owner_label` text (`anastasia | studio | agent`), `occurred_at` timestamptz, `note` text (provenance: Drive link, brief ref, thread id), `updated_at`
- Constraints: proofed may not be `na` unless `na_reason` explains that nothing renders text or speech (soft: reason mandatory; the hard rule lives in review, per her ruling "nothing is n/a here unless truly nothing renders text or speech")

### 2.2 `production_gate_events` (append-only audit)

Every transition: (client_id, content_item_id, gate_key, dest, from_state, to_state, actor_key, note, created_at, receipt id). **[call] Gate transitions do NOT write `activity_log`**: the client overview feed reads activity_log, and production internals must never leak to Maria's feed. The dedicated events table is the audit trail; the agency surface reads it directly.

### 2.3 `ops_tasks`

(client_id nullable: ops tasks may be agency-global), title, `category` enum (`invoice | follow_up | revisit | access | watch | plan | report | portal | admin`), `due_date` date nullable, `trigger_note` text nullable (the `watch:` form), `owner_label`, `status` enum (`open | done | dropped`), `source` text (provenance, mandatory), timestamps, idempotency receipts. Done tasks keep their rows (**[call] prune policy: keep rows forever, filter views to open + recently-done; answers the spec's §13.2 open question with "never delete", cheap and audit-consistent**).

### 2.4 Security posture (both tables + events)

- RLS ON; **zero grants to authenticated** (client roles read nothing; the §14 acceptance check "client roles read none of it" becomes an assertion).
- service_role: SELECT-only on tables (revoke-then-grant per the 0017 incident pattern); writes ONLY via security-definer RPCs (`set_production_gate`, `add_ops_task`, `complete_ops_task`) with agency-actor validation, fingerprinted idempotency receipts, and shape checks (note length, enum validation, https-only links in notes not enforced [they are provenance, not client-facing]).
- Cumulative assertion fold extended (slice numbering continues); poisoned-defaults replay in the verification bar.
- **Assistant index: NOT a source.** Production gates and ops tasks are agency-only; the 13-source index does not grow here, asserted (the client-facing assistant must never learn or leak production internals).

## 3. Write path and the no-dual-writes rule

- New `portal-write` commands: `gate` (payload: contentId, gateKey, state, note, owner, naReason?), `ops-task` (add), `ops-task-complete`. Same conventions as every §5.1 command (dry-run, receipts, actor).
- **The pack's `## STATUS GATES` block**: stays the agency working record. At gates-cutover the EMISSION is the `portal-write gate` call; the command **also regenerates the block in the piece's pack when given `--pack <path>`** (best-effort mirror, exactly the §5 plan: "the format survives; only who writes it changes"). Without `--pack` it prints the regenerated block for the agent to paste, so the file mirror can never silently diverge without a visible step. **[call: --pack is optional-but-nagging rather than mandatory, because publish packs move and rename; a hard requirement would break emissions on renames]**
- Adoption boundary, stated honestly: agents in Anastasia's content sessions must switch their gate edits to `portal-write gate` for Supabase to be truthful. Until they do, the portal's gate data covers only what the backfill (§6) and portal-session work record. The skill wiring (§8) is what flips her sessions over; the cutover is per-lane, not big-bang.

## 4. Derivations (views, no new hand-kept state)

### 4.1 `content_stage` (per piece, agency-side)

Priority-ordered derivation over existing + new data:

1. `done`: every REQUIRED destination link-confirmed (publication targets live + observation; required set = the piece's platforms)
2. `posted_unverified`: any destination posted without link confirmation
3. `scheduled_partial | scheduled`: schedule targets confirmed for some/all destinations
4. `approved`: current released version has an approve decision AND production gates design_built + proofed are done
5. `direction_approved`: an approve decision exists BUT any of design_built/proofed/approval_sent is open (the H&C shape: decision recorded, production incomplete)
6. `awaiting_decision`: approval_sent done, no decision on the current version
7. `in_production`: released or draft with open production gates (subdivide by first open gate for display: "needs design", "needs proof", "waiting on studio" when source_in_hand open with owner studio)
8. `draft`: none of the above

Notes: stage is a VIEW (or SQL function), never stored; per-destination truth stays visible alongside (the stage label carries the divergent destinations, e.g. "scheduled (IG, FB); YT pending"). Podcast-lane pieces: until the ep-2 gate set exists, episodes simply have no production-gate rows and derive through the existing states only (**consistent with "not covered by the 9-gate model"**).

### 4.2 `my_tasks` (agency-only view)

Union of:
- Per non-archived piece with open gates: the FIRST open gate in canonical order (1..9, production gates interleaved per the locked vocabulary), with owner routing: anastasia → action; maria → Waiting-on-Maria (+days since approval_sent); studio → Waiting-on-studio (visible from plan stage).
- Open ops_tasks (due-dated sorted into Overdue / Today / This week / Upcoming; `trigger_note` ones under Watch).
- Waiting-on-Maria staleness: **[call, answers §13.3] at 2 business days the row flags "nudge?"; the surface offers a draft; nothing sends without her** (matches the portal SLA and the nothing-outbound rule).

Rendered on the ADMIN surface (the §6.8 agency area), NOT in the client portal shell. The interim file-grammar render in her sessions continues until the lanes cut over; both read the same canonical order so they agree wherever data overlaps.

## 5. Approval semantics (unchanged, restated as build constraints)

- copy-approved closes only on an explicit per-piece per-version decision (portal Approve or `record_external_decision`); never inferred. Enforced already; the gate system adds NO alternate close path.
- Request-a-change: reopens copy-approved via the existing version machinery. Production-gate reopening is an EXPLICIT `portal-write gate ... state=open` emission by the recording agent (the change note names what reopens); nothing reopens by inference. **[call]**
- The change-note rule: phase 2 adds a `change_note` on release/re-release rendered in Maria's ask; until then the note rides the email ask (current behavior).
- approval_sent evidence: email era = thread id in the note; at portal-only, the release event itself closes approval_sent (the release IS the ask), recorded with the release id.

## 6. Backfill (data step after 0022 applies; ops, not schema)

- The 11 posted/historical pieces: all four production gates `done`, note "backfill: shipped pre-gate-system", occurred_at = first_live date, owner anastasia. (source_in_hand only on studio-sourced pieces; The-Dot-designed pieces get `na` with reason "not studio-sourced" for source_in_hand. **[call: na, not done, keeps the gate's meaning strict]**)
- Decoder + ep2: close from the live publish packs' STATUS GATES blocks verbatim (they exist and are current).
- H&C: design_built OPEN, proofed OPEN, approval_sent OPEN; the recorded decision stays untouched (provenance already honest); stage derives to `direction_approved`. **Remediation by next version, not retroactive edits:** the real Wednesday flow (final copy + visual to Maria, her explicit ok) closes the gates properly and records the decision on the version she actually saw.
- ep3 + where-to-start: source_in_hand per reality (ep3 = studio cut status), design_built open, proofed open, approval_sent open.
- Backfill runs via `portal-write gate` (dry-run first, gate by gate, receipts) so even the backfill is audited; no direct SQL.

## 7. Later phases (sequenced, from the aligned spec)

- **Phase 2:** `plan_cycles` entity (week_start, plan-drafted/sent/approved via the existing decision machinery; needed BEFORE plan approval goes portal-only); ideas-status upgrade (enum remap new→logged, considering→triaged, planned→slotted, archived→parked; add declined/promoted; migrate the 6 live rows; promotion links via existing source_idea_id; parked/declined never re-asked, surfaced in UI + excluded from re-triage); `change_note` on release.
- **Phase 3:** reporting cycles native (`report_cycles`: period, platform, pulled/analyzed/logged/sent), podcast-lane gate set (before ep 2), studio-bonus-cut class (gives the parked Slam Dunk URL its home), external-decision RPC that never toggles can_decide (Codex backlog item).

## 8. Skill wiring (coordinated step, content pen, after her go)

Per the aligned spec §11: production-workflow gets the grammar + emission-rides-the-work + per-destination split + no-inference + change-note + post-slot proof ask + plan deadline; ops-assist renders my_tasks. This spec adds: both skills point gate EMISSION at `portal-write gate` once phase 1 is live (the per-lane cutover switch). Both skill trees stay in sync.

## 9. Verification bar

Per increment: fresh replay 0001..0022 + poisoned-defaults replay + cumulative assertions (incl. zero-authenticated-grants and not-an-index-source); test-rls additions (client denied everything on the new tables/RPCs incl. via the assistant search path; gate write + reopen + na-reason enforcement; ops task lifecycle; my_tasks view excludes archived + client roles); vitest for the stage derivation (every §4.1 branch incl. the H&C shape and destination divergence); build; no eval rerun needed (assistant untouched) BUT one assistant regression fixture: a question about production gates must ground to nothing (index has no such source). Frozen hashes to Codex.

## 10. Acceptance (mirrors the aligned spec §14)

- One fact, one write location; the portal's gate data and a piece's pack block never disagree after an emission (the command wrote both).
- `my_tasks` agrees with the file-grammar render on the overlap dataset.
- No Maria gate closed without an explicit logged decision on that object + version; H&C displays `direction_approved` until her real decision on the version she saw.
- Client roles (and the assistant) can read none of it, asserted.
- Writes idempotent; backfill fully receipted.

## 11. Calls needing Anastasia's ok (each with the default I will build if she just says "go")

1. Production gates are per-piece (dest column reserved, NULL in v1).
2. Gate transitions skip activity_log (dedicated agency-only events table) so Maria's feed can never leak production internals.
3. Ops tasks: never deleted; views filter (answers §13.2).
4. Waiting-on-Maria: nudge-draft auto-OFFERED at 2 business days, never auto-sent (answers §13.3).
5. Backfill: non-studio pieces get source_in_hand = na (not done).
6. Production-gate reopening on a change request is an explicit emission, never inferred.
7. H&C remediation by next version (no retroactive edits to the recorded decision).
8. `--pack` mirror optional-but-nagging on the gate command.

---

## 12. Self-doubt review record (adversarial pass on this spec, findings + resolutions)

Method: attacked the spec against (a) the aligned spec line by line, (b) the handoff's 9-gate table, (c) the live schema as built through 0021, (d) failure modes (leaks, drift, races, dead ends). Findings that CHANGED the spec are marked FIXED (the text above already includes the fix); the rest are recorded risks.

1. **Client-visibility contradiction (FIXED).** My first wiring plan put an honest-stage strip on the piece page and gated the client "Waiting on approval" bucket on approval_sent. The aligned spec §10 explicitly forbids client visibility of production gates. Resolution: all stage/gate rendering moved to the agency surface; the client end is untouched (its earlier confusions were already fixed by the wording deploys, and at launch "released = asked" makes its bucket honest by construction). The earlier `2026-07-21-portal-gate-wiring.md` phase-1 sketch is SUPERSEDED by this spec on those two points.
2. **Activity-feed leak (FIXED).** Reusing activity_log for gate events would have put "design not built" in Maria's overview feed. Dedicated agency-only events table instead; asserted zero authenticated grants.
3. **Assistant leak (FIXED).** The 0018-0021 index triggers grow by explicit source registration, so gates/ops won't be indexed by accident, but nothing ASSERTED it. Added: a not-an-index-source assertion + an eval-side regression fixture (production-gate questions must ground to nothing).
4. **Ops-lane dead end (FIXED).** The admin surface (Vercel) cannot read `~/Kanset/ops-tasks.md`, so a file-based ops lane can never render in the portal. Resolution stated honestly in §3: ops truth moves to Supabase only when her session agents adopt `portal-write ops-task`; until then portal my_tasks shows gates + waiting cuts, and the local render covers ops. Per-lane cutover, no pretense.
5. **Interim dual-write risk (FIXED).** Agents closing gates in pack blocks while the portal holds gate rows = the drift machine reborn. Resolution: the emission command regenerates the block (or prints it for pasting), making the file the OUTPUT of the write, per the aligned spec's own §5 cutover plan.
6. **H&C acceptance-check violation (FIXED).** §14 says no Maria gate closes without an explicit decision on that object; H&C's recorded row is plan-level by her own account. Resolution: stage derivation treats decision-without-production-gates as `direction_approved` (so the display stops overstating), the recorded decision is preserved as history, and the REAL Wednesday approval closes it properly. No retroactive surgery.
7. **Podcast-lane hole (RESOLVED by derivation).** Episodes have no gate set yet; if the stage function required production gates, episodes would show forever-in-production. The §4.1 derivation only consults gate rows that exist, so episodes derive from decision/schedule/publication states alone until their gate set lands.
8. **Reopen ambiguity (FIXED as call 6).** "Edits-requested reopens the relevant gates" does not define "relevant." Guessing in SQL would close the wrong gates or reopen too many. Made explicit-emission-only, named in the change note.
9. **Grammar mismatch risk (RECORDED).** The pack grammar allows `[~]` with reason and dest-suffixed lines for gates 7-9; the portal stores 7-9 in their existing structures, not in content_production_gates. The regenerated block therefore merges TWO sources (production gates from 0022; schedule/publication from existing tables). The generator must render the same grammar for both, and a hand-edited 7-9 line in a pack is NOT an emission (those gates close only through their real paths: her report, the confirm-in). The skills must say so explicitly (added to §8's wiring content).
10. **Backfill honesty (FIXED as call 5).** Marking source_in_hand "done" on The-Dot-designed pieces would be false history; na-with-reason keeps the gate meaningful.
11. **Owner enum vs reality (RECORDED risk).** owner_label is a label, not an auth identity; a wrong label misroutes a my_tasks row but has no security effect (everything is agency-only). Accepted for v1.
12. **Ideas remap loss (RECORDED, phase 2).** The current enum's `considering` maps to `triaged`, but the standard's `slotted` requires a plan-week linkage that phase 2's plan_cycles provides; remapping before plan_cycles exists would leave `slotted` meaning "planned" without a week. Sequencing consequence: ideas remap lands WITH or AFTER plan_cycles, not before.
13. **What I could not verify from here (RECORDED).** The exact current publish-pack block contents for decoder/ep2 (backfill source) and whether ep3's studio cut has arrived; the backfill step reads them at run time and the dry-run surfaces both for eyeballing before apply.

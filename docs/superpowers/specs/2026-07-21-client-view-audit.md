# Client-view audit: what Maria actually experiences, against the standardized content flow

**Date:** 2026-07-21 (session of 2026-07-20 evening ET) · **Author:** Claude (audit run, read-only) · **Method:** code read of `src/app/client/[slug]/` + `src/lib/portal/`, then a live walk of every client route on production as the capability-matched preview seat ("Maria (preview)", toodokie@gmail.com, comment + requests + schedule, no decide). Nothing was approved, commented, scheduled, or changed; browsing only (curl does not execute the MarkSeen client component, so not even seen-state was written).

**Audited against, in order:** `~/Kanset/handoff-portal-agent-content-flow-2026-07-20.md` (the 9-gate standardized flow) · `~/Kanset/docs/superpowers/specs/2026-07-20-my-tasks-design.md` v2 (§10 no client visibility of production gates; §12 rulings incl. the change-note rule) · `docs/superpowers/specs/2026-07-21-portal-gate-system-design.md` (agency gate spec; its §12.1 records why the client end was left untouched).

---

## 1. Stage-by-stage walkthrough from Maria's chair

### Stage 0, ideas (`/client/kanset/ideas`, `ideas/page.tsx` + `IdeasBoard.tsx`)

What she sees: an "Idea board" with a warm invitation ("Drop a post idea, a question, a story worth telling, anything you want us to shape into content. We pick it up from here."), an Add-an-idea form (title + optional details), and 6 cards. All 6 are attributed "Maria Guerts" with status chips `new` or `planned`, dated 2026-07-20.

- The invitation matches what the Notion board did; the affordance is there and the form works for her seat (canSubmitRequests gates it, with a clear read-only fallback line otherwise).
- Status vocabulary shown is the CURRENT enum (`new`, `planned`), not the ideas-standard vocabulary (`logged → triaged → slotted | parked | declined → promoted`). "new"/"planned" are comprehensible client words; the remap is correctly deferred to gate-spec phase 2 (and §12.12 correctly sequences it with plan_cycles).
- Provenance nuance: every card is dated 2026-07-20 (the seed date), including ideas she actually raised by email on Jul 6 and Jul 13-14. She is named as author (true in substance) but the dates are the migration date, not when she had the idea. Mild, worth knowing before she asks.
- A `planned` idea does not link to its piece (promotion links are phase 2). Fine at launch.

### Stage 1, weekly plan (`/client/kanset/plan`, `plan/page.tsx`; also Calendar)

Plan approval is email-only until phase 2's `plan_cycles`; the portal has NO plan object. What the Plan surface shows instead: "What we are planning next. Ideas and drafts in the pipeline, before they come to you for approval." filtered to `status in (idea, draft)` only.

Live result tonight: the surface shows exactly two rows, "Week of Jul 20": Thu ep 3 and Fri where-to-start, both chipped `draft`. Monday's decoder, Tuesday's ep 2, and Wednesday's H&C are absent (their status is `approved`), so the page reads as a two-piece "plan" for a five-piece approved week. A client looking for "next week's plan" here sees a fragment that quietly omits most of the week. The Calendar (which shows everything, with the In-planning / Approved-or-scheduled / Published legend) is the truthful surface; the Plan page's framing invites the wrong expectation.

Bigger problem: the two rows it DOES show are the two pieces currently sitting in her Waiting-on-approval bucket (see Stage 3). The Plan page tells her these come to her "for approval once ready" while the Overview says they are waiting on her now. Same object, two doors, opposite messages. Root cause: Plan/Calendar route on `status` (`isProduced()` in `src/lib/portal/schedule.ts`), the Overview routes on `client_state` (`needs_review`), and a released-for-review piece is `status='draft'` + `client_state='needs_review'` at the same time.

### Stage 2, mid-production review loop

The flow says a copy draft or frames CAN go to Maria before final approval, mapping to Approve / Request-a-change. In the portal as built, the only mechanism is: sync + release the not-yet-final version. That lands the piece in `needs_review`, i.e. it looks EXACTLY like a final approval ask: same Waiting-on-approval bucket, same DecideForm (Approve / Request a change), same chips. There is no ask-scope anywhere ("this is a direction check on frames" vs "this is the final ask"), and no change-note field. The framing that distinguishes the two today lives in Anastasia's email, and only there.

- Mechanically coherent with sealed versions: her Request-a-change reopens via the version machinery; her Approve records against that version; the later final version re-arms her approval. No rule is violated.
- Practically: if a mid-production version were released without an accompanying email, Maria would be invited to "Approve" frames-in-progress with nothing telling her that a final version is still coming, and her click would record as copy-approved on that version (the exact approval-shape that produced the H&C confusion). So the mid-production loop is portal-CAPABLE but email-DEPENDENT for its meaning. The supporting pieces that do exist: the "Open the design in Canva" button (renders for any https canva_url, `piece/[contentId]/page.tsx`) and the comment thread (agency comments render visibly distinct, yellow-edged and uppercase-labelled, `CommentThread.tsx`), which can carry the framing inside the portal.

### Stage 3, approval (`/client/kanset/piece/[contentId]`, Overview buckets)

- **The Waiting-on-approval bucket is honest by construction.** Live: "2 waiting for you" = ep 3 + where-to-start, exactly the two pending approvals in the record. Released = asked; nothing else inflates it. The bucket note ("Fact-checked (Confirmed) is our gate; Approve is yours.") is Anastasia's own ruling rendered.
- **The decision affordance is capability-correct.** The preview seat (no decide) sees "This piece is waiting for the primary decision-maker." instead of the DecideForm; the decider sees Approve / Request a change with a note field ("Note (required to request a change)", placeholder "What would you like changed?"). Good wording, good gating.
- **The change-note has NOWHERE to render.** DecideForm/release carries no note to the client; gate-spec §5 defers `change_note` to phase 2. Today the note rides the email ask. The moment approvals go portal-only at launch, a materially-changed piece would reach Maria with no explanation, in direct breach of her §12 ruling. Interim mechanism exists and should be codified: an agency comment on the piece posted at release time (renders distinctly, on the same page as the Approve button).
- **H&C, the direction-approved shape, live:** her end shows the piece in the "Approved" Overview bucket and the piece page says, verbatim, "This piece is approved." with the v1 chip and full copy incl. the no-dedicated-quota slide. Agency-side the stage will derive `direction_approved`; her side claims more than she decided. Worse, the Fact-check evidence panel attributes the no-quota claim to "Maria Guerts, RCIC, professional guidance · agency-verified 2026-07-17" while the record (CLAUDE.md) says that exact claim still needs her sign-off. Her name is on an attestation she has not yet given, on a page she can open tonight. The planned remediation (Wednesday re-release as a new version with her real decision) fixes the state; the attribution should not precede her word.
- Version chips ("v1", "based on v2" in request history) are visible. Mild internal flavour, but versions are legitimately part of the client contract (requests bind to versions), so acceptable.

### Stages 4-6, schedule / publish / verify (SchedulePanel, PublicationPanel)

- **Schedule:** "Editorial plan: {date}. Provider commitments are shown separately." then per-destination rows "facebook · Not confirmed · pending · not yet verified". The separation of editorial intent from provider commitment is exactly the signed model, and nothing ever infers a schedule. But the wording is agency-speak: "Provider commitments", "No external publishing destination is assigned" (shown on ep 3, a piece whose header chips say instagram, facebook, youtube, because schedule targets are only created later). From her chair the page contradicts itself: the chips promise three platforms, the schedule section says no destination is assigned.
- **Per-destination divergence renders correctly**: FB and IG are separate rows everywhere; one confirmation never covers both, matching gate 7-9 semantics.
- **Posted-but-unverified vs link-confirmed:** the labels come from the DB views (0008/0009) and are genuinely good client language: "manually verified by The Dot", "verified pre-portal record", "posted pre-portal, not independently verified", "not yet verified". The `legacy_unverified` provenance never leaks as a token; Maria reads "posted pre-portal, not independently verified". Comprehensible and honest.
- **Live links:** "Open the live post" renders only when a live_url exists and status is live. Verified live on podcast ep 1 (youtu.be/64TvgNPsJ3o). The IG/FB legacy imports have no stored URL, so her posted Instagram/Facebook pieces have NO click-through to the live post. Expected given the import's honesty, but from her chair most of her own posted history is unlinkable.
- **The raw-state leak:** the piece page closes with "This piece is {state}." Unhandled states render as enum tokens. Live tonight: "This piece is partially_live." on the OINP carousel AND on podcast ep 1. Compounding it, `portal_publication_state` (0009) only returns 'live' for manual+verified targets, so every imported historical piece is `partially_live` FOREVER, even the YouTube-verified ones. Two consequences: (a) jargon with an underscore rendered into client prose on every posted piece; (b) the Overview buckets (`needs_review / with_dot / approved / scheduled / live`) have no bucket for `partially_live`, `partially_scheduled`, `publish_failed`, `reschedule_pending`, or `cancel_pending`, so the ENTIRE 11-piece posted history is invisible on the Overview: no Published panel renders at all. Her month of shipped work only surfaces via Calendar and the activity feed.
- **Activity feed noise:** her first-visit feed opens with eleven "New · The Dot · Design link updated: ..." rows dated 2026-07-21 (sync housekeeping), followed by report rows and the honest "Live: ... · pre-portal record" rows. Because `getActivity` caps at 30, the housekeeping flood pushed her own "Approved externally" decision records (written by `record_external_decision`, 0011, with honest "decided by email; recorded by ..." summaries) off the first page entirely. First impression: bookkeeping, not her story.
- **Calendar note** ("This portal is the workflow record. The shared Google Calendar is an agency coordination surface, not proof of scheduling or publication.") is doctrinally perfect and tonally stiff; fine to keep, worth a warmth pass someday.

### Stage 7, reports (`/client/kanset/reports`)

Genuinely good from her chair. "Latest by platform" cards with per-card data windows (correctly divergent: IG Jul 3-17, FB Jul 3-15, YT Jun 19-Jul 16), plain tiles, and "The read" summaries in a human voice. The null-pending rule renders as prose a client understands: "Account-level comments, shares, saves ... were not pulled this period; they join the next review." Nothing pretends to be a live dashboard, and the intro says so. v0 demo rows are hard-filtered (`schema_version >= 1`). Two nits: the YouTube card pairs "Followers 10" with "Subscribers gained 15" (two different measures side by side; the read explains it, the tiles alone confuse), and "Avg view duration seconds" is a humanized key, not a label.

### Cross-cutting

- **Greeting:** "Good day, Maria." (first name split works on the preview seat's "Maria (preview)"). Warm, correct.
- **Tone:** overwhelmingly good ("Ask for what you need.", "Drop a post idea...", "You're all caught up."). Zero em dashes anywhere in any fetched page (scanned all 18). Exceptions listed under findings: "Provider commitments", "canonical version" (Requests intro: "Requests stay visible while The Dot prepares and reviews the canonical version."), raw `partially_live`, raw `confirmed` chip.
- **Fact-check chip inconsistency:** the Overview maps `confirmed` to "fact-checked" per Anastasia's 2026-07-20 wording ruling (`page.tsx` comment cites it). The piece page AND the plan subpage still render the raw value: chips read "confirmed" there. The exact ambiguity she flagged ("Confirmed by whom, of what?") survives on the two pages where she actually reads copy.
- **Comments two-way clarity:** agency replies are visually distinct (yellow left edge, uppercase name, indent) vs client comments plain with inline name. Clear. Empty state "No comments yet." fine.
- **Alerts / outbox:** v1 outbox email is agency-only (0015 trigger; `notify.ts` states it). Maria receives NO portal emails at launch, consistent with nothing-outbound. Consequence stated honestly: at launch, "release = the ask" is only true once she is IN the portal; the ask still needs Anastasia's manual email nudge until client notifications are deliberately turned on.
- **Request-a-change wording:** button "Request a change", note required, placeholder "What would you like changed?". The suggest-edit path is separate and clearly labelled ("Suggest edit" per copy block, "Suggested replacement copy"). Removal asks for a reason and states "it does not delete the piece immediately". All good. One cosmetic: destination checkbox "Youtube" (should be YouTube).
- **Capability gating:** every write affordance the preview seat holds appeared (comment box, suggest edit, schedule-change form, add idea, removal request); the one it lacks (decide) fell back to a correct, polite sentence. Nothing dead-ended.
- **Mobile shell:** the bottom bar renders ALL NINE entries (Overview, Calendar, Plan, Ideas, Requests, Strategy, Reports, Library, Billing) in a horizontally scrollable strip (`portal-shell.module.css`, min-width 68px per item, `overflow-x: auto`). Nine items need roughly 612px; a phone shows about five and a half, with no fade, arrow, or "More" affordance hinting that Billing, Library, and Reports exist off-screen to the right. On the device Maria will most likely use, four sections are effectively hidden.
- **Assistant:** invisible, correctly. The nav entry requires capability + the fail-closed gate RPC (`layout.tsx`), and the route itself 404s without them (`assistant/page.tsx`). Confirmed live: no nav entry, empty page.
- **Billing:** invoice #0137, Jul 9, period Jun 27 to Jul 26, $800.00, "Unpaid" badge, "View invoice" linking the frozen Drive doc (13YR1dHe6Yhy3mv7r1AZwAkfr1ykcI6ev). Correct and honest, with one pre-launch check: confirm with Anastasia whether the Interac payment has arrived, because "Unpaid" in front of a client who has paid is worse than no badge.
- **Library:** 8 links, warm descriptions, all open in new tabs. Fine. **Strategy:** 5 recommendations, on-voice, client-safe. Fine.
- **Communication panel:** "No emails or call recaps logged yet." after a month of dense email history reads odd on day one; either backfill two or three `meeting_email_note_added` recaps or hide the panel until first entry.

---

## 2. Findings, ranked

### BLOCKER before launch

**B1. The two-door contradiction on released-for-review pieces.** A piece in `needs_review` with `status='draft'` (ep 3, where-to-start tonight, and EVERY piece during its approval window every week) is described by Plan/Calendar as "still in planning. We will send it to you for approval once it is ready" (`plan/[contentId]/page.tsx`) while the Overview says it is waiting on her. The weekly approval ask, the single most important client moment in the flow, is contradicted by two of the three doors that reach it. Fix: route on `client_state`, not `status`: in `schedule.ts`, treat `needs_review`/`with_dot` as produced (send to the piece page), and exclude `needs_review` from the Plan surface's "before they come to you" filter (or give those rows a "Waiting for your review" chip + piece-page link). Coverage: NOT in the gate spec (its §12.1 explicitly left the client end untouched); this is a new client-side item.

**B2. The change-note rule has no portal render, and approvals go portal-only at launch.** Her §12 ruling: materially-changed copy she has seen MUST carry an explaining note with the ask. Gate spec §5 defers `change_note` to phase 2; DecideForm carries nothing. Until phase 2 lands, portal-only approval of changed copy structurally breaches the ruling. Fix (interim, zero build): standing rule that release of a materially-changed version is accompanied by an agency COMMENT on the piece stating what changed and why (renders distinctly, same page as Approve); wire that into `kanset-production-workflow`'s release step. Coverage: gate spec phase 2 (`change_note` on release); the interim comment rule is a new process item.

**B3. H&C shows "approved" plus an attestation Maria has not given.** Overview bucket "Approved" + piece line "This piece is approved." for a direction-level decision, and the evidence panel attributes the no-dedicated-quota claim to "Maria Guerts, RCIC, professional guidance" while the record says that claim still needs her sign-off. Displaying her name as source of an unconfirmed claim is a provenance error visible to her tonight. Fix: before launch (or before Wednesday's re-release, whichever first) downgrade that ledger entry to pending/unattributed until her word lands, and prefer wording "Approved (direction)" or hold H&C out of the Approved bucket until the real Wednesday decision closes it. Coverage: gate spec §6/§12.6 handles the agency-side stage honestly but consciously left her side overstating; the ledger-attribution point is new.

**B4. Raw state tokens rendered into client prose.** "This piece is partially_live." live on two pages tonight; `schedule_failed`, `reschedule_pending`, `cancel_pending`, `publish_failed` would render the same way (`piece/[contentId]/page.tsx` line 98 fallback). One-line-per-state label map fixes it. Blocker because it is jargon in the exact sentence that summarizes the piece for her, on every posted piece in the launch dataset. New client-side item.

### CONFUSING, fix soon

**C1. The posted history is invisible on the Overview.** No bucket accepts `partially_live` (or `partially_scheduled`, `publish_failed`, `reschedule_pending`, `cancel_pending`), and imported targets can NEVER reach `live` (0009 requires manual+verified), so the Published panel never renders and her month of shipped work is absent from her landing page. Fix: widen the Published bucket to `live | partially_live` (label honestly, e.g. "Published" with per-piece verification labels doing the nuance), or add a catch-all "In motion" bucket. New client-side item; related to gate-spec §4.1's stage derivation but on the client bucket map.

**C2. Nine mobile nav tabs with invisible overflow.** Four sections effectively undiscoverable on a phone. Fix: scroll affordance (fade + partial-item peek) or collapse to 5 (Overview, Calendar, Ideas, Reports, More). New client-side item.

**C3. Fact-check chip says "fact-checked" on the Overview but raw "confirmed" on the piece and plan subpages.** Finish Anastasia's own wording ruling everywhere the chip renders (`piece/[contentId]/page.tsx` line 57, `plan/[contentId]/page.tsx` line 50). New client-side item, trivial.

**C4. Activity-feed housekeeping flood.** Eleven "Design link updated" rows (all "New") open her feed and push her own recorded approvals off the 30-row window. Fix: exclude or collapse low-signal event types from the client feed render (the event type list is known), or raise signal filtering in `getActivity`. Her feed should lead with decisions, releases, live confirmations, reports. New client-side item.

**C5. Schedule-section wording and the empty-destination contradiction.** "Provider commitments are shown separately", "No external publishing destination is assigned" under chips that say instagram/facebook/youtube, and near-duplicate "pending · not yet verified" rows in both Schedule and Publication sections pre-posting. Fix: client wording pass ("Posting times The Dot has confirmed in the platforms"; hide the Publication section until at least one destination is posted; suppress "no destination assigned" when the piece is pre-approval). New client-side item.

**C6. The Plan surface reads as "the plan" but shows only idea/draft rows.** During a normal week it shows a fragment (2 of 5 pieces tonight) with no marker that approved pieces have moved on. Fix now with a one-line note on the Plan page ("Approved pieces move to the Calendar"), properly with phase 2 `plan_cycles` (which is also the precondition for portal-only plan approval). Covered: gate spec phase 2.

**C7. Requests intro says "canonical version".** Internal vocabulary. Say "the master copy" or "the official version". New, trivial.

**C8. IG/FB posted pieces have no live link.** Expected from the honest import, but worth a standing intent: as IG/FB permalinks get confirmed through the live confirm path over time, her history becomes clickable. Covered by existing confirm tooling; no build.

### FINE as is

- Waiting-on-approval honesty (release = ask; verified 2 = 2).
- Decision affordances + no-decide fallback wording; Request-a-change note required; suggest-edit and removal flows and their sealed-version framing ("Nothing here silently rewrites released copy").
- Publication verification labels ("posted pre-portal, not independently verified" etc.); per-destination rows; publication lock invisible but effective.
- Reports page: null-pending prose, per-card data windows, demo-row ban enforced in code.
- Ideas board invitation + form; statuses readable; Notion-board parity achieved.
- Comments: two-way visual distinction; select-to-quote works on copy blocks.
- Assistant invisibility (capability + fail-closed switch + 404).
- Billing table + frozen invoice doc link. (Verify paid state before launch.)
- Library, Strategy: tone and content.
- Greeting, no em dashes anywhere, logout, noindex, robots.

---

## 3. Flow moments that remain EMAIL-ONLY at launch

| Moment | Email-only? | Acceptable at launch? |
|---|---|---|
| Stage 1 plan approval (plan-sent → plan-approved) | Yes, by design until phase 2 `plan_cycles` | Yes, PROVIDED the Plan surface stops contradicting the approval bucket (B1) and gets the C6 note |
| Stage 2 mid-production framing ("direction check, not final ask") | Yes in practice; the portal can carry the artifact (release + Canva link + comment) but not the ask-scope | Yes, if mid-production releases always carry an agency comment stating scope; otherwise hold mid-production review on email |
| Stage 3 change-note on materially-changed copy | Yes (no render location) | NO for portal-only approvals; needs the B2 interim comment rule or phase 2 `change_note` first |
| The approval NUDGE (telling Maria something waits) | Yes; v1 outbox is agency-only, she gets no portal emails | Yes; consistent with nothing-outbound. Anastasia's launch email should set the habit ("your portal shows what waits on you") |
| Stage 7 report "sent" step | Yes (the portal renders; the send is email) | Yes |
| Invoice payment status / receipts | Yes (manual status flips) | Yes; confirm #0137's true status before she sees "Unpaid" |
| Podcast-episode lane approvals | Yes (own gate set pre-ep 2) | Yes |

## 4. Contradiction check against the two hard rules

**No-client-visibility rule (my-tasks §10):** NO violation found. No production gates, ops tasks, stage labels, or my_tasks render anywhere in `src/app/client/`; gate transitions skip activity_log by design; the assistant surface 404s and its index excludes gate sources. The raw `partially_live` / `confirmed` tokens (B4/C3) are client-state and fact-check vocabulary leaking unpolished, not production-gate leakage.

**Sealed-version rule:** NO violation found. All client edit paths are requests ("Nothing here silently rewrites released copy"); publication lock stands; versions bind requests and decisions. The closest thing to a tension is B3: not a rewrite, but a client display asserting more approval than the version's decision record carries, plus a ledger attribution ahead of the attestor's word. Both are display/data corrections, not lock breaches.

## 5. Suggested sequencing

1. Pre-launch, small client-side fixes (one short slice): B1 routing + plan-page filter, B4 state-label map, C3 chip wording, C7 wording, C2 nav overflow affordance, C5 wording pass, C1 bucket widening, C4 feed filter.
2. Pre-launch, data/process: B3 (H&C ledger attribution + bucket handling until Wednesday's real decision), B2 interim comment rule wired into the workflow skill, billing paid-status check, optional Communication backfill.
3. Phase 2 (already in the gate spec): `change_note` on release, `plan_cycles`, ideas-status remap. These retire B2's interim rule and C6.

# Admin portal (/admin/portal) redesign spec

**Date:** 2026-07-21 · **Author:** Claude (ui-ux-pro-max design pass) · **Surface:** agency-only ops cockpit (`/admin/portal`), password-gated, Anastasia only. NOT the client portal.

**Problem (her words):** "hot mess of the worst UI and UX." Reality: `GatesAdmin.tsx` + the publication-coordination section render bare `<h2>/<ul>/<table>/<form>` with hardcoded hex (#e5e5e5, #ffd700) and inline styles, zero brand tokens, and the publication section shows a FULLY-EXPANDED confirm-in form for every piece and destination at once (the classic "overwhelm upfront" form-wall).

## Design system (this surface)

Pattern: data-dense operations dashboard. Drive it with **@thedot/design-system `--dot-*` tokens** (cream ground, charcoal text, teal, rust), NOT a new palette. Plain CSS module `portal-admin.module.css`, no Tailwind, no inline hex. Primarily light (internal desktop tool); ensure 4.5:1 text contrast.

- **Layout:** centered container max-width ~1120px, cream page ground, content in **white cards** (hairline `--dot-hairline` border, small radius ~8px, generous 20-24px internal padding, 24-32px between sections). Consistent 4/8px spacing rhythm.
- **Type:** design-system Heading/Text/Eyebrow. Page title = display; section headers = h2 + a one-line grey subhead; field labels = uppercase 11-12px letter-spaced grey; values = 13-15px; ALL dates/numbers `font-variant-numeric: tabular-nums`.
- **Status pills (ONE shared component, semantic, SVG not emoji):** gate states done (solid charcoal + check), open (outline), na (grey); schedule/publication pending (grey), scheduled (teal outline), live/verified (teal solid + check), failed (rust); verification verified vs "not yet verified" (muted). Never color-only, always a word or icon with it.
- **Interaction:** row hover highlight (150-200ms), cursor pointer on clickables, visible focus rings, `prefers-reduced-motion` respected.

## Information architecture (reorder by how she actually works)

1. **My Tasks (the hero, top card).** Her daily driver. Groups in priority order: Actions (what SHE does next, each showing the specific next gate as a pill), Waiting on Maria (days + nudge chip), Waiting on studio, then Ops by bucket (overdue / today / this week / upcoming / watch). Each row scannable: optional client tag, title, the actionable bit as a pill, secondary meta muted. Empty state: a calm "Nothing open."
2. **Pieces (table, styled).** Keep the table; make it breathe: hover row highlight, Client / Piece / Stage (colored pill) / a clean 9-gate strip (dots or mini-pills) with a small **legend** above it (currently the gate strip is unreadable dots with only a title tooltip). Tabular dates.
3. **Publication coordination (the biggest fix, progressive disclosure).** STOP rendering every form expanded. Per piece, a compact card; under it, each destination is a ROW showing: destination name, current status pill (scheduled/live/pending), verification pill, and the live_url as a link if present. The confirm-in FORM is COLLAPSED behind a per-destination "Confirm / correct" button that expands the form inline only when she acts. This turns a wall of forms into a scannable status board she drills into. Keep the existing form fields (provider URL, actual datetime, Toronto offset, provider object id, evidence) but grouped in a tidy card with one primary "Confirm" button, helper text, and loading/disabled states on submit.
4. **Supporting, secondary, collapsed by default or compact below:** calendar health, invoices, change requests. Compact cards; not competing with the primary work.

## Constraints

- Behavior-preserving: this is a VISUAL + IA refactor. Do not change what any form submits, any server action, any data fetch, or any gate/publication logic. GatesAdmin stays read-only; emissions still go through portal-write.
- Agency-only stays agency-only: nothing here ever imports into the client shell; no client-visible change.
- Extract inline styles to `portal-admin.module.css`; remove hardcoded hex in favor of `--dot-*` tokens.
- Accessibility: labeled inputs (keep), focus states, contrast, keyboard order, reduced-motion.
- No em dashes. Verify `next build` + existing vitest green (logic untouched, so tests should not move).

## Deliverable

A restyled `/admin/portal`: `GatesAdmin.tsx` (My Tasks + Pieces) and the publication-coordination section of `page.tsx` rebuilt on the card/pill system, with `portal-admin.module.css`. Same data, same actions, dramatically better hierarchy and scannability. Display-plane (agency-only), so it deploys on Anastasia's review, with a post-hoc Codex pass.

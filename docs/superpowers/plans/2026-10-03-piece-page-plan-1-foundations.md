# Piece Page Redesign, Plan 1 of 5: Foundations and Quick Fixes Implementation Plan

**Approved by Anastasia 2026-10-03** ("aok"). Not built yet.

> **Amended 2026-10-03 (release path aligned with plans 2 and 3).** Task 12 already deployed by pushing `feat/portal-audit-fixes-2026-09-15`, but reviewed after deploy. Step 5 now adds a `code-review` skill pass on the frozen hash before Anastasia's go-ahead, Step 6 checks the pushed HEAD is that hash, and Step 7 first verifies the Vercel deployment for that commit. No migration, so there is no apply step.

> **Amended 2026-10-03 (media guard).** No task in this plan changes. The release guard Anastasia approved (refuse releasing a version with no review asset, portal preview or design link unless an `Approved by Anastasia:` override is recorded) lives in plan 2, Tasks 1a and 9a, not here: the database check needs plan 2's `content_review_previews`, and every release path ends in `mark_content_ready` or `record_content_courtesy_release`, which plan 2's 0092 rewrites. Plan 2's Task 9a also edits `scripts/update-portal.ts` after this plan's Task 10, on lines Task 10 does not touch, and extends Task 10's `EXIT CODES` comment with `6 = release media missing`. Do not reuse exit code 6 for anything else.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the low-risk groundwork for the piece page redesign: a private share title on every piece page, the missing design-system tokens and the three new brand primitives later plans need, and a sync-time guard that stops a reel or carousel reaching the portal without its on-screen text.

**Architecture:** Three independent slices. (1) Design system: new `--dot-*` tokens in `packages/design-system/src/tokens/tokens.css`, two new components (`TickDot`, `ReviewDots`) built like `Dot`, and a glow state on the yellow `Button`; every hard-coded red in the portal moves onto `--dot-danger`. (2) Metadata: a small `piece-metadata.ts` module resolves the piece title through the viewer's own session and RLS-bound query, so a viewer who cannot see the piece gets only the generic portal title; the `/client` layout stops inheriting the marketing site's Open Graph card. (3) Tooling: a pure `on-screen-text-rule.ts` decides whether a canonical file needs an on-screen text block, and `scripts/update-portal.ts` refuses a sync or re-share that lacks one, before any write, unless the canonical frontmatter carries `on_screen_text: captions_only`.

**Tech Stack:** Next.js 15.5 App Router (`generateMetadata`), React 19, CSS Modules, Vitest 2 (jsdom, Testing Library), Storybook 8, tsup, gray-matter, tsx scripts, pnpm workspaces.

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md` sections 4.3 (tab ticks), 9.3 (production rule), 9.4 (share title, tokens, reds), 10a (dots, glow, highlighter). Approved look: `.superpowers/brainstorm/mockups-2026-10-03/portal-v3.css` (lines 466-516 are the v2 brand pass the values below are copied from).

**Out of scope for Plan 1 (later plans):** the page layout itself, the copy switcher and tick gating logic, the editor, server-side drafts, media previews, Agency Ops panels, the feedback card. Plan 1 only adds the primitives and fixes they will use.

---

## Engineering rules for this plan (read before Task 1)

From `~/Kanset/PORTAL-OPERATIONS-PLAYBOOK.md` section 12 and `docs/PORTAL-AGENT-MANUAL.md` sections 13, 15 and 17:

1. **One editor owns the slice.** Do not run this plan while another agent is editing `packages/design-system`, `src/app/client/[slug]/piece/`, or `scripts/update-portal.ts`.
2. **Branch:** work on `feat/portal-audit-fixes-2026-09-15` in `~/thedot-site` (production deploys from this branch by push). Check `git status --short` first; the tree carries unrelated untracked `.pnpm-store/` and `.tmp-portal-session/` and a modified `.gitignore`. **Never `git add -A` or `git add .`**; add only the files each task names.
3. **No migrations in this plan.** Nothing here reads or writes a new table, so the "migrations before UI" rule is satisfied trivially. The new `on_screen_text` frontmatter key is read only by the CLI and never sent to the database (`toRow` in `scripts/update-portal.ts` picks named fields).
4. **Commits are local.** Each task ends with a local commit so the final state is a frozen hash for review. **Do not push** until Task 12's gate: pushing this branch deploys production.
5. **Host discipline (`~/Kanset/CLAUDE.md`):** one worktree at most, no dev server left running, one full `next build` only in Task 12.
6. **Skill edits need Anastasia's OK** (her discuss-before-changing rule). Task 11 lists exact text and is marked APPLY AFTER APPROVAL.

**Test commands (verified 2026-10-03):**
- Single file: `pnpm exec vitest run <path>` from `~/thedot-site` (the root `vitest.config.ts` runs package tests too; `Button.css.test.ts` resolves paths from the repo root, so always run from the root).
- Design-system suite: `pnpm exec vitest run packages/design-system` (currently 5 files, 11 tests, all passing).
- Full suite: `pnpm test`.
- Design-system build and types: `pnpm --filter @thedot/design-system build` and `pnpm --filter @thedot/design-system typecheck`.
- App types: `pnpm exec tsc --noEmit 2>&1 | grep -E '<your files>'` (the repo has pre-existing errors in marketing routes; only your files must be clean).

---

## File map

**Design system (`packages/design-system/src/`)**
- Modify `tokens/tokens.css`: add `--dot-off-white`, `--dot-danger`, `--dot-grad-highlight`, `--dot-grad-highlight-soft`, `--dot-grad-glow`.
- Modify `tokens/tokens.ts`: add `offWhite`, `danger` to `colors`.
- Create `tokens/tokens.css.test.ts`: asserts the new custom properties and values.
- Modify `components/Button/Button.module.css`: yellow glow on hover and focus-visible, yellow disabled state.
- Modify `components/Button/Button.css.test.ts`: glow and disabled assertions.
- Modify `components/Button/Button.stories.tsx`: a disabled yellow story.
- Modify `components/Input/Input.module.css`, `components/Textarea/Textarea.module.css`: `.invalid` uses `--dot-danger`.
- Create `components/TickDot/{TickDot.tsx,TickDot.module.css,TickDot.test.tsx,TickDot.css.test.ts,TickDot.stories.tsx,index.ts}`.
- Create `components/ReviewDots/{ReviewDots.tsx,ReviewDots.module.css,ReviewDots.test.tsx,ReviewDots.css.test.ts,ReviewDots.stories.tsx,index.ts}`.
- Modify `index.ts`: export the two components.

**App (`src/`)**
- Create `src/app/danger-token.test.ts`: regression scan, no hard-coded portal reds.
- Modify `src/app/admin/portal/admin-shell.module.css:70`: `--admin-danger: var(--dot-danger)`.
- Modify `src/app/client/[slug]/piece/[contentId]/piece-review.module.css:97`, `src/app/client/[slug]/ideas/ideas.module.css:39`: `color: var(--dot-danger)`.
- Modify inline styles in `src/app/client/[slug]/piece/[contentId]/DecideForm.tsx:22`, `CommentThread.tsx:88`, `SchedulePanel.tsx:153`, `src/app/client/[slug]/plan/IdeaDecisionForm.tsx:32`.
- Create `src/app/client/portal-share-metadata.ts` + `portal-share-metadata.test.ts`: shared portal Open Graph/Twitter/description, `clientDisplayName`.
- Modify `src/app/client/layout.tsx`: spread the portal share metadata.
- Modify `src/app/client/[slug]/layout.tsx`: use `clientDisplayName`.
- Create `src/app/client/[slug]/piece/[contentId]/piece-metadata.ts` + `piece-metadata.test.ts`.
- Modify `src/app/client/[slug]/piece/[contentId]/page.tsx`: `generateMetadata`, shared cached item read.

**Tooling**
- Create `src/lib/portal/on-screen-text-rule.ts` + `on-screen-text-rule.test.ts`.
- Create `src/lib/portal/update-portal-on-screen-wiring.test.ts`: source-order regression test.
- Modify `scripts/update-portal.ts`: import the rule, add `refuseMissingOnScreenText`, call it in `runSync` and `runReshare` before any write.

**Docs**
- Modify `docs/PORTAL-AGENT-MANUAL.md` section 13.1 (tokens, components, danger exception) and add the exit code 5 note.
- Task 11 (after approval): `~/Kanset/.claude/skills/kanset-production-workflow/SKILL.md`, `~/Kanset/.claude/skills/kanset-graphic-design/SKILL.md`.

---

### Task 1: New design-system tokens

**Files:**
- Modify: `packages/design-system/src/tokens/tokens.css`
- Modify: `packages/design-system/src/tokens/tokens.ts`
- Create: `packages/design-system/src/tokens/tokens.css.test.ts`
- Modify: `packages/design-system/src/tokens/tokens.test.ts`

Values come from `portal-v3.css`: off-white and danger at lines 7-8, `ins` highlighter at 506, `.changed` soft highlighter at 508, `--dot-glow` at 466. The mockup's `--dot-glow` is named `--dot-grad-glow` here to match the package's `--dot-grad-*` family.

- [ ] **Step 1: Write the failing CSS token test**

Create `packages/design-system/src/tokens/tokens.css.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function token(name: string): string | null {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)
  return match ? match[1].trim() : null
}

describe('piece page redesign tokens (spec 9.4, 10a)', () => {
  it('defines the off-white panel ground that portal CSS already references', () => {
    expect(token('--dot-off-white')).toBe('#fffefc')
  })

  it('defines one danger colour for errors', () => {
    expect(token('--dot-danger')).toBe('#9f241b')
  })

  it('defines the highlighter for added text, a gradient and never a flat fill', () => {
    expect(token('--dot-grad-highlight')).toBe(
      'linear-gradient(to top, rgba(218,255,0,.62) 0%, rgba(238,251,157,.55) 45%, rgba(250,249,246,0) 72%)',
    )
  })

  it('defines the softer highlighter for updated passages', () => {
    expect(token('--dot-grad-highlight-soft')).toBe(
      'linear-gradient(to top, rgba(238,251,157,.75) 0%, rgba(250,249,246,0) 45%)',
    )
  })

  it('defines the yellow glow used by the primary button on hover and focus', () => {
    expect(token('--dot-grad-glow')).toBe(
      'radial-gradient(circle farthest-corner at 50% 50%, #daff00 0%, #eefb9d 62%, #faf9f6 100%)',
    )
  })

  it('keeps the core dot fill the review dots rely on', () => {
    expect(token('--dot-grad-fill')).toBe('radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6)')
  })
})
```

- [ ] **Step 2: Add the TS palette expectation to the existing test**

In `packages/design-system/src/tokens/tokens.test.ts`, add inside `describe('brand tokens', ...)` after the first `it`:

```ts
  it('exposes the off-white ground and the danger colour', () => {
    expect(colors).toMatchObject({ offWhite: '#fffefc', danger: '#9f241b' })
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/design-system/src/tokens`
Expected: FAIL. `tokens.css.test.ts` fails 5 of 6 (`expected null to be '#fffefc'` etc.; the `--dot-grad-fill` test passes). `tokens.test.ts` fails the new `it` (`offWhite` missing).

- [ ] **Step 4: Add the tokens**

In `packages/design-system/src/tokens/tokens.css`, replace the line

```css
  --dot-yellow-pale:#eefb9d; --dot-hairline:#ebebe7;
```

with

```css
  --dot-yellow-pale:#eefb9d; --dot-hairline:#ebebe7;
  /* Panel ground slightly lifted off cream (BRAND-SPEC "Off-white"). Portal CSS referenced it
     before it existed, so those panels rendered transparent until 2026-10-03. */
  --dot-off-white:#fffefc;
  /* The one danger colour. Replaces the hard-coded #9f241b / #c0392b / #b4502f reds. */
  --dot-danger:#9f241b;
```

and after the `--dot-grad-silver` line add:

```css
  /* Yellow as light, never a flat fill (piece page redesign, spec 10a) */
  --dot-grad-highlight:linear-gradient(to top, rgba(218,255,0,.62) 0%, rgba(238,251,157,.55) 45%, rgba(250,249,246,0) 72%);
  --dot-grad-highlight-soft:linear-gradient(to top, rgba(238,251,157,.75) 0%, rgba(250,249,246,0) 45%);
  --dot-grad-glow:radial-gradient(circle farthest-corner at 50% 50%, #daff00 0%, #eefb9d 62%, #faf9f6 100%);
```

In `packages/design-system/src/tokens/tokens.ts`, replace the `colors` object with:

```ts
export const colors = {
  black: '#35332f', cream: '#faf9f6', yellow: '#daff00',
  white: '#ffffff', grey: '#7a776f', graphite: '#47453f',
  yellowPale: '#eefb9d', hairline: '#ebebe7',
  offWhite: '#fffefc', danger: '#9f241b',
} as const;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run packages/design-system/src/tokens`
Expected: PASS, 2 files, 9 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/thedot-site
git add packages/design-system/src/tokens/tokens.css packages/design-system/src/tokens/tokens.ts packages/design-system/src/tokens/tokens.test.ts packages/design-system/src/tokens/tokens.css.test.ts
git commit -m "Define the off-white, danger, highlighter and glow tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Move every hard-coded red onto the danger token

**Files:**
- Create: `src/app/danger-token.test.ts`
- Modify: `packages/design-system/src/components/Input/Input.module.css:7`
- Modify: `packages/design-system/src/components/Textarea/Textarea.module.css:7`
- Modify: `src/app/admin/portal/admin-shell.module.css:70`
- Modify: `src/app/client/[slug]/piece/[contentId]/piece-review.module.css:97`
- Modify: `src/app/client/[slug]/ideas/ideas.module.css:39`
- Modify: `src/app/client/[slug]/piece/[contentId]/DecideForm.tsx:22`
- Modify: `src/app/client/[slug]/piece/[contentId]/CommentThread.tsx:88`
- Modify: `src/app/client/[slug]/piece/[contentId]/SchedulePanel.tsx:153`
- Modify: `src/app/client/[slug]/plan/IdeaDecisionForm.tsx:32`

Audit result (grep on 2026-10-03, these are all of them): `#9f241b` in `piece-review.module.css` and `DecideForm.tsx`; `#c0392b` in `Input.module.css`, `Textarea.module.css`, `ideas.module.css`, `CommentThread.tsx`, `SchedulePanel.tsx`, `IdeaDecisionForm.tsx`; `#b4502f` only as the `--admin-danger` definition (its seven uses in `portal-admin.module.css` already go through `var(--admin-danger)`).

**Visible change to flag to Anastasia:** admin danger text and borders shift from the rust `#b4502f` to the deep red `#9f241b`, and client error text on four forms shifts from `#c0392b` to `#9f241b`. Both are AA on cream. The manual currently calls the admin rust a "sanctioned exception"; Task 6 updates that line.

- [ ] **Step 1: Write the failing regression scan**

Create `src/app/danger-token.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Spec 9.4 (2026-10-03): one danger colour, defined once as --dot-danger in the design-system
// tokens. Three different reds had drifted into the portal. This scan keeps them out.
const ROOT = process.cwd()
const SCANNED = [
  'src/app/client',
  'src/app/admin/portal',
  'packages/design-system/src/components',
]
const RETIRED_REDS = /#(?:9f241b|c0392b|b4502f)\b/i

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('danger colour comes from the token', () => {
  it('no portal or design-system component hard-codes a red', () => {
    const offenders = SCANNED.flatMap((dir) => files(join(ROOT, dir)))
      .filter((path) => RETIRED_REDS.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })

  it('the admin danger alias points at the shared token', () => {
    const css = readFileSync(join(ROOT, 'src/app/admin/portal/admin-shell.module.css'), 'utf8')
    expect(css).toMatch(/--admin-danger:\s*var\(--dot-danger\)/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/danger-token.test.ts`
Expected: FAIL. First test lists 9 offenders (the files above); second test fails on the regex.

- [ ] **Step 3: Replace the reds**

`packages/design-system/src/components/Input/Input.module.css` and `packages/design-system/src/components/Textarea/Textarea.module.css`, each:

```css
.invalid { border-color: #c0392b; }
```
becomes
```css
.invalid { border-color: var(--dot-danger); }
```

`src/app/admin/portal/admin-shell.module.css` line 70:

```css
  --admin-danger: #b4502f;
```
becomes
```css
  --admin-danger: var(--dot-danger);
```

`src/app/client/[slug]/piece/[contentId]/piece-review.module.css` line 97: `color: #9f241b;` becomes `color: var(--dot-danger);`

`src/app/client/[slug]/ideas/ideas.module.css` line 39: `color: #c0392b;` becomes `color: var(--dot-danger);`

`src/app/client/[slug]/piece/[contentId]/DecideForm.tsx` line 22:
```tsx
    {state?.error && <p id="decision-error" role="alert" style={{ color: 'var(--dot-danger)' }}>{state.error}</p>}
```

`src/app/client/[slug]/piece/[contentId]/CommentThread.tsx` line 88:
```tsx
        {state?.error && <p id="comment-error" role="alert" style={{ color: 'var(--dot-danger)', margin: '8px 0 0' }}>{state.error}</p>}
```

`src/app/client/[slug]/piece/[contentId]/SchedulePanel.tsx` line 153:
```tsx
            <p role="alert" style={{ color: 'var(--dot-danger)', margin: '10px 0 0' }}>{state.error}</p>
```

`src/app/client/[slug]/plan/IdeaDecisionForm.tsx` line 32:
```tsx
    {state?.error && <p id="idea-decision-error" role="alert" style={{ color: 'var(--dot-danger)', margin: '10px 0 0' }}>{state.error}</p>}
```

(Moving these inline styles into CSS modules is spec 9.4's last bullet and belongs to the layout plans that rewrite these components; do not restructure them here.)

- [ ] **Step 4: Run the scan and the affected component tests**

Run: `pnpm exec vitest run src/app/danger-token.test.ts packages/design-system "src/app/client/[slug]/piece" "src/app/client/[slug]/plan"`
Expected: PASS, no failures (the existing `DecideForm`, `ReviewVerdict`, `IdeaDecisionForm`, `Input`, `Textarea` tests do not assert colours).

- [ ] **Step 5: Commit**

```bash
cd ~/thedot-site
git add src/app/danger-token.test.ts packages/design-system/src/components/Input/Input.module.css packages/design-system/src/components/Textarea/Textarea.module.css src/app/admin/portal/admin-shell.module.css "src/app/client/[slug]/piece/[contentId]/piece-review.module.css" "src/app/client/[slug]/ideas/ideas.module.css" "src/app/client/[slug]/piece/[contentId]/DecideForm.tsx" "src/app/client/[slug]/piece/[contentId]/CommentThread.tsx" "src/app/client/[slug]/piece/[contentId]/SchedulePanel.tsx" "src/app/client/[slug]/plan/IdeaDecisionForm.tsx"
git commit -m "Use one danger token instead of three hard-coded reds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Yellow button glows on hover and focus

**Files:**
- Modify: `packages/design-system/src/components/Button/Button.module.css`
- Modify: `packages/design-system/src/components/Button/Button.css.test.ts`
- Modify: `packages/design-system/src/components/Button/Button.stories.tsx`

Mockup rule (`portal-v3.css:504-505`): `.btn.yellow:hover, .btn.yellow:focus-visible { background: var(--dot-glow); }` and `.btn.yellow[disabled] { background: var(--dot-hairline); }`, with the disabled colours from line 33. The disabled style is scoped to the yellow variant only, so the existing `variant="black" disabled={pending}` buttons keep their current look.

- [ ] **Step 1: Write the failing assertions**

Append to `packages/design-system/src/components/Button/Button.css.test.ts`:

```ts
describe('yellow primary action glows (spec 10a)', () => {
  it('glows on hover and on keyboard focus, never when disabled', () => {
    expect(css).toMatch(
      /\.yellow:hover:not\(:disabled\):not\(\[aria-disabled='true'\]\),\s*\.yellow:focus-visible:not\(:disabled\):not\(\[aria-disabled='true'\]\)\s*\{[^}]*background:\s*var\(--dot-grad-glow\)/,
    )
  })

  it('no longer flattens the hover to pale yellow', () => {
    expect(css).not.toMatch(/\.yellow:hover\s*\{[^}]*--dot-yellow-pale/)
  })

  it('shows a quiet disabled state for the yellow button only', () => {
    expect(css).toMatch(
      /\.yellow:disabled,\s*\.yellow\[aria-disabled='true'\]\s*\{[^}]*background:\s*var\(--dot-hairline\)[^}]*color:\s*var\(--dot-grey-accessible\)[^}]*border-color:\s*var\(--dot-grey-light\)[^}]*cursor:\s*not-allowed/,
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/design-system/src/components/Button`
Expected: FAIL, 3 new tests fail; the 2 existing visited-state tests pass.

- [ ] **Step 3: Implement**

In `packages/design-system/src/components/Button/Button.module.css` replace

```css
.yellow:hover { background: var(--dot-yellow-pale); color: var(--dot-black); text-decoration: none; }
```

with

```css
/* Yellow is light: the one flat yellow is the primary action, and it glows on hover and keyboard
   focus (piece page redesign, spec 10a). Placed after the state list above so it wins at equal
   specificity over .yellow:focus. */
.yellow:hover:not(:disabled):not([aria-disabled='true']),
.yellow:focus-visible:not(:disabled):not([aria-disabled='true']) {
  background: var(--dot-grad-glow);
  color: var(--dot-black);
  text-decoration: none;
}
.yellow:disabled,
.yellow[aria-disabled='true'] {
  background: var(--dot-hairline);
  color: var(--dot-grey-accessible);
  border-color: var(--dot-grey-light);
  cursor: not-allowed;
}
```

In `packages/design-system/src/components/Button/Button.stories.tsx` append:

```tsx
export const YellowStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Button variant="yellow">Approve (hover or Tab to see the glow)</Button>
      <Button variant="yellow" disabled>Approve</Button>
    </div>
  ),
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run packages/design-system/src/components/Button`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/thedot-site
git add packages/design-system/src/components/Button/Button.module.css packages/design-system/src/components/Button/Button.css.test.ts packages/design-system/src/components/Button/Button.stories.tsx
git commit -m "Let the yellow button glow on hover and focus

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: TickDot component

A 14 px hairline circle that fills with the core yellow gradient once checked. Later plans put one in each copy-switcher tab (spec 4.3) and use it for the admin production gates (spec 10a). Mockup: `.tdot` / `.tdot.on` at `portal-v3.css:487-488`.

**Files:**
- Create: `packages/design-system/src/components/TickDot/TickDot.tsx`
- Create: `packages/design-system/src/components/TickDot/TickDot.module.css`
- Create: `packages/design-system/src/components/TickDot/TickDot.test.tsx`
- Create: `packages/design-system/src/components/TickDot/TickDot.css.test.ts`
- Create: `packages/design-system/src/components/TickDot/TickDot.stories.tsx`
- Create: `packages/design-system/src/components/TickDot/index.ts`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`packages/design-system/src/components/TickDot/TickDot.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TickDot } from './TickDot';

describe('TickDot', () => {
  it('is decorative by default, so a visible text label carries the meaning', () => {
    const { container } = render(<TickDot checked={false} />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toHaveAttribute('data-checked', 'false');
  });

  it('exposes a name when it is the only signal', () => {
    render(<TickDot checked label="Reviewed" />);
    const dot = screen.getByRole('img', { name: 'Reviewed' });
    expect(dot).toHaveAttribute('data-checked', 'true');
    expect(dot).not.toHaveAttribute('aria-hidden');
  });

  it('passes a className through', () => {
    const { container } = render(<TickDot checked className="extra" />);
    expect(container.firstElementChild).toHaveClass('extra');
  });
});
```

`packages/design-system/src/components/TickDot/TickDot.css.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./TickDot.module.css', import.meta.url), 'utf8')

describe('TickDot look (mockup .tdot)', () => {
  it('is a 14px hairline circle on white', () => {
    expect(css).toMatch(/\.tick\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/)
    expect(css).toMatch(/\.tick\s*\{[^}]*border-radius:\s*var\(--dot-radius-circle\)/)
    expect(css).toMatch(/\.tick\s*\{[^}]*border:\s*1px solid var\(--dot-grey-light\)/)
    expect(css).toMatch(/\.tick\s*\{[^}]*background:\s*var\(--dot-white\)/)
  })

  it('fills with the core yellow dot gradient when checked', () => {
    expect(css).toMatch(/\.checked\s*\{[^}]*border-color:\s*var\(--dot-black\)[^}]*background:\s*var\(--dot-grad-fill\)/)
  })

  it('animates only when the viewer allows motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.tick\s*\{\s*transition:/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run packages/design-system/src/components/TickDot`
Expected: FAIL, `Failed to resolve import "./TickDot"` and `ENOENT ... TickDot.module.css`.

- [ ] **Step 3: Implement**

`packages/design-system/src/components/TickDot/TickDot.module.css`:

```css
.tick { display: inline-block; flex: none; width: 14px; height: 14px; border-radius: var(--dot-radius-circle);
  border: 1px solid var(--dot-grey-light); background: var(--dot-white); vertical-align: middle; }
.checked { border-color: var(--dot-black); background: var(--dot-grad-fill); }
@media (prefers-reduced-motion: no-preference) {
  .tick { transition: border-color .2s ease; }
}
```

`packages/design-system/src/components/TickDot/TickDot.tsx`:

```tsx
import styles from './TickDot.module.css';

export interface TickDotProps {
  checked: boolean;
  /** Accessible name. Omit when adjacent text already says the state (the dot is then aria-hidden). */
  label?: string;
  className?: string;
}

export function TickDot({ checked, label, className }: TickDotProps) {
  const cls = [styles.tick, checked ? styles.checked : null, className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  return <span className={cls} data-checked={checked ? 'true' : 'false'} {...a11y} />;
}
```

`packages/design-system/src/components/TickDot/index.ts`:

```ts
export { TickDot } from './TickDot';
export type { TickDotProps } from './TickDot';
```

`packages/design-system/src/components/TickDot/TickDot.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { TickDot } from './TickDot';

const meta: Meta<typeof TickDot> = { title: 'Brand/TickDot', component: TickDot };
export default meta;
type Story = StoryObj<typeof TickDot>;

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontFamily: 'var(--dot-font-display)' }}>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>CAPTION <TickDot checked={false} /></span>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>ON-SCREEN TEXT <TickDot checked label="Reviewed" /></span>
    </div>
  ),
};
```

In `packages/design-system/src/index.ts`, after `export * from './components/DotGrid';` add:

```ts
export * from './components/TickDot';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run packages/design-system/src/components/TickDot`
Expected: PASS, 2 files, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/thedot-site
git add packages/design-system/src/components/TickDot packages/design-system/src/index.ts
git commit -m "Add TickDot, the hairline dot that fills when a tab is reviewed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ReviewDots component

A row of n circles, the first `filled` of them filled with `--dot-grad-fill` (exactly `radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6)`). Later plans use it for `2 of 3 reviewed` in the decision bar and the 5-dot rating in the feedback card. Mockup: `.rdots` at `portal-v3.css:489-491`, 22 px, 8 px gap, 18 px under 600 px (line 549).

**Files:**
- Create: `packages/design-system/src/components/ReviewDots/ReviewDots.tsx`
- Create: `packages/design-system/src/components/ReviewDots/ReviewDots.module.css`
- Create: `packages/design-system/src/components/ReviewDots/ReviewDots.test.tsx`
- Create: `packages/design-system/src/components/ReviewDots/ReviewDots.css.test.ts`
- Create: `packages/design-system/src/components/ReviewDots/ReviewDots.stories.tsx`
- Create: `packages/design-system/src/components/ReviewDots/index.ts`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`packages/design-system/src/components/ReviewDots/ReviewDots.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewDots } from './ReviewDots';

function dots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-filled]'));
}

describe('ReviewDots', () => {
  it('renders one dot per item and fills the first n', () => {
    const { container } = render(<ReviewDots total={3} filled={2} />);
    expect(dots(container).map((d) => d.getAttribute('data-filled'))).toEqual(['true', 'true', 'false']);
  });

  it('is decorative unless given a label, because the bar prints "2 of 3 reviewed" beside it', () => {
    const { container } = render(<ReviewDots total={3} filled={1} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes one accessible name for the whole row when labelled', () => {
    render(<ReviewDots total={5} filled={4} label="Rated 4 of 5" />);
    expect(screen.getByRole('img', { name: 'Rated 4 of 5' })).toBeInTheDocument();
  });

  it('clamps filled to the range 0..total', () => {
    const over = render(<ReviewDots total={2} filled={9} />);
    expect(dots(over.container).every((d) => d.getAttribute('data-filled') === 'true')).toBe(true);
    const under = render(<ReviewDots total={2} filled={-1} />);
    expect(dots(under.container).every((d) => d.getAttribute('data-filled') === 'false')).toBe(true);
  });

  it('renders nothing inside for a zero or invalid total', () => {
    const { container } = render(<ReviewDots total={0} filled={0} />);
    expect(dots(container)).toHaveLength(0);
    const nan = render(<ReviewDots total={Number.NaN} filled={1} />);
    expect(dots(nan.container)).toHaveLength(0);
  });

  it('records its size for styling', () => {
    const { container } = render(<ReviewDots total={1} filled={1} size="sm" />);
    expect(container.firstElementChild).toHaveAttribute('data-size', 'sm');
  });
});
```

`packages/design-system/src/components/ReviewDots/ReviewDots.css.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./ReviewDots.module.css', import.meta.url), 'utf8')

describe('ReviewDots look (mockup .rdots)', () => {
  it('lays the dots out in a row with an 8px gap', () => {
    expect(css).toMatch(/\.row\s*\{[^}]*display:\s*inline-flex[^}]*gap:\s*var\(--dot-space-2\)/)
  })

  it('draws 22px hairline circles on white', () => {
    expect(css).toMatch(/\.dot\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/)
    expect(css).toMatch(/\.dot\s*\{[^}]*border-radius:\s*var\(--dot-radius-circle\)/)
    expect(css).toMatch(/\.dot\s*\{[^}]*border:\s*1px solid var\(--dot-grey-light\)/)
  })

  it('fills with the core yellow radial gradient', () => {
    expect(css).toMatch(/\.on\s*\{[^}]*border-color:\s*var\(--dot-black\)[^}]*background:\s*var\(--dot-grad-fill\)/)
  })

  it('shrinks to 18px on a phone and has a 14px small size', () => {
    expect(css).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.md \.dot\s*\{\s*width:\s*18px;\s*height:\s*18px;/)
    expect(css).toMatch(/\.sm \.dot\s*\{\s*width:\s*14px;\s*height:\s*14px;/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run packages/design-system/src/components/ReviewDots`
Expected: FAIL, `Failed to resolve import "./ReviewDots"` and `ENOENT ... ReviewDots.module.css`.

- [ ] **Step 3: Implement**

`packages/design-system/src/components/ReviewDots/ReviewDots.module.css`:

```css
.row { display: inline-flex; align-items: center; gap: var(--dot-space-2); vertical-align: middle; }
.dot { display: block; flex: none; width: 22px; height: 22px; border-radius: var(--dot-radius-circle);
  border: 1px solid var(--dot-grey-light); background: var(--dot-white); }
.on { border-color: var(--dot-black); background: var(--dot-grad-fill); }
.sm { gap: 6px; }
.sm .dot { width: 14px; height: 14px; }
@media (max-width: 600px) {
  .md .dot { width: 18px; height: 18px; }
}
@media (prefers-reduced-motion: no-preference) {
  .dot { transition: border-color .2s ease; }
}
```

`packages/design-system/src/components/ReviewDots/ReviewDots.tsx`:

```tsx
import styles from './ReviewDots.module.css';

export interface ReviewDotsProps {
  /** Number of dots. Non-finite or negative values render none. */
  total: number;
  /** How many dots, from the left, are filled. Clamped to 0..total. */
  filled: number;
  size?: 'md' | 'sm';
  /** Accessible name for the whole row. Omit when visible text beside it says the same. */
  label?: string;
  className?: string;
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function ReviewDots({ total, filled, size = 'md', label, className }: ReviewDotsProps) {
  const count = whole(total);
  const on = Math.min(count, whole(filled));
  const cls = [styles.row, styles[size], className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <span className={cls} data-size={size} {...a11y}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={[styles.dot, i < on ? styles.on : null].filter(Boolean).join(' ')}
          data-filled={i < on ? 'true' : 'false'}
        />
      ))}
    </span>
  );
}
```

Note: `whole(-1)` is `0`, so `filled={-1}` fills nothing, and `total={NaN}` renders no dots, matching the tests.

`packages/design-system/src/components/ReviewDots/index.ts`:

```ts
export { ReviewDots } from './ReviewDots';
export type { ReviewDotsProps } from './ReviewDots';
```

`packages/design-system/src/components/ReviewDots/ReviewDots.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ReviewDots } from './ReviewDots';

const meta: Meta<typeof ReviewDots> = { title: 'Brand/ReviewDots', component: ReviewDots };
export default meta;
type Story = StoryObj<typeof ReviewDots>;

export const Progress: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'var(--dot-font-display)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.8rem' }}>
      <ReviewDots total={3} filled={2} /> <strong>2 of 3 reviewed</strong>
    </div>
  ),
};

export const Rating: Story = {
  render: () => <ReviewDots total={5} filled={4} label="Rated 4 of 5" />,
};

export const Small: Story = {
  render: () => <ReviewDots total={9} filled={5} size="sm" label="5 of 9 gates done" />,
};
```

In `packages/design-system/src/index.ts`, after the `TickDot` export add:

```ts
export * from './components/ReviewDots';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run packages/design-system/src/components/ReviewDots`
Expected: PASS, 2 files, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/thedot-site
git add packages/design-system/src/components/ReviewDots packages/design-system/src/index.ts
git commit -m "Add ReviewDots, the row of dots that fill with the brand gradient

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Build the package and update the manual

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md` section 13.1 (around lines 515-525)

- [ ] **Step 1: Typecheck and build the design system**

Run: `pnpm --filter @thedot/design-system typecheck && pnpm --filter @thedot/design-system build`
Expected: no type errors; tsup prints `ESM Build success` and `DTS Build success`. Then:

Run: `grep -c -- '--dot-off-white:#fffefc' packages/design-system/dist/index.css; grep -o 'export { [^}]*ReviewDots[^}]*}' packages/design-system/dist/index.js | head -1`
Expected: `1`, and an export line containing `ReviewDots` and `TickDot`. (`dist/` is git-ignored; Vercel rebuilds it through the root `build` script.)

- [ ] **Step 2: Update the manual**

In `docs/PORTAL-AGENT-MANUAL.md` section 13.1, replace

```
  themes through these; never raw hex in a component** (the one sanctioned exception is the admin
  `--admin-danger: #b4502f` rust, a semantic danger color). Key tokens:
```

with

```
  themes through these; never raw hex in a component.** Errors use `--dot-danger` (#9f241b); the
  admin `--admin-danger` is an alias of it (the old #b4502f rust and the #c0392b form red were
  retired 2026-10-03, guarded by `src/app/danger-token.test.ts`). Key tokens:
```

In the same section, after the `Space:` bullet line (`- Space: \`--dot-space-1..8\`. Radius: ...`), add:

```
  - Panels and light: `--dot-off-white` (#fffefc, lifted panel ground), `--dot-grad-fill` (the
    core dot fill), `--dot-grad-glow` (the yellow primary button's hover and focus glow),
    `--dot-grad-highlight` (added text) and `--dot-grad-highlight-soft` (updated passages). Yellow
    is light, never a flat pale fill, except the one yellow primary Button.
```

and replace the components line

```
- **Components** (`src/components/`): `Heading`, `Text`, `Eyebrow`, `Button`, `Card`, `Tag`,
  `ReadMore`, `Input`, `Textarea`, `Selector`, `Dot`, `DotGrid`, `Stripe`, `Arrow`, `Logo`. Use
```

with

```
- **Components** (`src/components/`): `Heading`, `Text`, `Eyebrow`, `Button`, `Card`, `Tag`,
  `ReadMore`, `Input`, `Textarea`, `Selector`, `Dot`, `DotGrid`, `TickDot` (a hairline dot that
  fills when checked: tab ticks, gates), `ReviewDots` (n dots, first k filled: review progress,
  ratings), `Stripe`, `Arrow`, `Logo`. Use
```

- [ ] **Step 3: Commit**

```bash
cd ~/thedot-site
git add docs/PORTAL-AGENT-MANUAL.md
git commit -m "Document the new tokens, TickDot and ReviewDots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Stop the portal inheriting the marketing share card

**Why:** the root `src/app/layout.tsx` sets `openGraph` and `twitter` titles to "The Dot Creative Agency | Professional Web Design GTA" plus the marketing poster image and `alternates.canonical: '/'`. The `/client` layouts override `title` but not these, so every portal link (piece pages included) previews as The Dot's marketing card. This is the "share link shows The Dot's generic title" bug in spec section 1. Next.js replaces a top-level metadata key wholesale in a child, so setting `openGraph` and `twitter` in `/client/layout.tsx` drops the marketing values for every portal route.

**Files:**
- Create: `src/app/client/portal-share-metadata.ts`
- Create: `src/app/client/portal-share-metadata.test.ts`
- Modify: `src/app/client/layout.tsx`
- Modify: `src/app/client/[slug]/layout.tsx`

- [ ] **Step 1: Write the failing test**

`src/app/client/portal-share-metadata.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clientDisplayName, PORTAL_NOINDEX, portalShareMetadata } from './portal-share-metadata'

describe('portal share metadata', () => {
  it('names the client from its slug', () => {
    expect(clientDisplayName('kanset')).toBe('Kanset')
    expect(clientDisplayName('')).toBe('')
  })

  it('never indexes a portal page', () => {
    expect(PORTAL_NOINDEX).toEqual({ index: false, follow: false })
  })

  it('replaces the marketing Open Graph and Twitter cards with the given title', () => {
    const meta = portalShareMetadata('Kanset · Foreign worker cost')
    expect(meta.openGraph).toEqual({
      title: 'Kanset · Foreign worker cost',
      description: 'A private client workspace.',
      siteName: 'Kanset Portal',
      type: 'website',
    })
    expect(meta.twitter).toEqual({
      card: 'summary',
      title: 'Kanset · Foreign worker cost',
      description: 'A private client workspace.',
    })
    expect(meta.description).toBe('A private client workspace.')
    expect(meta.alternates).toEqual({ canonical: null })
  })

  it('carries nothing from the marketing site', () => {
    expect(JSON.stringify(portalShareMetadata('Kanset Portal'))).not.toMatch(/Dot Creative|Poster|thedotcreative/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/client/portal-share-metadata.test.ts`
Expected: FAIL, `Failed to resolve import "./portal-share-metadata"`.

- [ ] **Step 3: Implement the module**

`src/app/client/portal-share-metadata.ts`:

```ts
import type { Metadata } from 'next'

// The portal is private. Its link previews must never show the marketing site's card (inherited
// from the root layout) and must never show piece content to someone who cannot open the piece.
export const PORTAL_SITE_NAME = 'Kanset Portal'
export const PORTAL_DESCRIPTION = 'A private client workspace.'
export const PORTAL_NOINDEX = { index: false, follow: false } as const

export function clientDisplayName(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

export function portalShareMetadata(
  title: string,
): Pick<Metadata, 'description' | 'openGraph' | 'twitter' | 'alternates'> {
  return {
    description: PORTAL_DESCRIPTION,
    openGraph: { title, description: PORTAL_DESCRIPTION, siteName: PORTAL_SITE_NAME, type: 'website' },
    twitter: { card: 'summary', title, description: PORTAL_DESCRIPTION },
    alternates: { canonical: null },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/client/portal-share-metadata.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in the two layouts**

`src/app/client/layout.tsx`: add the import below the existing `import PortalPwaRegistration ...` line

```ts
import { PORTAL_NOINDEX, PORTAL_SITE_NAME, portalShareMetadata } from './portal-share-metadata'
```

and replace the `metadata` export with

```ts
export const metadata: Metadata = {
  title: 'Kanset Portal · The Dot',
  manifest: '/kanset-portal.webmanifest',
  robots: PORTAL_NOINDEX,
  ...portalShareMetadata(PORTAL_SITE_NAME),
}
```

`src/app/client/[slug]/layout.tsx`: add the import

```ts
import { clientDisplayName, PORTAL_NOINDEX } from '../portal-share-metadata'
```

and replace the body of `generateMetadata` with

```ts
  const { slug } = await params
  return {
    title: `${clientDisplayName(slug)} · Client Portal`,
    // Installable-app manifest: opens straight to the workspace, own name + icon ("Kanset Portal").
    manifest: '/kanset-portal.webmanifest',
    robots: PORTAL_NOINDEX,
  }
```

(The `[slug]` layout keeps inheriting `openGraph`/`twitter` from `/client/layout.tsx`, which now say "Kanset Portal".)

- [ ] **Step 6: Typecheck the touched files**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'src/app/client/(layout|portal-share-metadata|\[slug\]/layout)'`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd ~/thedot-site
git add src/app/client/portal-share-metadata.ts src/app/client/portal-share-metadata.test.ts src/app/client/layout.tsx "src/app/client/[slug]/layout.tsx"
git commit -m "Give portal links their own share card instead of the marketing one

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Piece page title "Kanset · <piece title>", noindex, no leakage

**Access model (why this is safe):** the title is resolved with the same two calls the page already makes: `getClientSession(slug)` (RPC bound to `auth.uid()`, returns `null` for a logged-out viewer or a non-member) and `getContentItem(clientId, contentId)` (reads `content_with_state` through `createSupabaseServer()`, i.e. the viewer's JWT under RLS, returning `null` when the viewer cannot see the piece). Only when both succeed does the title contain the piece title. Any `null`, an empty title, or any thrown error yields the generic `Kanset · Client Portal`. No admin client is used.

**Known limit, state it in the hand-off:** chat apps fetch link previews without a session, so a pasted link previews as "Kanset Portal" (Task 7), not the piece title. Showing the piece title to an unauthenticated fetcher would be the leak this task forbids. The piece title appears in the browser tab, history, bookmarks and the installed app's window for a signed-in viewer.

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/piece-metadata.ts`
- Create: `src/app/client/[slug]/piece/[contentId]/piece-metadata.test.ts`
- Modify: `src/app/client/[slug]/piece/[contentId]/page.tsx`

- [ ] **Step 1: Write the failing test**

`src/app/client/[slug]/piece/[contentId]/piece-metadata.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), getContentItem: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))

import { resolvePieceMetadata } from './piece-metadata'

const SESSION = { clientId: 'client-uuid', userId: 'user-uuid' }
const GENERIC = 'Kanset · Client Portal'

beforeEach(() => {
  mocks.getClientSession.mockReset()
  mocks.getContentItem.mockReset()
})

describe('piece page metadata', () => {
  it('titles the page with the client and piece for a viewer who can see it', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: 'What it costs to hire a foreign worker' })
    const meta = await resolvePieceMetadata('kanset', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(mocks.getContentItem).toHaveBeenCalledWith('client-uuid', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(meta.title).toBe('Kanset · What it costs to hire a foreign worker')
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.openGraph).toMatchObject({ title: 'Kanset · What it costs to hire a foreign worker' })
    expect(meta.twitter).toMatchObject({ title: 'Kanset · What it costs to hire a foreign worker' })
  })

  it('gives a logged-out or non-member viewer the generic title and never queries the piece', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    const meta = await resolvePieceMetadata('kanset', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(meta.title).toBe(GENERIC)
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(mocks.getContentItem).not.toHaveBeenCalled()
  })

  it('gives the generic title when RLS hides the piece', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue(null)
    const meta = await resolvePieceMetadata('kanset', 'someone-elses-piece')
    expect(meta.title).toBe(GENERIC)
    expect(JSON.stringify(meta)).not.toContain('someone-elses-piece')
  })

  it('gives the generic title for a blank piece title', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: '   ' })
    expect((await resolvePieceMetadata('kanset', 'x-piece')).title).toBe(GENERIC)
  })

  it('never throws from metadata, so an outage cannot leak an error string into the head', async () => {
    mocks.getClientSession.mockRejectedValue(new Error('auth outage detail'))
    const meta = await resolvePieceMetadata('kanset', 'x-piece')
    expect(meta.title).toBe(GENERIC)
    expect(JSON.stringify(meta)).not.toContain('outage')
  })

  it('trims the piece title', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: '  Two clocks  ' })
    expect((await resolvePieceMetadata('kanset', 'x-piece')).title).toBe('Kanset · Two clocks')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/piece-metadata.test.ts"`
Expected: FAIL, `Failed to resolve import "./piece-metadata"`.

- [ ] **Step 3: Implement**

`src/app/client/[slug]/piece/[contentId]/piece-metadata.ts`:

```ts
import type { Metadata } from 'next'
import { cache } from 'react'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { clientDisplayName, PORTAL_NOINDEX, portalShareMetadata } from '../../../portal-share-metadata'

// One RLS-bound read per request, shared by generateMetadata and the page (React cache is
// request-scoped on the server, like getClientSession's).
export const getPieceItem = cache(getContentItem)

// Spec 9.4: the tab and share title read "Kanset · <piece title>" and the page is never indexed.
// The title is resolved with the VIEWER's session and RLS. Anyone who cannot see the piece gets
// the generic portal title, and no lookup failure can put piece data or error text in the head.
export async function resolvePieceMetadata(slug: string, contentId: string): Promise<Metadata> {
  const client = clientDisplayName(slug)
  const titled = (title: string): Metadata => ({ title, robots: PORTAL_NOINDEX, ...portalShareMetadata(title) })
  const generic = titled(`${client} · Client Portal`)
  try {
    const session = await getClientSession(slug)
    if (!session) return generic
    const item = await getPieceItem(session.clientId, contentId)
    const pieceTitle = item?.title?.trim()
    if (!pieceTitle) return generic
    return titled(`${client} · ${pieceTitle}`)
  } catch {
    return generic
  }
}
```

In `src/app/client/[slug]/piece/[contentId]/page.tsx`:

1. Replace the import line `import { getContentItem } from '@/lib/portal/data'` with:

```ts
import type { Metadata } from 'next'
import { getPieceItem, resolvePieceMetadata } from './piece-metadata'
```

2. Directly above `export default async function Piece(...)` add:

```ts
export async function generateMetadata({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}): Promise<Metadata> {
  const { slug, contentId } = await params
  return resolvePieceMetadata(slug, contentId)
}
```

3. In `Piece`, replace `const item = await getContentItem(session.clientId, contentId)` with:

```ts
  const item = await getPieceItem(session.clientId, contentId)
```

- [ ] **Step 4: Run to verify it passes, plus the neighbouring piece tests**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece"`
Expected: PASS, including the 6 new tests; the existing `DecideForm`, `RemovalRequestForm`, `ReviewAssets`, `ReviewFlowIntro`, `SuggestEditForm`, `ReviewVerdict` tests still pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]/(page|piece-metadata)'`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd ~/thedot-site
git add "src/app/client/[slug]/piece/[contentId]/piece-metadata.ts" "src/app/client/[slug]/piece/[contentId]/piece-metadata.test.ts" "src/app/client/[slug]/piece/[contentId]/page.tsx"
git commit -m "Title each piece page Kanset · <piece title>, only for viewers who can see it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The on-screen text rule (pure)

**Rule (spec 9.3, after the 2026-10-02 incident where Maria approved copy without seeing the reel's frames):** a canonical file whose format puts text on the media must carry a client-facing block with that text, unless the frontmatter declares the only on-screen text is captions of the speech.

- Formats covered: `reel`, `short`, `vertical_video`, `carousel`, `single` (spec says "every piece whose media carries on-screen text"; single graphics carry text).
- Blocks that satisfy it (every on-screen key already in `~/Kanset/portal-content`, counted 2026-10-03): `reel-script`, `on-screen-copy`, `onscreen-script`, `video-script`, `carousel-copy`, `carousel-slides`, `carousel`, `document-copy`, `linkedin-document-copy`.
- Opt-out: canonical frontmatter `on_screen_text: captions_only`. Any other value is an error, so a typo cannot silently opt out.
- Not covered: `article`, `podcast`, `podcast_article`, `post`, `linkedin-post`, `story`, `null`.

Today 41 of the reel/carousel canonicals lack such a block (talking-head Ask Kanset files and older graphic pieces). The rule only bites when one of them is next synced or re-shared, which is the intended forward rule. Note for the doc text in Task 11: Ask Kanset clips show a **question card**, which is on-screen text beyond captions, so they need an `on-screen-copy` block, not the opt-out; `captions_only` is for clips such as Kanset Talks cuts with dialogue captions only.

**Files:**
- Create: `src/lib/portal/on-screen-text-rule.ts`
- Create: `src/lib/portal/on-screen-text-rule.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/portal/on-screen-text-rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  checkOnScreenTextBlock,
  ON_SCREEN_TEXT_BLOCK_KEYS,
  readOnScreenTextOptOut,
} from './on-screen-text-rule'

const canonical = (extra: string) => `---
portal_kind: content
content_id: kanset-2026-10-foreign-worker-cost-reel
client: kanset
title: "Foreign worker cost"
format: reel
${extra}version: 2
---
<!-- portal-block:social-caption -->
## Caption
Body.

<!-- internal -->
`

describe('readOnScreenTextOptOut', () => {
  it('is null when the key is absent', () => {
    expect(readOnScreenTextOptOut(canonical(''), 'x.md')).toBeNull()
  })

  it('reads captions_only', () => {
    expect(readOnScreenTextOptOut(canonical('on_screen_text: captions_only\n'), 'x.md')).toBe('captions_only')
  })

  it('refuses any other value so a typo cannot opt out', () => {
    expect(() => readOnScreenTextOptOut(canonical('on_screen_text: caption_only\n'), 'x.md'))
      .toThrow(/on_screen_text must be captions_only in x\.md; got "caption_only"/)
    expect(() => readOnScreenTextOptOut(canonical('on_screen_text: true\n'), 'x.md'))
      .toThrow(/got true/)
  })
})

describe('checkOnScreenTextBlock', () => {
  const base = { contentId: 'kanset-2026-10-foreign-worker-cost-reel', optOut: null }

  it('passes a reel that carries a reel-script block', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['reel-script', 'social-caption'] }))
      .toEqual({ status: 'present', blockKey: 'reel-script' })
  })

  it('accepts every known on-screen block key', () => {
    for (const key of ON_SCREEN_TEXT_BLOCK_KEYS) {
      expect(checkOnScreenTextBlock({ ...base, format: 'carousel', blockKeys: [key] }).status).toBe('present')
    }
  })

  it('flags a reel with only a caption and a YouTube package (the 2026-10-02 incident)', () => {
    const verdict = checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['social-caption', 'youtube-package'] })
    expect(verdict.status).toBe('missing')
    if (verdict.status !== 'missing') throw new Error('unreachable')
    expect(verdict.message).toContain('kanset-2026-10-foreign-worker-cost-reel')
    expect(verdict.message).toContain('format "reel"')
    expect(verdict.message).toContain('<!-- portal-block:reel-script -->')
    expect(verdict.message).toContain('on_screen_text: captions_only')
  })

  it('covers short, vertical_video, carousel and single, case-insensitively', () => {
    for (const format of ['short', 'vertical_video', 'carousel', 'single', 'Reel', ' reel ']) {
      expect(checkOnScreenTextBlock({ ...base, format, blockKeys: ['caption'] }).status).toBe('missing')
    }
  })

  it('lets a captions-only talking-head clip opt out explicitly', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['social-caption'], optOut: 'captions_only' }))
      .toEqual({ status: 'opted-out', optOut: 'captions_only' })
  })

  it('prefers a present block over an opt-out', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['on-screen-copy'], optOut: 'captions_only' }).status)
      .toBe('present')
  })

  it('does not apply to formats without on-screen media text', () => {
    for (const format of ['article', 'podcast', 'podcast_article', 'post', 'linkedin-post', 'story', null]) {
      expect(checkOnScreenTextBlock({ ...base, format, blockKeys: ['caption'] }))
        .toEqual({ status: 'not-applicable' })
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/portal/on-screen-text-rule.test.ts`
Expected: FAIL, `Failed to resolve import "./on-screen-text-rule"`.

- [ ] **Step 3: Implement**

`src/lib/portal/on-screen-text-rule.ts`:

```ts
// Production rule (spec 2026-10-03-piece-page-redesign-design.md section 9.3): every piece whose
// media carries on-screen text ships to the portal with that text as a client-facing block, so the
// client can read what the frames say before approving. Added after 2026-10-02, when a reel's copy
// was approved without its frames and the post had to come down.
//
// Pure and I/O-free. scripts/update-portal.ts calls it before any write.
import matter from 'gray-matter'

export const ON_SCREEN_TEXT_FORMATS: ReadonlySet<string> = new Set([
  'reel', 'short', 'vertical_video', 'carousel', 'single',
])

// Every on-screen block key already used in portal-content (2026-10-03 inventory).
export const ON_SCREEN_TEXT_BLOCK_KEYS: readonly string[] = [
  'reel-script', 'on-screen-copy', 'onscreen-script', 'video-script',
  'carousel-copy', 'carousel-slides', 'carousel', 'document-copy', 'linkedin-document-copy',
]

export type OnScreenTextOptOut = 'captions_only'

export type OnScreenTextVerdict =
  | { status: 'not-applicable' }
  | { status: 'present'; blockKey: string }
  | { status: 'opted-out'; optOut: OnScreenTextOptOut }
  | { status: 'missing'; message: string }

// Reads the optional `on_screen_text` frontmatter key from a canonical file. Absent = no opt-out.
// Any value other than captions_only throws, so a misspelling can never switch the rule off.
export function readOnScreenTextOptOut(canonicalRaw: string, source: string): OnScreenTextOptOut | null {
  const value = (matter(canonicalRaw).data as Record<string, unknown>).on_screen_text
  if (value === undefined || value === null) return null
  if (value === 'captions_only') return value
  throw new Error(`on_screen_text must be captions_only in ${source}; got ${JSON.stringify(value)}`)
}

export function checkOnScreenTextBlock(input: {
  contentId: string
  format: string | null
  blockKeys: readonly string[]
  optOut: OnScreenTextOptOut | null
}): OnScreenTextVerdict {
  const format = input.format?.trim().toLowerCase() ?? null
  if (!format || !ON_SCREEN_TEXT_FORMATS.has(format)) return { status: 'not-applicable' }
  const blockKey = input.blockKeys.find((key) => ON_SCREEN_TEXT_BLOCK_KEYS.includes(key))
  if (blockKey) return { status: 'present', blockKey }
  if (input.optOut) return { status: 'opted-out', optOut: input.optOut }
  return {
    status: 'missing',
    message: `${input.contentId} is format "${format}" but has no on-screen text block `
      + `(one of: ${ON_SCREEN_TEXT_BLOCK_KEYS.join(', ')}). Add <!-- portal-block:reel-script --> `
      + '(or on-screen-copy / carousel-copy) with the text frame by frame, so the client reads what the '
      + 'media says before approving. For a talking-head clip whose only on-screen text is captions of '
      + 'the speech, add "on_screen_text: captions_only" to the canonical frontmatter instead.',
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/portal/on-screen-text-rule.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/thedot-site
git add src/lib/portal/on-screen-text-rule.ts src/lib/portal/on-screen-text-rule.test.ts
git commit -m "Decide when a piece must carry its on-screen text block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Refuse the sync in `update-portal` before any write

**Behaviour:** in `runSync` (covers both `create` with an authored canonical and `sync`) and in the non-retry path of `runReshare`, after the refreshed canonical is parsed and its identity asserted and **before** the preview RPC, `inspect(...,'apply')`, `begin-revision`, any file write, commit or sync, the CLI evaluates the rule on the refreshed canonical. `missing` refuses with exit code 5 and a `refused` run-log entry; `opted-out` prints a one-line note; `present` and `not-applicable` are silent. Preview runs refuse too, so the problem shows before anyone adds `--apply`. The stranded-release retry in `runReshare` is untouched (it re-releases content that was already synced). The client-edit apply path (`portal-inbox apply-edit`) and the bulk `sync-content` script are not changed: applying Maria's own edits must never be blocked by this rule.

**Files:**
- Modify: `scripts/update-portal.ts`
- Create: `src/lib/portal/update-portal-on-screen-wiring.test.ts`
- Modify: `docs/PORTAL-AGENT-MANUAL.md`

- [ ] **Step 1: Write the failing wiring test**

`src/lib/portal/update-portal-on-screen-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The CLI is an I/O shell with no harness of its own, so this pins the ORDER that makes the
// on-screen text refusal safe: it must run before every preview RPC and every mutation.
const src = readFileSync(new URL('../../../scripts/update-portal.ts', import.meta.url), 'utf8')

function body(name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('update-portal enforces the on-screen text rule before writing', () => {
  it('imports the pure rule', () => {
    expect(src).toMatch(/import \{[^}]*checkOnScreenTextBlock[^}]*readOnScreenTextOptOut[^}]*\} from '\.\.\/src\/lib\/portal\/on-screen-text-rule'/)
  })

  it('runSync refuses before the preview RPC and before any write', () => {
    const fn = body('runSync')
    const check = fn.indexOf('refuseMissingOnScreenText(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf('PREVIEW_RPC'))
    expect(check).toBeLessThan(fn.indexOf('writeFileSync('))
    expect(check).toBeLessThan(fn.indexOf("inspect(ctx.portalDir, 'apply')"))
  })

  it('runReshare refuses before opening a revision', () => {
    const fn = body('runReshare')
    const check = fn.indexOf('refuseMissingOnScreenText(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf("runAdmin(['begin-revision'"))
    expect(check).toBeLessThan(fn.indexOf('writeFileSync('))
  })

  it('uses its own exit code', () => {
    expect(src).toMatch(/process\.exitCode = 5/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/portal/update-portal-on-screen-wiring.test.ts`
Expected: FAIL on all 4 (import missing, `refuseMissingOnScreenText(` not found, exit code 5 absent).

- [ ] **Step 3: Wire it into the CLI**

In `scripts/update-portal.ts`:

1. After the line `import { isUnresolvedContentRequest } from '../src/lib/portal/request-status'` add:

```ts
import { checkOnScreenTextBlock, readOnScreenTextOptOut } from '../src/lib/portal/on-screen-text-rule'
```

2. In the header comment, after the `--quiet` paragraph (the line ending `throw. Refused if she has already decided on the released version.`), add:

```ts
//
// EXIT CODES: 2 = refused input (open fact-check gate, missing pack or change note), 3 = locked,
// 4 = open client edit request or version reconcile, 5 = on-screen text block missing (a reel,
// short, carousel or single without its frame-by-frame text; spec 2026-10-03 section 9.3).
```

3. Directly above `// Refresh the canonical body + push a new (or first) version. No re-arm. Preview does no writes.` add:

```ts
// Spec 2026-10-03 section 9.3: a piece whose media carries on-screen text reaches the portal with
// that text as a block, so the client can read the frames before approving. Runs on the REFRESHED
// canonical, before any preview RPC, revision, file write or sync. Returns true when the run stops.
function refuseMissingOnScreenText(
  parsed: ParsedContent,
  canonicalRaw: string,
  canonicalName: string,
  report: (extra?: Record<string, unknown>) => void,
): boolean {
  const verdict = checkOnScreenTextBlock({
    contentId: parsed.content_id,
    format: parsed.format,
    blockKeys: parsed.copy_blocks.map((block) => block.key),
    optOut: readOnScreenTextOptOut(canonicalRaw, canonicalName),
  })
  if (verdict.status === 'opted-out') {
    console.log(`note: ${parsed.content_id} declares on_screen_text: ${verdict.optOut} (no on-screen text block required).`)
  }
  if (verdict.status !== 'missing') return false
  report({ outcome: 'refused', reason: 'on-screen text block missing' })
  console.error(`REFUSED: ${verdict.message}`)
  process.exitCode = 5
  return true
}
```

4. In `runSync`, replace

```ts
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // structure + PII safety gate (HARD STOP)
  assertCanonicalIdentity(parsed, ctx.contentId)
```

with

```ts
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // structure + PII safety gate (HARD STOP)
  assertCanonicalIdentity(parsed, ctx.contentId)
  if (refuseMissingOnScreenText(parsed, refreshed, ctx.canonicalName, ctx.report)) return
```

5. In `runReshare`, replace

```ts
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // safety gate
  assertCanonicalIdentity(parsed, ctx.contentId)
```

with

```ts
  const parsed = parseContentFile(refreshed, ctx.canonicalName) // safety gate
  assertCanonicalIdentity(parsed, ctx.contentId)
  if (refuseMissingOnScreenText(parsed, refreshed, ctx.canonicalName, ctx.report)) return
```

Both `return`s happen while the per-piece and root locks are still held by `main`; its `finally` releases them, exactly as the existing refusals do.

- [ ] **Step 4: Run the wiring test and the existing update-portal tests**

Run: `pnpm exec vitest run src/lib/portal/update-portal-on-screen-wiring.test.ts src/lib/portal/update-portal-core.test.ts src/lib/portal/on-screen-text-rule.test.ts`
Expected: PASS, all files.

- [ ] **Step 5: Typecheck the script**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'scripts/update-portal|on-screen-text-rule'`
Expected: no output.

- [ ] **Step 6: Read-only smoke against real canonicals (no DB, no writes)**

This checks the rule against the live content repo without running the CLI. Write the script to the scratchpad, not the repo:

```bash
cat > /tmp/kanset-onscreen-smoke.ts <<'EOF'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '/Users/anastasiavolkova/thedot-site/src/lib/portal/frontmatter'
import { checkOnScreenTextBlock, readOnScreenTextOptOut } from '/Users/anastasiavolkova/thedot-site/src/lib/portal/on-screen-text-rule'
const dir = '/Users/anastasiavolkova/Kanset/portal-content'
const counts: Record<string, number> = {}
for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
  const raw = readFileSync(join(dir, name), 'utf8')
  const p = parseContentFile(raw, name)
  const v = checkOnScreenTextBlock({ contentId: p.content_id, format: p.format, blockKeys: p.copy_blocks.map((b) => b.key), optOut: readOnScreenTextOptOut(raw, name) })
  counts[v.status] = (counts[v.status] ?? 0) + 1
}
console.log(counts)
EOF
cd ~/thedot-site && pnpm exec tsx /tmp/kanset-onscreen-smoke.ts; rm -f /tmp/kanset-onscreen-smoke.ts
```

Expected: an object with `present`, `missing` and `not-applicable` counts summing to the number of canonical `.md` files (93 on 2026-10-03; `missing` about 41, `opted-out` absent because no file carries the key yet). No exceptions. If a parse error appears for a file, it is pre-existing and unrelated; note it and continue.

- [ ] **Step 7: Note the exit code in the manual**

In `docs/PORTAL-AGENT-MANUAL.md` section 17 (Testing), after the `pnpm exec next build` bullet, add:

```
- `scripts/update-portal.ts` refuses (exit code 5) a sync or re-share of a `reel`, `short`,
  `vertical_video`, `carousel` or `single` canonical without an on-screen text block
  (`reel-script`, `on-screen-copy`, `carousel-copy`, ...), unless its frontmatter declares
  `on_screen_text: captions_only` (talking-head clips whose only on-screen text is dialogue
  captions). Rule: `src/lib/portal/on-screen-text-rule.ts`; spec 2026-10-03 section 9.3. Applying
  Maria's own edits (`portal-inbox apply-edit`) is deliberately not gated.
```

- [ ] **Step 8: Commit**

```bash
cd ~/thedot-site
git add scripts/update-portal.ts src/lib/portal/update-portal-on-screen-wiring.test.ts docs/PORTAL-AGENT-MANUAL.md
git commit -m "Refuse a reel or carousel sync that is missing its on-screen text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Skill text for the production rule (APPLY AFTER APPROVAL)

**Do not apply until Anastasia has read this text and said yes** (her discuss-before-changing rule for skill and system work). `~/Kanset` is not a git repository, so there is no commit; record the approval and date in the hand-off. Code from Tasks 9-10 can ship without this text; the CLI message itself explains the fix.

**Files:**
- Modify: `~/Kanset/.claude/skills/kanset-production-workflow/SKILL.md`
- Modify: `~/Kanset/.claude/skills/kanset-graphic-design/SKILL.md`

- [ ] **Step 1: Show Anastasia the four edits below and wait for her yes**

- [ ] **Step 2: kanset-production-workflow, frontmatter example (section "Portal content format")**

Replace the line

```
format: carousel                             # reel | carousel | single | story | article
```

with

```
format: carousel                             # reel | short | vertical_video | carousel | single | story | article | podcast | podcast_article | post | linkedin-post
on_screen_text: captions_only                # OPTIONAL, rare. Only for a talking-head clip whose ONLY on-screen text is dialogue captions. Omit otherwise.
```

- [ ] **Step 3: kanset-production-workflow, new rule paragraph**

Directly after the paragraph that begins `Rules: exactly ONE \`<!-- internal -->\` marker`, add:

```
**On-screen text ships with the piece (rule since 2026-10-03, after the 2026-10-02 take-down).** Any `reel`, `short`, `vertical_video`, `carousel` or `single` whose media shows text carries that text as a client-facing block, frame by frame or slide by slide, in the words that are actually on screen: `<!-- portal-block:reel-script -->` for animated reels and Shorts, `on-screen-copy` for a talking-head clip's question card, cover or end card, `carousel-copy` for carousels and singles. Maria approves the copy and the frames together; a caption block alone is not a review of the media. `update-portal` refuses the sync (exit code 5) without one. The only exception is a clip whose sole on-screen text is dialogue captions (for example a Kanset Talks cut): declare `on_screen_text: captions_only` in the canonical frontmatter. Ask Kanset clips show a question card, so they need `on-screen-copy`, not the exception. When a frame changes in the build, update the block in the same task, so the block and the render never disagree.
```

- [ ] **Step 4: kanset-production-workflow, per-piece flow step 8 ("Record")**

At the end of step 8's list of what every content pack must include, after item **(d)**, add:

```
 **(e) for any piece with text on the media, the on-screen text block** (`reel-script`, `on-screen-copy` or `carousel-copy`, see "On-screen text ships with the piece"), matching the final render word for word.
```

- [ ] **Step 5: kanset-graphic-design, "Hand off cleanly"**

Add as the first bullet of the section:

```
- Before hand-off, write or update the pack's on-screen text block (`reel-script` for reels and Shorts, `carousel-copy` for carousels and singles, `on-screen-copy` for a talking-head question card or end card) from the FINAL render, frame by frame, with each frame's timing. The block is what Maria reads before she approves; if it disagrees with the frames she approves something she has not seen. `update-portal` refuses a reel or carousel without it.
```

- [ ] **Step 6: Mirror check**

Run: `ls ~/Kanset/.agents/skills/kanset-production-workflow/SKILL.md ~/Kanset/.agents/skills/kanset-graphic-design/SKILL.md 2>/dev/null`
If either file exists, apply the same edits there so the Codex mirror does not drift. Then confirm no em dashes were introduced:

Run: `grep -n '—' ~/Kanset/.claude/skills/kanset-production-workflow/SKILL.md ~/Kanset/.claude/skills/kanset-graphic-design/SKILL.md | head`
Expected: no new lines from these edits.

---

### Task 12: Verify, freeze, review, deploy

- [ ] **Step 1: Full test suite**

Run: `cd ~/thedot-site && pnpm test`
Expected: all files pass, including the 10 new test files (`tokens.css.test.ts`, `danger-token.test.ts`, `TickDot.test.tsx`, `TickDot.css.test.ts`, `ReviewDots.test.tsx`, `ReviewDots.css.test.ts`, `portal-share-metadata.test.ts`, `piece-metadata.test.ts`, `on-screen-text-rule.test.ts`, `update-portal-on-screen-wiring.test.ts`) and the extended `Button.css.test.ts` and `tokens.test.ts`.

- [ ] **Step 2: Types for every touched file**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -E 'portal-share-metadata|piece-metadata|piece/\[contentId\]/page|client/layout|\[slug\]/layout|on-screen-text-rule|update-portal|danger-token|DecideForm|CommentThread|SchedulePanel|IdeaDecisionForm'`
Expected: no output.

- [ ] **Step 3: One production build (the only full build in this plan)**

Run: `pnpm --filter @thedot/design-system build && pnpm exec next build`
Expected: build succeeds; `/client/[slug]/piece/[contentId]` listed as a dynamic route. Do not start `next start` or a dev server afterwards.

- [ ] **Step 4: Freeze and record the hash**

Run: `git status --short && git log --oneline -10 && git rev-parse HEAD`
Expected: only the pre-existing unrelated entries (`.gitignore`, `.pnpm-store/`, `.tmp-portal-session/`) remain uncommitted; the last 10 commits are this plan's. Record the HEAD hash; review that hash, never the working tree.

- [ ] **Step 5: Code-review pass, then Anastasia's go-ahead**

Run the `code-review` skill on the frozen hash from Step 4 (no Codex lane); fix findings in new commits, rerun Steps 1 to 4 and freeze a new hash. Then show her the hash and review outcome, and, because it changes visible colours and the share card, tell her in a few lines: the reds unify to one deep red (admin rust included), the billing and evidence panels now render on `#fffefc` instead of transparent or `#f7f6f2`, pasted portal links preview as "Kanset Portal" instead of The Dot's marketing card, the browser tab reads "Kanset · <piece title>" for a signed-in viewer, and no visual on Maria's page changes otherwise (TickDot, ReviewDots and the glow are unused until Plan 2). Push only on her go.

- [ ] **Step 6: Deploy (after her go)**

Run: `git -C ~/thedot-site rev-parse HEAD && git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15`
Expected: the printed HEAD is the reviewed frozen hash; the push succeeds and Vercel builds production from the branch. No migration to apply first. If the remote branch moved, pull with `--ff-only` (or rebase onto it), rerun Steps 1 to 4, re-review the new hash and get the go-ahead again.

- [ ] **Step 7: Verify live, without touching Maria's seat**

First watch the Vercel deployment for the pushed commit reach Ready and confirm its commit is the frozen hash.

Unauthenticated, no leakage (the share-preview view):

```bash
curl -sL https://www.thedotcreative.co/client/kanset/piece/kanset-2026-10-foreign-worker-cost-reel \
  | grep -oE '<title>[^<]*</title>|<meta property="og:title" content="[^"]*"|<meta name="robots" content="[^"]*"'
```

Expected: `<title>Kanset Portal · The Dot</title>`, `og:title` `Kanset Portal`, robots `noindex, nofollow`; the piece title appears nowhere; "The Dot Creative Agency" appears nowhere.

Signed in: open the same piece as the **preview seat** (`toodokie@gmail.com`, via the admin-minted link, never Maria's account) in the built-in browser or an existing browser session and read the tab title. Expected: `Kanset · <the piece's title>`. Also open `/admin/portal` and one client form error state if one is easy to trigger, and confirm the danger red renders (not black or transparent).

- [ ] **Step 8: Cleanup statement for the hand-off**

State: no worktree created; `/tmp/kanset-onscreen-smoke.ts` removed in Task 10; `.next/` build output and `packages/design-system/dist/` are git-ignored build artefacts left in place (normal for this repo); no dev server or browser automation process left running. Then run a code-review pass (the `code-review` skill) on the recorded hash; there is no Codex lane (Anastasia, 2026-09-21).

---

## Self-review

**Spec coverage (Plan 1 scope):**
- Share title `Kanset · <piece title>`, noindex, session/RLS respected, no leakage: Tasks 7 and 8 (and Task 7 fixes the marketing card inheritance that actually caused the generic share title).
- `--dot-off-white #fffefc`: Task 1.
- Danger token replacing `#9f241b`, `#c0392b`, `#b4502f` with a usage audit: Tasks 1 and 2 (audit list in Task 2, regression scan).
- Highlighter gradient token: Task 1 (`--dot-grad-highlight` for added text, `--dot-grad-highlight-soft` for updated passages, both from the v3 mockup).
- Yellow glow token: Task 1 (`--dot-grad-glow`).
- ReviewDots with the core yellow radial gradient: Task 5 (fills with `--dot-grad-fill`, which is exactly `radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6)`, asserted in Task 1).
- TickDot (hairline circle that fills): Task 4.
- Button glow on hover/focus for the yellow variant: Task 3.
- Package patterns (component folder, `index.ts`, CSS module, test, story, root export): Tasks 4-6.
- Production rule check in update-portal with an explicit opt-out flag: Tasks 9 and 10 (refuses; preview refuses too, so it reads as a warning before `--apply`).
- Skill doc text, marked apply after approval: Task 11.
- Engineering rules (one editor, frozen commit, tests, branch, no UI before migrations): header section and Task 12.

**Deliberately not in Plan 1:** moving the inline styles and hand-built chips into CSS modules (spec 9.4 third bullet) belongs with the layout rewrite in a later plan, because those components are being replaced; the tick gating of Approve (spec 4.3) is page logic for a later plan; `TickDot`/`ReviewDots` are built but not yet placed on the page.

**Placeholder scan:** no TBD/TODO; every code step has full code; every command has an expected result.

**Type consistency:** `clientDisplayName`, `PORTAL_NOINDEX`, `PORTAL_SITE_NAME`, `portalShareMetadata` defined in Task 7 and used with the same names in Task 8. `getPieceItem` and `resolvePieceMetadata` defined in Task 8 and used in `page.tsx` in the same task. `checkOnScreenTextBlock`, `readOnScreenTextOptOut`, `ON_SCREEN_TEXT_BLOCK_KEYS`, `OnScreenTextOptOut` defined in Task 9 and used with the same signatures in Task 10. `refuseMissingOnScreenText(parsed, canonicalRaw, canonicalName, report)` defined and called with that argument order in Task 10, and the wiring test searches for `refuseMissingOnScreenText(`.

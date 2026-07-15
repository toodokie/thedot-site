# Design Spec — `@thedot/design-system`

**Date:** 2026-07-15
**Author:** Anastasia Volkova (with Claude)
**Status:** Approved design → ready for implementation plan

## 1. Goal & context

Extract a small, clean, **standalone React component library** from the `thedot-site`
Next.js marketing site so it can be synced to **Claude Design** via `/design-sync`
(storybook shape). Claude Design's design agent will then compose on-brand designs from
these real components.

`thedot-site` today is a Next.js *application*, not a component library: its "components"
are page/feature sections coupled to `next/image`, data files, and API routes, styled by a
~6,000-line Webflow-exported `globals.css` with non-semantic class names (`.hack42-*`).
This library is a fresh, semantic extraction — **not** a port of that CSS.

### Decisions (locked)
| Decision | Choice |
|---|---|
| End goal | Feed Claude Design **+** be clean enough for the site to adopt later. **Do not refactor the site now.** |
| Location | In-repo workspace package (`packages/design-system/`) |
| Package name | `@thedot/design-system` |
| Build | `tsup` → `dist/` (ESM + `.d.ts` + bundled CSS), React externalized |
| Styling | Design tokens (CSS variables) + per-component **CSS Modules** |
| Storybook | **Yes** — one story per component; the render source `/design-sync` verifies |
| First-cut scope | **Approach A — Foundation set (~13 components)** |
| Fonts | Adobe Typekit kit `gac6jnd` (`futura-pt`, `ff-real-text-pro`) via `<link>` |
| **Brand source of truth** | **Figma "The Dot Styleguide"** (`26JZoEUiX2geZRTPjfcgXq`) for palette + vector assets |

### Source reconciliation (Figma vs site CSS)
Pulled from Figma via REST API. Figma is authoritative where it defines something; the site
CSS fills the gaps Figma doesn't cover:
- **Palette — Figma.** Figma names 4 styles (The Dot Black, Cream, Yellow, Pure White). Per the
  **superset** decision we also keep two greys from the Claude Design palette (`#7a776f`, `#47453f`)
  as brand tokens. **6 colors total.**
- **Vector assets — Figma.** 3 components exported as SVG: `Main Logo`, `Favicon`, `Dot Pattern`
  (the signature dot device, now vector — supersedes the raster poster).
- **Type scale & gradients — site CSS.** Figma has **no named text styles and no gradient styles**,
  so the type scale and the yellow-gradient library remain sourced from `globals.css`.

## 2. Architecture & package layout

```
package.json                       → add "workspaces": ["packages/*"]  (additive; app build unaffected)
packages/design-system/
  package.json                     → @thedot/design-system; peerDeps react/react-dom ^19; build via tsup
  tsup.config.ts                   → entry src/index.ts; format esm; dts; external react; emit dist/index.css
  tsconfig.json
  .storybook/  main.ts  preview.ts → framework react-vite; preview loads Typekit + tokens.css + fonts.css
  src/
    index.ts                       → barrel export (components + token TS)
    tokens/    tokens.css  tokens.ts
    styles/    fonts.css  reset.css
    assets/    main-logo.svg  favicon.svg  dot-pattern.svg   (from Figma)
               shape-6-2.svg  shape-6-3.svg  shape-7-1.svg  arrow.svg  stripe.png   (from public/images)
    components/<Name>/  <Name>.tsx  <Name>.module.css  <Name>.stories.tsx  index.ts
  dist/                            → build output = exactly what /design-sync bundles
```

- `styles/tokens.css` is `@import`ed by the stylesheet that reaches designs, so tokens are in
  the CSS closure `/design-sync` ships (a required invariant of the sync format).
- The site is untouched. Adding `workspaces` to the root `package.json` is additive and does
  not change `next build`.

## 3. Tokens & CSS strategy

**`tokens/tokens.css`** — CSS custom properties, the single source of truth:

```css
:root{
  /* Brand palette — Figma "The Dot Styleguide" is source of truth (superset: 6) */
  --dot-black:#35332f;     /* The Dot Black — text, solid dots, buttons */
  --dot-cream:#faf9f6;     /* The Dot Cream — primary canvas/background */
  --dot-yellow:#daff00;    /* The Dot Yellow — THE accent, almost always a gradient */
  --dot-white:#ffffff;     /* Pure White — elevated surfaces */
  --dot-grey:#7a776f;      /* Warm grey — secondary text, captions, meta */
  --dot-graphite:#47453f;  /* Graphite — secondary dark, borders, dark surfaces */
  --dot-yellow-pale:#eefb9d;  /* gradient midtone ONLY, never a flat fill */
  --dot-hairline:#ebebe7;     /* 1px borders (used instead of shadows) */

  /* Signature gradients (from site CSS — Figma defines none) */
  --dot-grad-fill:radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6);
  --dot-grad-corner:radial-gradient(circle farthest-corner at 100% 0%, #daff00cf, #eefb9dbd 34%, #faf9f6 53%);
  --dot-grad-edge:radial-gradient(circle farthest-corner at 100% 50%, #daff00a1, #faf9f6);
  --dot-grad-wash:linear-gradient(to bottom, #faf9f6, #daff00a3);
  --dot-grad-96:linear-gradient(96deg, #faf9f6, #daff00);
  --dot-grad-135:linear-gradient(135deg, #daff00 0%, #faf9f6 100%);

  /* Type (from site CSS — Figma has no named text styles) */
  --dot-font-display:'futura-pt','Futura','Avenir Next','Helvetica Neue',Arial,sans-serif;
  --dot-font-text:'ff-real-text-pro',sans-serif;
  --dot-weight-light:200; --dot-weight-book:300; --dot-weight-medium:500; --dot-weight-demi:600;
  --dot-text-hero:clamp(3rem,8vw,6rem);  --dot-text-h1:clamp(3rem,8vw,5rem);
  --dot-text-h2:clamp(2.5rem,6vw,4rem);  --dot-text-section:4.2rem;   /* Real Text, -0.02em */
  --dot-text-h3:clamp(1.5rem,4vw,2.375rem); --dot-text-h4:clamp(1.25rem,3vw,1.875rem);
  --dot-text-body:1.0625rem; --dot-text-eyebrow:0.78rem;

  /* Space (4px base) + radius */
  --dot-space-1:4px; --dot-space-2:8px; --dot-space-3:12px; --dot-space-4:16px;
  --dot-space-5:24px; --dot-space-6:32px; --dot-space-7:48px; --dot-space-8:64px;
  --dot-radius:0;         /* sharp by default */
  --dot-radius-circle:50%;
}
```

- **`tokens.ts`** re-exports the same values as JS constants for consumers who prefer tokens in TS.
- **Components** style via CSS Modules referencing `var(--dot-*)` — semantic class names, zero `.hack42-*`.
- **`styles/reset.css`** — minimal box-sizing/margin reset scoped to library components.
- **`styles/fonts.css`** — documents the Typekit `<link href="https://use.typekit.net/gac6jnd.css">`;
  Storybook preview injects it. The conventions header tells the design agent to include it.

## 4. Component inventory & APIs (Approach A — 13)

| Component | Key props | Notes |
|---|---|---|
| `Heading` | `level:1\|2\|3\|4`, `variant?:'display'\|'section'`, `as?` | H1/H2 Futura (thin); H3/H4 + `section` use Real Text |
| `Text` | `size:'lg'\|'md'\|'sm'`, `tone?:'black'\|'grey'\|'graphite'`, `as?` | Real Text body |
| `Eyebrow` | `tone?`, `children` | uppercase Futura 600, wide tracking |
| `Button` | `variant:'black'\|'yellow'\|'ghost'`, `size?:'md'\|'sm'`, `as?:'button'\|'a'` | sharp corners, uppercase, 2px border |
| `Card` | `eyebrow?`, `title?`, `children` | hairline border, flat (no shadow) |
| `Tag` | `tone:'yellow'\|'black'`, `children` | uppercase pill |
| `Input` | `label?`, `invalid?`, native input props | black focus, sharp |
| `Textarea` | `label?`, `invalid?`, native textarea props | matches Input |
| `Selector` | `selected?`, `onSelect?`, `size?`, `children` | **signature: yellow-gradient fill on hover/selected** |
| `Dot` | `fill:'silver'\|'black'\|'yellow'`, `size?` | gradient-filled circle |
| `DotGrid` | `cols`, `rows`, `pattern?` | the signature device; renders `dot-pattern.svg` or a token-built grid |
| `Stripe` | `tone?` | full-width vertical-line divider |
| `Arrow` | `direction?:'up'\|'down'\|'left'\|'right'` | brand arrow asset |

Each component: one clear purpose, typed props (`<Name>Props` exported), styled only via its
`.module.css` + tokens, and one Storybook story covering its variants.

## 5. Storybook, build & verification

- **Storybook** (v8, `@storybook/react-vite`): co-located `*.stories.tsx`; `preview.ts` loads Typekit,
  `tokens.css`, `fonts.css`, `reset.css` so stories render exactly on-brand. This is the render
  source `/design-sync` screenshots and verifies against.
- **Build** (`tsup`): emits `dist/index.js` (ESM), `dist/index.d.ts`, `dist/index.css`
  (tokens + all component CSS, with `tokens.css` in the `@import` closure), and copied `assets/`.
  React/React-DOM are `peerDependencies`, externalized.
- **Tests** (light): Vitest + React Testing Library for the *interactive* components only —
  `Selector` (selection state), `Input`/`Textarea` (controlled behavior). Plus `tsc --noEmit`
  typecheck and a green build as the real gates. No exhaustive unit coverage (YAGNI).

## 6. `/design-sync` handoff

Once `dist/` builds and Storybook renders green:

1. Run `/design-sync` → detects **storybook shape** → creates a new Claude Design project.
2. It screenshots each story, verifies preview fidelity against the Storybook render, and uploads
   the compiled bundle + per-component `.d.ts` / `.prompt.md` / preview cards.
3. **Conventions header** (`.design-sync/conventions.md`, authored by us): no provider wrapper is
   required beyond loading the Typekit `<link>` and importing `dist/index.css`; the styling idiom
   is *"components are pre-styled — use `var(--dot-*)` tokens for your own layout glue; there are no
   utility classes."* Names/tokens validated against the built artifacts before commit.

## 7. Out of scope (YAGNI)

- **Approach B** section shells (`Section`, `Hero`, `Header`, `Footer`, `QuoteBlock`) — fast-follow after the pipeline is proven.
- **Approach C** multi-step forms (`ProjectBrief`, `EfficiencyBrief`, `ProjectEstimate`, `ConversionDiagnostic`) — data/API-coupled, weak as DS parts.
- Any change to the live site (`src/**` stays as-is).
- Dark mode (site is light-only).
- Social icons (`icons8-*`, `iconmonstr-*`) and `example*` placeholder images.

## 8. Assets

**From Figma** (`26JZoEUiX2geZRTPjfcgXq`, exported SVG, staged in `brand-kit/figma/`):
- `main-logo.svg` — vector wordmark
- `favicon.svg` — vector favicon
- `dot-pattern.svg` — **the signature dot device** (grid of solid + silver-gradient circles), vector

**From `public/images`:**
- `arrow.svg` (decorative arrow), `stripe.png` (vertical-line divider), `shape-6-2/6-3/7-1.svg`,
  `dot-motif.svg` — brand graphic motifs.

All land in `packages/design-system/src/assets/` during implementation and are re-exported where a
component needs them (`Arrow`, `Stripe`, `DotGrid`).

## 9. Assumptions & risks

- **Figma token as secret:** the personal access token was shared in chat and must be **rotated**
  after extraction. It is stored at `~/.figma-token` (read-only, outside the repo) and referenced
  via `$(cat ~/.figma-token)`; never committed.
- **Typekit reachability:** fonts load via Adobe's hosted `<link>`. If `/design-sync`'s screenshot
  environment can't reach Typekit, previews fall back to system fonts. Mitigation: document the link
  in the conventions header; accept fallback if Adobe licensing forbids self-hosting.
- **CSS Modules + tsup CSS bundling** is the fiddliest build step. Fallback: Vite library mode.
- **Workspaces:** adding `"workspaces"` to root `package.json` is additive; verify `next build`
  and `npm ci` still succeed after the change.
- **`dot-pattern.svg` is 855 KB** (hundreds of gradient circles). If bundle size matters, `DotGrid`
  may render a token-built CSS grid instead of inlining the SVG, keeping the SVG as an optional asset.

## 10. Milestones (for the implementation plan to expand)

1. Workspace + package scaffold (`package.json` workspaces, `packages/design-system/` with tsup, tsconfig).
2. Tokens (`tokens.css`/`tokens.ts` — the 6 Figma-sourced brand colors + gradients + type), `fonts.css`, `reset.css`.
3. Assets: bring the 3 Figma SVGs + `public/images` brand graphics into `src/assets`.
4. Primitives A: `Heading`, `Text`, `Eyebrow`, `Button`, `Tag`, `Card`.
5. Form fields: `Input`, `Textarea`, `Selector`.
6. Brand devices: `Dot`, `DotGrid`, `Stripe`, `Arrow`.
7. Storybook setup + one story per component.
8. Green build (`dist/`) + light interactive tests + typecheck.
9. `/design-sync` (storybook shape) + author & validate conventions header.

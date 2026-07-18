# design-sync notes — @thedot/design-system

## Config decisions
- **`cssEntry: dist/index.css`** — component CSS lives in a SEPARATE tsup-emitted stylesheet (CSS Modules + tokens), NOT imported by the JS entry. Without `cssEntry` the scrape finds nothing and every preview renders unstyled. `cssEntry` resolves relative to the PACKAGE root (`packages/design-system/`), not repo root. [GENERAL]
- **`titleMap {Assets: null}`** — the `Brand/Assets` story is a showcase (logo / dot-pattern SVGs), not a component export; excluded.
- Fonts are Adobe Typekit (`futura-pt`, `ff-real-text-pro`) loaded via a remote `@import` in `dist/index.css` → `[FONT_REMOTE]` (not `[FONT_MISSING]`). Verified both display + body fonts render on both compare panels.
- `--node-modules` is the REPO-ROOT `node_modules` (npm workspace hoists `react` there; `packages/design-system/node_modules` lacks it). `--entry packages/design-system/dist/index.js`.

## Re-sync risks (watch on next sync)
- **Typekit CDN dependency:** fonts load from `use.typekit.net/gac6jnd.css` at runtime. If the kit id changes or Typekit is unreachable, previews silently fall back to system fonts — re-verify a text component (Heading/Text) renders real Futura/Real Text after any font-related change.
- **Stale dist:** re-run `buildCmd` (`npm run build --workspace @thedot/design-system`) before the converter so `dist/index.css` + `dist/index.js` are fresh; a stale dist desyncs component CSS from the JS bundle.
- **Story caps:** every component has ≤2 stories, all graded from images — no capped/ungraded tail.
- **Assets story:** if `Brand/Assets` is renamed, or real asset components are added later, revisit `titleMap`.
- **First sync verdict:** all 13 components graded `match` (every story) on the first pass — no `close` accepted, no skips.

## Type system — SOURCE OF TRUTH IS THE WEBSITE (globals.css), not Figma
- Body copy = `ff-real-text-pro` **weight 300** (light), **1rem/16px**, line-height **1.5** (site `.service-card p` etc.). Earlier shipped 400/17px/1.55 — too heavy; corrected 2026-07-17.
- H1 = Futura **400** (added `--dot-weight-regular:400`; H1 was 200). H2/hero = Futura 200. H3/H4/section = Real Text 300.
- When DS and site disagree on type, match `src/app/styles/globals.css`.

## Body type — MEASURE THE LIVE RENDERED SITE, not globals.css (2026-07-18)
`globals.css` is overridden by styled-jsx, so its declared weights ≠ what renders. Measure the live
page with Playwright `getComputedStyle` (browser UA to pass the bot-block; Typekit loads on the real domain):
  node .ds-sync/... (see scratchpad inspect-blog.cjs) → https://www.thedotcreative.co/blog + a post.
- **Body copy (article `p`): ff-real-text-pro weight 200, 16px, line-height 1.8, #333.**
- **Card excerpt (blog card): weight 200, 20px, line-height 1.6, #555.**
- Blog card title: futura-pt 400, ~1.8rem, lh 1.3. Category chip: real-text 500, 0.8rem, 0.5px.
- So DS `Text` base weight = **200 (light)**, not 300/400 (both earlier guesses were wrong).
- **Logo** component inlines the wordmark as a data URI (the Figma svg is raster-in-svg) so it renders in Claude Design.

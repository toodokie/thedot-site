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

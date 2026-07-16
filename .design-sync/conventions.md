# The Dot Creative — Design System

Real compiled components from `@thedot/design-system` (13 components). The brand: **mono + one acid-yellow**, warm off-white canvas, **sharp corners (radius 0)**, thin Futura display type. The **dot** is the signature device (`Dot`, `DotGrid`).

## Setup / wrapping
- Wrap your layout in an element with class **`dot-root`**. It sets the branded base: cream background (`--dot-cream`), ink text (`--dot-black`), and the body font. Without it your own layout elements fall back to browser defaults (white bg, serif) — the library components stay styled regardless, but the page won't read as The Dot.
- Fonts (Adobe Typekit `futura-pt` display + `ff-real-text-pro` body) load automatically via the stylesheet's `@import` — no extra font setup.
- Components are **pre-styled and self-contained**. Never add classes to them; style via props (e.g. `variant`, `tone`, `size`).

## Styling idiom — tokens, NOT utility classes
There are **no utility classes**. Style your own layout glue with these CSS custom properties (all defined in the bound `styles.css` / `_ds_bundle.css`):
- **Color:** `--dot-black` #35332f · `--dot-cream` #faf9f6 (canvas) · `--dot-yellow` #daff00 (accent) · `--dot-white` · `--dot-grey` #7a776f · `--dot-graphite` #47453f · `--dot-hairline` #ebebe7 (1px borders — use hairlines, never shadows).
- **Yellow is a gradient, not a flat fill:** `--dot-grad-fill` (circle/shape fill) · `--dot-grad-corner` · `--dot-grad-edge` · `--dot-grad-wash` · `--dot-grad-96` · `--dot-grad-135` · `--dot-grad-silver` (the dot pearl).
- **Type:** `--dot-font-display` (Futura) · `--dot-font-text` (Real Text) · weights `--dot-weight-light|book|medium|demi` (200/300/500/600) · sizes `--dot-text-hero|h1|h2|section|h3|h4|body|eyebrow`.
- **Space:** `--dot-space-1`..`--dot-space-8` (4→64px). **Radius:** `--dot-radius` (0, sharp — the default) · `--dot-radius-circle`.

## Principles
Sharp corners. Warm cream canvas, never pure white. One loud accent (yellow, always as a gradient — never a flat block). Thin Futura for headlines. Reach for the dot before any other shape.

## Where the truth lives
Read the bound `styles.css` (and the `_ds_bundle.css` it `@import`s) for the exact tokens and component classes, and each component's `.prompt.md` / `.d.ts` for its API.

## One idiomatic snippet
```tsx
<div className="dot-root" style={{ padding: 'var(--dot-space-7)' }}>
  <Eyebrow>Selected work · 2026</Eyebrow>
  <Heading variant="display">Brands that attract</Heading>
  <Text size="lg" tone="grey">Websites that convert, systems that grow.</Text>
  <div style={{ display: 'flex', gap: 'var(--dot-space-4)', marginTop: 'var(--dot-space-6)' }}>
    <Button variant="yellow">Start a project</Button>
    <Button variant="ghost">View work</Button>
  </div>
</div>
```

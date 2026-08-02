# Brand Production Kit — keeping AI-generated video & images on brand

The reference every reel, keyframe, and AI generation points to. **Source of truth: the live site + `@thedot/design-system` tokens, NOT Figma.** Master visual reference: `brand-kit/brand-board.html` (render to PNG and feed it in).

## Two surfaces — do NOT confuse them
- **WEBSITE UI** = warm light. Cream canvas, never pure white, **never dark**. (The site has never used a dark background.)
- **SOCIAL / VIDEO** (reels, the AI-member avatar) = **editorial grunge is allowed and on-brand.** The @thedotcreativeagency feed already uses **charcoal grounds, halftone cut-outs, glitch texture, film grain, old-newspaper tones, and bold *sparse* yellow** (see "FREE COSTS", "BRANDING" posts). Match the surface. The rules below marked *(UI)* are website-only; everything else holds on both.

### Social / video visual language (reels + avatar)
Animated **cut-out stickers** with halftone/dithered edges · **old-newspaper palette used carefully and sparsely** (halftone B&W, newsprint grey, aged paper) · deep charcoal grounds where the beat suits · film grain + subtle glitch · editorial magazine mastheads/labels · bold condensed display type · acid-yellow as the **single sparse bold accent** (a headline hit, a marker highlight, one cut-out) — never a wash. Elegant but bold: grit in the imagery, precision in the type.

### Typography — LOCKED to the design system
**Fonts (no substitutes, ever):**
- Display / headlines → **futura-pt** (fallbacks: Futura, Avenir Next). This IS the Bauhaus font — Paul Renner, 1927, a geometric sans from the circle and the line — so the Bauhaus instinct is the brand's *existing* display face, not a new one. Never a decorative "Bauhaus" display font.
- Body / captions → **ff-real-text-pro**.

**Weight by surface (they differ — do not cross them):**
- **Website UI** headings ship **light, weight 200** (`--dot-weight-light`) — airy, elegant. Site default. DS weights top out at demi 600.
- **Social / reels / avatar** → **bold futura-pt** (a heavier cut than the DS defines), matching the FREE COSTS / BRANDING posts. Same font, bolder weight. Do not make the site bold or the reels wispy.

**The hard lock (the real one):** futura-pt and ff-real-text-pro load via **Adobe Typekit (kit `gac6jnd`), which is domain-locked — AI generation tools cannot render them.** Any type an AI "types" is a lookalike and will drift. So **all brand-critical type (headlines, mastheads, end-cards, marker highlights) is composited in the REAL fonts in post** (CapCut / Canva / the DS), never left as AI output. That is the only way to actually lock the typeface.

- Geometric + reductive layout: dot/circle first, then square and line; asymmetric grid; undecorated.
- One yellow accent, sparse.

## The 5 rules AI breaks by default
1. **Canvas is warm cream `#faf9f6` *(UI)*.** Never pure white, never dark **on the website**. On social/video, dark editorial grounds are allowed (see above).
2. **Acid-yellow `#daff00` is ALWAYS a soft radial glow** fading to cream, never a flat fill or yellow block. Signature: `radial-gradient(circle at 50% 50%, #daff00cc, #faf9f6)`. Pale yellow `#eefb9d` only lives *inside* those gradients.
3. **Sharp corners (radius 0), hairline borders `#ebebe7`.** No rounded corners, no heavy drop shadows.
4. **Five colors only:** cream, ink `#35332f`, yellow `#daff00`, graphite `#47453f`, warm grey `#7a776f`. Nothing else competes.
5. **The dot is the signature device** — a single circle or a grid of circles, some silver-gradient, some solid ink, some glowing yellow. Reach for it before any other shape.

## The locked prompt block (paste into EVERY generation)
> Warm cream canvas #faf9f6 (never white, never dark). Near-black ink #35332f for type and line. One accent: acid-yellow #daff00 used ONLY as a soft radial glow or a thin marker/underline/dot, never a flat yellow fill. Warm greys #47453f and #7a776f for secondary elements. Sharp corners, hairline borders, generous negative space. Clean geometric sans display type, Futura-like. Editorial, minimal, sophisticated, calm, a sense of luxury and air. Signature motif: a dot — a single circle or a grid of circles, some silver-gradient, some solid ink, some glowing yellow.

## Negative / avoid (use where the tool supports a negative prompt)
dark or black background, pure white background, flat yellow fill / yellow background block, neon, rounded corners, drop shadows, any gradient other than yellow-to-cream glow, extra accent colors, rainbow, generic corporate stock, glossy 3D, clutter, busy background, watermark.

## Visual references to FEED the tools
As Explainer "custom style reference" / Nano Banana reference images / product-photoshoot refs:
- `brand-kit/brand-board.html` → rendered PNG (master: palette + dot device + gradients in one frame)
- `brand-kit/decorative/dot-motif.svg`, `brand-kit/figma/dot-pattern.svg` (the dot device)
- `brand-kit/logo.png` / `brand-kit/figma/main-logo.svg`
- `brand-kit/media/the-dot-poster.webp` (brand in context)

## Consistency anchors (every episode matches the last)
- **Face** → the trained **Soul-ID** locks the AI member across all frames and episodes.
- **Style** → set ONE universal style key = the brand reference; reuse the same reference-image set every time.
- **Palette** → the `--dot-grad-fill` glow is the yellow. Never invent a new yellow treatment.

## The brand-finish pass (AI gets ~90%; we lock the last 10%)
AI will not nail exact hex, real fonts, the true dot, or the yellow *gradient*. Finish every asset in the design system / Canva / CapCut:
- Correct palette to exact hex; convert any flat yellow to the radial glow.
- Rebuild **hero type + end cards** in real Futura + exact tokens. AI renders text unreliably, so brand-critical type is composited, not generated.
- Add the true dot device / dot-grid and hairline borders from the DS.
- Burn captions in the brand type.

## QA gate — run on EVERY render before ship
Extract frames, check each against the 5 rules:
- [ ] Cream canvas, not white, not dark
- [ ] Yellow only as glow/marker, zero flat yellow blocks
- [ ] Sharp corners, hairline borders
- [ ] Only the 5 brand colors present
- [ ] Dot device present and correct
- [ ] Display type reads Futura-like; no gibberish AI text in hero elements
- [ ] No "Made with AI" disclosure tagline (removed 2026-07-31). The AI-member avatar self-discloses via its intro ("I'm the AI member of The Dot"); Meta's platform AI label is a per-post choice, not a baked-in tagline.
Any box fails → regenerate or fix in the finish pass. Verify against the **live site**, not Figma.

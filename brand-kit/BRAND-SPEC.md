# The Dot Creative — Design System Spec

**Digital design agency · GTA / Ontario · thedotcreative.co**
Extracted from production source (`src/app/styles/globals.css`, `layout.tsx`, live copy).

---

## 1. Brand essence
A design + business-systems agency. The identity is built on **one device: the dot.**
A field of circles — most **filled with a soft radial gradient**, a few solid ink — with the
wordmark set inside the grid. The whole system is **monochrome (warm off-white + near-black)
with a single acid-yellow accent**, `#daff00`, that almost always appears *as a gradient*, not a flat fill.

**Design principles**
1. **The dot leads.** Circles + the dot grid are the signature. Reach for them before any other shape.
2. **Mono + one yellow.** Warm off-white canvas, near-black ink, and `#daff00` — nothing else competes.
3. **Yellow is a gradient, not a fill.** The accent glows (radial/linear), it rarely sits flat.
4. **Sharp structure, thin type.** Corners at 0px, hairline rules, ultra-light Futura display.
5. **Warm, never cold.** Base is `#faf9f6`, never pure white or cold grey.

---

## 2. Color

### Primary (this is 95% of the brand)
| Name | Hex | Var | Use |
|---|---|---|---|
| Canvas | `#faf9f6` | `--background` / `--raw-white` | Every background. Warm off-white. |
| Ink | `#35332f` | `--foreground` | Text, rules, solid dots, primary buttons. |
| **Yellow** | `#daff00` | `--yellow` / `--highlight-color` | THE accent — highlights, gradient fills, `theme-color`. **17× in code.** |
| Pale yellow | `#eefb9d` | — | Gradient midtone only (softens yellow → canvas). |

### Support neutrals (quiet, warm)
| Name | Hex | Var | Use |
|---|---|---|---|
| Off-white | `#fffefc` | `--white-3` | Cards / elevated surfaces |
| Beige | `#ebead7` | `--beige` | Section backgrounds |
| Antique white | `#dac9bb` | `--antique-white` | Warm fills, dividers |
| Taupe | `#8f7165` | `--grey` | Secondary text |
| Warm grey | `#7a776f` | `--grey-2` | Captions, meta |
| Hairline | `#ebebe7` | `--white-smoke-2` | 1px borders (used instead of shadows) |

### Rare / legacy — do NOT treat as brand accents
`#ff7432` coral, `#78c8af` aquamarine, `#1e4145` slate green — **each appears once** in the codebase.
Keep out of the core palette unless deliberately reviving them.

> **This is what I got wrong before:** I showed coral / aquamarine / slate as co-equal accents. They aren't. The brand is **mono + one yellow.**

---

## 3. Gradients — the signature fill

Yellow almost never appears flat. These are the actual production gradients:

| Purpose | Value |
|---|---|
| **Circle / shape fill (core)** | `radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6)` |
| Corner glow (top-right) | `radial-gradient(circle farthest-corner at 100% 0%, #daff00cf, #eefb9dbd 34%, #faf9f6 53%)` |
| Edge glow (right) | `radial-gradient(circle farthest-corner at 100% 50%, #daff00a1, #faf9f6)` |
| Soft wash (bottom) | `linear-gradient(to bottom, #faf9f6, #daff00a3)` |
| Diagonal wash | `linear-gradient(96deg, #faf9f6, #daff00)` |
| Diagonal wash 135° | `linear-gradient(135deg, #daff00 0%, #faf9f6 100%)` |

**The dot fill:** circles are filled with a radial gradient. In the poster it renders as a
silver/pearl sphere (`radial at ~35% 30%, white → grey`); in the interactive UI the same circle
fills with the **yellow** radial gradient above (e.g. on hover of the round selectors).

---

## 4. The dot device
- Signature: a **grid of circles** (`border-radius: 50/100%`), mixed solid-ink and gradient-filled.
- Round selectors: `125 × 125px` circles, `border-radius: 100%`, hairline border, fill with the
  yellow radial gradient on hover.
- Wordmark sits **inside** the dot grid (see `media/the-dot-poster.webp`).

---

## 5. Typography (Adobe Fonts — Typekit kit `gac6jnd`)

**Families**
- **Futura PT** (`futura-pt`) — display & UI. Weights: 100/200 (light), 300 (book), 500, 600 (demi). Fallbacks: Futura, Avenir Next, Helvetica Neue, Arial.
- **FF Real Text Pro** (`ff-real-text-pro`) — body, subheads, and large editorial section titles. Weights 300–400.

**Scale (production)**
| Role | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| Hero | Futura PT | `clamp(3rem, 8vw, 6rem)` | 200–300 | 1.1 | — |
| H1 | Futura PT | `clamp(3rem, 8vw, 5rem)` | 400 | 1.1 | — |
| H2 | Futura PT | `clamp(2.5rem, 6vw, 4rem)` | 200 | 1.2 | — |
| Section title | **FF Real Text Pro** | `4.2rem` | 300 | 1.1 | `-0.02em` |
| H3 | FF Real Text Pro | `clamp(1.5rem, 4vw, 2.375rem)` | 300 | 1.3 | — |
| H4 | FF Real Text Pro | `clamp(1.25rem, 3vw, 1.875rem)` | 300 | 1.4 | — |
| Body | FF Real Text Pro | `1rem – 1.125rem` | 400 | 1.55 | — |
| Eyebrow / label | Futura PT | `0.7–0.82rem` | 600 | — | `0.12–0.22em`, UPPERCASE |

**Feel:** display type runs **thin** (200/300) at large sizes; labels/buttons run 600 uppercase with wide tracking. Note the big **section titles use the *text* font (Real Text Pro)**, not Futura.

---

## 6. Shape & layout
- **Border radius:** `0` by default (sharp). Only circles break this (`50/100%`). Avoid rounded rectangles.
- **Depth:** none — 1px hairline borders (`#ebebe7`), not shadows.
- **Buttons:** rectangular, 2px border, uppercase Futura 600, tracking ~0.1em. Variants: solid ink, yellow, ghost.

---

## 7. Decorative elements  (`decorative/`)
| Asset | What it is | How it's used |
|---|---|---|
| `vertical-line-stripe.png` | **Full-width band of fine vertical lines** (a ruler / tick stripe, 5762×22) | Section dividers site-wide — hero, projects, quotes |
| `dot-motif.svg` (`7_1.svg`) | Dot / circle motif | Background graphic on selector tiles |
| `shape-7-1.svg`, `shape-6-2.svg`, `shape-6-3.svg` | Brand line-shapes | Background graphics on diagnostic-tool tiles |
| `arrow.png` | Hand-styled arrow (300×300) | Inline directional accents |

---

## 8. Brand voice

**Positioning:** Strategic web design **+ business-systems integration** for growing Ontario / GTA businesses. Not "pretty websites" — **outcomes**: attract, convert, grow, save hours.

**Signature line (three-beat rhythm, uppercase):**
> **BRANDS THAT ATTRACT · WEBSITES THAT CONVERT · SYSTEMS THAT GROW**

**Two registers**
- **Punchy / marketing:** short, direct, benefit-first. Uppercase triads. Imperatives.
  *"Stop paying for disconnected tools." · "Strategic web design that actually works for your business." · "Save 10–20 hours monthly."*
- **Warm / brand-poetic:** for identity moments.
  *"Inspire brands to flourish." · "Convey meaning and creative spirit into everyday life." · "From refined visual identity to intelligent system integration."*

**Tone rules**
- ✅ Lead with the outcome (convert, grow, integrate, save time). Be specific ("10–20 hours").
- ✅ Use three-part rhythms and confident, plain language. Local & grounded (Ontario, GTA).
- ✅ Speak to *growing businesses*, not "users."
- ❌ No jargon-for-its-own-sake, no hype adjectives ("cutting-edge", "world-class"), no hedging.

---

## 9. Assets in this bundle
- `logo.png` — wordmark · `brand-board.html` — visual system (color, gradients, dots, type, voice) · `brand-in-use.html` — real media
- `media/` — the dot poster, 6 client heroes, layout signature
- `decorative/` — vertical-line stripe, dot motif, brand shapes, arrow

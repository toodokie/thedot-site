# The Dot Creative — site (agent guide)

Standing knowledge for any agent working in **`~/thedot-site`** (The Dot Creative Agency's real marketing site). Read this first. Hard-won findings from real sessions; keep it updated when you learn something new.

---

# ⚠️⚠️ THIS SITE HAS A DESIGN SYSTEM — USE IT FOR ALL NEW UI ⚠️⚠️

**Any agent building, generating, or restyling UI uses [`@thedot/design-system`](packages/design-system/).**
Do NOT hand-roll buttons/cards/inputs, do NOT invent colors or fonts, do NOT paste Webflow classes.
About to write a `<button>` or a hex color? **STOP — use the design system.**

- **Package:** `packages/design-system/` — workspace-linked, **13 components**. `dist/` is gitignored, so build once per clone: `npm run build --workspace @thedot/design-system`.
- **Use:** `import '@thedot/design-system/styles.css';` (once, at the root) then `import { Button, Card, Heading, DotGrid } from '@thedot/design-system';`. Gallery: `npm run storybook --workspace @thedot/design-system` (localhost:6006). Fonts: the Typekit `<link>` (kit `gac6jnd`) is already in `layout.tsx`.
- **Components:** `Heading` · `Text` · `Eyebrow` · `Button` · `Card` · `Tag` · `Input` · `Textarea` · `Selector` · `Dot` · `DotGrid` · `Stripe` · `Arrow`.
- **Rules:** style components via **props** (never add classes to them); style your own layout with **`var(--dot-*)` tokens** — NO utility classes, NO hardcoded hex; wrap layout in **`<div className="dot-root">`**; **yellow is always a gradient** (`--dot-grad-fill`), never a flat fill; **sharp corners** (`--dot-radius: 0`), hairline borders (`--dot-hairline`), warm cream canvas — never pure white; the **dot** (`Dot`/`DotGrid`) is the signature device.
- **Tokens (all in `styles.css`):** color `--dot-black #35332f` · `--dot-cream #faf9f6` · `--dot-yellow #daff00` · `--dot-white` · `--dot-grey #7a776f` · `--dot-graphite #47453f` · `--dot-hairline`; gradients `--dot-grad-fill/corner/edge/wash/96/135/silver`; type `--dot-font-display` (Futura) / `--dot-font-text` (Real Text) · `--dot-weight-light|book|medium|demi` · `--dot-text-hero|h1|h2|section|h3|h4|body|eyebrow`; space `--dot-space-1`..`8`; radius `--dot-radius`, `--dot-radius-circle`.
- **Source of truth = the WEBSITE.** For the **type system and anything the site and Figma disagree on**, match the live site / `src/app/styles/globals.css` — NOT Figma. (Figma "The Dot Styleguide" `26JZoEUiX2geZRTPjfcgXq` seeded the palette + vector assets only; the 6 colors above.) **Synced to Claude Design** project "The Dot Creative — Design System" — see the update loop in the design-system section. Spec + plan: `docs/superpowers/`.
- **⚠️ The `src/` app PREDATES the DS and is NOT migrated** (styled-jsx + the 6,000-line `globals.css` below). Don't assume site code uses the DS, and **don't mass-rewrite the site** unless explicitly asked. The DS is the **go-forward** standard for new UI and any restyle you're asked to do.

---

## What this is
- **Next.js 15.3.8** (App Router, Turbopack), TypeScript, deployed on **Vercel**. Component styling is mostly **styled-jsx** (scoped `<style jsx>`), plus a big global sheet at `src/app/styles/globals.css`.
- Marketing site + a **Notion-sourced blog** + interactive lead tools. Brand = warm mono (`#faf9f6` canvas, `#35332f` ink) with **one acid-yellow `#daff00` used as glow/marker, never flat fills**; sharp corners on buttons; fonts **futura-pt** (display) + **ff-real-text-pro** (body) via **Adobe Typekit** (kit `gac6jnd`, loaded in `layout.tsx`).
  - ⚠️ **Typekit fonts cannot load in claude.ai artifacts / any non-authorized domain** (kit is domain-locked). Preview brand pages via the real dev server (`npm run dev`, localhost is authorized), not artifacts.

## 🎨 Design system — USE IT for all UI (`@thedot/design-system`)
**When writing or restyling UI, build with the design system, do NOT hand-roll styled-jsx** (it fights the aggressive globals.css and comes out off-brand — see the styling gotcha below). This is the standing convention for code-writing agents.
- Local **workspace package** at `packages/design-system/` (v0.0.1, on the `feat/thedot-design-system` branch, built to `dist/`, symlinked into `node_modules/@thedot/design-system`). Ships its own reset + tokens + fonts CSS.
- Import: `import { Card, Heading, Text, Eyebrow, Tag, Arrow, Button } from '@thedot/design-system';`
- Exports:
  - **Heading** `{ level?: 1|2|3|4, variant?: 'display'|'section', as?, className }`
  - **Text** `{ size?: 'lg'|'md'|'sm', tone?, as?, className }`
  - **Eyebrow** `{ tone?, className }`
  - **Button** `{ variant?: 'black'|'yellow'|'ghost', size?: 'md'|'sm', as? (polymorphic) }`
  - **Card** `{ eyebrow?, title?, className, children }`
  - **Tag** `{ tone?, className }` · **Dot** `{ fill?, size? }` · **DotGrid** `{ cols, rows, gap, dotSize }` · **Stripe** `{ tone?, height? }` · **Arrow** `{ direction?, size? }`
  - **Input** / **Textarea** `{ label, invalid, ... }` · **Selector** `{ selected, onSelect, size }`
  - Tokens: `colors, fonts, radius, space, weights, assetPaths`
- If you edit DS source, rebuild it (`npm run build` in `packages/design-system`) before the app sees the change. When wrapping a `<Card>` in a Next `<Link>`, still add `text-decoration: none` on the link (globals.css underlines every link's text).
- **🔄 Updating the Claude Design copy — changed the DS? run `/design-sync`.** From the repo root, `/design-sync` re-syncs to the pinned project (`.design-sync/config.json`) and updates it in place. It's a **re-sync** (not a fresh import): it rebuilds, re-verifies **only the components you changed** (unchanged ones carry forward via the `_ds_sync.json` anchor), and re-uploads — minutes, not hours. Nothing to do in the Claude Design app. Everything it needs (project id, `cssEntry`/`titleMap` quirks, gotchas) lives in `.design-sync/` — read `.design-sync/NOTES.md` first. Fresh clones re-install the one-time tooling (`.ds-sync/` + Playwright chromium) on the first sync there. When verifying, the previews are graded against a freshly-built Storybook — **still confirm against the live site** (source of truth).

## 🚀 Deploy — READ THIS (the site is CLI-deployed, and it's fragile on flaky wifi)
- Production is deployed via **`vercel --prod`** from the working tree (NOT git-connected; the active branch `feat/thedot-design-system` is ~25 commits ahead of origin, unpushed). So a deploy ships the **local working tree**, committed or not.
- **On flaky/travel wifi, `vercel --prod` frequently dies with `read ETIMEDOUT`** on the `/v13/deployments` POST — but **Vercel still builds it server-side**. Do NOT trust the CLI exit code.
- ⚠️ **Deploys land OUT OF ORDER and STALE:** a timed-out deploy builds minutes later from whatever tree it uploaded, so the "newest" deployment in `vercel ls` can be an **older commit's build**. Trusting deployment IDs will fool you.
- ✅ **Reliable verification = assert the actual RENDERED BEHAVIOR on the prod domain**, not deployment IDs. Headless-render the page and check the specific DOM/CSS you changed:
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --dump-dom --virtual-time-budget=15000 --user-agent="Mozilla/5.0 Chrome/125" \
    "https://www.thedotcreative.co/blog?cb=$RANDOM"
  ```
  (add a `?cb=` cache-buster; the blog/home pages are client-rendered so give JS time to run.)
- Deployment **preview URLs are auth-protected (302)** — you can't render `thedot-site-<id>-....vercel.app` directly to verify code.
- `vercel promote <url>` and `vercel alias set <url> <domain>` both **error** ("Deployment belongs to a different team" / "don't have access to the domain"), but **the prod alias moves to the newest Ready production-target deployment on its own within a few minutes** — just wait and re-check `vercel inspect thedotcreative.co | grep -oE 'thedot-site-[a-z0-9]+'`.
- **`.vercelignore`** excludes `content/`, `brand-kit/`, `docs/` (~10MB, not used at runtime) to shrink uploads and help them land. Keep runtime assets in `public/`.
- Vercel project: `prj_b433SastpjIyachqjqJ19SshAQ9P`, team `team_Z42r476y4gC6Aeg2tyFopvlD`. Pull prod env with `vercel env pull <file> --environment=production --yes` (contains all secrets — treat as sensitive, delete after use).

## 🏗️ Build
- `npm run build`. `next.config.ts` has **`typescript.ignoreBuildErrors: true`** (repo carries ~130 pre-existing tsc errors; build still ships). A stale `.next` can throw a bogus `ENOENT ... _not-found/page.js.nft.json` during trace collection — `rm -rf .next` and rebuild.
- ⚠️ **macOS has NO `timeout` command** — `timeout … npx tsc` silently no-ops and reports a false "clean." Run `npm run build` / `npx tsc` directly.
- Local build logs a benign `Error syncing portfolio from Notion: API token is invalid` (the portfolio token only exists in prod env) — not a failure; build still exits 0.

## 📝 Blog CMS (Notion)
- Blog content lives in a Notion DB titled **"Website Blog"** (`227d0f0c2544805faf15c3eec46ad6e3`), env `NOTION_BLOG_DATABASE_ID` + `NOTION_BLOG_TOKEN`.
- **Full post body = Notion PAGE BODY BLOCKS** (converted to HTML by `src/app/api/blog/[slug]/route.ts` → `getFullPageContent`). The `Content` rich_text property is only a fallback. Supported blocks: paragraph, heading_1/2/3, bulleted/numbered list, quote, **callout** (→ `<div class="tech-note">`), code, divider; annotations: bold, italic, code, link. **No custom classes** beyond that mapping.
- A post goes live by flipping the **Status** select to `Published` (`/api/blog` filters on it). Fields: Title (title), Slug, Excerpt, Category (select), Tags (multi_select), Date, Featured (checkbox), Read Time, Word Count, Meta Title, Meta Description, Featured Image (files), Social Image (url).
- `BlogPostPage.tsx` emits **Article + FAQPage JSON-LD** (FAQ parsed from the post's `## Frequently asked questions` h2 → h3/p pairs).
- Blog list/index = `BlogPage.tsx`; single post page = `BlogPostPage.tsx` (both client-rendered, fetch `/api/blog*`).

## 🖼️ Images & covers (real gotchas)
- **Notion file URLs EXPIRE** (signed) — using them as `featuredImage` breaks the image after the API cache serves a stale URL. **Host covers in `public/images/blog/<slug>/cover.png`** and point Notion's Featured Image (external) + Social Image (url) at `https://www.thedotcreative.co/images/blog/<slug>/cover.png`.
- **`next.config.ts` `images.remotePatterns` must allow the host you use.** Same-origin absolute URLs are NOT exempt — `www.thedotcreative.co` + `thedotcreative.co` at `/images/**` are whitelisted so `<Image>` accepts the hosted cover. Without it, `<Image>` silently fails to render.
- Blog **index cards use a plain `<img>`** (no remotePatterns needed) while the **post hero uses `<Image>`** — they can render/size differently. Full-bleed cover art (1.9:1 with edge text) gets cropped by fixed card aspect ratios; use `object-fit: contain` + a warm backing, or provide a card-shaped (4:3) thumbnail.

## 🔧 AI-visibility self-check tool
- Route `/tools/ai-visibility` (`src/app/tools/ai-visibility/page.tsx`), API `src/app/api/ai-visibility/route.ts`, component `src/components/AiVisibilitySelfCheck.tsx`, shared prompts `src/lib/aivc-prompts.ts` (imported by BOTH API + component so **shown === run**). Embedded into any blog post that contains the `[[ai-visibility-tool]]` marker (BlogPostPage splits on it).
- Engine: OpenAI **gpt-5.2** (`AIVC_MODEL` env) + `web_search_preview`, run 3× with **three different real-customer by-need phrasings**; "named X/3." "Named" decided in CODE (`isSameBusiness`, requires the real name not a single shared generic word). Results **credit the engine** in small print, show the **matched name**, and write a **raw-output audit trail** to the Notion lead. Cost ≈ web search $10/1k calls = $0.01/call → ~$0.05–0.08/check; `$25` OpenAI hard cap is the backstop.
- Env (all set in prod): `OPENAI_API_KEY`, `SMTP_*`/`FROM_EMAIL`/`AGENCY_EMAIL` (report emails), `NOTION_AIVC_LEADS_DB_ID` + `NOTION_TOKEN` (lead capture to the "Prospective Clients Template" DB via the "Website Calculator Integration"). Diagnose prod errors via Vercel MCP `get_runtime_logs`.

## 🎨 Styling gotcha (bit us on the homepage journal section)
- **`globals.css` is aggressive and bleeds into components:** `a { text-decoration: underline }` (line ~72) underlines every link's text (and, via propagation, its children), and there are global heading `text-transform: uppercase` rules. **Scoped styled-jsx does NOT automatically win** — you must explicitly reset (`text-decoration: none`, `text-transform: none`) on your links/headings, often with `!important`, or the section inherits the raw underline/uppercase look. Always preview a new section against the live global sheet before calling it on-brand.

## Key files
- `src/components/HomePage.tsx` — homepage composition (section stack). `src/components/LatestFromJournal.tsx` — "Latest thinking" module (3 recent posts from `/api/blog`, above `<ServicesSection/>`).
- `src/components/BlogPage.tsx` / `BlogPostPage.tsx` — blog index / single post.
- `src/app/api/blog/*` — Notion blog API. `src/app/api/ai-visibility/route.ts` — the tool API.
- `next.config.ts` — images.remotePatterns, ignoreBuildErrors. `src/middleware.ts` — bot-block (allows GPTBot/ClaudeBot/OAI-SearchBot; blocks curl/scrapers → use a browser UA when curling prod), HTTPS + non-www→www redirect, canonical header, `/client` portal session.

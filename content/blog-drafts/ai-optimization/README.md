# Blog draft: "Can AI Find Your Business?" + AI-visibility self-check tool

Status: **draft, awaiting Anastasia's review** (created 2026-07-15).

## What's in / tied to this folder
- **`article.md`** — the blog post for thedotcreative.co/blog. ~1,600 words, consultative voice, no em dashes. Anchored in primary sources (Google Search Central AI guidance, Google AI Features doc, MIT/Aral arXiv paper), plus BrightLocal 2026 and HubSpot's free grader. Uses an **anonymized** Toronto immigration-consultancy example. Sources listed at the bottom of the file.
- **`ai-visibility-self-check.html`** — self-contained standalone widget (brand-native skin: warm canvas, ink, acid-yellow glow, sharp corners). This is the **shareable / iframe fallback** and the live preview. No external requests.
- **`../../../src/components/AiVisibilitySelfCheck.tsx`** — the **canonical** version for this site: a `'use client'` React component using styled-jsx and the site's CSS vars (`--background`, `--foreground`, `--yellow`, …) + Typekit fonts, so it stays perfectly on-brand. Type-checks clean. Props: `bookingUrl` (default `/contacts`).

Live preview: https://claude.ai/code/artifact/f8aa9685-3941-4ce0-91e5-77321e489c2f

The widget runs the two GEO checks plus an optional bonus:
1. **By name** (direct search) — most businesses pass.
2. **By need** (non-branded) — most fail; this is the one that sells the audit (spotlighted with the yellow glow).
3. **Bonus, can it read your site?** — only shows if a website is entered (kept optional so it doesn't bias the discovery checks).
Plus a credited HubSpot free-grader link and a CTA to `/contacts`.

## How to publish (Next.js; blog is Notion/API-sourced)
- **Article:** posts come from the CMS/Notion pipeline, not local files. Paste `article.md` into a new blog post. Images go under `public/images/blog/<slug>/`. Suggested slug: `can-ai-find-your-business`.
- **Widget:** use the React component. Import and drop it in:
  ```tsx
  import AiVisibilitySelfCheck from '@/components/AiVisibilitySelfCheck';
  // ...
  <AiVisibilitySelfCheck />            // or <AiVisibilitySelfCheck bookingUrl="/estimate" />
  ```
  Cleanest reusable home is a small page route (e.g. `src/app/tools/ai-visibility/page.tsx`) that you can link to from the blog post and the services page. The standalone `.html` is only needed if you ever want to iframe it somewhere React isn't available.

## Resolved
- CTA link → **`/contacts`** (confirmed: `src/app/contacts` exists).
- Brand accent → not a flat swap; re-skinned to the real **mono + yellow-glow** system per `brand-kit/BRAND-SPEC.md`.
- **Live route created:** `src/app/tools/ai-visibility/page.tsx` → **`/tools/ai-visibility`** (renders the component, full SEO metadata, site header + Footer). Run `npm run dev` and open `/tools/ai-visibility` to view.
- **Article aligned to the tool:** "branded/non-branded" → "by name / by need" (matches the widget's two checks; industry terms kept once, parenthetically). Added a link to `/tools/ai-visibility` at the "audit yourself" section. Still 0 em dashes.

## Open decisions (see chat)
- Whether to also embed the widget directly in the blog post (via the component) or just link to `/tools/ai-visibility` from it.
- Any final copy tweaks before the article goes into the CMS.

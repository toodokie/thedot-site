# The Dot Creative — SEO Audit

**Site:** https://www.thedotcreative.co (Next.js marketing site — creative/web-design agency, GTA/Ontario)
**Primary SEO goal:** organic leads from Ontario businesses
**Date:** 2026-07-18
**Inputs:** Google Search Console (3-month export — see `search-console-report-2026-07.md`), live-site inspection, Lighthouse, `/api/blog`.

---

## ✅ Resolution status — updated 2026-07-19 (fixes SHIPPED & verified live)

All three 🔴 critical issues plus the 🟠 image/AI-crawler block are **fixed and confirmed live on production**:

| Issue | Status | What changed |
|---|---|---|
| robots.txt wrong host + bad blocks | ✅ **Fixed & live** | `src/app/robots.txt/route.ts` — hardcoded canonical www host; removed `Disallow: /*.png` + `/*.ico`; removed AI-bot blocks; added `Disallow: /admin` + `/client`; deleted redundant `public/robots.txt` |
| Sitemap dead 404 URLs | ✅ **Fixed & live** | `src/app/sitemap.ts` — pulls real published slugs from Notion via new `getPublishedBlogSlugs()` (was hitting the `/api/blog/posts` stub → dead slugs); revalidates hourly. Sitemap now lists the 6 real posts. |
| Canonical bugs | ✅ **Fixed & live** | `/estimate` self-canonicals (was homepage); `/brief`, `/services`, `/efficiency-brief` → www (relative) |
| Long titles + missing `/contacts` H1 | ✅ **Fixed & live** | Home/services/estimate titles trimmed to ~60 chars; `/contacts` hero promoted to `<h1>` |

**Deferred (deliberately):** the `/brief` heading cleanup — it's **127** `<h1>` tags (form field labels styled as H1); rushing that on a live lead form is risky, so it's left for a careful separate pass. *(The finding below says "45" — that's the ~45 rendered on the visible step; the component has 127.)*

**Still open — strategy, not bugs (see action plan below):** own the brand SERP, build Ontario/creative-agency content, local SEO / Google Business Profile, and the blog program.

---

## Executive summary

**Overall health: the site's *foundations* are decent (good titles/meta, rich server-rendered schema, HTTPS, fast Core Web Vitals) — but several technical signals are actively telling Google the wrong things, and the site is essentially invisible outside its own brand name.**

Search delivers ~19 clicks / 3 months (see the Search Console report). The biggest levers aren't "write more content" yet — they're **fixing broken crawl/canonical signals** that suppress what you already have.

### Top 5 priorities
1. 🔴 **robots.txt declares the wrong canonical host** (`vercel.app`) and points the sitemap there too.
2. 🔴 **Sitemap is stale/broken** — it lists dead 404 blog URLs and omits all 6 real posts.
3. 🔴 **Canonical tag bugs** — `/estimate` canonicals to the **homepage**; `/brief` & `/services` canonical to the **non-www** domain.
4. 🟠 **robots.txt blocks all images** (`Disallow: /*.png`) and **blocks AI crawlers** (while you run an AI-visibility tool).
5. 🟠 **No organic presence for money terms** — "creative agency ontario" (pos 66), and you're not #1 for "dot creative" (pos 11.5).

### Quick wins (hours, not weeks)
- Fix robots.txt `Host`/`Sitemap`; remove `Disallow: /*.png`.
- Regenerate the sitemap from live routes + the Notion blog.
- Fix the `/estimate`, `/brief`, `/services` canonical URLs.
- Add an H1 to `/contacts`; reduce `/brief`'s 45 H1s.

---

## Technical SEO findings

### 1. robots.txt declares `vercel.app` as canonical host 🔴
- **Impact:** High — conflicting canonical-host signals confuse Google about which domain is authoritative; can dilute/misattribute ranking.
- **Evidence:** `robots.txt` contains `Host: https://thedot-site.vercel.app` and `Sitemap: https://thedot-site.vercel.app/sitemap.xml` — both the preview domain, not `www.thedotcreative.co`.
- **Fix:** Change both to `https://www.thedotcreative.co`. Ideally serve `robots.txt` dynamically so it always matches the canonical host.
- **Priority:** 1

### 2. Sitemap is stale and serves 404s 🔴
- **Impact:** High — Google discovers dead URLs (crawl waste + quality signal) and never sees your real, ranking content via the sitemap.
- **Evidence:** `sitemap.xml` lists `/blog/future-of-web-design`, `/blog/color-psychology-in-branding`, `/blog/effective-logo-design-principles`, `/blog/responsive-design-best-practices` — **all return HTTP 404**. Meanwhile `/api/blog` returns 6 live posts (`can-ai-find-your-business`, `the-true-cost-of-free-manual-work`, `software-subscription-trap-ontario-business`, `emotional-brand-strategy-…`, `gta-small-business-website-mistakes-fix-guide`, `website-design-trends-europe-canadian-businesses`) — **none of which (except a slug-mismatched one) are in the sitemap.** The top-performing post in GSC (`emotional-brand-strategy…`, position 4) is absent.
- **Fix:** Generate the sitemap dynamically — enumerate real static routes + fetch live blog slugs from Notion (same source as `/api/blog`). Include correct `www` absolute URLs, real `lastmod`. Resubmit in Search Console.
- **Priority:** 1

### 3. Canonical tag bugs 🔴
- **Impact:** High — a wrong canonical tells Google a page is a duplicate of another, so it won't be indexed/ranked on its own.
- **Evidence (live `<link rel="canonical">`):**
  - `/estimate` → `https://www.thedotcreative.co` (**points to the homepage**, not `/estimate`)
  - `/brief` → `https://thedotcreative.co/brief` (**non-www** — a URL that 307-redirects)
  - `/services` → `https://thedotcreative.co/services` (**non-www**)
  - (`/`, `/blog`, `/contacts`, `/projects/*` correctly use `www`.)
- **Fix:** Every page self-canonicals to its own `https://www.thedotcreative.co<path>` URL. Fix `/estimate` first (it's self-deindexing). Standardize www + trailing-slash across all canonicals.
- **Priority:** 1

### 4. robots.txt blocks all images and AI crawlers 🟠
- **Impact:** Medium-High — `Disallow: /*.png` blocks image crawling (bad for an image-heavy portfolio + Google Images); blocking AI bots contradicts your AI-visibility strategy.
- **Evidence:** robots.txt has `Disallow: /*.png`, `Disallow: /*.ico`, and `Disallow:` for `GPTBot`, `ChatGPT-User`, `CCBot`, `anthropic-ai`, `Claude-Web`. This also **contradicts the site middleware**, which explicitly *allows* `GPTBot`/`ClaudeBot`/`OAI-SearchBot`. The blocked agent names are also outdated (`Claude-Web`/`anthropic-ai` are deprecated; current are `ClaudeBot`, `OAI-SearchBot`, `PerplexityBot`).
- **Fix:** Remove `Disallow: /*.png` (keep images crawlable). Decide AI policy deliberately — if you want to be *cited* by AI (you built a tool for exactly this), **allow** `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot` and reconcile with the middleware. See the **ai-seo** skill.
- **Priority:** 2

### 5. Redirect chain + temporary redirect 🟡
- **Impact:** Low-Medium — extra hop + a `307` (temporary) where a permanent redirect is the canonicalization signal.
- **Evidence:** `http://thedotcreative.co` →308→ `https://thedotcreative.co/` →307→ `https://www.thedotcreative.co/` (two hops; the non-www→www step is `307` temporary).
- **Fix:** Collapse to a single hop and make non-www→www a **301/308 permanent**.
- **Priority:** 3

### 6. Core Web Vitals — good, one lever 🟡
- **Impact:** Low (already 91/100 mobile).
- **Evidence (Lighthouse, mobile lab):** Performance **91**, LCP **2.6s**, CLS **0**, TBT **90ms**; ~**1.5s** of render-blocking resources (Adobe Typekit font CSS loading synchronously); homepage ships **446 KB of HTML**.
- **Fix:** `preconnect`/`preload` + swap fonts to non-blocking; trim inline homepage payload. Pulls LCP/FCP down.
- **Priority:** 3

---

## On-page SEO findings

### 7. Heading hierarchy is messy 🟠
- **Impact:** Medium — weak semantic structure; wastes the strongest on-page keyword signal.
- **Evidence:** `/contacts` has **0 `<h1>`**; `/brief` has **45 `<h1>`** (form fields marked as H1); `/services` has 3 H1s led by the generic *"We Create Digital Experiences"* (no keyword); the homepage H1 renders as run-together text *"WEBSITES & WORKFLOWSDIGITAL DESIGN AGENCY"*.
- **Fix:** One descriptive, keyword-bearing H1 per page (e.g., home: "Ontario Web Design & Business Systems Agency"; `/services`: "Web Design + Systems Integration for Ontario Businesses"; add an H1 to `/contacts`). Demote form-field H1s on `/brief` to labels/`<h2>`.
- **Priority:** 2

### 8. Title tags slightly long 🟡
- **Impact:** Low — truncation in SERPs, lost CTR.
- **Evidence:** Home 77 chars, `/services` 82, `/estimate` 90 (all beyond the ~60-char visible limit). Content is otherwise strong and keyworded.
- **Fix:** Trim to ~55–60 chars, front-load the keyword, brand at the end.
- **Priority:** 3

### 9. Structured data — a strength ✅
- **Evidence:** JSON-LD is **server-rendered** on every page: `LocalBusiness` (with `PostalAddress`, `GeoCoordinates`, service area), `OfferCatalog`/`Service`; project pages add `CreativeWork`, `BreadcrumbList`, `WebPage`, `ImageObject`. Blog posts emit `Article` + `FAQPage`.
- **Note:** Keep it — just validate in Google's Rich Results Test after the canonical/sitemap fixes, and make sure NAP in the schema matches Google Business Profile exactly (see #12).

---

## Content & authority findings

### 10. Brand-dependent, and not #1 for the brand 🟠
- **Evidence:** clicked queries are all branded; `dot creative` = position **11.5** (page 2), `dot creative agency` = position 7.8. Competing with dotYeti, Dot Foundry, Dot & Company, Dot Creative Kft.
- **Fix:** Own the brand SERP — strong homepage title/H1 with "The Dot Creative Agency", Google Business Profile, consistent NAP, a few citations/directory listings, and (optionally) branded-term internal linking. You should be #1–2 for every "dot creative" variant. See **directory-submissions** + **competitors** skills.
- **Priority:** 2

### 11. Invisible for the money terms 🟠
- **Evidence:** "full service creative agency" (pos 26), "creative agency ontario" (pos 66), "design agency ontario" (pos 59), "billable hours optimization for creative agencies" (pos 74) — impressions, zero clicks.
- **Fix:** Build dedicated, genuinely-useful pages/posts targeting Ontario + creative-agency intent (service + location pages, comparison/"best X in Ontario" content). This is where new organic clients come from. See **content-strategy** + **programmatic-seo** + **site-architecture**.
- **Priority:** 3 (strategic, highest upside)

### 12. Weakest in the home market (local SEO gap) 🟠
- **Evidence:** Canada = position **22** (page 3) vs US position 8, despite Ontario being the target.
- **Fix:** Local SEO — claim/optimize **Google Business Profile**, consistent NAP across web, Ontario/GTA location signals in content, local citations. This directly targets the Canada gap.
- **Priority:** 2

### 13. `/brief` — 401 impressions, position 9, 0 clicks 🟡
- **Evidence:** Title/meta are actually fine ("Start Your Project | Project Brief…"). So the 0-click is likely **intent mismatch** — it ranks alongside the homepage for brand/service queries and users click the homepage, or the queries are informational while `/brief` is a form.
- **Fix:** Pull the exact queries `/brief` ranks for (GSC → page filter), then decide: add supporting content to match intent, or accept it as a form and let a content page rank instead. See **cro** for the form itself.
- **Priority:** 3

### 14. Blog isn't pulling search weight 🟡
- **Evidence:** `/blog` index ranks position 39; strong posts exist (`emotional-brand-strategy…` at pos 4) but with tiny impressions — compounded by the broken sitemap (#2) hiding them from Google.
- **Fix:** Fix the sitemap first (#2), then internal-link posts from relevant service pages, target Ontario/agency keywords, and refresh. See **content-strategy**.
- **Priority:** 3

---

## Prioritized action plan

### 🔴 Critical (do first — unblocks indexing/ranking of what you already have)
1. **robots.txt:** change `Host` + `Sitemap` to `https://www.thedotcreative.co`; remove `Disallow: /*.png`.
2. **Sitemap:** regenerate dynamically (real static routes + live Notion blog slugs), correct `www` URLs; resubmit in GSC.
3. **Canonicals:** fix `/estimate` (→ itself, not homepage) and `/brief` + `/services` (→ `www`); standardize site-wide.

### 🟠 High-impact
4. Reconcile the **AI-crawler policy** (robots.txt vs middleware) — allow the bots you want to be cited by.
5. **Local SEO:** Google Business Profile + consistent NAP (targets the Canada position-22 gap and the brand SERP).
6. **Headings:** one keyworded H1 per page; fix `/contacts` (0) and `/brief` (45).

### 🟢 Quick wins
7. Trim long titles to ~60 chars.
8. Collapse the redirect chain; make non-www→www a 301.
9. Non-blocking font loading (perf).

### 🔵 Strategic (highest long-term upside)
10. Content targeting **Ontario + creative-agency** intent (service/location pages + blog) to rank for the money terms you currently only get impressions for.
11. Blog program: internal linking, keyword targeting, refresh — once the sitemap exposes the real posts.

---

*Related skills to go deeper: `ai-seo` (AI citations), `schema` (validate structured data), `content-strategy` / `programmatic-seo` / `site-architecture` (rank for money terms), `cro` (the `/brief` & calculators), `directory-submissions` + `competitors` (brand SERP).*

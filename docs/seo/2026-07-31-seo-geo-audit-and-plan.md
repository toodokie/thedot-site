# SEO + GEO audit — verified findings & action plan

**Site:** https://www.thedotcreative.co
**Source audit date:** 2026-07-31 (external audit, reproduced verbatim in Appendix A)
**Verified & annotated:** 2026-07-31 (Claude, against live site + this codebase)

---

## TL;DR

The external audit is **largely accurate** — I verified the concrete claims against the code and the live site (see the table below). The core diagnosis holds:

> **Good engineering foundation, weak information architecture and commercial consistency.** The site is crawlable and indexable; the problem is that the homepage sells the *current* business (web + business systems + automation + AODA + AI visibility) while **Services / Estimate / Brief / structured data still describe the old web-+-graphic-+-photo-+-video business at old prices.** Search engines, AI systems, and buyers can't tell what you actually offer or what it costs.

**The single unlock:** almost every "Critical/High" commercial item is blocked on one decision only you can make — **what is the current canonical offer and its price bands?** Once that's fixed, the rest (rewrite/retire legacy pages, schema services, service pages) is execution.

**What's independent of that decision (I can do now):** SSR the blog + kill the stale fallback (fixes the crawler-404 and the "AI crawlers get a loading shell" risk), schema www/serviceArea/telephone cleanup, footer year, sitemap `lastmod`, H1 hygiene.

---

## Canonical offer — DECIDED 2026-07-31 (the unlock)

The founder's decisions, now the single source of truth for all Wave-2/3 work:

- **Positioning:** *Websites and connected business systems for growing Ontario businesses.* Web + systems is the headline; **workflow automation, AODA accessibility, and AI-visibility are supporting services**; **graphic design + photo/video are secondary à-la-carte** (available on request — NOT in nav, schema, or the primary architecture).
- **Canonical services + prices** (these REPLACE the legacy $650 / $350 / $450 and $800–$2,800 figures everywhere):
  | Service | Price | Role |
  |---|---|---|
  | Professional Foundation (web design + build) | $2,500–$4,500 | Primary |
  | Connected Business System (site + integration + automation) | $5,500–$7,500 | Primary (differentiator) |
  | Design & Consulting (AODA audit, integration consulting, optimization, + à-la-carte creative) | from $350 | Supporting |
  | AI-Visibility Audit | tie to the /tools/ai-visibility tool | Supporting |
- **Impact claim — standardized to "10–20 hours per month".** Purge the conflicting "10+ hours weekly" and "25–40% less admin" claims until a case study can support a stronger number.
- **Estimate + Brief:** REBUILD to the current offer (not retire/noindex) — keep the interactive funnels, update services/prices/minimums.

### Wave-2 build sub-projects (sequenced)
- **SP1 — Core offer reconciliation** (the Critical fix; mostly executable now): hero H1 (drop "DIGITAL DESIGN AGENCY" → the positioning line), Services page rebuilt around the 3 tiers + secondary à-la-carte, purge legacy prices site-wide, standardize the impact claim, align schema.
- **SP2 — Rebuild `/estimate` + `/brief`** to the current services/prices.
- **SP3 — Service landing pages** (web-design+systems, workflow-automation, AODA, managed-growth, AI-visibility-audit) + internal linking + per-page `Service` schema.
- **SP4 — About page** (needs the founder's real bio/experience/credentials).
- **SP5 — Proof / case study** (needs client-approved evidence).

## Verification results (checked today)

| # | Audit claim | Verified? | Evidence / nuance |
|---|-------------|-----------|-------------------|
| 1 | Services/Estimate/Brief contradict homepage offer & price | ✅ **Confirmed** | `ServicesPage.tsx` shows **$650 / $350 / $450**; homepage packages are $2,500–$7,500. Different offer *and* price level. |
| 2 | Global schema stale, non-www, `priceRange:"$"`, deprecated `serviceArea` | ✅ **Confirmed** | `src/app/layout.tsx:101` — `LocalBusiness`, `@id: https://thedotcreative.co` (non-www), `serviceArea` present, `priceRange:"$"`. `projects.ts` also uses non-www `@id`s; `BlogPostPage.tsx` uses **www** → inconsistent. |
| 3 | Many H1s per page | ✅ **Confirmed — worse than reported** | `ProjectBrief.tsx` = **127** `<h1>`; `ServicesPage.tsx` = **5**; `ProjectEstimate.tsx` = **4**. (Audit estimated Services 3, Brief ~40.) |
| 4 | Blog index links to a 404 / shows only one article | ⚠️ **Reframed** | **Live (JS-rendered) blog is fine**: 6 article cards, all HTTP 200, incl. the correct `…-fix-guide` slug. The 404/one-article state is what a **non-JS crawler** sees — the client render falls back to a **stale hardcoded list** (`BlogPage.tsx:1274`, old slug `gta-small-business-website-mistakes`) until Notion loads. Root cause = #5, not a broken link. |
| 5 | Blog articles client-rendered → crawlers get `Loading…` | ✅ **Confirmed** | `BlogPage.tsx` / `BlogPostPage.tsx` fetch `/api/blog*` in `useEffect`. Full text only exists post-JS. Real GEO risk. |
| 6 | Footer copyright still 2025 | ✅ **Confirmed** | `Footer.tsx:82` — "© 2025". |
| 7 | No dedicated service pages | ✅ **Confirmed** | Only `/services` (one page); no per-offer landing pages. |
| 8 | No substantive About page | ✅ **Confirmed** | No `/about` route exists. |
| 9 | Mobile Lighthouse 67 / LCP 6.2s / ~5MB homepage | ⬜ **Plausible, not re-run** | Consistent with the heavy homepage (hero video, large `globals.css`). Worth a real Lighthouse run before/after. |
| 10 | Two blog data sources tangled | ✅ **Confirmed (new)** | Notion via `/api/blog` **and** a hardcoded `/api/blog/posts` route + hardcoded fallback array in `BlogPage.tsx`. The stale slug lives in all three. |

**Already fixed (this week), so treat as done in the audit:**
- Tool page (`/tools/ai-visibility`) missing H1 → **fixed** (now a single `<h1>`, blog embeds keep `<h2>`).
- Tool page `og:url` non-www → **fixed** (www).
- Canonicals / www redirect / sitemap ISR → fixed in the July 18 SEO pass.

---

## Reframed action plan (by unlock, with ownership)

Legend — **[ME]** I can do without any business decision · **[YOU]** needs your call/real data · **[BUILD]** scoped engineering project.

### The one decision that unblocks everything — **[YOU]**
Define the **canonical offer + price bands**. Concretely:
- Which services are *primary* (the ones that get nav + a service page + schema)?
- Which are *secondary/à-la-carte* (photo, video, small projects — kept but demoted) vs *retired*?
- Real current price framing per primary service (ranges or "from", with conditions).

Everything marked ⛓ below is blocked on this.

### Wave 1 — offer-independent, high-leverage (I can start now)
1. **[BUILD] Server-render the blog** (index + article bodies) and **delete the stale hardcoded fallback** in `BlogPage.tsx` + reconcile/remove the hardcoded `/api/blog/posts` route. Fixes the crawler-404 (#4), the "AI crawlers get a loading shell" (#5), and the two-sources mess (#10) in one pass. *Highest GEO value.*
2. **[ME] Schema hygiene (non-offer parts):** unify all `@id`/`url`/`logo`/`image` to **www**; replace deprecated `serviceArea` with `areaServed`; add the real visible **telephone**; split the single `LocalBusiness`-everywhere into `Organization` + `WebSite` + page-level `WebPage`, and `Article`/`BlogPosting` (real dates + author) on posts, `BreadcrumbList` on posts/projects. *(The service catalogue + `priceRange` wait for the offer decision — ⛓.)*
3. **[ME] Footer year** → 2026 (and make it auto-update).
4. **[ME] Sitemap `lastmod`** → emit real last-modified dates or omit the synthetic uniform timestamp.
5. **[ME] H1 hygiene** on Brief (127→1), Services (5→1), Estimate (4→1) → one descriptive H1 + logical H2/H3. *(Lower priority if these pages are being retired — confirm in the offer decision.)*

### Wave 2 — commercial consistency (⛓ needs the offer decision)
6. **[YOU+ME] Reconcile or retire** Services / Estimate / Brief so every page states the same offer + compatible pricing. Retired-but-kept pages get `noindex` + out of nav.
7. **[ME] Schema services + `priceRange`** updated to the real catalogue and price level (remove the misleading `"$"`).
8. **[YOU+BUILD] Homepage message tighten** — one H1 that answers *what you build / for whom / what problem / where*. Link each service block to its own page.
9. **[YOU] Reconcile the impact claims** (10–20 hrs/mo vs 10+ hrs/wk vs 25–40% admin) to one supportable number with conditions.

### Wave 3 — authority & content (⛓ + your real data)
10. **[YOU+BUILD] Service landing pages** (web+systems, workflow automation, AODA, managed optimization, AI-visibility audit) — fit/problem/deliverables/process/proof/price/FAQ/one CTA each.
11. **[YOU] About page** — real founder identity, experience, process, verifiable credentials/links.
12. **[YOU] Proof** — 1–2 outcome-led integration case studies (client-approved evidence only).
13. **[ME/YOU] Answer-ready content pass** — definitions up top, question-shaped H2s, concise answers, dates, first-party links. Start with turning the existing "Can AI Find Your Business?" article + tool into a full service+proof cluster.

### Wave 4 — performance & measurement
14. **[ME/BUILD] Homepage perf** — right-size images, defer video/non-critical JS, cut render-blocking CSS/JS; target LCP < 2.5s mobile. Verify with real Lighthouse runs.
15. **[YOU] Connect** Google Search Console + Bing Webmaster Tools (AI Performance report). Set up a fixed buyer-prompt monitoring set across ChatGPT/Perplexity/Gemini/Copilot.

---

## My recommendation on sequencing

1. **Now:** I knock out Wave-1 items 2–5 (schema www/serviceArea/telephone, footer year, sitemap, H1 hygiene) — safe, fast, no decisions needed — and scope the blog-SSR build (item 1) as its own PR.
2. **You, in parallel:** make the offer + pricing call (Wave-2 unlock). That's the highest-value hour you can spend — it removes the contradictions the audit flagged as *Critical*.
3. **Then:** we execute Wave 2 (reconcile pages + schema services), then Wave 3 (service pages, About, proof).

Don't chase new content volume first — the audit is right that fixing the contradictions creates more value than publishing more.

---

## Appendix A — External audit (verbatim, 2026-07-31)

> Preserved exactly as received for the record. My verification above supersedes it where they differ (notably the blog-404 reframing).

<!-- BEGIN EXTERNAL AUDIT -->

**Site:** https://www.thedotcreative.co/
**Audit date:** July 31, 2026
**Scope:** public technical SEO, on-page SEO, content, local and entity signals, structured data, AI crawler access, AI-readable content, discovery tests, and mobile performance.

### Executive summary

The Dot has a good technical base and a more differentiated offer than a typical web-design studio. The site is indexable, has a sitemap and canonical URLs, and explicitly allows major search and AI crawlers. The homepage already combines web design, systems integration, automation, accessibility, and AI visibility in a commercially interesting way.

The main problem is not invisibility caused by a crawler block. It is **message and entity fragmentation**:

- The homepage presents a current web, workflow, integration, AODA, and managed-growth business.
- The Services, Estimate, and Brief pages still present the older web, graphic design, photo, and video business, with materially different prices.
- The site's structured data also describes the older agency and omits most of the current services.
- The blog hub links to a 404, displays only one article, and does not expose the six live articles listed in the sitemap.
- Article content is rendered after JavaScript loads. A crawler that does not render JavaScript receives a loading shell rather than the article body.
- There are no dedicated service pages or substantive About page to establish clear expertise, local relevance, or founder identity.

**Overall diagnosis:** good engineering foundation, weak information architecture and commercial consistency. Fixing the contradictions will likely create more value than publishing a high volume of new content immediately.

### Priority findings

| Priority | Finding | Why it matters | Recommended action |
|---|---|---|---|
| Critical | Services, Estimate, Brief, and homepage contradict one another | Search engines, AI systems, and prospects cannot confidently determine the current offer or price level | Decide the live offer, then rewrite or retire every legacy page in one coordinated pass |
| Critical | Blog index links to `/blog/gta-small-business-website-mistakes`, which returns 404 | Users and crawlers hit a dead end from the blog's only visible article | Point it to `/blog/gta-small-business-website-mistakes-fix-guide` and list every live article |
| High | Blog articles are client-rendered | Non-rendering AI crawlers can receive only `Loading...`, not the article text | Server-render or statically generate the full article body |
| High | Global schema is stale and inconsistent with the canonical domain | The machine-readable business identity describes an older version of The Dot | Replace it with accurate Organization, WebSite, WebPage, Service, Article, and breadcrumb markup where applicable |
| High | No dedicated service landing pages | The site has no strong page to rank for each high-intent offer | Create focused pages for web and systems, workflow automation, AODA, managed optimization, and AI visibility |
| High | No substantive About page | The site lacks a clear founder, experience, process, business identity, and trust narrative | Add an About page with real, verifiable details and links to profiles and work |
| High | Mobile Lighthouse performance is 67, with LCP at 6.2 seconds | The main content appears slowly, especially on mobile | Reduce the homepage payload, right-size images, defer non-critical video and scripts, and remove render-blocking resources |
| Medium | One page can have many H1s | Services has three H1s; Brief turns almost every form question into an H1 | Use one descriptive H1 per page and logical H2/H3 structure |
| Medium | Business-impact claims conflict | Metadata says 10 to 20 hours saved monthly; homepage says 10+ hours weekly and 25 to 40% less admin | Use one supportable claim, define the conditions, and link it to case evidence |
| Medium | Sitemap gives every static URL the same current timestamp | Synthetic `lastmod` values weaken the usefulness of freshness signals | Output the last meaningful content modification date or omit `lastmod` |

### Technical SEO and accessibility

**What passes**

- HTTPS is live and the non-www HTTPS URL resolves to the www canonical.
- Canonical tags are present on the reviewed pages.
- `robots.txt` allows general crawling and names a sitemap.
- Browser, Googlebot, Bingbot, OAI-SearchBot, GPTBot, Claude-SearchBot, Claude-User, and PerplexityBot received HTTP 200 on the homepage in the live tests.
- The XML sitemap is valid and contains the core pages, projects, tool, and six articles.
- Homepage server response time was strong in the Lighthouse run.
- Layout stability was strong, with CLS at 0.
- Basic Lighthouse SEO checks scored 100. This score covers a limited technical checklist, not the overall SEO strategy.

**What needs work**

- Mobile Lighthouse: Performance 67, Accessibility 94, Best Practices 89.
- Mobile LCP: 6.2 seconds. FCP: 4.4 seconds.
- Total homepage transfer was approximately 5 MB across 40 requests.
- Estimated opportunities included 1.85 seconds from render-blocking resources, 377 KiB from better image sizing, 65 KiB of unused JavaScript, and 12 KiB of unused CSS.
- Lighthouse also found low-contrast text, heading-order problems, console errors, and small text. Only about half of the assessed text met its legibility test.
- Homepage HTML is unusually large at roughly 450 KB before page assets.
- The copyright year is still 2025.

### On-page and conversion consistency

**Homepage**

The homepage title and description are directionally strong, but the H1, secondary slogans, service names, and portfolio copy compete for attention. The primary value proposition should answer four questions without interpretation:

1. What do you build?
2. For whom?
3. What business problem does it solve?
4. Where do you work?

A clearer H1 direction would be: **Websites and connected business systems for growing Ontario service businesses.** This is a positioning example, not final copy.

The page should link each service block to a dedicated, indexable page. The current single Services destination cannot support all of the commercial intents represented on the homepage.

**Services**

The page title says web design and business systems integration, but the visible service overview says websites, graphic design, photo, and video. It advertises website design starting at $650, while the homepage presents $2,500 to $4,500 and $5,500 to $7,500 packages. It also has three H1 elements.

This page should be rebuilt around the current offer. If photo, video, or small à la carte projects remain available, position them as secondary capabilities rather than the main service architecture.

**Estimate and Brief**

The estimate page presents old website prices from $800 to $2,800 and itemized integration prices. The Brief page asks about the old creative-service mix and uses around 40 H1 elements for form questions.

Choose one of these paths:

- update both tools to the current offer, scopes, and minimums, or
- remove them from primary navigation and apply `noindex` if they are retained only for direct legacy use.

Do not leave them indexed as competing statements of the offer.

**Contact and trust**

The Contact page provides phone, email, Instagram, LinkedIn, and Ontario. A full street address is not necessary if this is a home-based or service-area business. Do not invent one. Instead:

- define the real service area consistently;
- add the visible phone number to structured data;
- link to an official company LinkedIn page if one exists;
- add a substantive About page with the founder's real name, experience, approach, and verifiable credentials;
- add testimonials and outcome-led case studies only where client permission and evidence exist.

### Structured data audit

All reviewed pages use the same `LocalBusiness` object. Current problems include:

- non-www URLs in `@id`, `url`, logo, and image while canonical URLs use www;
- a stale service catalogue centred on custom websites, development, graphic design, and photo/video;
- no workflow automation, systems integration, AODA, managed optimization, or AI visibility services;
- `priceRange` set to `$`, which does not match the published package prices;
- deprecated `serviceArea` alongside `areaServed`;
- no visible telephone in the markup;
- the same markup copied to articles, tools, projects, and service pages;
- no Article, Service, BreadcrumbList, or page-specific WebPage markup.

Recommended architecture:

- one stable `Organization` or the most accurate local business subtype with `@id` ending `/#organization`;
- one `WebSite` entity with `@id` ending `/#website`;
- a page-specific `WebPage` connected through `isPartOf` and `about`;
- `Service` entities on genuine service pages;
- `Article` or `BlogPosting` on articles, with real publication and modification dates and a real author;
- `BreadcrumbList` on articles, services, and projects;
- `WebApplication` only for the interactive AI visibility tool if its features and provider can be described accurately.

Structured data must match visible content. It does not directly make a company rank in AI answers, but it removes ambiguity and improves entity consistency.

### GEO and AI discovery review

**1. Crawler access: strong**

The Dot intentionally allows crawling, and the tested AI search and training crawler user agents received the homepage. No separate AI submission form is needed for a service business.

**2. Content delivery to AI systems: high risk on articles**

The AI visibility article becomes complete after browser JavaScript runs. In the initial HTML returned to Browser, Googlebot, OAI-SearchBot, Claude-SearchBot, and PerplexityBot user agents, the semantic article body and headings were absent and a loading state was present.

Google can render JavaScript, but AI crawler rendering behaviour varies and is not guaranteed. The safe standard is to place the complete primary text in the server response through server-side rendering or static generation.

**3. Entity clarity: weak**

The Dot is currently described as all of the following: digital design agency; web design agency; graphic design, photo, and video provider; business systems integration provider; workflow automation partner; AODA provider; AI visibility advisor.

These can coexist, but the hierarchy must be explicit. A strong version would define one primary category and a small set of supported services. Repetition across the homepage, About page, service pages, schema, social profiles, and trusted third-party profiles helps search and AI systems resolve the same entity.

**4. Answer-ready content: promising but too narrow**

The article **Can AI Find Your Business?** is a good asset. It answers a real buyer question, explains limitations, cites sources, and avoids guarantees. The AI self-check is also a useful, differentiated tool.

The rest of the site needs the same answer-ready structure: clear definitions near the top; specific questions as headings; concise answer paragraphs; factual examples and limitations; authorship and revision dates; links to first-party evidence; original case evidence and measurable outcomes.

**5. Unbranded discovery: currently weak**

In sampled searches for web design plus workflow automation in Ontario and AI visibility services in Toronto, The Dot did not surface among the leading unbranded results. Competitors with dedicated service pages and explicit category language did. This is a snapshot, not formal rank tracking.

### Suggested site architecture

- `/about`
- `/services`
  - `/services/web-design-business-systems`
  - `/services/workflow-automation`
  - `/services/aoda-web-accessibility`
  - `/services/managed-website-growth`
  - `/services/ai-visibility-audit`
- `/work` with detailed case studies
- `/tools/ai-visibility`
- `/blog`
- `/contact`

Each service page should cover fit, problem, deliverables, process, integrations, proof, price framing, FAQs, limitations, and a single next action.

### Directional keyword opportunities

No Search Console, Bing Webmaster Tools, Ahrefs, or Semrush data was available. Demand and difficulty are strategic estimates and must be validated before a publishing roadmap is finalized.

| Query theme | Intent | Likely difficulty | Best page |
|---|---|---:|---|
| web design agency Ontario | Commercial | High | Web design and systems service |
| Toronto web design agency | Commercial | High | Web design and systems service |
| web design and automation agency | Commercial | Medium | Web design and systems service |
| website automation Toronto | Commercial | Medium | Workflow automation service |
| business systems integration Ontario | Commercial | Medium | Web design and systems service |
| workflow automation consultant Ontario | Commercial | Medium | Workflow automation service |
| small business automation Ontario | Commercial | Medium | Workflow automation service |
| CRM integration consultant Toronto | Commercial | Medium | Workflow automation service |
| website CRM integration | Commercial | Medium | Integration page or guide |
| QuickBooks website integration | Commercial | Medium | Integration page or case study |
| booking system integration website | Commercial | Medium | Integration page or case study |
| AODA compliant website design Ontario | Commercial | Medium | AODA service |
| AODA website audit Ontario | Commercial | Medium | AODA service |
| website accessibility audit Toronto | Commercial | Medium | AODA service |
| managed website optimization Ontario | Commercial | Low to medium | Managed growth service |
| website redesign for Ontario small business | Commercial | Medium | Web design service |
| web design for professional services Ontario | Commercial | Medium | Industry landing page or case cluster |
| AI visibility audit Toronto | Commercial | Medium | AI visibility service |
| GEO agency Toronto | Commercial | Medium | AI visibility service |
| AI search optimization Ontario | Commercial | Medium | AI visibility service |
| can AI find my business | Informational | Medium | Existing article and tool |
| AI visibility check for local business | Tool intent | Medium | Existing tool |
| cost of a custom website in Ontario | Informational/commercial | Medium | Pricing guide |
| automate client intake for a service business | Problem aware | Low to medium | Guide plus workflow service |
| connect website forms to CRM and QuickBooks | Problem aware | Low to medium | Guide plus case study |

### Content gaps

Prioritize proof and buying guidance over generic trend articles:

1. A detailed systems-integration case study showing the original workflow, integrations, implementation, measured result, and limits.
2. AODA website obligations and practical audit guide for Ontario organizations, reviewed against current official guidance.
3. What a connected business website includes, what it does not include, and when a conventional brochure site is enough.
4. Website plus CRM, accounting, scheduling, and intake integration examples.
5. A transparent guide to website pricing in Ontario that matches the actual offer.
6. AI visibility audit methodology, deliverables, measurement, and what cannot be guaranteed.
7. Original research from anonymized audit patterns, with a reproducible method and enough sample context to be credible.

### Competitor snapshot

This is a search-result comparison, not a complete competitive intelligence study.

| Competitor | Search advantage observed | Opportunity for The Dot |
|---|---|---|
| Forge Web (forgeweb.ca) | Clear local service-business positioning and a direct website plus lead-recovery systems story | Compete with stronger design quality plus transparent integration process and proof |
| WebAlfa (webalfa.com) | Conventional Toronto web-design and SEO language with focused service discovery | Build separate pages for each offer and use more explicit high-intent wording |
| Inspiratica (inspiratica.ca) | Strong technical systems-integration credibility | Own the middle ground for Ontario SMBs that need excellent design and practical integration without enterprise complexity |
| HAIC (thehaic.com) | Explicit Toronto AI visibility category, dedicated services, founder identity, and reported outcomes | Differentiate with a grounded audit-first offer tied to site engineering, accessibility, content, and business systems |
| Raywise (raywise.ca) | Dedicated AI visibility landing pages, clear buyer segments, methods, and calls to action | Turn the current article and tool into a complete service and proof cluster |

### Action plan

**First 7 days**

1. Fix the broken blog link and make the blog index display all live articles.
2. Decide the current service and pricing architecture. Reconcile homepage, Services, Estimate, Brief, metadata, and CTAs.
3. Update global structured data to the canonical www identity and current services. Remove misleading `$` price range.
4. Use one H1 per page. Correct the Brief form semantics and Services heading hierarchy.
5. Reconcile or remove the 10 to 20 hours monthly, 10+ hours weekly, and 25 to 40% claims until each can be supported.
6. Correct the footer year and replace synthetic sitemap modification dates.

**Next 30 days**

1. Server-render or statically generate every article.
2. Add accurate Article and breadcrumb markup.
3. Launch an About page and the first three core service pages.
4. Add descriptive internal links among service pages, case studies, articles, and tools.
5. Reduce homepage transfer size and improve LCP, contrast, text sizing, console errors, and heading order.
6. Expand one portfolio item into an outcome-led integration case study with client-approved evidence.
7. Connect and review Google Search Console and Bing Webmaster Tools. Use Bing's AI Performance report where available.

**Next 90 days**

1. Complete the service architecture and publish the highest-value problem-led guides.
2. Build legitimate external corroboration through client profiles, relevant directories, partnerships, expert contributions, and earned coverage.
3. Monitor a fixed set of buyer prompts across ChatGPT search, Google AI features, Perplexity, Gemini, and Copilot. Record whether The Dot is mentioned, cited, accurately described, and linked.
4. Measure impressions, qualified organic leads, indexed pages, non-brand clicks, AI citations, and assisted conversions. Do not optimize to a single blended AI-visibility score.

### Acceptance checks after implementation

- Every public page gives the same primary business category, current offers, and compatible pricing.
- The homepage and each service page have one descriptive H1.
- Every blog article is visible in View Source without waiting for JavaScript.
- The blog index contains every intended article and no internal 404 links.
- Structured data validates and uses the canonical www entity IDs.
- Visible page content and structured data describe the same services.
- Lighthouse mobile LCP is under 2.5 seconds on representative production runs where feasible.
- Search Console reports no indexing or structured-data regressions.
- AI prompt monitoring uses documented prompts, locations, dates, and platforms.

### Evidence and guidance consulted

- Live The Dot pages, robots file, sitemap, rendered DOM, response HTML, metadata, JSON-LD, and HTTP responses, reviewed July 31, 2026.
- Lighthouse 12.7.1 mobile audit, run July 31, 2026.
- Google Search guidance for AI features; Google structured data policies; OpenAI crawler docs; Anthropic web crawler docs; Perplexity crawler docs; Bing Webmaster Tools AI Performance; Schema.org validator.

### Important limitations

- This audit did not have access to Search Console, Bing Webmaster Tools, analytics, backlink databases, Google Business Profile, conversion data, or server logs.
- Search-result observations are snapshots, not rank tracking.
- AI answers are probabilistic, personalized, location-sensitive, and change over time. No legitimate GEO provider can guarantee inclusion or placement.
- Recommendations involving legal accessibility obligations should be confirmed against current Ontario requirements and, where needed, qualified legal advice.

<!-- END EXTERNAL AUDIT -->

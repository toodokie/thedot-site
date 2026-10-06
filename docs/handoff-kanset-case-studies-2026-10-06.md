# Handoff: Kanset case studies, a site refresh and The Dot's Instagram (2026-10-06)

**For:** The Dot agent (works in `~/thedot-site`, The Dot's own brand).
**From:** the Kanset agent, at Anastasia's request.
**Owner of every decision:** Anastasia. She writes in the first person singular ("I", never "we"), and nothing is published, posted or emailed without her yes.

## What she wants

1. **Three case studies** about her work for Kanset Services Inc. (a Toronto immigration consultancy, client since June 2026), for thedotcreative.co:
   - **A. The client review portal.** A purpose-built review portal: the client watches every video inline, edits the exact words on screen, approves once, and never loses an edit.
   - **B. The Kanset social engagement.** A weekly content engine since June 2026: about five posts a week across Instagram, Facebook, YouTube and LinkedIn, with a reel-led strategy, the Ask Kanset series and an employer-first focus.
   - **C. The Kanset Talks podcast launch.** Monthly episodes on YouTube, with cut Shorts, captions, a companion article on kanset.com per episode, and YouTube setup.
2. **A site refresh** of thedotcreative.co. The scope is still open; see "Decisions she still owes" below.
3. **Posts for The Dot's own Instagram**, built from the case studies. She wants to post something soon. Ship the first post before the site work, and don't let the site hold it up.

## Decisions she still owes (ask before building past them)

1. **Site refresh scope.**
   - A: add the three case studies and update the services wording, keeping the look and structure. Recommended for now.
   - B: a light redesign of the homepage and services pages around what she does today: social management, post-production and client systems.
   - C: a full rebuild.
2. **Naming Kanset.** Maria Guerts (Director of Operations, Kanset) must agree before Kanset is named or its posts are shown. Otherwise anonymize as "a Toronto immigration consultancy".
   - Draft a one-line permission ask for Anastasia to send herself. Maria prefers point form and short emails.
   - Case study A can run anonymously with sandbox screenshots, so it does not have to wait for her.
3. **Credit line on Kanset's YouTube** (separate, she is still thinking about it). "Post-production: The Dot Creative" or "Edited by The Dot Creative" at the end of Kanset Talks descriptions, only with Maria's OK. Never put agency credit in Kanset's captions.

## Hard rules

- **No client PII.** Never show real client names, applicant details or Maria's portal data.
- **Portal screenshots come only from the practice client `kanset-sandbox`**, never Maria's account.
  - Sign in as the sandbox seat `toodokie@gmail.com` (admin-minted link; see `~/Kanset/content/receipts/2026-10/sandbox-setup-2026-10-04.md`), or use the admin "View as Maria" on sandbox pieces.
  - The sandbox pieces carry real Kanset copy. Treat them as client content and get Maria's OK before showing their words publicly, or blur them.
- **Immigration is regulated.** Nothing that implies outcomes ("got approved", "guaranteed"). Talk about the work, not client results.
- **No em dashes, anywhere.** Use commas, colons, periods or parentheses.
- **The Dot's brand, not Kanset's.** Use `~/thedot-site/brand-kit/` (BRAND-SPEC.md, BRAND-PRODUCTION-KIT.md, brand board). Kanset's design system lives in `~/Kanset` and is out of scope, though Kanset's own pieces may appear as shown work.
- **Numbers must be verified from the source**, never estimated, and must compare like with like. Quote absolute numbers, not percentage jumps from tiny bases.
- **Deploys.** A git push builds a Preview only. Production is `npx vercel --prod --yes`, run by Anastasia from a clean worktree. Agents prepare the commands, and Claude Code blocks agent deploys. Follow `~/thedot-site/docs/PORTAL-AGENT-MANUAL.md` section 15 and the host-resource rules: one worktree, one production build, cleanup stated.

## Facts and where they live (verify before quoting)

### Portal (case study A)
- **Engineering record:** the spec is `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md`. The plans are `~/thedot-site/docs/superpowers/plans/2026-10-03-piece-page-plan-*.md` (1, 2, 3, 4a, 4b and 5, each with its built and deployed date and commits). The manual is `~/thedot-site/docs/PORTAL-AGENT-MANUAL.md`.
- **Timeline:** the portal has been live since 2026-07-20. The piece-page redesign was built and deployed 2026-10-03 to 2026-10-06, and Maria moved to the new page on 2026-10-05.
- **What it does, in plain words:**
  - The client reviews each post in one place.
  - The video plays right on the page, which fixed a real problem: the client could not play Drive videos.
  - Every on-screen frame shows with its words beside it, and covers and YouTube thumbnails have their own tile.
  - She edits text in place, or full screen on her phone, with tracked changes. Edits save as she types and survive a closed tab or a second device.
  - One review per piece: her edits are applied and the piece lands on Approved, never back to her for a second look.
  - "Sent · being applied" markers keep her words visible where she made them.
  - The agency side gets a "From Maria" list, an email naming exactly what she sent, and a rehearsal sandbox for testing changes before the client sees them.
- **The story angle:** a solo studio built a review system tailored to one client's real habits. The problems it solves: lost edits, unplayable videos, approval email chains, "did my change go through?".

### Social engagement (case study B)
- **Scope and history:** `~/Kanset/CLAUDE.md` (engagement summary; the dated history is paper trail only).
- **What actually posted:** `~/Kanset/content/POSTED.md`, generated from the portal and holding every live post with its URLs.
- **Performance read and rules:** `~/Kanset/content/performance-keepers.md`. It has dated, sourced reads, for example the Oct 3 animated vs filmed reels comparison and the YouTube search wins from process titles.
- **Starting baseline:** `~/Kanset/SM-analytics-tracking-2026.md`. Early July: Instagram 56 followers, Facebook 959.
- **No current follower totals are on file.** Ask Anastasia for this month's native analytics before quoting growth.
  - Note from performance-keepers (2026-09-24): an offline event caused a follower spike. Don't credit that to content.

### Podcast (case study C)
- **Episodes** (from `POSTED.md`):
  - Ep 1: 2026-07-16, YouTube https://youtu.be/64TvgNPsJ3o
  - Ep 2: 2026-08-13
  - Ep 3: 2026-09-17, YouTube https://youtu.be/vzwHmOBjtUc
  - Ep 4: planned for 2026-10-15
- **Companion articles** are on kanset.com/news (one per episode).
- **The studio, The Studio Loft (@loftcreativespace),** films and delivers the master. The Dot does post-production (cuts, Shorts, captions, covers, retouch), the articles, posting and YouTube setup. Credit the studio wherever their footage appears.
- **Podcast hosts:** Maria Guerts (RCIC) and Mary Nirenberg (President). Spell Nirenberg exactly.

## Suggested first deliverable (if she agrees)

An anonymous Instagram carousel or reel on the portal story. Two possible angles: "How I stopped losing client edits" or "One review link instead of 20 emails".
- **Visuals:** sandbox screenshots with any client copy blurred. Phone width for the inline video and the editor; desktop for the agency view.
- **Brand:** The Dot's brand kit.
- **Review:** show Anastasia the drafts before anything is scheduled.

## Done means

- The decisions above are answered by Anastasia.
- **Case study A** is drafted and approved by her, live on the site and posted on Instagram.
- **Case studies B and C** are drafted from verified numbers, after Maria's naming answer.
- **The site refresh** is delivered to the scope she chose.
- The cleanup condition is stated: worktrees, build output and any browser sessions.

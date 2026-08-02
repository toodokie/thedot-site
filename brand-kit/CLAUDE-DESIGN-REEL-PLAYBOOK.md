# The Dot — Claude Design Reel Playbook

How we produce on-brand animated Reels: **Higgsfield keyframe → Claude Design animation → screen-record → post.** Repeatable. Pair with [BRAND-PRODUCTION-KIT.md](BRAND-PRODUCTION-KIT.md).

## The workflow (why it works)
1. **Higgsfield** (`gpt_image_2` + brand reference images) generates **ONE on-brand keyframe** — the "look anchor." It nails the editorial cut-out look and renders headline text cleanly. Save it (e.g. `looktest-01.png`).
2. **Claude Design** builds the full **animated multi-scene reel**, with that keyframe **attached as the exact style reference**. Free, fast, full control over timing and motion.
3. **Screen-record** the Claude Design output → 9:16 MP4 → post to Instagram (**add trending audio at post time**; Meta AI-content label ON).

Division of labor: Higgsfield = brand-accurate *frames*; Claude Design = *animation + assembly*. The keyframe bridges them and keeps every scene on-brand.

## Prompt requirements (the reusable template — every reel prompt needs all 7)
1. **Style anchor** — attach the approved Higgsfield keyframe and say "match the attached image exactly." Also list the brand rules in text; don't rely on the image alone.
2. **Audience line** — "small-business OWNERS, NOT technical people. Plain language, no jargon." This is the #1 thing that breaks reels.
3. **Brand style block** — cream `#faf9f6` ground (never white/dark), ink `#35332f`, ONE acid-yellow `#daff00` accent per scene (marker/one element, never a flat fill), halftone B&W cut-outs, bold Futura-style headlines, editorial masthead, silver dot sphere, sharp corners, film grain, the 5 brand colors only.
4. **Reel-safe zones** — keep readable content inside **≥14% top / ≥22% bottom / ≥8% sides**, nothing in the **lower-right** (IG buttons). Masthead dropped down from the top edge. Background/grain can bleed; text cannot.
5. **Scene structure** — ONE idea for the whole reel; a hook that meets the viewer where they are; ~7–8s/scene; ~30–40s total; plain copy per scene.
6. **Motion — the signature reel motion (paste this MOTION block into every reel prompt):**
   > Headlines **snap in word by word with a slight overshoot** (bounce-settle, not a soft fade). Yellow markers **draw on fast** (quick swipe). Checklist rows **punch in hard** (strong snap with impact). **Every scene has a slow "breathing" camera — a gentle push-in that settles** so nothing ever sits still. Clean cuts or paper-slide wipes between scenes; loop back to Scene 1.
7. **Output — MUST be MP4.** Every reel prompt has to explicitly state the deliverable is an **MP4 video file, 9:16, 1080×1920** — do not settle for an HTML-only/animated-design output. Say "deliver the final reel as an MP4" in the prompt, every time. No burned captions (headlines carry the message).

## Content principles (learned the hard way)
- **ONE idea per reel.** Six technical points reads as homework. Pick the single takeaway.
- **Lead with the outcome, not the topic.** Nobody wants "schema"; they want to be found. Name the payoff first.
- **Zero jargon.** No tool names, no "Organization ≠ Product." Use an everyday metaphor (schema = "a name tag for your website").
- **Meet the viewer's real state.** The strongest hooks validate confusion ("you've heard the word, no clue what to do with it") instead of lecturing.
- **Tips are welcome — simplified.** A saveable 3–4 point checklist works, phrased as plain outcomes, not technical steps.
- **Always answer "so what?"** Stakes: can't read you → can't recommend you → invisible when a customer is choosing.
- **Length: target ~30–40s. Tighten pacing, NOT content.** Shorten each scene's hold-time (cut dead air); never delete scenes or copy to hit the time. Keep read-heavy scenes (checklists) long enough to actually read — that's the frame people screenshot. Completion drives reach and drops after ~30s. Add a `PACING:` line to the prompt with per-scene seconds; do NOT uniform-speed-up the exported MP4 (text flashes by too fast to read).

## Worked example — the schema reel (FINAL, locked 2026-07-31)
Structure: HOOK (meet the confused owner) → WHAT IT IS (name tag metaphor) → 4-POINT CHECK (simplified tips, saveable) → PROOF (show the `/tools/ai-visibility` result: by-name ✓ / by-need ✗) → CTA (free check → link in bio). Audience = business owners; every technical term translated to plain language. Note it's framed as a **revision** ("keep the design, change only safe zones + copy") because Claude Design had already built a loved version.

```
Keep the reel you already built EXACTLY as-is — same style, layout, elements, colors,
textures, halftone cut-outs, dot sphere, masthead, grain, type treatment, and ALL the
animation and transitions. Do NOT redesign or regenerate the look. Change ONLY two things:

(1) SAFE ZONES — pull all readable text and the CTA inside a centered safe box:
    ≥14% margin top, ≥22% bottom, ≥8% sides, and nothing in the lower-right corner.
    Drop the masthead down from the top edge. Background, grain, and the cream ground
    may still bleed to the edges; only readable elements move inward.

(2) COPY — replace the scene text with the following (audience = small-business OWNERS,
    plain language, zero jargon). Apply the existing motion to the new words.

  SCENE 1 — HOOK: "Someone told you your website needs 'schema.' You nodded. Honestly?
    You have no clue what that means."  (yellow marker under "no clue")
  SCENE 2 — WHAT IT IS: "Schema is a name tag for your website. It tells Google and AI
    what your business actually is — who you help, what you do, where."
  SCENE 3 — THE CHECK: headline "Does yours actually work?" then 4 items stack in, one
    every ~2.5s:  1. It's actually there   2. It describes what you really do
    3. It matches your real name, address & phone   4. Google and AI can reach it
  SCENE 4 — THE PROOF: "So we built a free tool that asks AI for you." A result card
    animates in —  By name: checkmark found   |   By need: cross AI didn't name you.
    Yellow marker highlights the failed "By need" line.
  SCENE 5 — CTA: "Want the full checklist? The complete guide + a free 60-second check —
    both on our blog. Link in bio."  Dot device.

Everything else stays identical to the version I loved.

OUTPUT: deliver the final reel as an MP4 video file (9:16, 1080×1920).
```

**Post (blog-first):** the reel points to the blog, so PUBLISH the schema blog post first
(cover + Notion paste). Then: screen-record the reel → 9:16 MP4 → IG; **bio link → the schema
blog post** `https://www.thedotcreative.co/blog/is-your-schema-actually-helping` (full tips +
the embedded/linked tool); reshare to Story with a link sticker to the same URL; add trending
audio; Meta AI-content label ON.

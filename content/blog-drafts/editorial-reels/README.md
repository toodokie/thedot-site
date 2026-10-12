# October 2026 editorial Reel source

The Dot's two October campaigns share [studio.html](studio.html), an editable HTML/CSS source and the site's palette, Adobe kit `gac6jnd`, Futura PT and FF Real Text Pro. Their feed identities differ: the AI Reel uses a cream editorial story and silver orb; the Google Reel uses a charcoal search bulletin, chart and numbered data sections. The 16 captured JPGs in `rendered/` are the exact 1080 × 1920 scene inputs. [render.sh](render.sh) assembles each eight-scene sequence at 30 fps as a 28-second silent H.264 MP4, with hard cuts and a slow camera push. The first scene doubles as each campaign's Instagram cover. [Adjacent cover preview](adjacent-covers.jpg) shows their feed crop side by side.

[blog-covers.html](blog-covers.html) is the editable 1200 × 630 source for the two distinct article covers. Its exported PNGs are in `public/images/blog/<slug>/cover.png`; deploy those website assets before adding their production URLs to Notion's Featured Image and Social Image fields.

## Edit and re-export

1. Edit scene copy or styling in `studio.html`; update the matching `reel.md` storyboard and caption when copy changes.
2. Serve the repository root on localhost and visit `content/blog-drafts/editorial-reels/studio.html?campaign=agents&scene=0` (or `campaign=google`, scenes `0`–`7`) in a browser that can load the licensed Adobe kit. Capture each scene at **1080 × 1920** into `rendered/<campaign>-<two-digit-scene>.jpg`. Do not substitute fonts or export before the image and fonts finish loading.
3. Copy scene `00` to the corresponding campaign's `cover.jpg`. Run `bash content/blog-drafts/editorial-reels/render.sh` from the repo root. It creates `reel.mp4` in each campaign directory and prints codec, dimensions, frame rate and duration.

`render.sh` uses `ffmpeg` and cleans its temporary clips. The local preview server used for this production was stopped after QA. No website build output, browser process or render temp files need cleanup. The isolated worktree remains until the branch is reviewed and publication or preview deployment is explicitly approved.

## Editorial controls

- The AI Reel identifies the Anthropic incident as an **evaluation** and states the known impact was minimal. Source: [Anthropic](https://www.anthropic.com/news/investigating-unintended-model-actions).
- The Google Reel identifies the rollout dates and asks viewers to check data before changing pages. Source: [Google Search Status Dashboard](https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu).
- The illustrative form and chart are editorial graphics, not screenshots of Anthropic's evaluation or actual Search Console data.
- The Reels are fully legible without audio; no music rights or voice recording are needed.
- Instagram's controls cover edge regions. Essential copy, masthead and footer stay within the documented 8% left/right, 14% top and 22% bottom safe area in the captured scene composition. Verify the final preview in Instagram before posting because the interface can change.

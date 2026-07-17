# Publish package — "Can AI Find Your Business?"

Everything to paste into the blog CMS. The post body is `article.md`.

## CMS fields
| Field | Value |
| :- | :- |
| **Title** | Can AI Find Your Business? The New Kind of Search You Can't Ignore |
| **Slug** | `can-ai-find-your-business` |
| **metaTitle** (SEO) | Can AI Find Your Business? AI Search Visibility Guide |
| **metaDescription** | Nearly half of consumers now ask AI to find local businesses. Here's how AEO and GEO work, a free way to test if ChatGPT names you, and what actually helps. |
| **Excerpt** (card blurb) | Your customers are asking ChatGPT and Gemini for recommendations. Here's how to find out whether AI names your business, and what to do if it doesn't. |
| **Category** | Marketing (or your closest: "AI & Search" / "Digital Marketing") |
| **Tags** | AI Search, AEO, GEO, Local SEO, Small Business, ChatGPT, GTA Marketing |
| **Read time** | ~10 min |
| **featuredImage** | `/images/blog/can-ai-find-your-business/cover.jpg` (your Canva blog cover, 1200×630) |
| **socialImage** | same 1200×630 cover (used for link previews / OG) |

*Character counts: metaTitle 52, metaDescription 154, both within Google's display limits.*

## Images
Export your finished Canva covers and drop them in `public/images/blog/can-ai-find-your-business/`:
- `cover.jpg` — the 1200×630 blog cover (featured + social).
- The 1080×1350 Instagram cover is for the IG post, not the site.

## The embedded tool (already wired)
The article body contains the marker **`[[ai-visibility-tool]]`** in the "Audit yourself this afternoon" section. `BlogPostPage.tsx` detects that marker and renders the live `<AiVisibilitySelfCheck />` component in its place (posts without the marker are unaffected). So when you paste `article.md` into the CMS, leave the `[[ai-visibility-tool]]` line in the content exactly as is, on its own line. The tool also lives standalone at `/tools/ai-visibility`.

## Links inside the copy
The article references the free self-check in plain text (the embed handles it). If your CMS supports inline links, you can optionally link the phrase "AI-visibility self-check" to `/tools/ai-visibility` and "book an AI-visibility audit" to `/contacts`.

## Sources
The article ends with a sources list (BrightLocal, two Google docs, the MIT paper, HubSpot). Keep them as a short reference block or convert to inline links, your call. They add credibility and are good outbound signals.

# Brand Kit → Claude Design ("Create here")

Upload bundle for teaching Claude Design **The Dot Creative** brand.

## What's here
| File | What it teaches Claude |
|---|---|
| `BRAND-SPEC.md` | Exact tokens — colors, fonts, radius, spacing, component patterns |
| `brand-board.html` | Visual style guide (renders in real brand fonts) |
| `brand-in-use.html` | The brand shown in real media — poster, client work, decorative motifs |
| `logo.png` | Primary wordmark |
| `media/` | Brand poster + 6 client project heroes + layout signature |
| `decorative/` | Dot motif, brand shapes, arrow, divider line |

## How to upload (in the Claude Design app)
1. Open Claude Design (desktop sidebar or claude.ai/design) → **Add a design system** → **Create here**.
2. **Turn the two HTML boards into PDFs first** (best extraction quality):
   open `brand-board.html` and `brand-in-use.html` in a browser → **Print → Save as PDF**.
3. Drag into the uploader, in this priority order:
   - `BRAND-SPEC.md` (or paste its contents) — the ground-truth tokens
   - `brand-board.pdf` and `brand-in-use.pdf`
   - `logo.png`
   - everything in `media/` and `decorative/`
4. Let Claude generate the system, review the extracted colors/type/components, then **Publish**.

## Alternative: connect GitHub
"Create here" can also point at this repo directly. If you connect GitHub, target
`toodokie/thedot-site` and Claude will read `src/app/styles/globals.css` for tokens.
The curated bundle above still gives a cleaner result than the raw repo.

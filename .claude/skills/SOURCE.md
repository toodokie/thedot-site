# Skill provenance

The interface-craft review skills in this directory come from an upstream collection,
installed verbatim. Do not hand-edit their contents — update by re-copying from a newer
upstream commit (see "Updating" below) and bump the pin here.

## interfaces (jakubkrehel/skills)

- **Source:** https://github.com/jakubkrehel/skills
- **Pinned commit:** `a67333399dabbc71d7778962cb9c4fb9b86a00d0` (plugin v1.0.0, 2026-07-29)
- **Installed:** 2026-07-30, project-scoped, via manual copy of `skills/*`
- **License:** MIT (© Jakub Krehel / interfaces.dev)
- **Skills (7):** `better-interface` (orchestrator) · `better-ui` · `better-typography` ·
  `better-colors` · `better-accessibility` · `better-layout` · `better-writing`

Prescriptive interface-craft **review** skills that emit web recipes (HTML/CSS/ARIA).
Correct for this website; not for native/iOS or backend code. Installed project-scoped
(here, not user-global) so they fire only in this repo — the same machine holds an iOS
app and a backend where these web-CSS recipes would be wrong-platform advice.

Run `/better-interface` for a full cross-discipline review (`/better-interface quick`
for a short one); the other six fire from context.

### Styling idiom for this repo

thedotcreative.co uses **plain / global CSS — not Tailwind** (`src/app/styles/globals.css`,
`src/components/styles/*.css`). The skills adapt to the project's styling system, so any
review or fix they drive must be expressed in **plain-CSS idiom**, never Tailwind utility
classes. Do not hand-edit the generated/legacy `webflow-export/` CSS; the live site is the
Next.js `src/app` tree.

### Updating

Re-run the manual copy from a newer upstream commit, then update the pin above:

```
git clone --depth 1 https://github.com/jakubkrehel/skills.git <scratch>/jk-skills
cp -R <scratch>/jk-skills/skills/* .claude/skills/
```

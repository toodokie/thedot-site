# Piece Page Plan 4b of 5: Editing Like a Document Implementation Plan

**Approved spec; **plan approved by Anastasia 2026-10-03** with all decisions as recommended (switch per seat, preview seat first; server-side ticks gating Approve; DB approve guard on unsent drafts; Approve waits for media; phone nav hidden on the piece page, 767/1100 breakpoints; ProseMirror with our own Markdown codec; cut the line "I usually reply the same day"; Maria's switch flips with plan 5; media guard: design link counts per piece, new versions re-attach media, an approved no-media override silences the no-media alert, playback limits 1 per 10 min / 20 a day / 15 s stall, portal-ship gets --no-media).** Not built.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plan 4a's plain sheet editor with document-like editing (spec section 5): formatted text with no Markdown visible and a lossless Markdown round trip, track changes while editing and before sending, structured YouTube (Title, Description, Tags chips), chapters and Search & sharing fields, in-place editing on desktop and full-screen editor sheets on a phone, frame-by-frame and section-by-section editing that composes one block, "Jump to my edits", and the 50,000 character counter from 45,000.

**Architecture:** A small ProseMirror editor (`DocumentEditor`) over our own line-level Markdown codec (`markdown-doc.ts`). The codec splits a block into top-level Markdown blocks exactly as written; each block node keeps its source and a content signature, and is written back as that source, character for character, unless she changed it. Only an edited block is re-written, in Kanset's Markdown subset, and words never change on either path. A word-level diff drives a ProseMirror decoration plugin (track changes while editing) and a read-only `TrackedText` (review before sending). Plan 4a's `EditorHost` keeps its interface and gains in-place editing: on desktop the editor replaces the read view of the slot being edited (`EditSlot`, already placed by 4a); on a phone it opens a full-screen sheet with the toolbar above the keyboard. Structured fields are `form` requests rendered by the same host. Nothing about drafts, sending or the review contract changes: every editor still saves the whole block through plan 3's provider.

**Tech Stack:** ProseMirror core (`prosemirror-model`, `-state`, `-view`, `-commands`, `-history`, `-keymap`, `-schema-list`), React 19, CSS Modules on design-system tokens, Vitest 2 + Testing Library (jsdom), the codex runtime Playwright for scripted checks.

**Spec:** `~/Kanset/docs/superpowers/specs/2026-10-03-piece-page-redesign-design.md` section 5 (and 4.3, 4.4, 10, 12). Visual target: mockups `02-reel-editing.html`, `03b-reel-youtube-edit.html`, `06-article.html` in `.superpowers/brainstorm/mockups-2026-10-03/screens-v3/`.

**Builds on:** plan 4a merged and live (the `v2/` tree, `EditorHost` with `slotId` and `baseText`, `EditSlot`, `limits.ts`, the panels, `test-utils.tsx`), and plans 1 to 3.


> **Deploy correction 2026-10-04 (overrides every deploy step below).** Pushing `feat/portal-audit-fixes-2026-09-15` builds a Vercel **Preview only**; production is NOT deployed by a push (found when plan 1 shipped: commit a942714 built as Preview, production unchanged). Production deploys with the Vercel CLI from the clean frozen checkout: `cp -R ~/thedot-site/.vercel <worktree>/.vercel && cd <worktree> && npx vercel --prod --yes`, after the push so git and production match. Agents cannot run the push or the deploy (Claude Code's auto-mode blocks production deploys): hand Anastasia both commands, then confirm the new `target: production` deployment is READY (Vercel `list_deployments`) and verify live with a browser user agent (plain curl gets 403).

---

## Decisions for Anastasia (answer before Task 1; each has a recommendation)

1. **Editor library: ProseMirror core, our own Markdown codec.** ProseMirror (MIT, maintained by its author since 2015, the engine TipTap is built on) gives document editing, undo, lists, keyboard handling and decorations for track changes. We do not use `prosemirror-markdown`/`markdown-it` or TipTap's Markdown add-on: both normalise Markdown on the way out (bullet characters, emphasis markers, escapes, soft line breaks), which would rewrite untouched text and break the reconciler's exact-match rule. Our codec keeps every untouched block byte-identical by construction. Cost: about 50 KB gzipped, loaded only on the piece page. No new server dependency. **Recommend: yes.**
2. **What "lossless" means in practice.** Everything she does not touch comes back character for character (proved on every real canonical file, Task 3). A block she edits is re-written in Kanset's own Markdown style (her words exactly; formatting markers in the form the block already used; a numbered list she edits is renumbered 1, 2, 3). **Recommend: yes.**
3. **Round-trip tests read the real canonical files** from `~/Kanset/portal-content` (or `PORTAL_CONTENT_DIR`) at test time and skip when the folder is absent. No client copy is committed to `thedot-site`; committed fixtures are synthetic. **Recommend: yes.**
4. **Track changes are word level.** Added words get the yellow highlighter, removed words are struck through. Turning bold on or off is not shown as a change. **Recommend: yes.**
5. **The 50,000 limit counts characters the way the database does** (code points, so an emoji is one). The counter appears from 45,000. Over the limit, Send turns off with a plain line; the editor never cuts her text. **Recommend: yes.**
6. **Desktop edits in place; a phone opens a full-screen sheet.** Visual notes ("Suggest a change") stay a small sheet on both. **Recommend: yes.**
7. **Field guidance, not limits:** YouTube title shows "n of 100 characters" (YouTube's limit), search title 60 and search description 160 (search-result guidance). Going over is shown, never blocked. **Recommend: yes.**
8. **Maria's switch** flips with plan 5's feedback card and rollout note (4a decision 12), after you have used the editor on the preview seat and on your phone. **Recommend: yes.**

---

## Ground rules for whoever executes this

- **Playbook section 12** applies: one editor owns the slice, frozen hash reviewed with the `code-review` skill (no Codex lane), unit tests and build before deploy, push the reviewed branch. **No migration in this plan.**
- **One editor owns** `src/app/client/[slug]/piece/[contentId]/v2/`, `src/components/portal/editor/`, `src/lib/portal/piece-page/`, `scripts/piece-page-phone-check.mjs` and `package.json`/`pnpm-lock.yaml` while this runs.
- **Host discipline:** one worktree; one full build in Task 13; the local `next start` for the layout check is stopped in the same step; Playwright only in Tasks 13 and 14.
- **Never `git add -A` or `git add .`.** Commits stay local until Task 14.
- **No em dashes** in any file this plan creates or edits.

**Test commands (from the worktree root):** one file `pnpm exec vitest run <path>`; full suite `pnpm test`; types `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]/v2|components/portal/editor|piece-page/' || echo clean`.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | Modify | Seven ProseMirror packages |
| `src/lib/portal/piece-page/markdown-doc.ts` (+ `.test.ts`) | Create | Schema; lossless `parseMarkdown` / `serializeMarkdown`; `normalizedBlock` |
| `src/lib/portal/piece-page/editor-commands.ts` | Create | Enter, Shift-Enter, bold, italic for the Markdown schema |
| `src/lib/portal/piece-page/canonical-corpus.test.ts` | Create | Round trip, segmenting, YouTube and SEO codecs over every real canonical block |
| `src/lib/portal/piece-page/text-diff.ts` (+ `.test.ts`) | Create | Word-level diff |
| `src/lib/portal/piece-page/track-changes.ts` (+ `.test.ts`) | Create | Document text map, change ranges, the decoration plugin |
| `src/lib/portal/piece-page/limits.ts` (+ `limits.test.ts`) | Modify / Create | `characterCount` (code points) |
| `src/components/portal/editor/DocumentEditor.tsx` (+ `.test.tsx`) | Create | The ProseMirror editor component |
| `src/components/portal/editor/document-editor.module.css` | Create | Editor surface, ins and del, ProseMirror essentials |
| `src/components/portal/editor/TrackedText.tsx` (+ `.test.tsx`) | Create | Read-only tracked changes |
| `src/components/portal/editor/LengthCounter.tsx` (+ `.test.tsx`) | Create | Counter from 45,000; over-limit line |
| `src/app/client/[slug]/edit-length-limit.test.ts` | Modify | The new editor keeps the 50,000 limit and never truncates |
| `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx` (+ `.test.tsx`) | Rewrite | In place on desktop, full-screen sheet on a phone, forms |
| `src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx` | Modify | ProseMirror layout stubs for jsdom |
| `src/app/client/[slug]/piece/[contentId]/v2/editors/TagChips.tsx`, `YouTubeForms.tsx`, `ChaptersForm.tsx`, `SearchForm.tsx`, `JumpToEdits.tsx` (+ `editors.test.tsx`) | Create | Structured fields and article navigation |
| `src/app/client/[slug]/piece/[contentId]/v2/panels/*.tsx` | Modify | Open the structured forms; tracked text for unsent edits; Jump to my edits |
| `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx`, `panels-part2.test.tsx`, new `panels-tracked.test.tsx` | Modify / Create | Tests follow the document editor |
| `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx` | Modify | Over-limit counts code points |
| `src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css` | Modify | Inline editor, form fields, chips, chapter rows |
| `scripts/piece-page-phone-check.mjs` | Modify | Editing checks: full-screen sheet on a phone, in place on desktop |
| `docs/PORTAL-AGENT-MANUAL.md` | Modify | Editor notes in section 13 |

---

### Task 0: Workspace

**Files:** none changed.

- [ ] **Step 1: Create the worktree from the branch that carries plan 4a**

```bash
git -C ~/thedot-site fetch origin
git -C ~/thedot-site ls-tree -r --name-only origin/feat/portal-audit-fixes-2026-09-15 "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx" src/lib/portal/piece-page/limits.ts
git -C ~/thedot-site worktree add ~/worktrees/kanset-piece-page-editor -b feat/piece-page-editor origin/feat/portal-audit-fixes-2026-09-15
cd ~/worktrees/kanset-piece-page-editor && pnpm install --frozen-lockfile
```

Expected: both 4a files listed (if not, stop: 4a is not merged); the worktree is created; install finishes.

Cleanup condition: remove this worktree in Task 14 after the reviewed branch is pushed and production is verified.

---

### Task 1: Add the ProseMirror packages

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
cd ~/worktrees/kanset-piece-page-editor
pnpm add prosemirror-model prosemirror-state prosemirror-view prosemirror-commands prosemirror-history prosemirror-keymap prosemirror-schema-list
pnpm list prosemirror-model prosemirror-state prosemirror-view prosemirror-commands prosemirror-history prosemirror-keymap prosemirror-schema-list --depth 0
```

Expected: seven packages at major version 1 (for example `prosemirror-view 1.x`). `prosemirror-commands` must be at least 1.5 (it provides `splitBlockAs`): if the list shows an older version, run `pnpm add prosemirror-commands@^1.5`.

- [ ] **Step 2: Prove they load in Node (server rendering imports them)**

Run: `pnpm exec node --input-type=module -e "for (const m of ['prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-commands','prosemirror-history','prosemirror-keymap','prosemirror-schema-list']) await import(m); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add package.json pnpm-lock.yaml
git -C ~/worktrees/kanset-piece-page-editor commit -m "Add ProseMirror for document-like editing on the piece page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The lossless Markdown document model and editor commands

**Files:**
- Create: `src/lib/portal/piece-page/markdown-doc.ts`
- Create: `src/lib/portal/piece-page/editor-commands.ts`
- Create: `src/lib/portal/piece-page/markdown-doc.test.ts`

Kanset's canonical blocks use a small Markdown subset (checked over all 94 files on 2026-10-03): paragraphs whose single line breaks matter (`01 The fee...\n02 The wage...`), `#` to `###` headings, `-`/`*` and numbered lists (some with `[ ]` checkboxes and indented continuation lines), `>` quotes, `---` rules, `**bold**`, `__bold__`, `*italic*`, `_italic_`, inline code and `[text](https://...)` links. Everything else stays literal text. That subset is what this model edits.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { enter } from './editor-commands'
import { normalizedBlock, parseMarkdown, schema, serializeMarkdown } from './markdown-doc'

const SHAPES: Record<string, string> = {
  caption: 'What does it cost?\n\n01 The fee: $1,000 per position.\n02 The wage line: $36.92/hour.\n\n#LMIA #KansetServices',
  youtube: '**Title:** What does a permit cost?\n\n**Description:**\nThree things.\n\n**Tags:** LMIA, cost',
  lists: '- Paid by the employer.\n- Never recovered.\n\n1. The median wage.\n2. What you pay others.\n\n- [ ] Approve a promotion\n- [x] Change the wage',
  continuation: '- **Scene 1 (0.0s - 5.0s):** Hook text\n  continues here\n- **Scene 2:** Next',
  article: '# Title\n\nOpening *with* emphasis and a [link](https://www.canada.ca/a).\n\n### Section\n\n> "A quote"\n> continues\n\n---\n\n*General information only.*',
  mixed: 'Line before list\n- item one\n- item two\nLine after',
  spacing: '\n\nLeading newlines and trailing spaces  \n\n\n\nThree blank lines above.   ',
  inline: 'Use `code` and __strong__ and _em_ and ** not bold',
  emoji: '📌 Already applied? Enter the date → see weeks left.',
  numbers: '1. one\n1. one again\n3. three',
  empty: '',
}

function findText(doc: PMNode, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text)
    return found < 0
  })
  if (found < 0) throw new Error(`no ${text}`)
  return found
}

describe('parseMarkdown and serializeMarkdown', () => {
  it('round-trip every shape character for character', () => {
    for (const [name, body] of Object.entries(SHAPES)) {
      expect(serializeMarkdown(parseMarkdown(body)), name).toBe(body)
    }
  })

  it('shows no Markdown: labels are bold text, lists are lists, checkboxes are marked', () => {
    const youtube = parseMarkdown(SHAPES.youtube)
    expect(youtube.textContent).not.toContain('**')
    expect(youtube.firstChild!.firstChild!.marks.map((m) => m.type.name)).toEqual(['strong'])
    const lists = parseMarkdown(SHAPES.lists)
    expect(lists.content.content.map((n) => n.type.name)).toEqual(['bullet_list', 'ordered_list', 'bullet_list'])
    expect(lists.child(2).child(0).attrs.marker).toBe('- [ ] ')
    const article = parseMarkdown(SHAPES.article)
    expect(article.content.content.map((n) => n.type.name)).toEqual(['heading', 'paragraph', 'heading', 'blockquote', 'horizontal_rule', 'paragraph'])
    expect(article.child(0).attrs.level).toBe(1)
  })

  it('re-writes an untouched block exactly as it was written', () => {
    for (const name of ['caption', 'youtube', 'lists', 'continuation', 'article', 'mixed', 'inline', 'emoji']) {
      parseMarkdown(SHAPES[name]).forEach((node) => {
        expect(normalizedBlock(node), `${name}: ${node.attrs.raw}`).toBe(node.attrs.raw)
      })
    }
  })

  it('renumbers an edited numbered list and keeps every word', () => {
    const list = parseMarkdown(SHAPES.numbers).firstChild!
    expect(normalizedBlock(list)).toBe('1. one\n2. one again\n3. three')
  })

  it('changes only the block she edited', () => {
    const doc = parseMarkdown(SHAPES.caption)
    const state = EditorState.create({ doc })
    const at = findText(doc, '01 The fee')
    const edited = serializeMarkdown(state.apply(state.tr.insertText('NEW ', at)).doc)
    expect(edited).toBe(SHAPES.caption.replace('01 The fee', 'NEW 01 The fee'))
  })

  it('starts a new block with a blank line on Enter', () => {
    const doc = parseMarkdown(SHAPES.caption)
    let state = EditorState.create({ doc })
    const end = findText(doc, 'What does it cost?') + 'What does it cost?'.length
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)))
    enter(state, (tr) => { state = state.apply(tr) })
    state = state.apply(state.tr.insertText('New line'))
    expect(serializeMarkdown(state.doc)).toBe(SHAPES.caption.replace('What does it cost?\n\n', 'What does it cost?\n\nNew line\n\n'))
  })

  it('continues a numbered list on Enter', () => {
    const doc = parseMarkdown('1. The median wage.\n2. What you pay others.')
    let state = EditorState.create({ doc })
    const end = findText(doc, 'What you pay others.') + 'What you pay others.'.length
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)))
    enter(state, (tr) => { state = state.apply(tr) })
    state = state.apply(state.tr.insertText('A third item.'))
    expect(serializeMarkdown(state.doc)).toBe('1. The median wage.\n2. What you pay others.\n3. A third item.')
  })

  it('keeps a line break inside a quote on Enter', () => {
    const doc = parseMarkdown('> First line')
    let state = EditorState.create({ doc })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, findText(doc, 'First line') + 10)))
    enter(state, (tr) => { state = state.apply(tr) })
    state = state.apply(state.tr.insertText('Second'))
    expect(serializeMarkdown(state.doc)).toBe('> First line\n> Second')
  })

  it('writes bold she adds with the block marker style', () => {
    const doc = parseMarkdown('plain words')
    const state = EditorState.create({ doc })
    const tr = state.tr.addMark(1, 6, schema.marks.strong.create())
    expect(serializeMarkdown(state.apply(tr).doc)).toBe('**plain** words')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/markdown-doc.test.ts`
Expected: FAIL, cannot resolve `./editor-commands` and `./markdown-doc`.

- [ ] **Step 3: Implement the model**

`src/lib/portal/piece-page/markdown-doc.ts`:

```ts
// Lossless Markdown <-> ProseMirror document for the piece page editor (spec 2026-10-03 section 5).
//
// Maria edits formatted text; the canonical pipeline stores Markdown and the reconciler applies her
// text exactly. So the editor must hand back byte-identical Markdown for everything she did not
// touch. The body is split into top-level blocks exactly as written; the blank-line runs between
// them and any leading and trailing whitespace are kept. Each block node remembers its source (raw)
// and a signature of its content (sig). On the way out, a block whose content still matches its
// signature is written back as its source; only a block she edited is re-written from the document,
// in Kanset's Markdown subset. Words never change on either path (plan 4b, Task 3 proves it over
// every real canonical block).
import { Schema, type Mark, type Node as PMNode, type NodeType } from 'prosemirror-model'

const BLOCK_ATTRS = { raw: { default: null }, sig: { default: null }, sep: { default: '\n\n' } }

function checkState(marker: unknown): string | null {
  if (typeof marker !== 'string') return null
  if (/\[ \]/.test(marker)) return 'unchecked'
  if (/\[[xX]\]/.test(marker)) return 'checked'
  return null
}

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+', attrs: { lead: { default: '' }, trail: { default: '' } } },
    paragraph: {
      group: 'block', content: 'inline*',
      // lead: whitespace before the first line; lineLead: what a new line inside this block starts with.
      attrs: { ...BLOCK_ATTRS, lead: { default: '' }, lineLead: { default: '' } },
      parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block', content: 'inline*', defining: true,
      attrs: { ...BLOCK_ATTRS, level: { default: 3 }, markup: { default: '###' }, gap: { default: ' ' } },
      // The piece title is the page's h1, so a level-1 Markdown heading renders as h2.
      toDOM: (node) => [`h${Math.min(6, Number(node.attrs.level) + 1)}`, 0],
    },
    blockquote: { group: 'block', content: 'paragraph', attrs: { ...BLOCK_ATTRS }, toDOM: () => ['blockquote', 0] },
    bullet_list: { group: 'block', content: 'list_item+', attrs: { ...BLOCK_ATTRS }, toDOM: () => ['ul', 0] },
    ordered_list: { group: 'block', content: 'list_item+', attrs: { ...BLOCK_ATTRS }, toDOM: () => ['ol', 0] },
    list_item: {
      content: 'paragraph', defining: true, attrs: { marker: { default: '' } },
      toDOM: (node) => {
        const check = checkState(node.attrs.marker)
        return check ? ['li', { 'data-check': check }, 0] : ['li', 0]
      },
    },
    horizontal_rule: { group: 'block', attrs: { ...BLOCK_ATTRS }, toDOM: () => ['hr'] },
    text: { group: 'inline' },
    hard_break: {
      inline: true, group: 'inline', selectable: false,
      // lead: exactly what followed the line break in the source (indent, "> "); null for a new one.
      attrs: { lead: { default: null } },
      toDOM: () => ['br'],
    },
  },
  marks: {
    strong: { attrs: { markup: { default: '**' } }, parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { attrs: { markup: { default: '*' } }, parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    code: { excludes: '_', parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    link: {
      attrs: { href: {} }, inclusive: false,
      toDOM: (mark) => ['a', { href: String(mark.attrs.href), rel: 'noreferrer', target: '_blank' }, 0],
    },
  },
})

const HEADING = /^(#{1,6})([ \t]+)(\S.*)$/
const HR = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const LIST = /^([ \t]{0,3})(?:[-+*]|(\d{1,9})[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/
const QUOTE = /^([ \t]{0,3}>[ \t]?)(.*)$/
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g
const BULLET_MARKER = /^[ \t]{0,3}[-+*][ \t]+(?:\[[ xX]\][ \t]+)?$/
const ORDERED_MARKER = /^([ \t]{0,3})(\d{1,9})([.)])([ \t]+)(\[[ xX]\][ \t]+)?$/

type Kind = 'paragraph' | 'heading' | 'hr' | 'list' | 'quote'
type Group = { kind: Kind; lines: string[] }
type Line = { lead: string; text: string }

function lineKind(line: string): Kind {
  if (HEADING.test(line)) return 'heading'
  if (HR.test(line)) return 'hr'
  const list = LIST.exec(line)
  if (list && list[0].length < line.length) return 'list'
  if (QUOTE.test(line)) return 'quote'
  return 'paragraph'
}

function groupLines(lines: string[]): Group[] {
  const groups: Group[] = []
  for (const line of lines) {
    const kind = lineKind(line)
    const last = groups.at(-1)
    if (kind === 'heading' || kind === 'hr') { groups.push({ kind, lines: [line] }); continue }
    if (last && last.kind === 'list' && kind === 'paragraph' && /^[ \t]+\S/.test(line)) { last.lines.push(line); continue }
    if (last && last.kind === kind) { last.lines.push(line); continue }
    groups.push({ kind, lines: [line] })
  }
  return groups
}

function splitLead(line: string): Line {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? ''
  return { lead, text: line.slice(lead.length) }
}

function inlineNodes(text: string): PMNode[] {
  const nodes: PMNode[] = []
  for (const part of text.split(INLINE)) {
    if (!part) continue
    let mark: Mark | null = null
    let inner = part
    const link = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part)
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) { mark = schema.marks.strong.create({ markup: '**' }); inner = part.slice(2, -2) }
    else if (part.length > 4 && part.startsWith('__') && part.endsWith('__')) { mark = schema.marks.strong.create({ markup: '__' }); inner = part.slice(2, -2) }
    else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) { mark = schema.marks.code.create(); inner = part.slice(1, -1) }
    else if (link) { mark = schema.marks.link.create({ href: link[2] }); inner = link[1] }
    else if (part.length > 2 && part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) { mark = schema.marks.em.create({ markup: '*' }); inner = part.slice(1, -1) }
    else if (part.length > 2 && part.startsWith('_') && part.endsWith('_') && !part.startsWith('__')) { mark = schema.marks.em.create({ markup: '_' }); inner = part.slice(1, -1) }
    if (inner) nodes.push(schema.text(inner, mark ? [mark] : []))
  }
  return nodes
}

function textLines(lines: Line[]): PMNode[] {
  const nodes: PMNode[] = []
  lines.forEach((line, index) => {
    if (index > 0) nodes.push(schema.nodes.hard_break.create({ lead: line.lead }))
    nodes.push(...inlineNodes(line.text))
  })
  return nodes
}

function stripBlockAttrs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripBlockAttrs)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'attrs' && entry && typeof entry === 'object') {
      const attrs = { ...(entry as Record<string, unknown>) }
      delete attrs.raw
      delete attrs.sig
      delete attrs.sep
      out.attrs = attrs
    } else {
      out[key] = stripBlockAttrs(entry)
    }
  }
  return out
}

// Everything that decides how a block is written, except its remembered source and separator.
export function contentSig(node: PMNode): string {
  return JSON.stringify(stripBlockAttrs(node.toJSON()))
}

function block(type: NodeType, attrs: Record<string, unknown>, content: PMNode[], raw: string, sep: string): PMNode {
  const probe = type.create({ ...attrs, sep }, content)
  return type.create({ ...attrs, sep, raw, sig: contentSig(probe) }, content)
}

function buildLists(lines: string[], sep: string): PMNode[] {
  type Item = { marker: string; ordered: boolean; lines: Line[]; raw: string[] }
  const items: Item[] = []
  for (const line of lines) {
    const match = LIST.exec(line)
    if (match && match[0].length < line.length) {
      items.push({ marker: match[0], ordered: match[2] !== undefined, lines: [{ lead: '', text: line.slice(match[0].length) }], raw: [line] })
      continue
    }
    const last = items[items.length - 1]
    last.lines.push(splitLead(line))
    last.raw.push(line)
  }
  const runs: Item[][] = []
  for (const item of items) {
    const run = runs[runs.length - 1]
    if (run && run[0].ordered === item.ordered) run.push(item)
    else runs.push([item])
  }
  return runs.map((run, index) => {
    const listItems = run.map((item) => schema.nodes.list_item.create({ marker: item.marker }, [
      schema.nodes.paragraph.create({ lineLead: ' '.repeat(item.marker.length) }, textLines(item.lines)),
    ]))
    const type = run[0].ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list
    return block(type, {}, listItems, run.flatMap((item) => item.raw).join('\n'), index === 0 ? sep : '\n')
  })
}

function buildGroup(group: Group, sep: string): PMNode[] {
  const raw = group.lines.join('\n')
  const nodes = schema.nodes
  switch (group.kind) {
    case 'heading': {
      const match = HEADING.exec(group.lines[0]) as RegExpExecArray
      return [block(nodes.heading, { level: match[1].length, markup: match[1], gap: match[2] }, inlineNodes(match[3]), raw, sep)]
    }
    case 'hr':
      return [block(nodes.horizontal_rule, {}, [], raw, sep)]
    case 'quote': {
      const lines = group.lines.map((line) => {
        const match = QUOTE.exec(line) as RegExpExecArray
        return { lead: match[1], text: match[2] }
      })
      const paragraph = nodes.paragraph.create({ lead: lines[0].lead, lineLead: '> ' }, textLines(lines))
      return [block(nodes.blockquote, {}, [paragraph], raw, sep)]
    }
    case 'list':
      return buildLists(group.lines, sep)
    default: {
      const lines = group.lines.map(splitLead)
      return [block(nodes.paragraph, { lead: lines[0].lead }, textLines(lines), raw, sep)]
    }
  }
}

export function parseMarkdown(body: string): PMNode {
  const lead = /^\n*/.exec(body)?.[0] ?? ''
  const rest = body.slice(lead.length)
  const trail = /\s*$/.exec(rest)?.[0] ?? ''
  const core = rest.slice(0, rest.length - trail.length)
  const nodes: PMNode[] = []
  if (core.length > 0) {
    const pieces = core.split(/(\n(?:[ \t]*\n)+)/)
    for (let i = 0; i < pieces.length; i += 2) {
      groupLines(pieces[i].split('\n')).forEach((group, g) => {
        nodes.push(...buildGroup(group, g === 0 ? (i === 0 ? '\n\n' : pieces[i - 1]) : '\n'))
      })
    }
  }
  if (nodes.length === 0) nodes.push(block(schema.nodes.paragraph, {}, [], '', '\n\n'))
  return schema.nodes.doc.create({ lead, trail }, nodes)
}

const MARK_ORDER = ['link', 'strong', 'em', 'code']

function openToken(mark: Mark): string {
  if (mark.type.name === 'strong' || mark.type.name === 'em') return String(mark.attrs.markup)
  if (mark.type.name === 'code') return '`'
  return mark.type.name === 'link' ? '[' : ''
}

function closeToken(mark: Mark): string {
  if (mark.type.name === 'strong' || mark.type.name === 'em') return String(mark.attrs.markup)
  if (mark.type.name === 'code') return '`'
  return mark.type.name === 'link' ? `](${String(mark.attrs.href)})` : ''
}

export function inlineMarkdown(node: PMNode, defaultLead: string): string {
  let out = ''
  const active: Mark[] = []
  const closeTo = (keep: number) => { while (active.length > keep) out += closeToken(active.pop() as Mark) }
  node.forEach((child) => {
    if (child.type.name === 'hard_break') {
      closeTo(0)
      out += `\n${child.attrs.lead ?? defaultLead}`
      return
    }
    const marks = [...child.marks].sort((a, b) => MARK_ORDER.indexOf(a.type.name) - MARK_ORDER.indexOf(b.type.name))
    let keep = 0
    while (keep < active.length && keep < marks.length && active[keep].eq(marks[keep])) keep++
    closeTo(keep)
    for (let i = keep; i < marks.length; i++) {
      out += openToken(marks[i])
      active.push(marks[i])
    }
    out += child.text ?? ''
  })
  closeTo(0)
  return out
}

function listMarkdown(list: PMNode): string {
  const ordered = list.type.name === 'ordered_list'
  const lines: string[] = []
  let previous: number | null = null
  let bullet = '- '
  list.forEach((item) => {
    let marker = String(item.attrs.marker ?? '')
    if (ordered) {
      const match = ORDERED_MARKER.exec(marker)
      const fallback = previous === null ? 1 : previous + 1
      const number = match && (previous === null || Number(match[2]) !== previous) ? Number(match[2]) : fallback
      marker = match ? `${match[1]}${number}${match[3]}${match[4]}${match[5] ?? ''}` : `${number}. `
      previous = number
    } else if (BULLET_MARKER.test(marker)) {
      bullet = /^[ \t]{0,3}[-+*][ \t]+/.exec(marker)?.[0] ?? bullet
    } else {
      marker = bullet
    }
    const paragraph = item.firstChild as PMNode
    lines.push(marker + inlineMarkdown(paragraph, String(paragraph.attrs.lineLead || ' '.repeat(marker.length))))
  })
  return lines.join('\n')
}

// A block written from the document alone, ignoring its remembered source.
export function normalizedBlock(node: PMNode): string {
  switch (node.type.name) {
    case 'paragraph': return String(node.attrs.lead ?? '') + inlineMarkdown(node, String(node.attrs.lineLead ?? ''))
    case 'heading': return `${node.attrs.markup}${node.attrs.gap}${inlineMarkdown(node, '')}`
    case 'horizontal_rule': return typeof node.attrs.raw === 'string' ? node.attrs.raw : '---'
    case 'blockquote': {
      const paragraph = node.firstChild as PMNode
      return `${paragraph.attrs.lead || '> '}${inlineMarkdown(paragraph, String(paragraph.attrs.lineLead || '> '))}`
    }
    case 'bullet_list':
    case 'ordered_list': return listMarkdown(node)
    default: return node.textContent
  }
}

export function serializeBlock(node: PMNode): string {
  if (typeof node.attrs.raw === 'string' && node.attrs.sig === contentSig(node)) return node.attrs.raw
  return normalizedBlock(node)
}

export function serializeMarkdown(doc: PMNode): string {
  let out = String(doc.attrs.lead ?? '')
  doc.forEach((node, _offset, index) => {
    if (index > 0) out += typeof node.attrs.sep === 'string' ? node.attrs.sep : '\n\n'
    out += serializeBlock(node)
  })
  return out + String(doc.attrs.trail ?? '')
}
```

`src/lib/portal/piece-page/editor-commands.ts`:

```ts
import { chainCommands, splitBlockAs, toggleMark } from 'prosemirror-commands'
import { liftListItem, splitListItem } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import { schema } from './markdown-doc'

export const insertHardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
}

// A new top-level paragraph is a new Markdown block: a blank line before it and no remembered source.
export const newParagraph: Command = splitBlockAs(() => ({
  type: schema.nodes.paragraph,
  attrs: { sep: '\n\n', raw: null, sig: null, lead: '', lineLead: '' },
}))

const breakInQuote: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === schema.nodes.blockquote) return insertHardBreak(state, dispatch)
  }
  return false
}

export const enter: Command = chainCommands(
  breakInQuote,
  splitListItem(schema.nodes.list_item),
  liftListItem(schema.nodes.list_item),
  newParagraph,
)
export const toggleStrong: Command = toggleMark(schema.marks.strong)
export const toggleEm: Command = toggleMark(schema.marks.em)
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/markdown-doc.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add src/lib/portal/piece-page/markdown-doc.ts src/lib/portal/piece-page/editor-commands.ts src/lib/portal/piece-page/markdown-doc.test.ts
git -C ~/worktrees/kanset-piece-page-editor commit -m "Add a lossless Markdown document model for the piece page editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Round trip over every real canonical block

**Files:**
- Create: `src/lib/portal/piece-page/canonical-corpus.test.ts`

Reads the private canonical repository at test time through the real parser (`parseContentFile`), so the blocks are exactly what Supabase holds. Skips, with a visible note, where the folder is absent (CI, other machines). Nothing from it is committed.

- [ ] **Step 1: Write the test**

```ts
// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { parseContentFile } from '@/lib/portal/frontmatter'
import { parseLabeledList, serializeLabeledList } from './labeled-list'
import { normalizedBlock, parseMarkdown, schema, serializeMarkdown } from './markdown-doc'
import { joinSegments, segmentBlock } from './segments'
import { parseYouTubePackage, serializeYouTubePackage } from './youtube-fields'

const DIR = process.env.PORTAL_CONTENT_DIR ?? join(homedir(), 'Kanset', 'portal-content')
const FILES = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith('.md')) : []
if (FILES.length === 0) console.warn(`canonical-corpus: no canonical files at ${DIR}; the real-block round trip was skipped`)

type Block = { where: string; key: string; body: string }

function blocks(): Block[] {
  return FILES.flatMap((file) => parseContentFile(readFileSync(join(DIR, file), 'utf8'), file).copy_blocks
    .map((block) => ({ where: `${file}#${block.key}`, key: block.key, body: block.body })))
}

describe.skipIf(FILES.length === 0)('every real canonical block', () => {
  const all = blocks()

  it('has a corpus worth testing', () => {
    expect(all.length).toBeGreaterThan(150)
  })

  it('round-trips through the editor model character for character', () => {
    expect(all.filter((b) => serializeMarkdown(parseMarkdown(b.body)) !== b.body).map((b) => b.where)).toEqual([])
  })

  it('keeps every word when any block is re-written from scratch', () => {
    const changed: string[] = []
    for (const b of all) {
      parseMarkdown(b.body).forEach((node, _offset, index) => {
        const again = parseMarkdown(normalizedBlock(node))
        if (again.textContent !== node.textContent) changed.push(`${b.where} node ${index}`)
      })
    }
    expect(changed).toEqual([])
  })

  it('leaves every other block byte-identical when one word changes in the last block', () => {
    const broken: string[] = []
    for (const b of all) {
      const doc = parseMarkdown(b.body)
      if (doc.childCount < 2) continue
      let target = -1
      doc.forEach((node, offset, index) => {
        if (index !== doc.childCount - 1) return
        node.descendants((child, pos) => {
          if (target < 0 && child.isText) target = offset + 1 + pos
          return target < 0
        })
      })
      if (target < 0) continue
      const state = EditorState.create({ doc })
      const edited = serializeMarkdown(state.apply(state.tr.insertText('X', target)).doc)
      const prefixDoc = schema.nodes.doc.create({ lead: doc.attrs.lead, trail: '' },
        Array.from({ length: doc.childCount - 1 }, (_, i) => doc.child(i)))
      const prefix = serializeMarkdown(prefixDoc) + String(doc.lastChild!.attrs.sep)
      if (!edited.startsWith(prefix)) broken.push(b.where)
    }
    expect(broken).toEqual([])
  })

  it('segments every block into frames, pages and sections losslessly', () => {
    const broken = all.flatMap((b) => (['frames', 'pages', 'sections'] as const)
      .filter((mode) => joinSegments(segmentBlock(b.body, mode)) !== b.body).map((mode) => `${b.where} ${mode}`))
    expect(broken).toEqual([])
  })

  it('reads every YouTube package losslessly or declines it', () => {
    const packages = all.filter((b) => ['youtube-package', 'youtube-short', 'youtube-shorts-copy'].includes(b.key))
    const broken = packages.filter((b) => {
      const parsed = parseYouTubePackage(b.body)
      return parsed !== null && serializeYouTubePackage(parsed) !== b.body
    }).map((b) => b.where)
    expect(broken).toEqual([])
  })

  it('reads every article search block losslessly', () => {
    const seo = all.filter((b) => b.key === 'article-seo')
    expect(seo.filter((b) => serializeLabeledList(parseLabeledList(b.body)) !== b.body).map((b) => b.where)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run src/lib/portal/piece-page/canonical-corpus.test.ts`
Expected on Anastasia's Mac: PASS, 7 tests. Elsewhere: the suite is skipped with the warning line.

If a block fails the round trip, do not special-case the file: reduce it to the smallest failing Markdown, add that as a new shape in `markdown-doc.test.ts`, fix `markdown-doc.ts` until both pass. If "keeps every word" fails, the inline tokenizer and `inlineMarkdown` disagree on that construct; add the construct to the `inline` shape and fix the pair.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add src/lib/portal/piece-page/canonical-corpus.test.ts
git -C ~/worktrees/kanset-piece-page-editor commit -m "Prove the editor model round-trips every real canonical block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Word diff, track changes and tracked text

**Files:**
- Create: `src/lib/portal/piece-page/text-diff.ts` (+ `text-diff.test.ts`)
- Create: `src/lib/portal/piece-page/track-changes.ts` (+ `track-changes.test.ts`)
- Create: `src/components/portal/editor/document-editor.module.css`
- Create: `src/components/portal/editor/TrackedText.tsx` (+ `TrackedText.test.tsx`)

- [ ] **Step 1: Write the failing tests**

`text-diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { diffWords, tokenize } from './text-diff'

describe('diffWords', () => {
  it('tokenises words and the spaces between them', () => {
    expect(tokenize('a  b\nc')).toEqual(['a', '  ', 'b', '\n', 'c'])
  })

  it('marks a replaced word as removed then added', () => {
    expect(diffWords('a b c', 'a x c')).toEqual([
      { op: 'equal', text: 'a ' }, { op: 'delete', text: 'b' }, { op: 'insert', text: 'x' }, { op: 'equal', text: ' c' },
    ])
  })

  it('returns one equal run for identical text and handles empties', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'equal', text: 'same text' }])
    expect(diffWords('', 'new')).toEqual([{ op: 'insert', text: 'new' }])
    expect(diffWords('old', '')).toEqual([{ op: 'delete', text: 'old' }])
  })

  it('falls back to one removal and one addition when the middle is too large to compare word by word', () => {
    const a = Array.from({ length: 2100 }, (_, i) => `a${i}`).join(' ')
    const b = Array.from({ length: 2100 }, (_, i) => `b${i}`).join(' ')
    const ops = diffWords(a, b)
    expect(ops.map((op) => op.op)).toEqual(['delete', 'insert'])
  })
})
```

`track-changes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown-doc'
import { docTextMap, trackChangeRanges } from './track-changes'

describe('track changes', () => {
  it('maps document text to positions, with blank lines between blocks', () => {
    const map = docTextMap(parseMarkdown('Ab\n\nCd'))
    expect(map.text).toBe('Ab\n\nCd')
    expect(map.positions.slice(0, 2)).toEqual([1, 2])
    expect(map.positions[4]).toBe(5)
  })

  it('finds added words and removed words against the released text', () => {
    const doc = parseMarkdown('One two three')
    expect(trackChangeRanges(doc, 'One three')).toEqual({ inserts: [{ from: 5, to: 8 }], deletes: [] })
    expect(trackChangeRanges(parseMarkdown('One three'), 'One two three')).toEqual({ inserts: [], deletes: [{ at: 5, text: 'two' }] })
  })

  it('ignores formatting-only changes', () => {
    expect(trackChangeRanges(parseMarkdown('**One** two'), 'One two')).toEqual({ inserts: [], deletes: [] })
  })
})
```

`TrackedText.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TrackedText from './TrackedText'

describe('TrackedText', () => {
  it('shows added words highlighted and removed words struck through, without Markdown', () => {
    const { container } = render(<TrackedText base="Paid **before** anyone is hired." current="Paid **before** anyone is hired, never after." />)
    expect(container.querySelector('ins')).toHaveTextContent('added: hired, never after.')
    expect(container.querySelector('del')).toHaveTextContent('removed: hired.')
    expect(container.textContent).not.toContain('**')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/text-diff.test.ts src/lib/portal/piece-page/track-changes.test.ts src/components/portal/editor/TrackedText.test.tsx`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`src/lib/portal/piece-page/text-diff.ts`:

```ts
// Word-level diff for track changes (spec 2026-10-03 section 5). Trims the common start and end,
// then compares the middle word by word (LCS). A middle too large to compare in memory becomes one
// removal and one addition, which is still correct, just coarse.
export type DiffOp = { op: 'equal' | 'insert' | 'delete'; text: string }

const TOKEN = /\s+|[^\s]+/g
const MAX_CELLS = 4_000_000

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function push(ops: DiffOp[], op: DiffOp['op'], text: string): void {
  if (!text) return
  const last = ops[ops.length - 1]
  if (last && last.op === op) last.text += text
  else ops.push({ op, text })
}

function diffMiddle(a: string[], b: string[], ops: DiffOp[]): void {
  if (a.length === 0) { push(ops, 'insert', b.join('')); return }
  if (b.length === 0) { push(ops, 'delete', a.join('')); return }
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) {
    push(ops, 'delete', a.join(''))
    push(ops, 'insert', b.join(''))
    return
  }
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push(ops, 'equal', a[i]); i++; j++ }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { push(ops, 'delete', a[i]); i++ }
    else { push(ops, 'insert', b[j]); j++ }
  }
  while (i < a.length) push(ops, 'delete', a[i++])
  while (j < b.length) push(ops, 'insert', b[j++])
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before)
  const b = tokenize(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const ops: DiffOp[] = []
  push(ops, 'equal', a.slice(0, start).join(''))
  diffMiddle(a.slice(start, endA), b.slice(start, endB), ops)
  push(ops, 'equal', a.slice(endA).join(''))
  return ops
}
```

`src/lib/portal/piece-page/track-changes.ts`:

```ts
// Track changes while editing (spec 2026-10-03 section 5): added words get the highlighter, removed
// words are shown struck through where they were. Compares the words, not the Markdown, so turning
// bold on or off is not a change.
import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { parseMarkdown } from './markdown-doc'
import { diffWords } from './text-diff'

export type TextMap = { text: string; positions: number[] }

// The document's words with the document position of every character. Blocks are separated by a
// blank line; a line break inside a block is one new line.
export function docTextMap(doc: PMNode): TextMap {
  let text = ''
  const positions: number[] = []
  let started = false
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (started) { text += '\n\n'; positions.push(pos + 1, pos + 1) }
      started = true
      return true
    }
    if (node.isText) {
      const value = node.text ?? ''
      for (let i = 0; i < value.length; i++) { text += value[i]; positions.push(pos + i) }
      return false
    }
    if (node.type.name === 'hard_break') { text += '\n'; positions.push(pos); return false }
    return true
  })
  return { text, positions }
}

export type ChangeRanges = { inserts: Array<{ from: number; to: number }>; deletes: Array<{ at: number; text: string }> }

function positionAt(map: TextMap, index: number, doc: PMNode): number {
  if (index < map.positions.length) return map.positions[index]
  const last = map.positions[map.positions.length - 1]
  return Math.min(last === undefined ? 1 : last + 1, doc.content.size)
}

export function trackChangeRanges(doc: PMNode, baseText: string): ChangeRanges {
  const current = docTextMap(doc)
  const base = docTextMap(parseMarkdown(baseText)).text
  const ranges: ChangeRanges = { inserts: [], deletes: [] }
  let index = 0
  for (const op of diffWords(base, current.text)) {
    if (op.op === 'equal') { index += op.text.length; continue }
    if (op.op === 'delete') {
      if (op.text.trim()) ranges.deletes.push({ at: positionAt(current, index, doc), text: op.text.trim() })
      continue
    }
    const end = index + op.text.length
    for (let i = index; i < end; i++) {
      if (/\s/.test(current.text[i])) continue
      const start = i
      while (i < end && !/\s/.test(current.text[i])) i++
      ranges.inserts.push({ from: current.positions[start], to: current.positions[i - 1] + 1 })
    }
    index = end
  }
  return ranges
}

export function trackChangeDecorations(doc: PMNode, baseText: string): DecorationSet {
  const { inserts, deletes } = trackChangeRanges(doc, baseText)
  return DecorationSet.create(doc, [
    ...inserts.map((range) => Decoration.inline(range.from, range.to, { nodeName: 'ins', class: 'md-ins' })),
    ...deletes.map((removed) => Decoration.widget(removed.at, () => {
      const element = document.createElement('del')
      element.className = 'md-del'
      element.textContent = removed.text
      return element
    }, { side: -1, ignoreSelection: true, key: `del:${removed.at}:${removed.text}` })),
  ])
}

const trackChangesKey = new PluginKey<DecorationSet>('trackChanges')

export function trackChangesPlugin(baseText: string): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: trackChangesKey,
    state: {
      init: (_config, state) => trackChangeDecorations(state.doc, baseText),
      apply: (tr, previous, _old, next) => (tr.docChanged ? trackChangeDecorations(next.doc, baseText) : previous),
    },
    props: { decorations: (state) => trackChangesKey.getState(state) },
  })
}
```

`src/components/portal/editor/document-editor.module.css`:

```css
/* Document-like editor (spec 2026-10-03 section 5): same font and size as the read view, no
   Markdown visible, highlighter for added words, strike for removed words. Tokens only. */
.wrap { display: grid; gap: var(--dot-space-2); }
.label { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase;
  letter-spacing: 0.18em; font-size: 0.7rem; color: var(--dot-grey-accessible); }
.surface { min-height: 6rem; padding: var(--dot-space-3) var(--dot-space-4); border: 1px solid var(--dot-black);
  border-radius: var(--dot-radius); background: var(--dot-white); color: var(--dot-black); font-family: var(--dot-font-text);
  font-size: 1.0625rem; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;
  font-variant-ligatures: none; font-feature-settings: "liga" 0; }
.surface:focus-visible { outline: 3px solid var(--dot-black); outline-offset: 3px; }
.surface p { margin: 0 0 0.9em; }
.surface p:last-child { margin-bottom: 0; }
.surface h2, .surface h3, .surface h4, .surface h5, .surface h6 { margin: 0 0 0.6em; font-family: var(--dot-font-text);
  font-weight: var(--dot-weight-medium); font-size: 1.25rem; line-height: 1.3; }
.surface ul, .surface ol { margin: 0 0 0.9em; padding-left: 1.4em; }
.surface li[data-check] { list-style: none; }
.surface li[data-check='unchecked']::before { content: '☐ '; margin-left: -1.2em; }
.surface li[data-check='checked']::before { content: '☑ '; margin-left: -1.2em; }
.surface blockquote { margin: 0 0 0.9em; padding-left: var(--dot-space-4); border-left: 3px solid var(--dot-black); }
.surface hr { border: 0; border-top: 1px solid var(--dot-hairline); margin: var(--dot-space-4) 0; }
.surface :global(.md-ins), .ins { background: var(--dot-grad-highlight); text-decoration: none; color: var(--dot-black); padding: 0 2px; }
.surface :global(.md-del), .del { color: var(--dot-grey-accessible); text-decoration: line-through; text-decoration-thickness: 1px; }
.surface :global(.ProseMirror-hideselection *::selection) { background: transparent; }
.surface:global(.ProseMirror-hideselection) { caret-color: transparent; }
.surface :global(.ProseMirror-separator) { display: inline !important; border: none !important; margin: 0 !important; }
.tracked { white-space: pre-wrap; font-size: 1.0625rem; line-height: 1.6; }
.count { font-size: 0.8125rem; color: var(--dot-grey-accessible); font-variant-numeric: tabular-nums; }
.over { font-size: 0.875rem; color: var(--dot-danger); font-weight: var(--dot-weight-medium); }
.srOnly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

`src/components/portal/editor/TrackedText.tsx`:

```tsx
import { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'
import { diffWords } from '@/lib/portal/piece-page/text-diff'
import styles from './document-editor.module.css'

// Review before sending (spec 5): her unsent text against the released text, words only.
export default function TrackedText({ base, current }: { base: string; current: string }) {
  const ops = diffWords(plainTextFromMarkdown(base), plainTextFromMarkdown(current))
  return <div className={styles.tracked}>
    {ops.map((op, index) => op.op === 'equal'
      ? <span key={index}>{op.text}</span>
      : op.op === 'insert'
        ? <ins key={index} className={styles.ins}><span className={styles.srOnly}>added: </span>{op.text}</ins>
        : <del key={index} className={styles.del}><span className={styles.srOnly}>removed: </span>{op.text}</del>)}
  </div>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/text-diff.test.ts src/lib/portal/piece-page/track-changes.test.ts src/components/portal/editor/TrackedText.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add src/lib/portal/piece-page/text-diff.ts src/lib/portal/piece-page/text-diff.test.ts src/lib/portal/piece-page/track-changes.ts src/lib/portal/piece-page/track-changes.test.ts src/components/portal/editor/document-editor.module.css src/components/portal/editor/TrackedText.tsx src/components/portal/editor/TrackedText.test.tsx
git -C ~/worktrees/kanset-piece-page-editor commit -m "Show added and removed words while editing and before sending

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: The document editor component

**Files:**
- Create: `src/components/portal/editor/test-layout.ts`
- Create: `src/components/portal/editor/DocumentEditor.tsx`
- Create: `src/components/portal/editor/DocumentEditor.test.tsx`

Same font and size as the read view, no Markdown visible, Enter makes a new paragraph (a new item inside a list, a new line inside a quote), Shift-Enter a line break, Ctrl or Cmd with B and I for bold and italic, undo and redo. It reports Markdown through `serializeMarkdown`, so every untouched block comes back exactly. A `textbox` with a visible label for assistive technology.

- [ ] **Step 1: Write the jsdom layout stub and the failing tests**

`src/components/portal/editor/test-layout.ts`:

```ts
// jsdom has no layout. ProseMirror asks for rectangles when it scrolls a selection into view; give
// it empty ones. Test-only.
export function stubEditorLayout(): void {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }
  Range.prototype.getBoundingClientRect = () => rect as DOMRect
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* empty() {} }) as unknown as DOMRectList
  if (!document.elementFromPoint) document.elementFromPoint = () => null
}
```

`DocumentEditor.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import DocumentEditor, { editorViews } from './DocumentEditor'
import { stubEditorLayout } from './test-layout'

beforeEach(() => stubEditorLayout())

function mount(props: Partial<React.ComponentProps<typeof DocumentEditor>> = {}) {
  const onChange = vi.fn()
  render(<DocumentEditor label="Caption" value={'**Title:** Hello\n\nSecond'} baseText={null} onChange={onChange} {...props} />)
  const box = screen.getByRole('textbox', { name: 'Caption' })
  return { box, view: editorViews.get(box)!, onChange }
}

describe('DocumentEditor', () => {
  it('shows formatted text with no Markdown', () => {
    const { box } = mount()
    expect(box).toHaveAttribute('aria-multiline', 'true')
    expect(box.querySelector('strong')).toHaveTextContent('Title:')
    expect(box.textContent).not.toContain('**')
  })

  it('hands back Markdown on every change', () => {
    const { view, onChange } = mount()
    act(() => view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1)))
    expect(onChange).toHaveBeenLastCalledWith('**Title:** Hello\n\nSecond!')
  })

  it('highlights added words against the released text', () => {
    const { box, view } = mount({ value: 'Hello world', baseText: 'Hello world' })
    act(() => view.dispatch(view.state.tr.insertText(' big', 6)))
    expect(box.querySelector('ins')).toHaveTextContent('big')
  })

  it('makes text bold with the keyboard', () => {
    const { view, onChange } = mount({ value: 'Hello world' })
    act(() => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))))
    fireEvent.keyDown(view.dom, { key: 'b', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('**Hello** world')
  })

  it('tells the page when it loses focus', () => {
    const onBlur = vi.fn()
    const { view } = mount({ onBlur })
    fireEvent.blur(view.dom)
    expect(onBlur).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/components/portal/editor/DocumentEditor.test.tsx`
Expected: FAIL, cannot resolve `./DocumentEditor`.

- [ ] **Step 3: Implement**

```tsx
'use client'

import { useEffect, useId, useRef } from 'react'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { enter, insertHardBreak, toggleEm, toggleStrong } from '@/lib/portal/piece-page/editor-commands'
import { parseMarkdown, serializeMarkdown } from '@/lib/portal/piece-page/markdown-doc'
import { trackChangesPlugin } from '@/lib/portal/piece-page/track-changes'
import styles from './document-editor.module.css'

// The textbox element of each mounted editor to its view. Used by tests and the phone check only.
export const editorViews = new WeakMap<Element, EditorView>()

// Document-like editing (spec 2026-10-03 section 5). value is Markdown; onChange receives Markdown.
// baseText (the released text) turns on track changes; null turns it off.
export default function DocumentEditor({ label, value, baseText, onChange, onBlur, describedBy, autoFocus = false }: {
  label: string
  value: string
  baseText: string | null
  onChange: (markdown: string) => void
  onBlur?: () => void
  describedBy?: string
  autoFocus?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    const state = EditorState.create({
      doc: parseMarkdown(value),
      plugins: [
        history(),
        keymap({
          'Mod-b': toggleStrong, 'Mod-i': toggleEm, 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
          Enter: enter, 'Shift-Enter': insertHardBreak,
        }),
        keymap(baseKeymap),
        ...(baseText !== null ? [trackChangesPlugin(baseText)] : []),
      ],
    })
    const view: EditorView = new EditorView(mount, {
      state,
      attributes: {
        role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': labelId, class: styles.surface, spellcheck: 'true',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        if (tr.docChanged) onChangeRef.current(serializeMarkdown(next.doc))
      },
      handleDOMEvents: {
        blur: () => {
          onBlurRef.current?.()
          return false
        },
      },
    })
    editorViews.set(view.dom, view)
    if (autoFocus) view.focus()
    return () => {
      editorViews.delete(view.dom)
      view.destroy()
    }
    // The editor owns its document once mounted; a different value means a new editor (key it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className={styles.wrap}>
    <span id={labelId} className={styles.label}>{label}</span>
    <div ref={host} />
  </div>
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/components/portal/editor/DocumentEditor.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add src/components/portal/editor/test-layout.ts src/components/portal/editor/DocumentEditor.tsx src/components/portal/editor/DocumentEditor.test.tsx
git -C ~/worktrees/kanset-piece-page-editor commit -m "Add the document editor: formatted text in, exact Markdown out

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The 50,000 counter

**Files:**
- Modify: `src/lib/portal/piece-page/limits.ts`
- Create: `src/lib/portal/piece-page/limits.test.ts`
- Create: `src/components/portal/editor/LengthCounter.tsx` (+ `LengthCounter.test.tsx`)
- Modify: `src/app/client/[slug]/edit-length-limit.test.ts`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx`

- [ ] **Step 1: Write the failing tests**

`limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { COUNTER_FROM_CHARS, MAX_EDIT_CHARS, characterCount } from './limits'

describe('edit limits', () => {
  it('match migration 0088 and the spec', () => {
    expect([MAX_EDIT_CHARS, COUNTER_FROM_CHARS]).toEqual([50_000, 45_000])
  })

  it('count characters the way the database does', () => {
    expect(characterCount('📌 a')).toBe(3)
    expect('📌 a'.length).toBe(4)
  })
})
```

`LengthCounter.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LengthCounter from './LengthCounter'

describe('LengthCounter', () => {
  it('stays hidden under 45,000 characters', () => {
    const { container } = render(<LengthCounter text={'a'.repeat(44_999)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts from 45,000', () => {
    render(<LengthCounter text={'a'.repeat(45_000)} />)
    expect(screen.getByText('45,000 of 50,000 characters')).toBeInTheDocument()
  })

  it('says how far over the limit, and that nothing was cut', () => {
    render(<LengthCounter text={'a'.repeat(50_002)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('2 characters over the 50,000 limit. Shorten it before you send. Nothing has been cut.')
  })
})
```

Append inside the `describe` of `src/app/client/[slug]/edit-length-limit.test.ts`:

```ts
  it('the new piece page editor keeps the same limit and never truncates', () => {
    expect(read('../../../lib/portal/piece-page/limits.ts')).toContain('MAX_EDIT_CHARS = 50_000')
    for (const file of ['../../../components/portal/editor/DocumentEditor.tsx', './piece/[contentId]/v2/EditorHost.tsx']) {
      expect(read(file)).not.toMatch(/maxLength/)
    }
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/portal/piece-page/limits.test.ts src/components/portal/editor/LengthCounter.test.tsx "src/app/client/[slug]/edit-length-limit.test.ts"`
Expected: FAIL: `characterCount` is not exported; `./LengthCounter` missing. (The length-limit test already passes on 4a's code; it guards 4b's rewrite.)

- [ ] **Step 3: Implement**

Append to `src/lib/portal/piece-page/limits.ts`:

```ts
// Characters the way the database counts them (char_length counts code points), so an emoji is one.
export function characterCount(text: string): number {
  return Array.from(text).length
}
```

`src/components/portal/editor/LengthCounter.tsx`:

```tsx
import { COUNTER_FROM_CHARS, MAX_EDIT_CHARS, characterCount } from '@/lib/portal/piece-page/limits'
import styles from './document-editor.module.css'

const format = (value: number) => value.toLocaleString('en-CA')

// Spec 5: a counter only from about 45,000; the editor never truncates.
export default function LengthCounter({ text }: { text: string }) {
  const count = characterCount(text)
  if (count < COUNTER_FROM_CHARS) return null
  if (count > MAX_EDIT_CHARS) {
    const over = count - MAX_EDIT_CHARS
    return <span className={styles.over} role="alert">
      {format(over)} {over === 1 ? 'character' : 'characters'} over the {format(MAX_EDIT_CHARS)} limit. Shorten it before you send. Nothing has been cut.
    </span>
  }
  return <span className={styles.count}>{format(count)} of {format(MAX_EDIT_CHARS)} characters</span>
}
```

In `src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx`, change the import line `import { MAX_EDIT_CHARS } from '@/lib/portal/piece-page/limits'` to:

```ts
import { MAX_EDIT_CHARS, characterCount } from '@/lib/portal/piece-page/limits'
```

and replace `overLimit: currentDrafts.some((draft) => draft.proposedText.length > MAX_EDIT_CHARS),` with:

```ts
    overLimit: currentDrafts.some((draft) => characterCount(draft.proposedText) > MAX_EDIT_CHARS),
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run src/lib/portal/piece-page/limits.test.ts src/components/portal/editor/LengthCounter.test.tsx "src/app/client/[slug]/edit-length-limit.test.ts" "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add src/lib/portal/piece-page/limits.ts src/lib/portal/piece-page/limits.test.ts src/components/portal/editor/LengthCounter.tsx src/components/portal/editor/LengthCounter.test.tsx "src/app/client/[slug]/edit-length-limit.test.ts" "src/app/client/[slug]/piece/[contentId]/v2/PieceWorkspace.tsx"
git -C ~/worktrees/kanset-piece-page-editor commit -m "Count edits the way the database does and show the 50,000 counter from 45,000

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Edit in place on a computer, full-screen sheet on a phone

**Files:**
- Rewrite: `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx`
- Rewrite: `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx`, `panels-part2.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css`

The host keeps 4a's interface (`open`, `useEditorHost`, `EditSlot`, request shapes) and adds `close`, `active`, `inline` and a third request kind, `form`, for structured fields. On a computer the editor replaces the read view inside its `EditSlot` (same place, same type size); on a phone, copy and form editors open in a full-screen sheet whose toolbar (status, Discard, Done) sits above the keyboard. Visual notes stay a small sheet everywhere.

- [ ] **Step 1: Add the layout stub to the shared test setup**

In `src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx`, add the import:

```ts
import { stubEditorLayout } from '@/components/portal/editor/test-layout'
```

and make `stubDialogs` call it first:

```ts
export function stubDialogs(): void {
  stubEditorLayout()
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
```

(the rest of the function is unchanged).

- [ ] **Step 2: Write the failing tests**

Replace the whole of `EditorHost.test.tsx` with:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { editorViews } from '@/components/portal/editor/DocumentEditor'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { EditSlot, useEditorHost, type EditorRequest } from './EditorHost'
import { renderInPage, stubDialogs } from './test-utils'

const SCRIPT = '**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three'
const copyTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: SCRIPT }
const frame: EditorRequest = {
  kind: 'copy', slotId: 'reel-script:frame:1', target: copyTarget, title: 'Frame 2 of 3 · On-screen text',
  initialText: '**2.** Frame two', baseText: '**2.** Frame two', compose: (text) => SCRIPT.replace('**2.** Frame two', text),
}
const noteTarget: ReviewTarget = { kind: 'asset', key: 'reel-video', label: 'Reel video', urlSnapshot: 'https://drive.google.com/x', anchor: 'frame:3', anchorLabel: 'Frame 3' }

function Opener({ request }: { request: EditorRequest }) {
  const { open } = useEditorHost()
  return <button type="button" onClick={() => open(request)}>open</button>
}

function DraftProbe({ target }: { target: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(target)?.proposedText ?? ''}</output>
}

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

function page(request: EditorRequest, target: ReviewTarget) {
  return renderInPage(<>
    <Opener request={request} />
    <EditSlot slotId="reel-script:frame:1"><p>Frame two, read view</p></EditSlot>
    <DraftProbe target={target} />
  </>)
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('EditorHost', () => {
  it('edits in place on a computer and stores the whole block', async () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.queryByText('Frame two, read view')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Frame 2 of 3 · On-screen text' })
    expect(box.querySelector('strong')).toHaveTextContent('2.')
    const view = editorViews.get(box)!
    act(() => view.dispatch(view.state.tr.insertText(', edited', view.state.doc.content.size - 1)))
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('**2.** Frame two, edited'))
    expect(screen.getByTestId('draft')).toHaveTextContent('**1.** Frame one')
    expect(Array.from(box.querySelectorAll('ins')).map((el) => el.textContent).join(' ')).toContain('edited')
    expect(screen.getByText('Saved · not sent yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
  })

  it('opens a full-screen sheet on a phone, and Escape is Done', () => {
    phone(true)
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 3 · On-screen text' })).toBeVisible()
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps visual notes in a small sheet, anchored to the frame', async () => {
    page({ kind: 'note', target: noteTarget, title: 'Frame 3 of 8 · Suggest a change' }, noteTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 3 of 8 · Suggest a change' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Make the headline bigger.' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('Make the headline bigger.'))
  })

  it('asks before discarding', async () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    const view = editorViews.get(screen.getByRole('textbox', { name: 'Frame 2 of 3 · On-screen text' }))!
    act(() => view.dispatch(view.state.tr.insertText('X', 1)))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByTestId('draft')).toHaveTextContent('')
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
  })

  it('renders a form request in place with the same toolbar', () => {
    page({ kind: 'form', slotId: 'reel-script:frame:1', targets: [copyTarget], title: 'Structured', render: () => <p>form body</p> }, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByText('form body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })
})
```

Update the 4a panel tests to the document editor:

In `panels/panels-part1.test.tsx`, add `import { editorViews } from '@/components/portal/editor/DocumentEditor'` and replace:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    const field = screen.getByLabelText('Text')
    expect(field).toHaveValue('**2.** $1,000 PER POSITION')
    fireEvent.change(field, { target: { value: '**2.** $1,000 PER POSITION, PAID BY THE EMPLOYER' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
```

with:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    const box = screen.getByRole('textbox', { name: 'Frame 2 of 3 · On-screen text' })
    expect(box).toHaveTextContent('2. $1,000 PER POSITION')
    const view = editorViews.get(box)!
    act(() => view.dispatch(view.state.tr.insertText(', PAID BY THE EMPLOYER', view.state.doc.content.size - 1)))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
```

replace `expect(screen.getByLabelText('Text')).toHaveValue('First paragraph.\n\nSecond paragraph, edited.')` with:

```tsx
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveTextContent(/First paragraph\.\s*Second paragraph, edited\./)
```

and replace `expect(screen.getByLabelText('Text')).toHaveValue('**Page 2, the fee**\n\nPAID BEFORE HIRING.')` with:

```tsx
    expect(screen.getByRole('textbox', { name: 'Page 2 of 2 · PDF text' })).toHaveTextContent(/Page 2, the fee\s*PAID BEFORE HIRING\./)
```

In `panels/panels-part2.test.tsx`, replace `expect(screen.getByLabelText('Text')).toHaveValue('### Start with the one thing you can check\n\nSection body.')` with:

```tsx
    expect(screen.getByRole('textbox', { name: 'Start with the one thing you can check · Article' }))
      .toHaveTextContent(/Start with the one thing you can check\s*Section body\./)
```

(The YouTube assertion in that file changes in Task 8.)

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx"`
Expected: FAIL: no textbox (4a's host still renders a plain sheet).

- [ ] **Step 4: Implement**

Replace the whole of `src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx` with:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@thedot/design-system'
import DocumentEditor from '@/components/portal/editor/DocumentEditor'
import LengthCounter from '@/components/portal/editor/LengthCounter'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { useKeyboardInset, usePhone } from './hooks'
import { draftStatusLine } from './status-text'
import styles from './piece-page.module.css'

// One host opens every editor on the page (spec 2026-10-03 section 5). Copy and structured-field
// editors open in place on a computer and full screen on a phone; visual notes open a small sheet.
// Every editor saves the whole block through plan 3's provider (autosave, never sent until Send).

export type CopyEditRequest = {
  kind: 'copy'
  // The place on the page this edit belongs to, e.g. 'reel-script:frame:2'.
  slotId: string
  // A copy_block target whose currentText is the released block body.
  target: ReviewTarget
  title: string
  thumbUrl?: string | null
  // What the editor shows: one frame, one page, one section, or the whole block.
  initialText: string
  // The released text for this slot, for track changes.
  baseText: string
  // Turns the edited part back into the whole block body the draft stores.
  compose: (text: string) => string
}
export type NoteRequest = { kind: 'note'; target: ReviewTarget; title: string; thumbUrl?: string | null }
// Structured fields (YouTube, chapters, search and sharing). The rendered form saves its own drafts.
export type FormRequest = {
  kind: 'form'
  slotId: string
  targets: ReviewTarget[]
  title: string
  thumbUrl?: string | null
  render: () => ReactNode
}
export type EditorRequest = CopyEditRequest | NoteRequest | FormRequest

type EditorHostValue = {
  open: (request: EditorRequest) => void
  close: () => void
  active: EditorRequest | null
  inline: boolean
  mode: 'client' | 'preview'
}
const EditorHostContext = createContext<EditorHostValue | null>(null)

function requestKey(request: EditorRequest): string {
  const place = request.kind === 'note'
    ? `${request.target.kind}:${request.target.key}:${request.target.anchor ?? ''}`
    : request.slotId
  return `${request.kind}:${place}:${request.title}`
}

export default function EditorHost({ mode, children }: { mode: 'client' | 'preview'; children: ReactNode }) {
  const isPhone = usePhone()
  const [request, setRequest] = useState<EditorRequest | null>(null)
  const open = useCallback((next: EditorRequest) => setRequest(next), [])
  const close = useCallback(() => setRequest(null), [])
  const inline = !isPhone
  const value = useMemo(() => ({ open, close, active: request, inline, mode }), [close, inline, mode, open, request])
  const inSheet = request !== null && (request.kind === 'note' || !inline)
  return <EditorHostContext.Provider value={value}>
    {children}
    {inSheet && request && <EditorSheet key={requestKey(request)} request={request} onClose={close} />}
  </EditorHostContext.Provider>
}

export function useEditorHost(): EditorHostValue {
  const value = useContext(EditorHostContext)
  if (!value) throw new Error('Editors must be opened inside EditorHost')
  return value
}

// On a computer, the editor replaces the read view of the slot being edited: same place, same size.
export function EditSlot({ slotId, children }: { slotId: string; children: ReactNode }) {
  const { active, inline, close } = useEditorHost()
  if (!inline || active === null || active.kind === 'note' || active.slotId !== slotId) return <>{children}</>
  return <div className={styles.inlineEditor} data-editing-slot={slotId}>
    <EditorBody key={requestKey(active)} request={active} onDone={close} />
  </div>
}

function EditorBody({ request, onDone }: { request: CopyEditRequest | FormRequest; onDone: () => void }) {
  if (request.kind === 'form') return <EditorFrame targets={request.targets} onDone={onDone}>{request.render()}</EditorFrame>
  return <CopyEditor request={request} onDone={onDone} />
}

function CopyEditor({ request, onDone }: { request: CopyEditRequest; onDone: () => void }) {
  const { saveDraft, flush } = useReviewDrafts()
  const [composed, setComposed] = useState(() => request.compose(request.initialText))
  return <EditorFrame targets={[request.target]} onDone={onDone} extra={<LengthCounter text={composed} />}>
    <DocumentEditor label={request.title} value={request.initialText} baseText={request.baseText} autoFocus
      onChange={(text) => {
        const next = request.compose(text)
        setComposed(next)
        saveDraft(request.target, next, null)
      }}
      onBlur={() => { void flush() }} />
  </EditorFrame>
}

function NoteEditor({ request, onDone }: { request: NoteRequest; onDone: () => void }) {
  const { readDraft, saveDraft, flush } = useReviewDrafts()
  const [value, setValue] = useState(() => readDraft(request.target)?.proposedText ?? '')
  return <EditorFrame targets={[request.target]} onDone={onDone}>
    <label className={styles.label} htmlFor="editor-note-text">What should change?</label>
    <textarea id="editor-note-text" className={styles.plainEditor} value={value} autoFocus
      placeholder="Describe the change, for example: make the headline bigger"
      onChange={(event) => { setValue(event.target.value); saveDraft(request.target, event.target.value, null) }}
      onBlur={() => { void flush() }} />
  </EditorFrame>
}

// Status, Discard (asks first) and Done, the same for every editor. Done only closes: edits are
// already saved, and nothing is sent until Send.
function EditorFrame({ targets, onDone, extra, children }: {
  targets: ReviewTarget[]
  onDone: () => void
  extra?: ReactNode
  children: ReactNode
}) {
  const { readDraft, removeDraft, flush, syncState } = useReviewDrafts()
  const isPhone = usePhone()
  const [confirming, setConfirming] = useState(false)
  const hasDraft = targets.some((target) => readDraft(target) !== null)
  const status = hasDraft
    ? draftStatusLine(syncState === 'idle' ? 'saved' : syncState, isPhone)
    : 'Your edits save as you type and stay unsent until you send them.'
  return <div className={styles.editorFrame}>
    <div className={styles.editorBody}>{children}</div>
    <div className={styles.sheetT}>
      <span className={hasDraft ? styles.saved : styles.meta} role="status">{status}</span>
      {extra}
      {confirming
        ? <div className={styles.sheetActions}>
          <span>Discard this edit? It cannot be recovered.</span>
          <Button as="button" type="button" variant="black" size="sm"
            onClick={() => { for (const target of targets) removeDraft(target); onDone() }}>Yes, discard</Button>
          <Button as="button" type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep editing</Button>
        </div>
        : <div className={styles.sheetActions}>
          {hasDraft && <button type="button" className={styles.link} onClick={() => setConfirming(true)}>Discard</button>}
          <Button as="button" type="button" variant="black" size="sm" onClick={() => { void flush(); onDone() }}>Done</Button>
        </div>}
    </div>
  </div>
}

function EditorSheet({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closed = useRef(false)
  const inset = useKeyboardInset()
  const { flush } = useReviewDrafts()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  function finish() {
    if (closed.current) return
    closed.current = true
    void flush()
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose()
  }

  return <dialog ref={dialogRef} className={styles.editorSheet} aria-labelledby="editor-sheet-title"
    style={inset > 0 ? { paddingBottom: inset } : undefined}
    onCancel={(event) => { event.preventDefault(); finish() }} onClose={finish}>
    <div className={styles.sheetH}>
      {/* Signed, expiring storage links: next/image would cache and re-host them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {request.thumbUrl ? <img src={request.thumbUrl} alt="" /> : null}
      <h2 id="editor-sheet-title" className={styles.sheetTitle}>{request.title}</h2>
    </div>
    <div className={styles.sheetB}>
      {request.kind === 'note'
        ? <NoteEditor request={request} onDone={finish} />
        : <EditorBody request={request} onDone={finish} />}
    </div>
  </dialog>
}
```

Append to `src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css`:

```css
/* Plan 4b: editing in place, the shared editor frame, structured fields, chips, chapter rows. */
.inlineEditor { margin: var(--dot-space-2) 0; padding: var(--dot-space-4); border: 1px solid var(--dot-black); background: var(--dot-off-white); }
.editorFrame { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.editorBody { flex: 1; min-height: 0; overflow: auto; }
.editorSheet .sheetB { padding: 0; display: flex; }
.editorSheet .editorBody { padding: var(--dot-space-4); }
.inlineEditor .sheetT { padding: var(--dot-space-3) 0 0; background: transparent; border-top: 0; }
.fieldInput { width: 100%; min-height: 48px; padding: 12px 14px; font-family: var(--dot-font-text); font-size: 1.0625rem; color: var(--dot-black);
  background: var(--dot-white); border: 1px solid var(--dot-black); border-radius: var(--dot-radius); }
.fieldInput:focus-visible { outline: 3px solid var(--dot-black); outline-offset: 3px; }
textarea.fieldInput { min-height: 96px; line-height: 1.5; resize: vertical; }
.chipAdded { background: var(--dot-grad-highlight); border-color: var(--dot-grey-light); }
.chipRemoved { color: var(--dot-grey-accessible); text-decoration: line-through; background: transparent; border-style: dashed; border-color: var(--dot-grey-light); }
.chipX { display: inline-grid; place-items: center; width: 44px; height: 44px; margin: -4px -12px -4px 0; padding: 0; background: none; border: 0;
  cursor: pointer; color: var(--dot-graphite); font-size: 1.125rem; }
.chipAdd { min-width: 160px; min-height: 44px; margin-top: var(--dot-space-2); padding: 0 var(--dot-space-3); border: 1px dashed var(--dot-grey-light);
  background: transparent; font: inherit; }
.chapterRows { list-style: none; margin: 0 0 var(--dot-space-3); padding: 0; display: grid; gap: var(--dot-space-2); }
.chapterRow { display: grid; grid-template-columns: 6rem minmax(0, 1fr) auto; gap: var(--dot-space-2); align-items: center; }
@media (max-width: 767px) {
  .chapterRow { grid-template-columns: 5rem minmax(0, 1fr); }
  .chapterRow > button { grid-column: 2; justify-self: start; }
  .inlineEditor { margin-left: calc(-1 * var(--dot-space-4)); margin-right: calc(-1 * var(--dot-space-4)); }
}
```

- [ ] **Step 5: Run the host, the panels and the whole v2 folder**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2"`
Expected: PASS except `panels-part2.test.tsx`'s YouTube edit assertion (`getByLabelText('Text')`), which Task 8 replaces. Every other v2 test passes, including the CSS test (the appended block adds no forbidden colour and no stripe).

- [ ] **Step 6: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx" "src/app/client/[slug]/piece/[contentId]/v2/EditorHost.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/test-utils.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part1.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css"
git -C ~/worktrees/kanset-piece-page-editor commit -m "Edit in place on a computer and full screen on a phone, with the document editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: YouTube as Title, Description and Tags

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/TagChips.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/YouTubeForms.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/youtube-forms.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/panels/YouTubePanel.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx`

Each field maps to the exact existing block body: a package block is re-composed with `setYouTubeField` (4a, Task 6) so the label lines and everything after the tags stay as written; separate episode blocks (`youtube-title`, `youtube-description`, `youtube-tags`) each edit their own block. Tags left untouched keep their original separators.

- [ ] **Step 1: Write the failing tests**

`editors/youtube-forms.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { renderInPage, stubDialogs } from '../test-utils'
import TagChips from './TagChips'
import { TagsBlockForm, TitleBlockForm, YouTubePackageForm } from './YouTubeForms'

const PACKAGE = '**Title:** What does a permit cost?\n\n**Description:**\nThree things to know.\n\n**Tags:** LMIA, LMIA cost, foreign worker\n\n**Note for Maria on the title:** kept short.'
const target: ReviewTarget = { kind: 'copy_block', key: 'youtube-package', label: 'YouTube Short', currentText: PACKAGE }

function DraftProbe({ of }: { of: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(of)?.proposedText ?? ''}</output>
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('YouTubePackageForm', () => {
  it('edits the title as one line and keeps every other character of the block', async () => {
    renderInPage(<><YouTubePackageForm target={target} source={PACKAGE} base={PACKAGE} /><DraftProbe of={target} /></>)
    const title = screen.getByLabelText('Title')
    expect(title).toHaveValue('What does a permit cost?')
    expect(screen.getByText('24 of 100 characters')).toBeInTheDocument()
    fireEvent.change(title, { target: { value: 'What a permit costs in Ontario' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('What does a permit cost?', 'What a permit costs in Ontario')))
  })

  it('removes a tag, shows it struck through, and can put it back', async () => {
    renderInPage(<><YouTubePackageForm target={target} source={PACKAGE} base={PACKAGE} /><DraftProbe of={target} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag LMIA cost' }))
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('LMIA, LMIA cost, foreign worker', 'LMIA, foreign worker')))
    expect(screen.getByText('Removed:', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Put back tag LMIA cost' }))
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('LMIA, LMIA cost, foreign worker', 'LMIA, foreign worker, LMIA cost')))
  })
})

describe('TagChips', () => {
  it('adds tags with Enter or a comma and marks them added', () => {
    const onChange = vi.fn()
    renderInPage(<TagChips id="t" tags={['LMIA']} baseTags={['LMIA']} onChange={onChange} />)
    const input = screen.getByLabelText('Add a tag')
    fireEvent.change(input, { target: { value: 'Ontario' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['LMIA', 'Ontario'])
    fireEvent.change(input, { target: { value: 'Toronto,' } })
    expect(onChange).toHaveBeenLastCalledWith(['LMIA', 'Toronto'])
  })
})

describe('separate episode blocks', () => {
  it('edits a title block and a tags block on their own', async () => {
    const titleTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-title', label: 'YouTube title', currentText: 'Old title' }
    const tagsTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-tags', label: 'YouTube tags', currentText: 'a, b' }
    renderInPage(<>
      <TitleBlockForm target={titleTarget} source="Old title" />
      <TagsBlockForm target={tagsTarget} source="a, b" base="a, b" />
      <DraftProbe of={titleTarget} />
    </>)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe('New title'))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace('×', ''))).toEqual(['a', 'b'])
  })
})
```

In `panels/panels-part2.test.tsx`, replace:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Edit YouTube Short package' }))
    expect(screen.getByLabelText('Text')).toHaveValue(PACKAGE)
```

with:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Edit YouTube Short package' }))
    expect(screen.getByLabelText('Title')).toHaveValue('What does a permit cost?')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveTextContent('Three things to know.')
    expect(screen.getByRole('button', { name: 'Remove tag LMIA cost' })).toBeInTheDocument()
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/editors/youtube-forms.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx"`
Expected: FAIL: the editors do not exist; the panel still opens the plain copy editor.

- [ ] **Step 3: Implement**

`editors/TagChips.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { parseTags } from '@/lib/portal/piece-page/youtube-fields'
import styles from '../piece-page.module.css'

// Tags as removable chips (spec 5). Added tags carry the highlighter; removed tags stay struck
// through, with Put back, until she sends.
export default function TagChips({ id, tags, baseTags, onChange }: {
  id: string
  tags: string[]
  baseTags: string[]
  onChange: (tags: string[]) => void
}) {
  const [entry, setEntry] = useState('')
  const removed = baseTags.filter((tag) => !tags.includes(tag))

  function add(raw: string) {
    const fresh = parseTags(raw).filter((tag) => !tags.includes(tag))
    if (fresh.length > 0) onChange([...tags, ...fresh])
    setEntry('')
  }

  return <div>
    <ul className={styles.chips} aria-label="Tags">
      {tags.map((tag) => {
        const added = !baseTags.includes(tag)
        return <li key={tag} className={`${styles.chip} ${added ? styles.chipAdded : ''}`}>
          {tag}{added && <span className={styles.srOnly}> (added)</span>}
          <button type="button" className={styles.chipX} aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}>×</button>
        </li>
      })}
      {removed.map((tag) => <li key={`removed-${tag}`} className={`${styles.chip} ${styles.chipRemoved}`}>
        <span className={styles.srOnly}>Removed: </span>{tag}
        <button type="button" className={styles.chipX} aria-label={`Put back tag ${tag}`} onClick={() => onChange([...tags, tag])}>↺</button>
      </li>)}
    </ul>
    <label className={styles.srOnly} htmlFor={id}>Add a tag</label>
    <input id={id} className={styles.chipAdd} placeholder="Add a tag" value={entry}
      onChange={(event) => {
        const value = event.target.value
        if (value.includes(',')) add(value)
        else setEntry(value)
      }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(entry) } }}
      onBlur={() => { if (entry.trim()) add(entry) }} />
    <p className={styles.hint}>Tap the cross to remove a tag. Removed tags stay struck through until you send.</p>
  </div>
}
```

`editors/YouTubeForms.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import DocumentEditor from '@/components/portal/editor/DocumentEditor'
import { characterCount } from '@/lib/portal/piece-page/limits'
import {
  formatTags, parseTags, parseYouTubePackage, serializeYouTubePackage, setYouTubeField, youTubeFieldValue,
  type YouTubeFieldName,
} from '@/lib/portal/piece-page/youtube-fields'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'
import TagChips from './TagChips'

// YouTube's title limit. Guidance only: going over is shown, never blocked.
export const YOUTUBE_TITLE_LIMIT = 100

export function TitleField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const count = characterCount(value)
  return <div className={styles.field}>
    <label className={`${styles.label} ${styles.fieldLabel}`} htmlFor={id}>Title</label>
    <input id={id} className={styles.fieldInput} value={value} aria-describedby={`${id}-count`}
      onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))} />
    <span id={`${id}-count`} className={count > YOUTUBE_TITLE_LIMIT ? styles.errText : styles.charcount}>
      {count} of {YOUTUBE_TITLE_LIMIT} characters
    </span>
  </div>
}

// One package block ("**Title:** ... **Description:** ... **Tags:** ..."): each field is edited on
// its own and the block is re-composed around it, label lines and notes untouched.
export function YouTubePackageForm({ target, source, base }: { target: ReviewTarget; source: string; base: string }) {
  const { saveDraft } = useReviewDrafts()
  const pkg = useMemo(() => parseYouTubePackage(source), [source])
  const basePkg = useMemo(() => parseYouTubePackage(base), [base])
  const [title, setTitle] = useState(() => (pkg ? youTubeFieldValue(pkg, 'title') ?? '' : ''))
  const [description, setDescription] = useState(() => (pkg ? youTubeFieldValue(pkg, 'description') ?? '' : ''))
  const [tags, setTags] = useState(() => parseTags(pkg ? youTubeFieldValue(pkg, 'tags') ?? '' : ''))
  const [tagsTouched, setTagsTouched] = useState(false)
  if (!pkg) return null
  const has = (name: YouTubeFieldName) => pkg.fields.some((field) => field.name === name)

  function save(next: { title?: string; description?: string; tags?: string[] }) {
    if (!pkg) return
    let out = pkg
    if (has('title')) out = setYouTubeField(out, 'title', next.title ?? title)
    if (has('description')) out = setYouTubeField(out, 'description', next.description ?? description)
    if (has('tags') && (tagsTouched || next.tags)) out = setYouTubeField(out, 'tags', formatTags(next.tags ?? tags))
    saveDraft(target, serializeYouTubePackage(out), null)
  }

  return <div>
    {has('title') && <TitleField id="youtube-title" value={title} onChange={(value) => { setTitle(value); save({ title: value }) }} />}
    {has('description') && <div className={styles.field}>
      <DocumentEditor label="Description" value={description}
        baseText={basePkg ? youTubeFieldValue(basePkg, 'description') : null}
        onChange={(value) => { setDescription(value); save({ description: value }) }} />
    </div>}
    {has('tags') && <div className={styles.field}>
      <span className={`${styles.label} ${styles.fieldLabel}`}>Tags</span>
      <TagChips id="youtube-tags-add" tags={tags} baseTags={parseTags(basePkg ? youTubeFieldValue(basePkg, 'tags') ?? '' : '')}
        onChange={(value) => { setTags(value); setTagsTouched(true); save({ tags: value }) }} />
    </div>}
  </div>
}

// Episodes keep title, description and tags in separate blocks; each edits its own block.
export function TitleBlockForm({ target, source }: { target: ReviewTarget; source: string }) {
  const { saveDraft } = useReviewDrafts()
  const [value, setValue] = useState(source)
  return <TitleField id="youtube-title-block" value={value} onChange={(next) => { setValue(next); saveDraft(target, next, null) }} />
}

export function TagsBlockForm({ target, source, base }: { target: ReviewTarget; source: string; base: string }) {
  const { saveDraft } = useReviewDrafts()
  const [tags, setTags] = useState(() => parseTags(source))
  return <div className={styles.field}>
    <span className={`${styles.label} ${styles.fieldLabel}`}>Tags</span>
    <TagChips id="youtube-tags-block" tags={tags} baseTags={parseTags(base)}
      onChange={(next) => { setTags(next); saveDraft(target, formatTags(next), null) }} />
  </div>
}
```

In `panels/YouTubePanel.tsx`, add the import:

```tsx
import { TagsBlockForm, TitleBlockForm, YouTubePackageForm } from '../editors/YouTubeForms'
```

and replace:

```tsx
  const slotId = `${block.key}:whole`
  const openEditor = () => open({
    kind: 'copy', slotId, target, title: block.label, initialText: source, baseText: block.body, compose: (text) => text,
  })
```

with:

```tsx
  const slotId = `${block.key}:whole`
  const openEditor = () => {
    if (block.key === 'youtube-title') {
      open({ kind: 'form', slotId, targets: [target], title: 'YouTube title', render: () => <TitleBlockForm target={target} source={source} /> })
    } else if (block.key === 'youtube-tags') {
      open({ kind: 'form', slotId, targets: [target], title: 'YouTube tags',
        render: () => <TagsBlockForm target={target} source={source} base={block.body} /> })
    } else if (block.key !== 'youtube-description' && parseYouTubePackage(source) !== null) {
      open({ kind: 'form', slotId, targets: [target], title: block.label,
        render: () => <YouTubePackageForm target={target} source={source} base={block.body} /> })
    } else {
      open({ kind: 'copy', slotId, target, title: block.label, initialText: source, baseText: block.body, compose: (text) => text })
    }
  }
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/editors/youtube-forms.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add "src/app/client/[slug]/piece/[contentId]/v2/editors/TagChips.tsx" "src/app/client/[slug]/piece/[contentId]/v2/editors/YouTubeForms.tsx" "src/app/client/[slug]/piece/[contentId]/v2/editors/youtube-forms.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/YouTubePanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-part2.test.tsx"
git -C ~/worktrees/kanset-piece-page-editor commit -m "Edit YouTube as a title line, a description and tag chips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Chapters and Search & sharing as fields

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/ChaptersForm.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/SearchForm.tsx`
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/fields-forms.test.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/panels/ChaptersPanel.tsx`
- Modify: `src/app/client/[slug]/piece/[contentId]/v2/panels/SearchSharingPanel.tsx`

Chapters are a time and a title per row, written back into the chapter lines of the description and nowhere else (`replaceChapters`, 4a Task 6). A chapter list needs at least two complete rows; while she is mid-row, the last complete version stays saved. Search & sharing edits the four fields search and sharing depend on, written back into their `- **Label:** value` lines (`setLabeledValue`, 4a Task 7).

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { renderInPage, stubDialogs } from '../test-utils'
import ChaptersForm from './ChaptersForm'
import SearchForm from './SearchForm'

const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n\nOutro.'
const descriptionTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-description', label: 'YouTube description', currentText: DESCRIPTION }
const SEO = '- **SEO title:** How to Choose a Representative in Canada\n- **Slug:** `/news/how-to-choose`\n- **Meta description:** A license tells you who may help you.\n- **Category:** News'
const seoTarget: ReviewTarget = { kind: 'copy_block', key: 'article-seo', label: 'SEO', currentText: SEO }

function DraftProbe({ of }: { of: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(of)?.proposedText ?? ''}</output>
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('ChaptersForm', () => {
  const block = { key: 'youtube-description', label: 'YouTube description', body: DESCRIPTION }

  it('edits one chapter title and changes only that line', async () => {
    renderInPage(<><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /><DraftProbe of={descriptionTarget} /></>)
    fireEvent.change(screen.getByLabelText('Title, chapter 2'), { target: { value: 'Bring questions?' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(DESCRIPTION.replace('Should a client bring questions?', 'Bring questions?')))
  })

  it('adds a chapter once its time and title are filled', async () => {
    renderInPage(<><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /><DraftProbe of={descriptionTarget} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Add a chapter' }))
    fireEvent.change(screen.getByLabelText('Time, chapter 3'), { target: { value: '03:43' } })
    expect(screen.getByTestId('draft').textContent).toBe('')
    fireEvent.change(screen.getByLabelText('Title, chapter 3'), { target: { value: 'How many people work on a case?' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toContain('01:31 Should a client bring questions?\n03:43 How many people work on a case?\n\nOutro.'))
  })

  it('marks a time that is not minutes and seconds', () => {
    renderInPage(<ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} />)
    fireEvent.change(screen.getByLabelText('Time, chapter 1'), { target: { value: '0 0' } })
    expect(screen.getByLabelText('Time, chapter 1')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('SearchForm', () => {
  it('edits the search title with a counter and keeps every other line', async () => {
    renderInPage(<><SearchForm target={seoTarget} source={SEO} /><DraftProbe of={seoTarget} /></>)
    expect(screen.getByText('40 of 60 characters')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search title'), { target: { value: 'Choosing an Immigration Representative' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent)
      .toBe(SEO.replace('How to Choose a Representative in Canada', 'Choosing an Immigration Representative')))
    expect(screen.getByLabelText('Web address')).toHaveValue('/news/how-to-choose')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/editors/fields-forms.test.tsx"`
Expected: FAIL, the forms do not exist.

- [ ] **Step 3: Implement**

`editors/ChaptersForm.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import {
  findChapters, parseYouTubePackage, replaceChapters, serializeYouTubePackage, setYouTubeField, youTubeFieldValue,
  type ChapterItem,
} from '@/lib/portal/piece-page/youtube-fields'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'

const TIME = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/

export default function ChaptersForm({ target, block, source }: { target: ReviewTarget; block: ReviewCopyBlock; source: string }) {
  const { saveDraft } = useReviewDrafts()
  const isDescription = block.key === 'youtube-description'
  const pkg = useMemo(() => (isDescription ? null : parseYouTubePackage(source)), [isDescription, source])
  const description = isDescription ? source : (pkg ? youTubeFieldValue(pkg, 'description') ?? '' : '')
  const chapters = useMemo(() => findChapters(description), [description])
  const [rows, setRows] = useState<ChapterItem[]>(() => chapters?.items ?? [])
  if (!chapters) return <p className={styles.meta}>No chapters in this version.</p>

  function update(next: ChapterItem[]) {
    setRows(next)
    if (!chapters) return
    const complete = next.filter((row) => TIME.test(row.time.trim()) && row.title.trim())
    if (complete.length < 2) return
    const nextDescription = replaceChapters(description, chapters, complete)
    saveDraft(target, isDescription || !pkg
      ? nextDescription
      : serializeYouTubePackage(setYouTubeField(pkg, 'description', nextDescription)), null)
  }

  return <div>
    <ol className={styles.chapterRows} aria-label="Chapters">
      {rows.map((row, index) => <li key={index} className={styles.chapterRow}>
        <label className={styles.srOnly} htmlFor={`chapter-time-${index}`}>Time, chapter {index + 1}</label>
        <input id={`chapter-time-${index}`} className={styles.fieldInput} value={row.time} inputMode="numeric"
          aria-invalid={!TIME.test(row.time.trim())}
          onChange={(event) => update(rows.map((r, i) => (i === index ? { ...r, time: event.target.value } : r)))} />
        <label className={styles.srOnly} htmlFor={`chapter-title-${index}`}>Title, chapter {index + 1}</label>
        <input id={`chapter-title-${index}`} className={styles.fieldInput} value={row.title}
          onChange={(event) => update(rows.map((r, i) => (i === index ? { ...r, title: event.target.value } : r)))} />
        <button type="button" className={styles.link} aria-label={`Remove chapter ${index + 1}`}
          onClick={() => update(rows.filter((_, i) => i !== index))}>Remove</button>
      </li>)}
    </ol>
    <button type="button" className={styles.link} onClick={() => setRows([...rows, { time: '', title: '' }])}>Add a chapter</button>
    <p className={styles.hint}>Times are minutes and seconds, like 12:30. I match them to the cut before it posts.</p>
  </div>
}
```

`editors/SearchForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { characterCount } from '@/lib/portal/piece-page/limits'
import {
  SEARCH_FIELDS, labeledValue, parseLabeledList, serializeLabeledList, setLabeledValue,
} from '@/lib/portal/piece-page/labeled-list'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import styles from '../piece-page.module.css'

// Spec 4.4: search title, search description, web address, preview text when shared. Each writes
// back into its own "- **Label:** value" line; every other line stays as written.
export default function SearchForm({ target, source }: { target: ReviewTarget; source: string }) {
  const { saveDraft } = useReviewDrafts()
  const [list, setList] = useState(() => parseLabeledList(source))

  function change(label: string, value: string) {
    const next = setLabeledValue(list, label, value)
    setList(next)
    saveDraft(target, serializeLabeledList(next), null)
  }

  return <div>
    {SEARCH_FIELDS.map((field) => {
      const value = labeledValue(list, field.label)
      if (value === null) return null
      const id = `search-${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const count = characterCount(value)
      const multiline = field.label === 'Meta description' || field.label === 'Excerpt'
      return <div key={field.label} className={styles.field}>
        <label className={`${styles.label} ${styles.fieldLabel}`} htmlFor={id}>{field.title}</label>
        {multiline
          ? <textarea id={id} className={styles.fieldInput} rows={3} value={value} onChange={(event) => change(field.label, event.target.value)} />
          : <input id={id} className={styles.fieldInput} value={value} onChange={(event) => change(field.label, event.target.value)} />}
        {field.limit !== null && <span className={count > field.limit ? styles.errText : styles.charcount}>
          {count} of {field.limit} characters
        </span>}
      </div>
    })}
  </div>
}
```

In `panels/ChaptersPanel.tsx`, add `import ChaptersForm from '../editors/ChaptersForm'` and replace:

```tsx
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:chapters`, target, title: `${block.label}, chapters`, initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
```

with:

```tsx
        onClick={() => open({
          kind: 'form', slotId: `${block.key}:chapters`, targets: [target], title: 'Chapters',
          render: () => <ChaptersForm target={target} block={block} source={source} />,
        })}>Edit</button>}
```

In `panels/SearchSharingPanel.tsx`, add `import SearchForm from '../editors/SearchForm'` and replace:

```tsx
        onClick={() => open({
          kind: 'copy', slotId: `${block.key}:whole`, target, title: 'Search and sharing', initialText: source,
          baseText: block.body, compose: (text) => text,
        })}>Edit</button>}
```

with:

```tsx
        onClick={() => open({
          kind: 'form', slotId: `${block.key}:whole`, targets: [target], title: 'Search and sharing',
          render: () => <SearchForm target={target} source={source} />,
        })}>Edit</button>}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/editors" "src/app/client/[slug]/piece/[contentId]/v2/panels"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add "src/app/client/[slug]/piece/[contentId]/v2/editors/ChaptersForm.tsx" "src/app/client/[slug]/piece/[contentId]/v2/editors/SearchForm.tsx" "src/app/client/[slug]/piece/[contentId]/v2/editors/fields-forms.test.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/ChaptersPanel.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels/SearchSharingPanel.tsx"
git -C ~/worktrees/kanset-piece-page-editor commit -m "Edit chapters and search and sharing as fields written back to their lines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Track changes in review before sending, and "Jump to my edits"

**Files:**
- Create: `src/app/client/[slug]/piece/[contentId]/v2/editors/JumpToEdits.tsx`
- Modify: `panels/CopyPanel.tsx`, `panels/OnScreenTextPanel.tsx`, `panels/DocumentPanel.tsx`, `panels/ArticlePanel.tsx`, `panels/YouTubePanel.tsx` (all under `src/app/client/[slug]/piece/[contentId]/v2/`)
- Create: `src/app/client/[slug]/piece/[contentId]/v2/panels/panels-tracked.test.tsx`

Spec 5: added words highlighted and removed words struck through "while editing and in review before sending". While editing, the editor shows them (Task 4). Here the read views show them for every unsent edit, so the page she sends from shows exactly what she changed. Spec 4.4: "Jump to my edits" lists every changed article section before sending.

- [ ] **Step 1: Write the failing tests**

```tsx
import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { renderInPage, stubDialogs } from '../test-utils'
import ArticlePanel from './ArticlePanel'
import CopyPanel from './CopyPanel'
import OnScreenTextPanel from './OnScreenTextPanel'

function Save({ target, text }: { target: ReviewTarget; text: string }) {
  const { saveDraft } = useReviewDrafts()
  return <button type="button" onClick={() => saveDraft(target, text, null)}>save draft</button>
}

const CAPTION = 'First paragraph.\n\nSecond paragraph.'
const caption: CopyTab = { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: CAPTION }] }
const SCRIPT = '**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION'
const onscreen: CopyTab = { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel', body: SCRIPT }] }
const ARTICLE = '# Title\n\nOpening.\n\n### Start here\n\nSection body.\n\n### Sources\n\nA source.'
const article: CopyTab = { key: 'article', kind: 'article', label: 'Article', blocks: [{ key: 'article-body', label: 'Article', body: ARTICLE }] }

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('unsent edits read as tracked changes', () => {
  it('in a caption', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'social-caption', label: 'Caption', currentText: CAPTION }} text={'First paragraph.\n\nSecond paragraph, changed.'} />
      <CopyPanel tab={caption} before={{}} canEdit version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    expect(document.querySelector('ins')).toHaveTextContent('paragraph, changed.')
    expect(document.querySelector('del')).toHaveTextContent('paragraph.')
  })

  it('in the edited frame only', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'reel-script', label: 'Reel', currentText: SCRIPT }} text={SCRIPT.replace('PER POSITION', 'PER JOB')} />
      <OnScreenTextPanel tab={onscreen} frames={[]} before={{}} canEdit onSuggestFrame={null} version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].querySelector('ins')).toBeNull()
    expect(rows[1].querySelector('ins')).toHaveTextContent('JOB')
    expect(rows[1].querySelector('del')).toHaveTextContent('POSITION')
  })
})

describe('Jump to my edits', () => {
  it('lists every changed section and links to it', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'article-body', label: 'Article', currentText: ARTICLE }} text={ARTICLE.replace('Section body.', 'Section body, edited.')} />
      <ArticlePanel tab={article} coverUrl={null} before={{}} canEdit version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to my edits (1)' }))
    expect(screen.getByRole('link', { name: 'Start here' })).toHaveAttribute('href', '#article-section-1')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2/panels/panels-tracked.test.tsx"`
Expected: FAIL (no `ins`; no Jump button).

- [ ] **Step 3: Implement**

`editors/JumpToEdits.tsx`:

```tsx
'use client'

import { useState } from 'react'
import styles from '../piece-page.module.css'

// Spec 4.4: before sending, every changed article section, one tap away.
export default function JumpToEdits({ sections }: { sections: Array<{ index: number; name: string }> }) {
  const [open, setOpen] = useState(false)
  if (sections.length === 0) return null
  return <div className={styles.rel}>
    <button type="button" className={styles.link} aria-expanded={open} aria-controls="jump-to-edits" onClick={() => setOpen((v) => !v)}>
      Jump to my edits ({sections.length})
    </button>
    {open && <ul id="jump-to-edits" className={styles.menu} aria-label="Your unsent edits in this article">
      {sections.map((section) => <li key={section.index}>
        <a className={styles.menuItem} href={`#article-section-${section.index}`} onClick={() => setOpen(false)}>{section.name}</a>
      </li>)}
    </ul>}
  </div>
}
```

Add `import TrackedText from '@/components/portal/editor/TrackedText'` to each of `CopyPanel.tsx`, `OnScreenTextPanel.tsx`, `DocumentPanel.tsx`, `ArticlePanel.tsx`, `YouTubePanel.tsx`, then make these replacements.

`CopyPanel.tsx`: replace

```tsx
      <ChangedMarkdown body={source} before={draft ? null : before[block.key ?? ''] ?? null} />
```

with

```tsx
      {draft
        ? <TrackedText base={block.body} current={source} />
        : <ChangedMarkdown body={source} before={before[block.key ?? ''] ?? null} />}
```

`OnScreenTextPanel.tsx` and `DocumentPanel.tsx`: make the same replacement for the whole-block line (`<ChangedMarkdown body={source} before={draft ? null : before[block.key ?? ''] ?? null} />`), and replace the frame or page text line

```tsx
                  <div className={styles.frameText}><MarkdownCopy body={segmentText(segment)} style={INHERIT} /></div>
```

with

```tsx
                  <div className={styles.frameText}>
                    {edited[index] && baseSegments[index]
                      ? <TrackedText base={segmentText(baseSegments[index])} current={segmentText(segment)} />
                      : <MarkdownCopy body={segmentText(segment)} style={INHERIT} />}
                  </div>
```

`ArticlePanel.tsx`: add `import JumpToEdits from '../editors/JumpToEdits'`; replace

```tsx
    {draft && <p className={styles.saved}>Saved · not sent yet</p>}
```

with

```tsx
    {draft && <p className={styles.saved}>Saved · not sent yet</p>}
    {draft && <JumpToEdits sections={segmented.segments.filter((_, i) => edited[i])
      .map((segment) => ({ index: segment.index, name: segment.level === 1 ? 'Opening' : segment.label }))} />}
```

and replace

```tsx
            <ChangedMarkdown body={body} before={previous} className={styles.copy} />
```

with

```tsx
            {edited[index] && baseSegments[index]
              ? <TrackedText base={baseSegments[index].raw.replace(/^[^\n]*\n?/, '')} current={body} />
              : <ChangedMarkdown body={body} before={previous} className={styles.copy} />}
```

`YouTubePanel.tsx`: change the import of the YouTube codec to `import { parseTags, parseYouTubePackage, youTubeFieldValue } from '@/lib/portal/piece-page/youtube-fields'`; after `const previous = draft ? null : before[block.key ?? ''] ?? null` add

```tsx
  const basePackage = parseYouTubePackage(block.body)
  const baseDescription = basePackage ? youTubeFieldValue(basePackage, 'description') : null
```

replace

```tsx
    content = <Field label="Description"><ChangedMarkdown body={source} before={previous} className={styles.fieldValue} /></Field>
```

with

```tsx
    content = <Field label="Description">
      {draft ? <TrackedText base={block.body} current={source} /> : <ChangedMarkdown body={source} before={previous} className={styles.fieldValue} />}
    </Field>
```

and replace

```tsx
            : <Field key="description" label="Description"><ChangedMarkdown body={field.value} before={null} className={styles.fieldValue} /></Field>)}
```

with

```tsx
            : <Field key="description" label="Description">
              {draft && baseDescription !== null
                ? <TrackedText base={baseDescription} current={field.value} />
                : <ChangedMarkdown body={field.value} before={null} className={styles.fieldValue} />}
            </Field>)}
```

- [ ] **Step 4: Run them, and the whole v2 folder**

Run: `pnpm exec vitest run "src/app/client/[slug]/piece/[contentId]/v2"`
Expected: PASS, including `panels-tracked.test.tsx` (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add "src/app/client/[slug]/piece/[contentId]/v2/editors/JumpToEdits.tsx" "src/app/client/[slug]/piece/[contentId]/v2/panels"
git -C ~/worktrees/kanset-piece-page-editor commit -m "Show unsent edits as tracked changes and list edited article sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Editing checks in the scripted phone and desktop run

**Files:**
- Modify: `scripts/piece-page-phone-check.mjs`

- [ ] **Step 1: Add the editing check**

In `scripts/piece-page-phone-check.mjs`, insert immediately before the line `      await page.evaluate(() => window.scrollTo(0, 0))`:

```js
      // Plan 4b: a phone edits in a full-screen sheet with Done on screen; a computer edits in place.
      // The admin preview keeps drafts in this throwaway browser only; nothing is typed here anyway.
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      const edit = page.locator('[data-piece-page-v2] button', { hasText: /^Edit( text| section)?$/ }).first()
      if (await edit.count()) {
        await edit.scrollIntoViewIfNeeded()
        await edit.click()
        if (vp.name === 'phone') {
          const sheet = page.locator('dialog[open]')
          await sheet.waitFor({ timeout: 5000 })
          const box = await sheet.boundingBox()
          if (!box || box.width < vp.width - 1 || box.height < vp.height - 1) failures.push(`${label}: editor sheet is not full screen ${JSON.stringify(box)}`)
          const done = sheet.getByRole('button', { name: 'Done' })
          const doneBox = await done.boundingBox()
          if (!doneBox || doneBox.y + doneBox.height > vp.height || doneBox.height < 44) failures.push(`${label}: Done is off screen or under 44px`)
          await page.screenshot({ path: `${OUT}/${vp.name}-${id}-editing.png` })
          await done.click()
        } else {
          if ((await page.locator('[data-editing-slot]').count()) === 0) failures.push(`${label}: desktop edit did not open in place`)
          if ((await page.locator('dialog[open]').count()) > 0) failures.push(`${label}: desktop edit opened a sheet`)
          await page.screenshot({ path: `${OUT}/${vp.name}-${id}-editing.png` })
          await page.getByRole('button', { name: 'Done' }).first().click()
        }
      } else {
        console.log(`${label}: nothing editable (published or revision in progress); editing check skipped`)
      }
```

- [ ] **Step 2: Check it parses**

Run: `node --check scripts/piece-page-phone-check.mjs && echo ok`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add scripts/piece-page-phone-check.mjs
git -C ~/worktrees/kanset-piece-page-editor commit -m "Check editing at phone width and in place on desktop

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/PORTAL-AGENT-MANUAL.md`

- [ ] **Step 1: Add the editor notes to section 13 (after 13.5)**

```markdown
### 13.6 The piece page editor (plan 4b)

- `DocumentEditor` (`src/components/portal/editor/`) is ProseMirror over our own Markdown codec (`src/lib/portal/piece-page/markdown-doc.ts`). Untouched blocks come back byte-identical; an edited block is re-written in Kanset's Markdown subset; words never change. `canonical-corpus.test.ts` proves it over every file in `~/Kanset/portal-content` (or `PORTAL_CONTENT_DIR`) and skips where the folder is absent.
- Do not swap in `prosemirror-markdown`, `markdown-it` or a TipTap Markdown extension: they normalise untouched text and break the reconciler's exact-match rule.
- Every editor saves the whole block through `ReviewDraftProvider` (plan 3). Frame, page and section editors compose the block with `replaceSegment`; YouTube, chapters and search fields with their codecs. One block, one edit, as the 2026-08-14 contract requires.
- The 50,000 limit is `MAX_EDIT_CHARS` in `limits.ts` and counts code points like the database. The editor never truncates.
```

- [ ] **Step 2: Commit**

```bash
git -C ~/worktrees/kanset-piece-page-editor add docs/PORTAL-AGENT-MANUAL.md
git -C ~/worktrees/kanset-piece-page-editor commit -m "Document the piece page editor and its round-trip guarantee

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Full verification, one build, layout and editing check, freeze

**Files:** none changed.

- [ ] **Step 1:** `pnpm test`. Expected: all files pass; on Anastasia's Mac `canonical-corpus.test.ts` runs (not skipped).
- [ ] **Step 2:** `pnpm exec tsc --noEmit 2>&1 | grep -E 'piece/\[contentId\]/v2|components/portal/editor|piece-page/|edit-length-limit' || echo clean`. Expected: `clean`.
- [ ] **Step 3:** `pnpm build`. Expected: success. Check the piece page's client bundle grew by roughly the ProseMirror size only: `ls -la .next/static/chunks/app/client/\[slug\]/piece/\[contentId\]/` and note the page chunk size in the hand-off.
- [ ] **Step 4: Layout and editing check against the local build, then stop the server**

```bash
cd ~/worktrees/kanset-piece-page-editor
pnpm start -p 3101 > /tmp/kanset-piece-page-editor-start.log 2>&1 &
echo $! > /tmp/kanset-piece-page-editor-start.pid
until curl -s -o /dev/null http://localhost:3101; do sleep 1; done
BASE=http://localhost:3101 PIECES=kanset-2026-10-foreign-worker-cost-reel,kanset-2026-09-podcast-ep3,kanset-2026-09-linkedin-foreign-worker-cost,kanset-2026-09-podcast-ep3-article node scripts/piece-page-phone-check.mjs
kill "$(cat /tmp/kanset-piece-page-editor-start.pid)" && rm /tmp/kanset-piece-page-editor-start.pid
```

Expected: `PASS: 4 pieces at 375px and 1440px`. Pieces that are already published log "editing check skipped"; if all four are published, pick released pieces still under review from Agency Ops and re-run. Cleanup condition: `lsof -i :3101` prints nothing.

- [ ] **Step 5:** Read `/tmp/kanset-piece-page-check/*-editing.png` and compare with mockups `02-reel-editing`, `03b-reel-youtube-edit` and `06-article` (png-v3). Fix only what contradicts the approved mockups, in the task that owns the file, then re-run Steps 1, 2, 3 and 4.
- [ ] **Step 6: UI/UX checklist pass:** invoke `ui-ux-pro-max:ui-ux-pro-max` in review mode on the editors and the editing screenshots: keyboard only (Tab into the editor, Ctrl or Cmd with B and I, Shift-Enter, Escape closes the phone sheet, focus returns to the Edit button's area), visible focus on inputs, chips and chip buttons, 44px targets on the phone sheet toolbar, ins and del distinguishable without colour (strike and highlight shapes, plus the hidden "added" and "removed" words for screen readers). Fix in the owning files; re-run Steps 1 to 4.
- [ ] **Step 7: Freeze:** `git -C ~/worktrees/kanset-piece-page-editor status --short` (clean), `git -C ~/worktrees/kanset-piece-page-editor rev-parse HEAD` (the hash under review).

---

### Task 14: Copy review, code review, rollout (needs Anastasia; not done by the executing agent alone)

- [ ] **Step 1: Client copy through `kanset-copywriting`.** Run the skill over every client-facing line plans 4a and 4b add (first person singular, no em dashes, point-form where it is a list; Maria's preference for plain, short lines). The full list, by place:
  - Header: "Times not confirmed yet" · "Request another date" · "New date requested for …" · "Unschedule requested" · "Updated after your feedback: …" · "Questions & sources" · menu "Copy link", "Request removal", "Link copied".
  - Date request: "Requested Toronto date and time" · "Editorial plan date" · "Toronto time is applied automatically. Your confirmed times stay in place until I confirm the change." · "This moves the planned date on your calendar." · "Send request".
  - Media: "Video coming. You can review the text now." · "Pages coming. You can review the text now." · "This is the trailer. The full episode stays on Drive." · "Open the full episode in Drive" · "Suggest a change to the whole video" · "Suggest a change to page N" · "Tap the page to enlarge" · "Open the video to watch it." · "N frames, each shown beside its text in On-screen text".
  - Text: "On-screen text, frame by frame" · "What the video shows, word for word" · "Edit a frame to change the words on screen. To change how a frame looks, use Suggest a change beside it." · "Editing is closed" · "Edited, not sent" · "Synced to the page you are viewing" · "These show under the episode on YouTube. Edit a title or a time and I will match it to the cut." · "No chapters in this version." · "Times are minutes and seconds, like 12:30. I match them to the cut before it posts." · "Tap the cross to remove a tag. Removed tags stay struck through until you send." · "Jump to my edits (N)".
  - Carried edits: "You have an edit on … written against the previous version. I released version N while it was unsent. Keep it, adjust it, or discard it." · "New in version N" · "Your unsent edit, on version N" · "Keep my edit" · "Adjust" · "Discard" · "Discard this edit? It cannot be recovered." · "Keep it".
  - Editor: "Your edits save as you type and stay unsent until you send them." · "Describe the change, for example: make the headline bigger" · "N of 100 characters" · "N characters over the 50,000 limit. Shorten it before you send. Nothing has been cut."
  - Bar: "N of N reviewed" · "Open … to finish your review." · "New version N. Your earlier ticks are cleared for this version." · "You can approve once the video is here. I will let you know." · "Everything looks right? Approve sends it to scheduling." · "N unsent edits" · "Saved, not sent yet. Nothing reaches me until you send." · "Your N edits did not send. They are still saved here." · "Written against the previous version. Keep, adjust or discard it in the text above." · "Your edits are with me" · "I will send back a revised version for your review." · "I'm applying your edits" · "You sent N edits on …. The new version will show here. Editing is paused until then." · "Approved · posts …" · "Thank you. Nothing else needed from you." · "Posted …" · "Need it taken down? Use Request removal in the menu at the top." · "Still being put together" · "I still need to add: …" · "Only Maria can approve this piece. You can still edit the text." · "Add a note" · "Approve" · "Send my edits (N)" · "Send additional edits (N)" · "Retry".
  - Drawer: "Doesn't change the piece. To change it, edit the text." · "No questions yet. Ask anything about this piece below." · "I usually reply the same day." (a promise: Anastasia to confirm or cut) · "Questions are read-only for your account." · "The sources are still being confirmed." · "No edits sent yet." · "Send question".
  - Intro: the three lines in 4a, Task 27.
  Apply the approved wording as code edits in the owning files, re-run `pnpm test`, and get Anastasia's OK on the final list.
- [ ] **Step 2: Code review** of the frozen hash with the `code-review` skill (no Codex lane). Fix in new commits; re-run Task 13 Steps 1 to 3; re-freeze.
- [ ] **Step 3: Deploy by pushing the reviewed branch:** `git -C ~/thedot-site fetch origin && git -C ~/thedot-site checkout feat/portal-audit-fixes-2026-09-15 && git -C ~/thedot-site merge --ff-only feat/piece-page-editor && git -C ~/thedot-site push origin feat/portal-audit-fixes-2026-09-15`. No migration in this plan. Watch the Vercel deployment to Ready.
- [ ] **Step 4: Verify on production with the preview seat only** (`PORTAL_PIECE_PAGE_V2` still `toodokie@gmail.com`): run the phone check against `https://www.thedotcreative.co`; Anastasia opens a released piece on her phone through the preview seat (admin-minted link), opens an editor, sees it full screen with Done above the keyboard, and on her computer sees it edit in place. Where the preview seat cannot submit edits, she checks editing through `/admin/portal/pieces/<id>/maria-preview?layout=v2` (drafts stay in her browser; nothing is sent).
- [ ] **Step 5: Maria's switch.** Only on Anastasia's word, normally together with plan 5's feedback card and in-portal note: set `PORTAL_PIECE_PAGE_V2=toodokie@gmail.com,maria@kanset.com` in Vercel Production and redeploy. For the first week, check the Agency Ops inbox daily for refused sends (plan 3) and unsent-draft alerts. To roll back instantly: set the variable back to `toodokie@gmail.com` and redeploy; Maria's drafts are server records and survive the switch in either direction.
- [ ] **Step 6: Clean up:** `git -C ~/thedot-site worktree remove ~/worktrees/kanset-piece-page-editor`; delete `/tmp/kanset-piece-page-check` after Anastasia has seen the screenshots.

---

## Self-review

**Spec section 5 coverage:** edit in place, same font and size, no Markdown visible (Tasks 5, 7); Markdown stored underneath with a lossless round trip, tested on real canonical blocks (Tasks 2, 3); track changes while editing and in review before sending, highlighter for added and strike for removed (Tasks 4, 10); YouTube as Title (one line), Description (multi-line), Tags (removable chips), mapped to the existing block bodies, label lines never editable text (Task 8); LinkedIn Post and First comment are their own blocks and tabs (4a) and now edit in the document editor (Task 7); on-screen text edited frame by frame beside its frame (4a placement, Task 7 editor); 50,000 limit with the counter from about 45,000 and no truncation (Task 6); mobile full-screen editor sheet with Done and Discard reachable and the toolbar above the keyboard, touch targets 44px (Tasks 7, 11). Spec 4.4: section-by-section editing composing the one article block and "Jump to my edits" (4a placement, Tasks 7, 10). Spec 12: round-trip and structured-field mapping tests (Tasks 2, 3, 8, 9), phone-width checks (Task 11).

**Placeholder scan:** none; every step that changes code shows it; Task 14 lists every client string by name.

**Type consistency:** `EditorRequest` gains `FormRequest` (`targets`, `render`) and the host value gains `close`, `active`, `inline`; 4a's `CopyEditRequest` (`slotId`, `baseText`) and `EditSlot(slotId)` are used unchanged by the panels. `editorViews` (DocumentEditor) is read only by tests and not by the phone check. `characterCount` and `MAX_EDIT_CHARS` come from `limits.ts` everywhere they are used.

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

// Adversarial inputs: none of these may lose or move a byte, and an untouched block is written as it was.
const ADVERSARIAL: Record<string, string> = {
  zeroPadded: '01. You create an account.\n02. The employer submits an offer.\n03. You apply.',
  startsAtSeven: '7. seven\n8. eight\n10) ten',
  crlf: 'Line one\r\nLine two\r\n\r\n- a\r\n- b\r\n\r\n# Head\r\n\r\n**bold**\r\n',
  stray: 'a * b and _c and 5*3 = 15 and snake_case_name and ** and __init__ and *',
  nested: '- a\n  - b\n    - c\n- d\n  continued',
  hardBreaks: 'line one  \nline two\\\nline three',
  nbsp: '\u00a0Fee:\u00a0$1,000\u00a0\u00a0',
  unknown: '<div>html</div>\n| a | b |\n|---|---|\n![img](x.png)\n[ref]: https://x\n~~strike~~\n```\ncode fence\n```',
  headings: '#No space\n## Two ##\n###### Six\n####### seven',
  links: '[a](https://x.y/z?q=1) and [b](http://insecure) and <https://auto> and [**bold link**](https://k.ca)',
  blankRuns: '\n\n\n  \n\ntext\n\n \t\n\nmore\n\n\n',
  emojiRuns: '👩🏽‍💼 Employers 🇨🇦\n✅ done',
  tabs: '\tIndented para\n\t- not a list',
  quotes: '>No space\n> with space\n>\n> after empty',
  mixedBullets: '* one\n- two\n+ three',
  checks: '- [ ] a\n- [x] b\n- [X] c\n1. [ ] d',
  trailingSpace: 'Ends with a space. \n\nNext.  ',
  crlfEdges: '\r\n\r\nText \r\n  \r\n> q\r\n\r\n',
}

// True when `edited` is `original` with exactly one extra "X" somewhere.
function oneInsertedX(original: string, edited: string): boolean {
  if (edited.length !== original.length + 1) return false
  let i = 0
  while (i < original.length && original[i] === edited[i]) i++
  return edited[i] === 'X' && edited.slice(i + 1) === original.slice(i)
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

  it('round-trips every adversarial input byte for byte', () => {
    for (const [name, body] of Object.entries(ADVERSARIAL)) {
      expect(serializeMarkdown(parseMarkdown(body)), name).toBe(body)
    }
  })

  it('re-writes every adversarial block exactly as it was written', () => {
    for (const [name, body] of Object.entries(ADVERSARIAL)) {
      parseMarkdown(body).forEach((node) => {
        expect(normalizedBlock(node), `${name}: ${node.attrs.raw}`).toBe(node.attrs.raw)
      })
    }
  })

  it('changes only the inserted bytes when she types into any text of any block', () => {
    for (const [name, body] of Object.entries({ ...SHAPES, ...ADVERSARIAL })) {
      // A numbered list with a repeated number is renumbered when edited (plan 4b decision 2).
      if (name === 'numbers') continue
      const doc = parseMarkdown(body)
      doc.descendants((node, pos) => {
        if (!node.isText) return
        const state = EditorState.create({ doc })
        const middle = pos + Math.floor((node.text ?? '').length / 2)
        const edited = serializeMarkdown(state.apply(state.tr.insertText('X', middle)).doc)
        expect(oneInsertedX(body, edited), `${name} at ${middle}: ${JSON.stringify(edited)}`).toBe(true)
      })
    }
  })

  it('keeps every character of a block, trailing spaces included, when it is re-read on its own', () => {
    for (const [name, body] of Object.entries({ ...SHAPES, ...ADVERSARIAL })) {
      parseMarkdown(body).forEach((node, _offset, index) => {
        expect(parseMarkdown(normalizedBlock(node)).textContent, `${name} node ${index}`).toBe(node.textContent)
      })
    }
  })

  it('reads Windows line endings as the same blocks', () => {
    const doc = parseMarkdown('# Head\r\n\r\n> quoted\r\n> on\r\n\r\n- a\r\n- b\r\n\r\n---\r\n\r\nText')
    expect(doc.content.content.map((n) => n.type.name)).toEqual(['heading', 'blockquote', 'bullet_list', 'horizontal_rule', 'paragraph'])
    expect(doc.textContent).not.toContain('#')
    expect(doc.textContent).not.toContain('>')
  })

  it('continues a zero-padded numbered list in the same style', () => {
    const doc = parseMarkdown(ADVERSARIAL.zeroPadded)
    let state = EditorState.create({ doc })
    const end = findText(doc, 'You apply.') + 'You apply.'.length
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)))
    enter(state, (tr) => { state = state.apply(tr) })
    state = state.apply(state.tr.insertText('Done.'))
    expect(serializeMarkdown(state.doc)).toBe(`${ADVERSARIAL.zeroPadded}\n04. Done.`)
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

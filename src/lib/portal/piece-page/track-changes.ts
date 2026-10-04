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

// Screen-reader text for a change; the editor's stylesheet hides .md-sr visually.
function srLabel(text: string): HTMLElement {
  const label = document.createElement('span')
  label.className = 'md-sr'
  label.textContent = text
  return label
}

export function trackChangeDecorations(doc: PMNode, baseText: string): DecorationSet {
  const { inserts, deletes } = trackChangeRanges(doc, baseText)
  return DecorationSet.create(doc, [
    ...inserts.flatMap((range) => [
      Decoration.widget(range.from, () => srLabel('added: '), { side: -1, ignoreSelection: true, key: `ins:${range.from}` }),
      Decoration.inline(range.from, range.to, { nodeName: 'ins', class: 'md-ins' }),
    ]),
    // side -2 puts removed words before any added words at the same spot ("removed ..., added ...").
    ...deletes.map((removed) => Decoration.widget(removed.at, () => {
      const element = document.createElement('del')
      element.className = 'md-del'
      element.contentEditable = 'false'
      element.append(srLabel('removed: '), removed.text)
      return element
    }, { side: -2, ignoreSelection: true, key: `del:${removed.at}:${removed.text}` })),
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

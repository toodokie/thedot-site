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

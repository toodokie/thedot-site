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

// A line may end in \r (Windows line endings): it is kept as text, never dropped.
const HEADING = /^(#{1,6})([ \t]+)(\S[^\n]*)$/
const HR = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$/
const LIST = /^([ \t]{0,3})(?:[-+*]|(\d{1,9})[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/
const QUOTE = /^([ \t]{0,3}>[ \t]?)([^\n]*)$/
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
  if (list && list[0].length < line.replace(/\r$/, '').length) return 'list'
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
    if (match && match[0].length < line.replace(/\r$/, '').length) {
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
  // The trail starts at the first line break of the closing whitespace run, so spaces at the end of
  // the last line stay with that line (as they do on every other line) and a block re-read on its own
  // keeps them.
  const closing = /\s*$/.exec(rest)?.[0] ?? ''
  const trail = closing.includes('\n') ? closing.slice(closing.indexOf('\n')) : ''
  const core = rest.slice(0, rest.length - trail.length)
  const nodes: PMNode[] = []
  if (core.length > 0) {
    const pieces = core.split(/(\n(?:[ \t\r]*\n)+)/)
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
  // The last numbered marker's shape, so a renumbered or new item keeps the list's style ("01. ").
  let shape = { indent: '', width: 1, delim: '.', gap: ' ' }
  let bullet = '- '
  list.forEach((item) => {
    let marker = String(item.attrs.marker ?? '')
    if (ordered) {
      const match = ORDERED_MARKER.exec(marker)
      if (match) shape = { indent: match[1], width: match[2].length, delim: match[3], gap: match[4] }
      const keep = match !== null && (previous === null || Number(match[2]) !== previous)
      const number = keep ? Number((match as RegExpExecArray)[2]) : previous === null ? 1 : previous + 1
      // A kept number keeps its digits exactly; a new one is padded like the list's (01, 02).
      const digits = keep ? (match as RegExpExecArray)[2] : String(number).padStart(shape.width, '0')
      marker = `${shape.indent}${digits}${shape.delim}${shape.gap}${match?.[5] ?? ''}`
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

// Lossless "- **Label:** value" codec for the article's publishing details block (spec 4.4,
// Search & sharing). Lines that are not fields are kept verbatim. A CRLF line keeps its \r in
// trail, so CRLF lists parse like LF ones.

export type LabeledField = {
  kind: 'field'; lead: string; label: string; sep: string; wrap: '' | '`'; value: string; trail: string
}
export type LabeledItem = LabeledField | { kind: 'text'; raw: string }
export type LabeledList = { items: LabeledItem[] }

const FIELD = /^([ \t]*[-*+][ \t]+\*\*)([^*\n]+?)(:\*\*[ \t]*|\*\*:[ \t]*)(.*?)([ \t\r]*)$/

export function parseLabeledList(body: string): LabeledList {
  return {
    items: body.split('\n').map((line): LabeledItem => {
      const match = FIELD.exec(line)
      if (!match) return { kind: 'text', raw: line }
      const ticked = /^`([^`]*)`$/.exec(match[4])
      return {
        kind: 'field', lead: match[1], label: match[2], sep: match[3],
        wrap: ticked ? '`' : '', value: ticked ? ticked[1] : match[4], trail: match[5],
      }
    }),
  }
}

export function serializeLabeledList(list: LabeledList): string {
  return list.items.map((item) => (item.kind === 'text'
    ? item.raw
    : item.lead + item.label + item.sep + item.wrap + item.value + item.wrap + item.trail)).join('\n')
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function labeledValue(list: LabeledList, label: string): string | null {
  const field = list.items.find((item): item is LabeledField => item.kind === 'field' && same(item.label, label))
  return field ? field.value : null
}

export function setLabeledValue(list: LabeledList, label: string, value: string): LabeledList {
  // A field is one line: any line break in the new value becomes a space.
  const clean = value.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  // Only the first field with this label changes: the one labeledValue reads.
  const target = list.items.findIndex((item) => item.kind === 'field' && same(item.label, label))
  return {
    items: list.items.map((item, index) => (index === target && item.kind === 'field' && value !== item.value
      ? { ...item, value: clean }
      : item)),
  }
}

// What Maria sees for the four fields search and sharing depend on. Limits are guidance counters,
// never enforced.
export const SEARCH_FIELDS = [
  { label: 'SEO title', title: 'Search title', limit: 60 },
  { label: 'Meta description', title: 'Search description', limit: 160 },
  { label: 'Slug', title: 'Web address', limit: null },
  { label: 'Excerpt', title: 'Preview text when shared', limit: null },
] as const

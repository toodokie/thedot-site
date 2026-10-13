import { describe, expect, it } from 'vitest'
import {
  SEARCH_FIELDS, labeledValue, parseLabeledList, serializeLabeledList, setLabeledValue,
  type LabeledField,
} from './labeled-list'

const SEO = [
  '- **Title / H1:** How to Choose a Representative',
  '- **SEO title:** How to Choose a Representative in Canada',
  '- **Slug:** `/news/how-to-choose`',
  '- **Meta description:** A license tells you who may help you.',
  'A stray line that is not a field.',
  '- **Excerpt:** Anyone you pay has to be licensed.',
].join('\n')

describe('labelled list', () => {
  it('round-trips exactly', () => {
    expect(serializeLabeledList(parseLabeledList(SEO))).toBe(SEO)
  })

  it('reads values, case-insensitive, without code ticks', () => {
    const list = parseLabeledList(SEO)
    expect(labeledValue(list, 'seo title')).toBe('How to Choose a Representative in Canada')
    expect(labeledValue(list, 'Slug')).toBe('/news/how-to-choose')
    expect(labeledValue(list, 'Missing')).toBeNull()
  })

  it('changes one value, keeping its code ticks and every other line', () => {
    const next = serializeLabeledList(setLabeledValue(parseLabeledList(SEO), 'Slug', '/news/choose'))
    expect(next).toBe(SEO.replace('`/news/how-to-choose`', '`/news/choose`'))
  })

  it('maps the four search fields with their guidance limits', () => {
    expect(SEARCH_FIELDS.map((field) => [field.label, field.title, field.limit])).toEqual([
      ['SEO title', 'Search title', 60],
      ['Meta description', 'Search description', 160],
      ['Slug', 'Web address', null],
      ['Excerpt', 'Preview text when shared', null],
    ])
  })
})

// Round-trip property over tricky and real-world inputs: parse then serialize returns the exact
// input bytes, and writing any field's own value back changes nothing.

// Shape of a real canonical article-seo block (portal-content, no client data).
const REAL_SEO = [
  '## SEO and publishing details',
  '',
  '- **Title / H1:** How to Choose an Immigration Representative, and What a License Will Not Tell You',
  '- **SEO title:** How to Choose an Immigration Representative in Canada',
  '- **Target keyword:** how to choose an immigration representative Canada',
  '- **Slug:** `/news/how-to-choose-an-immigration-representative`',
  '- **Category:** News',
  '- **Meta description:** A license tells you who is allowed to help you, not who should.',
  '- **Excerpt:** Anyone you pay to represent you has to be licensed. That is the floor, not the answer.',
  '- **Tags:** Kanset Talks, Immigration, Consultation',
  '',
].join('\n')

const crlf = (text: string) => text.replace(/\n/g, '\r\n')

const TRICKY: string[] = [
  '', '\n', '\n\n', '\r\n', '   ', 'x',
  SEO, REAL_SEO, crlf(SEO), crlf(REAL_SEO), SEO + '\n\n\n', '\n\n' + SEO,
  '- **Slug:**',
  '- **Slug:**   ',
  '- **Slug:** `',
  '- **Slug:** ``',
  '- **Slug:** `a` and `b`',
  '- **Slug**: colon outside',
  '* **Slug:** star bullet',
  '+ **Slug:** plus bullet',
  '  - **Slug:** indented',
  '\t- **Slug:**\tvalue\t',
  '- **Slug:** trailing spaces   ',
  '- **Slug:** trailing cr\r',
  '- **Slug:** lone\rcr inside',
  '- **Bold *star* label:** v',
  '- **:** empty label',
  '- **Slug:** value with **bold** inside',
  '- **Slug:**  nbsp ',
  '- **Slug:** sep inside',
  '-**Slug:** no space after bullet',
  'Plain: line',
  '- **SEO title:** One\n- **SEO title:** Duplicate',
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const TOKENS = [
  '- ', '* ', '**', '**Slug:**', '**SEO title:** ', ':**', '**:', '`', ' ', '\t', '\n', '\n', '\r\n', '\r',
  'value', 'Label', ':', '/news/x', ' ',
]
function fuzz(count: number, seed: number): string[] {
  const random = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const length = Math.floor(random() * 30)
    return Array.from({ length }, () => TOKENS[Math.floor(random() * TOKENS.length)]).join('')
  })
}

describe('round-trip property', () => {
  const inputs = [...TRICKY, ...fuzz(500, 20261004)]

  it('serializes every input back to the exact bytes', () => {
    for (const body of inputs) expect(serializeLabeledList(parseLabeledList(body))).toBe(body)
  })

  it('writing a field\'s own value back changes nothing', () => {
    for (const body of inputs) {
      const list = parseLabeledList(body)
      for (const item of list.items) {
        if (item.kind !== 'field') continue
        const value = labeledValue(list, item.label)!
        expect(serializeLabeledList(setLabeledValue(list, item.label, value))).toBe(body)
      }
    }
  })

  it('reads CRLF lists like LF ones', () => {
    const lf = parseLabeledList(REAL_SEO)
    const cr = parseLabeledList(crlf(REAL_SEO))
    const labels = (list: typeof lf) => list.items.filter((i): i is LabeledField => i.kind === 'field').map((i) => i.label)
    expect(labels(cr)).toEqual(labels(lf))
    for (const field of SEARCH_FIELDS) expect(labeledValue(cr, field.label)).toBe(labeledValue(lf, field.label))
    const next = serializeLabeledList(setLabeledValue(cr, 'Slug', '/news/choose'))
    expect(next).toBe(crlf(REAL_SEO).replace('`/news/how-to-choose-an-immigration-representative`', '`/news/choose`'))
  })
})

describe('setLabeledValue edge cases (review fix)', () => {
  it('drops stray spaces when filling an empty value', () => {
    const list = parseLabeledList('- **Slug:**   ')
    expect(serializeLabeledList(setLabeledValue(list, 'Slug', 'New'))).toBe('- **Slug:** New')
  })

  it('reads back a value with a backtick from a code-ticked field', () => {
    const list = parseLabeledList('- **Slug:** `old`')
    const next = setLabeledValue(list, 'Slug', 'a`b')
    expect(labeledValue(parseLabeledList(serializeLabeledList(next)), 'Slug')).toBe('a`b')
  })
})

import { describe, expect, it } from 'vitest'
import {
  findChapters, formatTags, formatTagsLike, parseTags, parseYouTubePackage, replaceChapters,
  parseTitleBlock, serializeYouTubePackage, setTitleBlockTitle, setYouTubeField, youTubeFieldValue, type YouTubeFieldName,
} from './youtube-fields'

const INLINE = [
  '**Title:** What does a permit cost?',
  '',
  '**Description:**',
  'Three things to know.',
  '',
  'Book a consultation: https://kanset.com/contact',
  '',
  '#LMIA #KansetServices',
  '',
  '**Tags:** LMIA, LMIA cost, foreign worker',
].join('\n')

const OWN_LINES = [
  '**Title**',
  '',
  'Ask Kanset: Does remote work count?',
  '',
  '**Description**',
  '',
  'For the Canadian Experience Class, it depends.',
  '',
  '**Tags**',
  '',
  'canadian experience, remote work canada, kanset',
  '',
  '**Related video:** episode 3, https://youtu.be/example',
  '',
  '**Note for Maria on the title:** kept to the series format.',
].join('\n')

const PLAIN = [
  'Title: Ask Kanset: Can I lay off a foreign worker?',
  '',
  'Description: You can, with one extra step. kanset.com/contact',
].join('\n')

const BOLD_INSIDE = [
  '**Title:** Two employer paths',
  '',
  '**Description:**',
  '',
  'Intro line.',
  '',
  '**Path 1: The worker has an open permit**',
  '',
  'Details.',
].join('\n')

describe('parseYouTubePackage', () => {
  it('round-trips every shape exactly', () => {
    for (const body of [INLINE, OWN_LINES, PLAIN, BOLD_INSIDE]) {
      const parsed = parseYouTubePackage(body)
      expect(parsed).not.toBeNull()
      expect(serializeYouTubePackage(parsed!)).toBe(body)
    }
  })

  it('reads inline, own-line and plain labels', () => {
    expect(youTubeFieldValue(parseYouTubePackage(INLINE)!, 'title')).toBe('What does a permit cost?')
    expect(youTubeFieldValue(parseYouTubePackage(INLINE)!, 'tags')).toBe('LMIA, LMIA cost, foreign worker')
    expect(youTubeFieldValue(parseYouTubePackage(OWN_LINES)!, 'title')).toBe('Ask Kanset: Does remote work count?')
    expect(youTubeFieldValue(parseYouTubePackage(PLAIN)!, 'description')).toBe('You can, with one extra step. kanset.com/contact')
  })

  it('keeps notes after the tags out of the tags', () => {
    const parsed = parseYouTubePackage(OWN_LINES)!
    expect(youTubeFieldValue(parsed, 'tags')).toBe('canadian experience, remote work canada, kanset')
    expect(parsed.rest).toContain('**Note for Maria on the title:**')
  })

  it('keeps bold lines inside the description', () => {
    expect(youTubeFieldValue(parseYouTubePackage(BOLD_INSIDE)!, 'description')).toContain('**Path 1:')
  })

  it('returns null without a title label', () => {
    expect(parseYouTubePackage('Just a description, no labels.')).toBeNull()
  })
})

describe('setYouTubeField', () => {
  it('changes one field and nothing else', () => {
    const next = serializeYouTubePackage(setYouTubeField(parseYouTubePackage(INLINE)!, 'title', 'A new title'))
    expect(next).toBe(INLINE.replace('What does a permit cost?', 'A new title'))
  })

  it('leaves a missing field missing', () => {
    const parsed = parseYouTubePackage(PLAIN)!
    expect(serializeYouTubePackage(setYouTubeField(parsed, 'tags', 'x'))).toBe(PLAIN)
  })
})

describe('tags', () => {
  it('parses commas and new lines and formats with comma space', () => {
    expect(parseTags('LMIA, LMIA cost,foreign worker\nkanset')).toEqual(['LMIA', 'LMIA cost', 'foreign worker', 'kanset'])
    expect(formatTags(['a', 'b c'])).toBe('a, b c')
  })
})

describe('chapters', () => {
  const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n1:03:43 Last one\n\nOutro.'

  it('finds the run of chapter lines', () => {
    const chapters = findChapters(DESCRIPTION)!
    expect(chapters.items).toEqual([
      { time: '00:00', title: 'Meet Maria and Mary' },
      { time: '01:31', title: 'Should a client bring questions?' },
      { time: '1:03:43', title: 'Last one' },
    ])
    expect(DESCRIPTION.slice(chapters.start, chapters.end)).toBe('00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n1:03:43 Last one')
  })

  it('replaces only the chapter lines', () => {
    const chapters = findChapters(DESCRIPTION)!
    const next = replaceChapters(DESCRIPTION, chapters, [{ time: '00:00', title: 'Hello' }, { time: '02:00', title: 'Bye' }])
    expect(next).toBe('Intro.\n\nChapters:\n00:00 Hello\n02:00 Bye\n\nOutro.')
  })

  it('needs at least two chapter lines', () => {
    expect(findChapters('00:00 Only one')).toBeNull()
  })
})

// Round-trip property over tricky and real-world inputs: whenever a package parses, serializing
// it returns the exact input bytes, and writing any field's own value back changes nothing.

// Shape of a real canonical YouTube Short block (portal-content, no client data).
const REAL_SHORT = [
  'Title: Ask Kanset: can I apply to Express Entry without a job offer?',
  '',
  'Description: Yes, you can, Express Entry does not require a job offer. Questions? https://kanset.com/contact',
  '',
  'Video production by @loftcreativespace',
  '',
  '#ExpressEntry #CanadaImmigration #KansetServices',
  '',
].join('\n')

const crlf = (text: string) => text.replace(/\n/g, '\r\n')

const TRICKY: string[] = [
  INLINE, OWN_LINES, PLAIN, BOLD_INSIDE, REAL_SHORT,
  crlf(INLINE), crlf(OWN_LINES), crlf(PLAIN), crlf(BOLD_INSIDE), crlf(REAL_SHORT),
  INLINE + '\n', INLINE + '\n\n\n', '\n\n' + INLINE,
  'Preamble line\n\n**Title:** T\n**Description:** D\n**Tags:** a, b',
  '**Title:**',
  '**Title:**\n',
  '**Title**\n\n\n',
  'Title:',
  'title: lower case\ndescription: also lower',
  '**Title:**   spaced   \t\n\n**Description:**\t\n\n\n  indented body  \n\n',
  '**Tags:** first\n**Title:** after tags\n**Description:** d',
  '**Title:** A\n**Title:** duplicate\n**Description:** B\n**Description:** again',
  '**Title:** A\n**Tags**\n\n\n',
  '**Title:** A\n**Tags:** x\n\nNote after.\n\nAnother note.',
  '**Title:** A\r\n**Tags:** x\r\n\r\nNote after.\r\n',
  '**Title:** A\n**Tags:** x\n \t\nNote after spaces line.',
  '**Title:** mixed\r\n**Description:**\n\r\nbody\r\n',
  '**Title**: colon outside\n**Description**: body',
  'Unknown: line\nTitle: T\nUnknown: other\nDescription: D\n\nTrailing unknown',
  '**Title:** emoji \u{1F600} and   nbsp\n**Description:**   separator',
  '**Title:** A\n**Description:**\n00:00 Intro\n01:00 Middle\n\nOutro',
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
  '**Title:**', '**Title**', 'Title:', '**Description:**', '**Description**', 'Description:', '**Tags:**',
  '**Tags**', 'Tags:', '\n', '\n', '\n', '\r\n', ' ', '\t', 'word', 'a, b', '#tag', '**Note:**', '00:00 x',
]
function fuzz(count: number, seed: number): string[] {
  const random = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const length = Math.floor(random() * 30)
    return Array.from({ length }, () => TOKENS[Math.floor(random() * TOKENS.length)]).join('')
  })
}

const NAMES: YouTubeFieldName[] = ['title', 'description', 'tags']

describe('round-trip property', () => {
  const inputs = [...TRICKY, ...fuzz(500, 20261004)]

  it('serializes every parsed input back to the exact bytes', () => {
    let parsedCount = 0
    for (const body of inputs) {
      const parsed = parseYouTubePackage(body)
      if (!parsed) continue
      parsedCount += 1
      expect(serializeYouTubePackage(parsed)).toBe(body)
    }
    expect(parsedCount).toBeGreaterThan(100)
  })

  it('writing a field\'s own value back changes nothing', () => {
    for (const body of inputs) {
      const parsed = parseYouTubePackage(body)
      if (!parsed) continue
      for (const name of NAMES) {
        const value = youTubeFieldValue(parsed, name)
        if (value === null) continue
        expect(serializeYouTubePackage(setYouTubeField(parsed, name, value))).toBe(body)
      }
    }
  })

  it('reads CRLF packages like LF ones', () => {
    for (const body of [INLINE, OWN_LINES, PLAIN, BOLD_INSIDE, REAL_SHORT]) {
      const lf = parseYouTubePackage(body)!
      const cr = parseYouTubePackage(crlf(body))!
      for (const name of NAMES) {
        expect(youTubeFieldValue(cr, name)).toBe(youTubeFieldValue(lf, name) === null ? null : crlf(youTubeFieldValue(lf, name)!))
      }
    }
  })

  it('keeps CRLF line endings when a field in a CRLF package is edited', () => {
    const body = crlf(INLINE)
    const next = serializeYouTubePackage(setYouTubeField(parseYouTubePackage(body)!, 'description', 'One.\n\nTwo.'))
    expect(next).toBe(crlf(INLINE.replace('Three things to know.\n\nBook a consultation: https://kanset.com/contact\n\n#LMIA #KansetServices', 'One.\n\nTwo.')))
  })

  it('finds chapters in a CRLF description and keeps its line endings on replace', () => {
    const text = 'Intro.\r\n00:00 One\r\n01:00 Two\r\n\r\nOutro.'
    const chapters = findChapters(text)!
    expect(chapters.items).toEqual([{ time: '00:00', title: 'One' }, { time: '01:00', title: 'Two' }])
    expect(replaceChapters(text, chapters, chapters.items)).toBe(text)
    expect(replaceChapters(text, chapters, [{ time: '00:00', title: 'A' }, { time: '02:00', title: 'B' }]))
      .toBe('Intro.\r\n00:00 A\r\n02:00 B\r\n\r\nOutro.')
  })
})

describe('filling an empty field (review fix)', () => {
  const fill = (body: string, name: YouTubeFieldName, value: string) =>
    serializeYouTubePackage(setYouTubeField(parseYouTubePackage(body)!, name, value))
  const roundTrip = (out: string) => parseYouTubePackage(out)!

  it('keeps the next label on its own line (adjacent)', () => {
    const out = fill('**Title:**\n**Description:** d', 'title', 'NEW')
    expect(out).toBe('**Title:** NEW\n**Description:** d')
    expect(youTubeFieldValue(roundTrip(out), 'title')).toBe('NEW')
    expect(youTubeFieldValue(roundTrip(out), 'description')).toBe('d')
  })

  it('keeps the next label on its own line (blank line between)', () => {
    const out = fill('**Title:**\n\n**Description:** d', 'title', 'NEW')
    expect(out).toBe('**Title:** NEW\n\n**Description:** d')
    expect(youTubeFieldValue(roundTrip(out), 'description')).toBe('d')
  })

  it('puts a space after an empty trailing label and keeps CRLF', () => {
    expect(fill('**Title:** t\n**Description:**', 'description', 'NEW')).toBe('**Title:** t\n**Description:** NEW')
    const crlf = fill('**Title:**\r\n**Description:** d', 'title', 'NEW')
    expect(crlf).toBe('**Title:** NEW\r\n**Description:** d')
    expect(youTubeFieldValue(roundTrip(crlf), 'description')).toBe('d')
  })
})

describe('replaceChapters no-op (review fix)', () => {
  it('writes unchanged chapters back byte for byte', () => {
    const text = 'Intro\n\n00:00   Hello  \n01:00 Next\r\nafter'
    const found = findChapters(text)!
    expect(replaceChapters(text, found, found.items)).toBe(text)
  })
})

describe('formatTagsLike (Task 8: tags keep their separator style)', () => {
  it('returns the original value byte for byte when the tags are unchanged', () => {
    for (const original of ['LMIA,LMIA cost , foreign worker', 'a\nb\nc', 'a\r\nb', 'a, b,', '']) {
      expect(formatTagsLike(original, parseTags(original))).toBe(original)
    }
  })

  it('writes changed tags with the separator the original used', () => {
    expect(formatTagsLike('LMIA,LMIA cost,foreign worker', ['LMIA', 'foreign worker'])).toBe('LMIA,foreign worker')
    expect(formatTagsLike('a\nb\nc', ['a', 'c', 'd'])).toBe('a\nc\nd')
    expect(formatTagsLike('a\r\nb', ['a', 'b', 'c'])).toBe('a\r\nb\r\nc')
    expect(formatTagsLike('a, b,', ['a'])).toBe('a,')
    expect(formatTagsLike('only', ['only', 'more'])).toBe('only, more')
    expect(formatTagsLike('', ['first'])).toBe('first')
  })
})

// Item 4 (2026-10-06): a youtube-title block is the title on its first line; a later line that is
// a full italic line is the agency's note about the title (e.g. why it is kept short).
describe('title block notes', () => {
  const EP4 = 'Life after PR in Canada: what comes next | Kanset Talks Ep. 4\n\n*Kept short on purpose: YouTube cuts long titles in search results and on phones.*'

  it('reads the first line as the title and a full italic line as a note, without asterisks', () => {
    const block = parseTitleBlock(EP4)
    expect(block.title).toBe('Life after PR in Canada: what comes next | Kanset Talks Ep. 4')
    expect(block.notes).toEqual(['Kept short on purpose: YouTube cuts long titles in search results and on phones.'])
    expect(block.extra).toEqual([])
  })

  it('accepts underscore italics and CRLF lines, and leaves bold and partly italic lines as extra text', () => {
    const block = parseTitleBlock('Title here\r\n_Note one_\r\n**Bold line**\r\nHalf *italic* line')
    expect(block.title).toBe('Title here')
    expect(block.notes).toEqual(['Note one'])
    expect(block.extra).toEqual(['**Bold line**', 'Half *italic* line'])
  })

  it('a plain one-line title has no notes', () => {
    expect(parseTitleBlock('Old title')).toEqual({ title: 'Old title', notes: [], extra: [] })
  })

  it('round-trips byte for byte and replaces only the title line', () => {
    const bodies = [EP4, 'Old title', '\nLeading blank\n*n*', 'T\r\n\r\n*note*\r\n', '']
    for (const body of bodies) expect(setTitleBlockTitle(body, parseTitleBlock(body).title)).toBe(body)
    expect(setTitleBlockTitle(EP4, 'Life after PR | Kanset Talks Ep. 4'))
      .toBe(EP4.replace('Life after PR in Canada: what comes next | Kanset Talks Ep. 4', 'Life after PR | Kanset Talks Ep. 4'))
    expect(setTitleBlockTitle('T\r\n*note*', 'New')).toBe('New\r\n*note*')
  })
})

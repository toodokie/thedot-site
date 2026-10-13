import { describe, expect, it } from 'vitest'
import { joinSegments, replaceSegment, segmentBlock, segmentText, type SegmentMode } from './segments'

const ROUNDUP = [
  'Seven frames, 30 seconds.',
  '',
  '**1.** YOUR WEEKLY UPDATE · **DRAWS: 6,000 INVITED** · OCTOBER EDITION',
  '',
  '**2.** **TRADES** · 3,000 INVITED · CRS 470',
  '',
  '**3.** End card: **IN THE POOL?** · BOOK A CONSULTATION',
].join('\n')

const LIST_FRAMES = [
  '- Frame 1 (hook): A question? Another one?',
  '- Frame 2: Three processes with different purposes.',
  '- Frame 3, the permit: Their authorization to work.',
].join('\n')

const MIXED_LIST = [
  '- **0 to 2s (hook):** Want to hire but not sure where to begin?',
  '- **Frame 2:** Start with one question.',
  '- **Frame 3:** Some roles need one.',
  '- **CTA:** Not sure which path is yours?',
].join('\n')

const BOLD_PAGES = [
  '12 pages, 1080 x 1350.',
  '',
  '**Page 1, cover**',
  '',
  'GUIDE, SEPTEMBER',
  '',
  '**Page 2, the fee**',
  '',
  '**PAID BEFORE HIRING.**',
  '',
  '- Paid by the employer.',
  '',
  '',
  '**Page 3, the wage**',
  '',
  'The employer must offer a wage.',
].join('\n')

const HEADING_PAGES = [
  '**Document title:** A guide',
  '',
  '### Page 1 | Cover',
  '',
  '**HIRING WITHOUT AN LMIA?**',
  '',
  '### What HR should confirm',
  '',
  '### Page 2 | Start with the right question',
  '',
  'Two situations.',
].join('\n')

const NUMBERED = [
  '1. **Is the paperwork in order?** Here is what to track.',
  '2. **A permit is not forever.** Every permit expires.',
].join('\n')

const ARTICLE = [
  '# How to Choose a Representative',
  '',
  'Opening paragraph one.',
  '',
  'Opening paragraph two.',
  '',
  '### Start with the one thing you can check',
  '',
  'Body of section one.',
  '',
  '### Official sources',
  '',
  '- [A source](https://www.canada.ca/a) (canada.ca)',
].join('\n')

const ALL = [ROUNDUP, LIST_FRAMES, MIXED_LIST, BOLD_PAGES, HEADING_PAGES, NUMBERED]

describe('segmentBlock is lossless', () => {
  it('joins back to the exact body for every shape', () => {
    for (const body of ALL) {
      expect(joinSegments(segmentBlock(body, 'frames'))).toBe(body)
      expect(joinSegments(segmentBlock(body, 'pages'))).toBe(body)
    }
    expect(joinSegments(segmentBlock(ARTICLE, 'sections'))).toBe(ARTICLE)
  })
})

describe('frames', () => {
  it('splits **1.** style frames and keeps the intro line as preamble', () => {
    const result = segmentBlock(ROUNDUP, 'frames')
    expect(result.preamble).toBe('Seven frames, 30 seconds.\n\n')
    expect(result.segments.map((s) => s.label)).toEqual(['Frame 1', 'Frame 2', 'Frame 3'])
    expect(segmentText(result.segments[1])).toBe('**2.** **TRADES** · 3,000 INVITED · CRS 470')
  })

  it('splits "- Frame N" list frames', () => {
    expect(segmentBlock(LIST_FRAMES, 'frames').segments.map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('uses every list item when only some carry a frame number', () => {
    const result = segmentBlock(MIXED_LIST, 'frames')
    expect(result.preamble).toBe('')
    expect(result.segments.map((s) => s.number)).toEqual([1, 2, 3, 4])
    expect(result.segments[3].raw).toBe('- **CTA:** Not sure which path is yours?')
  })

  it('numbers an ordered list from its own numbers', () => {
    expect(segmentBlock(NUMBERED, 'frames').segments.map((s) => s.label)).toEqual(['Frame 1', 'Frame 2'])
  })

  it('returns no segments for a block without structure', () => {
    expect(segmentBlock('Just one caption line.', 'frames')).toEqual({ preamble: 'Just one caption line.', segments: [] })
  })
})

describe('pages', () => {
  it('splits bold page headers, keeping blank lines with the page above', () => {
    const result = segmentBlock(BOLD_PAGES, 'pages')
    expect(result.segments.map((s) => s.label)).toEqual(['Page 1', 'Page 2', 'Page 3'])
    expect(result.segments[1].raw.endsWith('- Paid by the employer.\n\n\n')).toBe(true)
  })

  it('splits heading pages and leaves other headings inside the page', () => {
    const result = segmentBlock(HEADING_PAGES, 'pages')
    expect(result.segments.map((s) => s.label)).toEqual(['Page 1', 'Page 2'])
    expect(result.segments[0].raw).toContain('### What HR should confirm')
  })
})

describe('sections', () => {
  it('splits at headings and records the heading level and text', () => {
    const result = segmentBlock(ARTICLE, 'sections')
    expect(result.segments.map((s) => [s.level, s.label])).toEqual([
      [1, 'How to Choose a Representative'],
      [3, 'Start with the one thing you can check'],
      [3, 'Official sources'],
    ])
  })
})

describe('replaceSegment', () => {
  it('replaces one segment and leaves every other character alone', () => {
    const next = replaceSegment(BOLD_PAGES, 'pages', 1, '**Page 2, the fee**\n\n**PAID BY THE EMPLOYER.**\n')
    expect(next).toBe(BOLD_PAGES.replace('**PAID BEFORE HIRING.**\n\n- Paid by the employer.', '**PAID BY THE EMPLOYER.**'))
  })

  it('throws for a segment that does not exist', () => {
    expect(() => replaceSegment(ROUNDUP, 'frames', 9, 'x')).toThrow('No segment 9')
  })
})

// Round-trip property over tricky and real-world inputs: whatever the shape, segmenting and
// joining returns the exact input bytes, and writing a segment's own text back changes nothing.

// Excerpt in the shape of a real canonical reel script (portal-content, no client data).
const REAL_REEL_SCRIPT = [
  'Express Entry OR a Provincial nomination?',
  '',
  "You don't have to choose.",
  '',
  'Three things that help:',
  '1. Run both profiles to increase your odds.',
  '2. Know your real odds under each.',
  '3. Keep your information consistent across both.',
  '',
  "Two doors beat one. Let's find yours.",
  '',
].join('\n')

const TRICKY: string[] = [
  '',
  '\n',
  '\n\n\n',
  '   ',
  '\t\n \n',
  'x',
  'no trailing newline',
  'trailing newline\n',
  ...ALL,
  ARTICLE,
  REAL_REEL_SCRIPT,
  ALL.map((body) => body.replace(/\n/g, '\r\n')).join('\r\n\r\n'),
  ROUNDUP.replace(/\n/g, '\r\n') + '\r\n',
  ARTICLE.replace(/\n/g, '\r\n'),
  BOLD_PAGES + '\n\n\n',
  '\n\n' + LIST_FRAMES + '\n',
  '- a\n-  b\n- c   \n\n\n- d\t\n',
  '# only heading',
  '#not a heading\n## real\n',
  '## A\n## B\n## C',
  '**1.**\n**2.**\n',
  '- Frame 1\n\n- Frame 1\n\n- Frame 1',
  '* Slide 2: x\n+ Slide 1: y\n',
  '### Page 1 |\n\n### Page 2 |\n \n',
  'unknown line\n- **CTA:** go\nanother unknown\n- **Frame 9:** z\n\n\n',
  ' weird separator\n- one\n- two \n',
  '1) first\n2) second\n10) tenth',
  '\r\n\r\n- a\r\n- b\r\n',
  '- a\r- b\r',
]

// Small seeded generator so the fuzz is deterministic.
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
  '\n', '\n', '\r\n', ' ', '\t', '- ', '* ', '1. ', '2) ', '**', '**1.** ', '**Page 3** ', '### ', '# ',
  'Frame 2', 'Slide 1:', 'Page 4', 'Scene', 'Card 7', 'text', 'Word', ':', '|', '`', ' ', '#',
]
function fuzz(count: number, seed: number): string[] {
  const random = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const length = Math.floor(random() * 40)
    return Array.from({ length }, () => TOKENS[Math.floor(random() * TOKENS.length)]).join('')
  })
}

const MODES: SegmentMode[] = ['frames', 'pages', 'sections']

describe('round-trip property', () => {
  const inputs = [...TRICKY, ...fuzz(400, 20261004)]

  it('joins back to the exact input for every input and mode', () => {
    for (const body of inputs) {
      for (const mode of MODES) {
        const segmented = segmentBlock(body, mode)
        expect(joinSegments(segmented)).toBe(body)
        expect(segmented.preamble + segmented.segments.map((s) => s.raw).join('')).toBe(body)
      }
    }
  })

  it('writing each segment\'s own text back changes nothing', () => {
    for (const body of inputs) {
      for (const mode of MODES) {
        const { segments } = segmentBlock(body, mode)
        segments.forEach((segment, index) => {
          expect(replaceSegment(body, mode, index, segmentText(segment))).toBe(body)
        })
      }
    }
  })

  it('keeps CRLF line endings when a segment in a CRLF block is edited', () => {
    const body = ROUNDUP.replace(/\n/g, '\r\n')
    const next = replaceSegment(body, 'frames', 1, '**2.** **TRADES**\n3,000 INVITED')
    expect(next).toBe(body.replace('**2.** **TRADES** · 3,000 INVITED · CRS 470', '**2.** **TRADES**\r\n3,000 INVITED'))
  })
})

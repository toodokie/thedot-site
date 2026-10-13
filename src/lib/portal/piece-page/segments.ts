// Lossless segmentation of a copy block into frames, pages or article sections (spec 2026-10-03
// sections 4.3 and 4.4). The page shows on-screen text frame by frame and PDF text page by page,
// and an edit to one frame composes back into the one block body the bundle sends. Segmenting
// never changes a character: preamble + every segment's raw is the body. A block without a
// recognisable structure yields no segments and the page shows it whole.

export type SegmentMode = 'frames' | 'pages' | 'sections'
export type SegmentKind = 'Frame' | 'Page' | 'Slide' | 'Scene' | 'Card' | 'Section'

export type Segment = {
  index: number
  number: number
  kind: SegmentKind
  label: string
  // Heading level for sections (1 to 6); 0 for frames and pages.
  level: number
  // Exact source from the marker line to the next marker, trailing blank lines included.
  raw: string
}

export type Segmented = { preamble: string; segments: Segment[] }

type Line = { text: string; offset: number }
type Start = { line: number; number: number | null; word: string | null; level: number; heading: string | null }

const HEADING_NUMBERED = /^#{2,6}\s+(page|slide|frame|scene|card)\s*(\d+)/i
const BOLD_NUMBERED = /^\*\*\s*(page|slide|frame|scene|card)\s*(\d+)/i
const BOLD_DIGIT = /^\*\*(\d+)\.\*\*/
const PLAIN_NUMBERED = /^(?:[-*+]\s+)?(?:\*\*)?\s*(page|slide|frame|scene|card)\s*(\d+)/i
const LIST_ITEM = /^(?:[-*+]|(\d+)[.)])\s+\S/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

function splitLines(body: string): Line[] {
  const lines: Line[] = []
  let offset = 0
  for (const text of body.split('\n')) {
    lines.push({ text, offset })
    offset += text.length + 1
  }
  return lines
}

function numbered(lines: Line[], pattern: RegExp): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = pattern.exec(line.text)
    if (match) starts.push({ line: index, number: Number(match[2]), word: match[1], level: 0, heading: null })
  })
  return starts
}

function boldStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const named = BOLD_NUMBERED.exec(line.text)
    if (named) {
      starts.push({ line: index, number: Number(named[2]), word: named[1], level: 0, heading: null })
      return
    }
    const digit = BOLD_DIGIT.exec(line.text)
    if (digit) starts.push({ line: index, number: Number(digit[1]), word: null, level: 0, heading: null })
  })
  return starts
}

function listStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = LIST_ITEM.exec(line.text)
    if (!match) return
    const named = PLAIN_NUMBERED.exec(line.text)
    starts.push({
      line: index,
      number: named ? Number(named[2]) : match[1] ? Number(match[1]) : null,
      word: named ? named[1] : null,
      level: 0,
      heading: null,
    })
  })
  return starts
}

function frameStarts(lines: Line[]): Start[] {
  const list = listStarts(lines)
  for (const candidate of [numbered(lines, HEADING_NUMBERED), boldStarts(lines), numbered(lines, PLAIN_NUMBERED)]) {
    if (candidate.length < 2) continue
    const allListItems = candidate.every((start) => LIST_ITEM.test(lines[start.line].text))
    return allListItems && list.length > candidate.length ? list : candidate
  }
  return list.length >= 2 ? list : []
}

function sectionStarts(lines: Line[]): Start[] {
  const starts: Start[] = []
  lines.forEach((line, index) => {
    const match = HEADING.exec(line.text)
    if (match) {
      const heading = match[2].replace(/\*\*|__/g, '').trim()
      starts.push({ line: index, number: null, word: null, level: match[1].length, heading })
    }
  })
  return starts
}

function kindOf(word: string | null, mode: SegmentMode): SegmentKind {
  if (mode === 'sections') return 'Section'
  if (word) return (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) as SegmentKind
  return mode === 'pages' ? 'Page' : 'Frame'
}

export function segmentBlock(body: string, mode: SegmentMode): Segmented {
  const lines = splitLines(body)
  const starts = mode === 'sections' ? sectionStarts(lines) : frameStarts(lines)
  if (starts.length === 0 || (mode !== 'sections' && starts.length < 2)) return { preamble: body, segments: [] }
  const offsets = starts.map((start) => lines[start.line].offset)
  const segments = starts.map((start, index): Segment => {
    const kind = kindOf(start.word, mode)
    const number = start.number ?? index + 1
    return {
      index,
      number,
      kind,
      label: mode === 'sections' ? (start.heading ?? `Section ${index + 1}`) : `${kind} ${number}`,
      level: start.level,
      raw: body.slice(offsets[index], index + 1 < offsets.length ? offsets[index + 1] : body.length),
    }
  })
  return { preamble: body.slice(0, offsets[0]), segments }
}

export function joinSegments(segmented: Segmented): string {
  return segmented.preamble + segmented.segments.map((segment) => segment.raw).join('')
}

// The text an editor shows for one segment: its source without the blank lines that separate it
// from the next one. replaceSegment puts those blank lines back.
export function segmentText(segment: Segment): string {
  return segment.raw.replace(/\s+$/, '')
}

export function replaceSegment(body: string, mode: SegmentMode, index: number, text: string): string {
  const segmented = segmentBlock(body, mode)
  const target = segmented.segments[index]
  if (!target) throw new Error(`No segment ${index}`)
  const trimmed = text.replace(/\s+$/, '')
  // Writing a segment's own text back is a no-op, whatever its line endings.
  if (trimmed === segmentText(target)) return body
  const trailing = /\s*$/.exec(target.raw)?.[0] ?? ''
  // Editors hand back LF; a segment written with CRLF keeps CRLF.
  let replacement = trimmed.replace(/\r\n?/g, '\n')
  if (target.raw.includes('\r\n')) replacement = replacement.replace(/\n/g, '\r\n')
  replacement += trailing
  return segmented.preamble + segmented.segments
    .map((segment) => (segment.index === index ? replacement : segment.raw)).join('')
}

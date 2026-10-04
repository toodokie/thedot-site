// Lossless YouTube package codec (spec 2026-10-03 section 5, structured fields). Title,
// Description and Tags map to the exact existing block body: preamble + every field's
// head + value + tail + rest is the body. Notes after the tags stay verbatim in rest.
// CRLF bodies parse like LF ones, and an edited field keeps the line endings it was written with.

export type YouTubeFieldName = 'title' | 'description' | 'tags'
export type YouTubeField = { name: YouTubeFieldName; head: string; value: string; tail: string }
export type YouTubePackage = { preamble: string; fields: YouTubeField[]; rest: string }

// A trailing \r (CRLF line) is captured on its own so it never lands in an inline value.
const BOLD_LABEL = /^\*\*(title|description|tags)(:?)\*\*(:?)[ \t]*(.*)(\r?)$/i
const PLAIN_LABEL = /^(title|description|tags):[ \t]*(.*)(\r?)$/i

type Label = { offset: number; lineEnd: number; name: YouTubeFieldName; inlineStart: number | null }

export function parseYouTubePackage(body: string): YouTubePackage | null {
  const labels: Label[] = []
  let offset = 0
  for (const line of body.split('\n')) {
    const bold = BOLD_LABEL.exec(line)
    const plain = bold ? null : PLAIN_LABEL.exec(line)
    if (bold || plain) {
      const name = (bold ?? plain)![1].toLowerCase() as YouTubeFieldName
      const inline = bold ? bold[4] : plain![2]
      const cr = bold ? bold[5] : plain![3]
      if (!labels.some((label) => label.name === name)) {
        labels.push({
          offset,
          lineEnd: offset + line.length,
          name,
          inlineStart: inline.length > 0 ? offset + line.length - cr.length - inline.length : null,
        })
      }
    }
    offset += line.length + 1
  }
  if (!labels.some((label) => label.name === 'title')) return null

  const fields: YouTubeField[] = []
  let end = 0
  labels.forEach((label, index) => {
    const next = labels[index + 1]?.offset ?? body.length
    const skip = /^\n(?:[ \t]*\r?\n)*/.exec(body.slice(label.lineEnd))?.[0].length ?? 0
    const valueStart = label.inlineStart ?? Math.min(label.lineEnd + skip, next)
    let regionEnd = next
    if (label.name === 'tags' && index === labels.length - 1) {
      const blank = /\r?\n[ \t]*\r?\n/.exec(body.slice(valueStart))
      if (blank) regionEnd = valueStart + blank.index
    }
    const region = body.slice(valueStart, regionEnd)
    const value = region.replace(/\s+$/, '')
    fields.push({
      name: label.name,
      head: body.slice(label.offset, valueStart),
      value,
      tail: region.slice(value.length),
    })
    end = regionEnd
  })
  return { preamble: body.slice(0, labels[0].offset), fields, rest: body.slice(end) }
}

export function serializeYouTubePackage(pkg: YouTubePackage): string {
  return pkg.preamble + pkg.fields.map((field) => field.head + field.value + field.tail).join('') + pkg.rest
}

export function youTubeFieldValue(pkg: YouTubePackage, name: YouTubeFieldName): string | null {
  return pkg.fields.find((field) => field.name === name)?.value ?? null
}

export function setYouTubeField(pkg: YouTubePackage, name: YouTubeFieldName, value: string): YouTubePackage {
  const trimmed = value.replace(/\s+$/, '')
  return {
    ...pkg,
    fields: pkg.fields.map((field) => {
      if (field.name !== name || trimmed === field.value) return field
      // Editors hand back LF; a field written with CRLF keeps CRLF.
      let clean = trimmed.replace(/\r\n?/g, '\n')
      if ((field.head + field.value + field.tail).includes('\r\n')) clean = clean.replace(/\n/g, '\r\n')
      if (field.value === '') {
        // An empty field has no inline gap: put the value after the label on the same line and
        // keep the line breaks that followed the label, so the next label stays at line start.
        const label = field.head.replace(/\s+$/, '')
        const breaks = /(?:\r?\n[ \t\r\n]*)?$/.exec(field.head)?.[0] ?? ''
        const eol = (field.head + field.tail).includes('\r\n') ? '\r\n' : '\n'
        const nextLabel = pkg.fields[pkg.fields.indexOf(field) + 1] !== undefined
        const tail = breaks.includes('\n') ? breaks : nextLabel ? eol : field.tail
        return { ...field, head: `${label} `, value: clean, tail }
      }
      return { ...field, value: clean }
    }),
  }
}

export function parseTags(value: string): string[] {
  return value.split(/\s*,\s*|\n+/).map((tag) => tag.trim()).filter(Boolean)
}

export function formatTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(', ')
}

// Writes tags back in the style they were written in: unchanged tags return the original value
// byte for byte; changed tags are joined with the original's first separator (", ", ",", a line
// break) and keep a trailing comma if it had one. With no separator to copy, ", ".
export function formatTagsLike(original: string, tags: string[]): string {
  const clean = tags.map((tag) => tag.trim()).filter(Boolean)
  const before = parseTags(original)
  if (clean.length === before.length && clean.every((tag, index) => tag === before[index])) return original
  const trailing = /\s*,\s*$/.exec(original)?.[0] ?? ''
  const body = original.slice(0, original.length - trailing.length)
  const separator = /\s*,\s*|(?:\r?\n)+/.exec(body)?.[0] ?? ', '
  return clean.length > 0 ? clean.join(separator) + trailing : ''
}

const CHAPTER = /^((?:\d{1,2}:)?\d{1,2}:\d{2})[ \t]+(\S.*?)[ \t]*(\r?)$/

export type ChapterItem = { time: string; title: string }
export type Chapters = { start: number; end: number; items: ChapterItem[] }

// The first run of two or more consecutive "00:00 Title" lines. start and end are character
// offsets of the run (end excludes the line break after the last chapter, \r included).
export function findChapters(text: string): Chapters | null {
  let offset = 0
  let run: Chapters | null = null
  for (const line of text.split('\n')) {
    const match = CHAPTER.exec(line)
    if (match) {
      const lineEnd = offset + line.length - match[3].length
      if (!run) run = { start: offset, end: lineEnd, items: [] }
      run.items.push({ time: match[1], title: match[2] })
      run.end = lineEnd
    } else if (run) {
      if (run.items.length >= 2) return run
      run = null
    }
    offset += line.length + 1
  }
  return run && run.items.length >= 2 ? run : null
}

export function replaceChapters(text: string, chapters: Chapters, items: ChapterItem[]): string {
  const breakWith = text.slice(chapters.start, chapters.end).includes('\r\n') ? '\r\n' : '\n'
  const original = text.slice(chapters.start, chapters.end).split('\n').map((line) => line.replace(/\r$/, ''))
  const lines = items.map((item, index) => {
    const before = chapters.items[index]
    // An unchanged chapter keeps its exact original line.
    if (before && before.time === item.time && before.title === item.title && original[index] !== undefined) return original[index]
    return `${item.time.trim()} ${item.title.trim()}`
  }).join(breakWith)
  return text.slice(0, chapters.start) + lines + text.slice(chapters.end)
}

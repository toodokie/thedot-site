import type { CSSProperties, ReactNode } from 'react'

type MarkdownBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' }

// Emphasis follows CommonMark's flanking rules closely enough for copy: a single * or _ must hug
// its text, and _ never opens or closes inside a word. Anything else is a literal character.
// No lookbehind: older iOS Safari cannot parse it, and a parse error would break the whole page.
const inlineToken = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|\*(?![\s*])(?:[^*\n]*[^\s*])?\*|_(?![\s_])(?:[^_\n]*[^\s_])?_)/g
const WORD_CHAR = /[A-Za-z0-9_\u00C0-\u024F]/

function isEmphasis(part: string | undefined): boolean {
  return part !== undefined && part.length > 2 && (/^(\*\*|__)[\s\S]+\1$/.test(part) || /^([*_])[\s\S]+\1$/.test(part))
}

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(inlineToken)
  return parts.map((part, index) => {
    if (!part) return null
    if ((part.startsWith('**') && part.endsWith('**') && part.length > 4) || (part.startsWith('__') && part.endsWith('__') && part.length > 4)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/)
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
    }
    // _ never opens or closes emphasis inside a word (file_name_here).
    const inWord = part.startsWith('_')
      && (WORD_CHAR.test(parts[index - 1]?.slice(-1) ?? '') || WORD_CHAR.test(parts[index + 1]?.charAt(0) ?? ''))
    if (index % 2 === 1 && !inWord && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    // Asterisks wrapped around bold or italic text ("***both***") are markers; any other * or _
    // is something Maria approved and renders as written.
    if (/^\*+$/.test(part) && (isEmphasis(parts[index - 1]) || isEmphasis(parts[index + 1]))) return null
    return <span key={index}>{part}</span>
  })
}

function parseBlocks(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: { ordered: boolean; start: number; items: string[] } | null = null
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list })
    list = null
  }
  const flushQuote = () => {
    if (quote.length) blocks.push({ kind: 'quote', lines: quote })
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushAll()
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      flushAll()
      blocks.push({ kind: 'heading', text: heading[1] })
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll()
      blocks.push({ kind: 'rule' })
      continue
    }
    const unordered = line.match(/^\s*[-+*]\s+(?:\[([ xX])\]\s+)?(.+)$/)
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      flushQuote()
      const isOrdered = Boolean(ordered)
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] }
      const checkbox = unordered?.[1]
      const text = ordered?.[2] ?? unordered?.[2] ?? ''
      list.items.push(checkbox == null ? text : `${checkbox.trim() ? '☑' : '☐'} ${text}`)
      continue
    }
    const quoted = line.match(/^\s*>\s?(.*)$/)
    if (quoted) {
      flushParagraph()
      flushList()
      quote.push(quoted[1])
      continue
    }
    flushList()
    flushQuote()
    paragraph.push(line)
  }
  flushAll()
  return blocks
}

export function plainTextFromMarkdown(body: string): string {
  return body
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s+\[ \]\s+/gm, '☐ ')
    .replace(/^\s*[-+*]\s+\[[xX]\]\s+/gm, '☑ ')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*/g, '')
}

const baseStyle: CSSProperties = {
  fontFamily: 'var(--dot-font-text)',
  fontSize: 16,
  lineHeight: 1.7,
  color: 'var(--dot-black)',
}

export default function MarkdownCopy({ body, style }: { body: string; style?: CSSProperties }) {
  const blocks = parseBlocks(body)
  return (
    <div data-markdown-copy style={{ ...baseStyle, ...style }}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return <h4 key={index} style={{ margin: index === 0 ? '0 0 10px' : '22px 0 10px', font: 'inherit', fontWeight: 700 }}>
            {inlineMarkdown(block.text)}
          </h4>
        }
        if (block.kind === 'rule') return <hr key={index} style={{ border: 0, borderTop: '1px solid var(--dot-hairline)', margin: '18px 0' }} />
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return <List key={index} start={block.ordered && block.start !== 1 ? block.start : undefined} style={{ margin: '10px 0 16px', paddingLeft: 24 }}>
            {block.items.map((item, itemIndex) => <li key={itemIndex} style={{ marginBottom: 5 }}>{inlineMarkdown(item)}</li>)}
          </List>
        }
        if (block.kind === 'quote') {
          return <blockquote key={index} style={{ margin: '12px 0 16px', paddingLeft: 14, borderLeft: '3px solid var(--dot-yellow)' }}>
            {block.lines.map((line, lineIndex) => <span key={lineIndex}>{inlineMarkdown(line)}{lineIndex < block.lines.length - 1 && <br />}</span>)}
          </blockquote>
        }
        return <p key={index} style={{ margin: '0 0 14px' }}>
          {block.lines.map((line, lineIndex) => <span key={lineIndex}>{inlineMarkdown(line)}{lineIndex < block.lines.length - 1 && <br />}</span>)}
        </p>
      })}
    </div>
  )
}

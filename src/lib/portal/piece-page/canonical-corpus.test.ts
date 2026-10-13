// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { parseContentFile } from '@/lib/portal/frontmatter'
import { parseLabeledList, serializeLabeledList } from './labeled-list'
import { isLosslessMarkdown, normalizedBlock, parseMarkdown, schema, serializeMarkdown } from './markdown-doc'
import { joinSegments, segmentBlock } from './segments'
import { parseYouTubePackage, serializeYouTubePackage } from './youtube-fields'

const DIR = process.env.PORTAL_CONTENT_DIR ?? join(homedir(), 'Kanset', 'portal-content')
const FILES = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith('.md')) : []
if (FILES.length === 0) console.warn(`canonical-corpus: no canonical files at ${DIR}; the real-block round trip was skipped`)

type Block = { where: string; key: string; body: string }

function blocks(): Block[] {
  return FILES.flatMap((file) => parseContentFile(readFileSync(join(DIR, file), 'utf8'), file).copy_blocks
    .map((block) => ({ where: `${file}#${block.key}`, key: block.key, body: block.body })))
}

describe.skipIf(FILES.length === 0)('every real canonical block', () => {
  const all = blocks()

  it('has a corpus worth testing', () => {
    expect(all.length).toBeGreaterThan(150)
  })

  it('round-trips through the editor model character for character', () => {
    expect(all.filter((b) => serializeMarkdown(parseMarkdown(b.body)) !== b.body).map((b) => b.where)).toEqual([])
  })

  it('opens every real block in the document editor, never the plain fallback', () => {
    expect(all.filter((b) => !isLosslessMarkdown(b.body)).map((b) => b.where)).toEqual([])
  })

  it('keeps every word when any block is re-written from scratch', () => {
    const changed: string[] = []
    for (const b of all) {
      parseMarkdown(b.body).forEach((node, _offset, index) => {
        const again = parseMarkdown(normalizedBlock(node))
        if (again.textContent !== node.textContent) changed.push(`${b.where} node ${index}`)
      })
    }
    expect(changed).toEqual([])
  })

  it('re-writes every real block exactly as it was written, so an edit changes only her bytes', () => {
    const drifted: string[] = []
    for (const b of all) {
      parseMarkdown(b.body).forEach((node, _offset, index) => {
        if (normalizedBlock(node) !== node.attrs.raw) drifted.push(`${b.where} node ${index}`)
      })
    }
    expect(drifted).toEqual([])
  })

  it('changes only the typed character when she types into any text of any real block', () => {
    const broken: string[] = []
    for (const b of all) {
      const doc = parseMarkdown(b.body)
      const state = EditorState.create({ doc })
      doc.descendants((node, pos) => {
        if (!node.isText) return
        const at = pos + Math.floor((node.text ?? '').length / 2)
        const edited = serializeMarkdown(state.apply(state.tr.insertText('X', at)).doc)
        let i = 0
        while (i < b.body.length && b.body[i] === edited[i]) i++
        const ok = edited.length === b.body.length + 1 && edited[i] === 'X' && edited.slice(i + 1) === b.body.slice(i)
        if (!ok) broken.push(`${b.where} at ${at}`)
      })
    }
    expect(broken).toEqual([])
  })

  it('leaves every other block byte-identical when one word changes in the last block', () => {
    const broken: string[] = []
    for (const b of all) {
      const doc = parseMarkdown(b.body)
      if (doc.childCount < 2) continue
      let target = -1
      doc.forEach((node, offset, index) => {
        if (index !== doc.childCount - 1) return
        node.descendants((child, pos) => {
          if (target < 0 && child.isText) target = offset + 1 + pos
          return target < 0
        })
      })
      if (target < 0) continue
      const state = EditorState.create({ doc })
      const edited = serializeMarkdown(state.apply(state.tr.insertText('X', target)).doc)
      const prefixDoc = schema.nodes.doc.create({ lead: doc.attrs.lead, trail: '' },
        Array.from({ length: doc.childCount - 1 }, (_, i) => doc.child(i)))
      const prefix = serializeMarkdown(prefixDoc) + String(doc.lastChild!.attrs.sep)
      if (!edited.startsWith(prefix)) broken.push(b.where)
    }
    expect(broken).toEqual([])
  })

  it('segments every block into frames, pages and sections losslessly', () => {
    const broken = all.flatMap((b) => (['frames', 'pages', 'sections'] as const)
      .filter((mode) => joinSegments(segmentBlock(b.body, mode)) !== b.body).map((mode) => `${b.where} ${mode}`))
    expect(broken).toEqual([])
  })

  it('reads every YouTube package losslessly or declines it', () => {
    const packages = all.filter((b) => ['youtube-package', 'youtube-short', 'youtube-shorts-copy'].includes(b.key))
    const broken = packages.filter((b) => {
      const parsed = parseYouTubePackage(b.body)
      return parsed !== null && serializeYouTubePackage(parsed) !== b.body
    }).map((b) => b.where)
    expect(broken).toEqual([])
  })

  it('reads every article search block losslessly', () => {
    const seo = all.filter((b) => b.key === 'article-seo')
    expect(seo.filter((b) => serializeLabeledList(parseLabeledList(b.body)) !== b.body).map((b) => b.where)).toEqual([])
  })
})

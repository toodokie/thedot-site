import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { applyCanonicalEdit, applyCanonicalEdits, buildCanonicalCreate } from './canonical-request-reconciler'
import { parseContentFile } from './frontmatter'

const source = `---
portal_kind: content
content_id: test-piece
client: kanset
title: "Test piece"
format: carousel
platforms: [instagram]
scheduled_date: "2026-07-20"
status: draft
version: 2
fact_check: confirmed
fact_check_scope: not_applicable
fact_check_exemption: "Brand-only text with no factual claims."
fact_check_ledger: []
---
<!-- portal-block:caption -->
## Caption
Released copy.

<!-- portal-block:title -->
## Title
Keep this.

<!-- internal -->
Private bytes:  keep  spacing.
`

describe('canonical request reconciler', () => {
  it('changes exactly one keyed block, bumps once, and preserves the internal suffix byte-for-byte', () => {
    const internal = source.slice(source.indexOf('<!-- internal -->'))
    const original = parseContentFile(source, 'test-piece.md').copy_blocks[0].body
    const result = applyCanonicalEdit(source, 'test-piece.md', 2, {
      blockKey: 'caption',
      originalChecksum: createHash('sha256').update(original).digest('hex'),
      proposedText: 'New line one.\nNew line two.',
    })
    expect(result.version).toBe(3)
    expect(result.raw.endsWith(internal)).toBe(true)
    expect(parseContentFile(result.raw, 'test-piece.md').copy_blocks).toEqual([
      { key: 'caption', label: 'Caption', body: 'New line one.\nNew line two.' },
      { key: 'title', label: 'Title', body: 'Keep this.' },
    ])
  })

  it('fails closed on stale checksum, version, or block key', () => {
    const request = { blockKey: 'caption', originalChecksum: '0'.repeat(64), proposedText: 'Changed.' }
    expect(() => applyCanonicalEdit(source, 'test-piece.md', 2, request)).toThrow(/checksum/)
    expect(() => applyCanonicalEdit(source, 'test-piece.md', 1, { ...request })).toThrow(/version/)
    expect(() => applyCanonicalEdit(source, 'test-piece.md', 2, { ...request, blockKey: 'missing' })).toThrow(/no longer exists/)
  })

  it('bundles distinct client edits into one version without touching internal notes', () => {
    const internal = source.slice(source.indexOf('<!-- internal -->'))
    const blocks = parseContentFile(source, 'test-piece.md').copy_blocks
    const result = applyCanonicalEdits(source, 'test-piece.md', 2, [
      {
        blockKey: 'caption',
        originalChecksum: createHash('sha256').update(blocks[0].body).digest('hex'),
        proposedText: 'Maria caption.',
      },
      {
        blockKey: 'title',
        originalChecksum: createHash('sha256').update(blocks[1].body).digest('hex'),
        proposedText: 'Maria title.',
      },
    ])
    expect(result.version).toBe(3)
    expect(result.raw.endsWith(internal)).toBe(true)
    expect(parseContentFile(result.raw, 'test-piece.md').copy_blocks).toEqual([
      { key: 'caption', label: 'Caption', body: 'Maria caption.' },
      { key: 'title', label: 'Title', body: 'Maria title.' },
    ])
  })

  it('fails closed when a bundled request duplicates a block or has a stale checksum', () => {
    const original = parseContentFile(source, 'test-piece.md').copy_blocks[0].body
    const patch = {
      blockKey: 'caption', originalChecksum: createHash('sha256').update(original).digest('hex'), proposedText: 'Changed.',
    }
    expect(() => applyCanonicalEdits(source, 'test-piece.md', 2, [patch, { ...patch, proposedText: 'Again.' }]))
      .toThrow(/two edits to the same copy block/)
    expect(() => applyCanonicalEdits(source, 'test-piece.md', 2, [{ ...patch, originalChecksum: '0'.repeat(64) }]))
      .toThrow(/checksum/)
  })

  it('creates a parser-valid unreleased working draft that cannot claim confirmed evidence', () => {
    const raw = buildCanonicalCreate('requested-piece', 'kanset', {
      title: 'Requested piece', brief: 'Explain this topic after source review.',
      platforms: ['instagram'], desiredDate: '2026-07-30', notes: 'Keep it concise.',
    }, 'requested-piece.md')
    const parsed = parseContentFile(raw, 'requested-piece.md')
    expect(parsed.version).toBe(1)
    expect(parsed.fact_check).toBe('needs-confirm')
    expect(parsed.internal_notes).toContain('Keep it concise')
  })
})

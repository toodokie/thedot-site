import { describe, expect, it } from 'vitest'
import { resolveReleasedCanonicalSource } from './canonical-provenance'

const SOURCE = '1'.repeat(40)
const HEAD = '2'.repeat(40)
const PATH = 'piece.md'

function reader(options: { ancestor: boolean; sourceRaw?: string; headRaw?: string }) {
  return (args: string[]) => {
    const command = args.join(' ')
    if (command === `show ${SOURCE}:${PATH}`) return options.sourceRaw ?? 'released bytes'
    if (command === `show ${HEAD}:${PATH}`) return options.headRaw ?? 'released bytes'
    if (command === `merge-base --is-ancestor ${SOURCE} ${HEAD}`) {
      if (options.ancestor) return ''
      throw new Error('not an ancestor')
    }
    throw new Error(`unexpected git command: ${command}`)
  }
}

describe('canonical provenance', () => {
  it('uses the recorded release when its commit is an ancestor', () => {
    expect(resolveReleasedCanonicalSource({
      git: reader({ ancestor: true }), sourceCommitSha: SOURCE, canonicalBaseRef: HEAD, sourcePath: PATH,
    })).toEqual({ raw: 'released bytes', adoptedEquivalentTree: false })
  })

  it('accepts a squash-rewritten history only when the canonical file is byte-identical', () => {
    expect(resolveReleasedCanonicalSource({
      git: reader({ ancestor: false }), sourceCommitSha: SOURCE, canonicalBaseRef: HEAD, sourcePath: PATH,
    })).toEqual({ raw: 'released bytes', adoptedEquivalentTree: true })
  })

  it('fails closed when rewritten history contains different canonical bytes', () => {
    expect(() => resolveReleasedCanonicalSource({
      git: reader({ ancestor: false, headRaw: 'different bytes' }),
      sourceCommitSha: SOURCE, canonicalBaseRef: HEAD, sourcePath: PATH,
    })).toThrow(/does not exactly match/)
  })
})

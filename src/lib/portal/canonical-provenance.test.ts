import { describe, expect, it } from 'vitest'
import {
  resolveReleasedCanonicalSource,
  resolveReleasedCanonicalSourceForPreparedCandidate,
} from './canonical-provenance'

const SOURCE = '1'.repeat(40)
const HEAD = '2'.repeat(40)
const PARENT = '3'.repeat(40)
const CANDIDATE = '4'.repeat(40)
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

function preparedReader(options: {
  headRaw?: string
  candidateRaw?: string
  parentRaw?: string
  changedPaths?: string
  candidateReachable?: boolean
}) {
  return (args: string[]) => {
    const command = args.join(' ')
    if (command === `show ${SOURCE}:${PATH}`) return 'released bytes'
    if (command === `show ${HEAD}:${PATH}`) return options.headRaw ?? 'approved candidate'
    if (command === `show ${CANDIDATE}:${PATH}`) return options.candidateRaw ?? 'approved candidate'
    if (command === `show ${PARENT}:${PATH}`) return options.parentRaw ?? 'released bytes'
    if (command === `merge-base --is-ancestor ${SOURCE} ${HEAD}`) throw new Error('not an ancestor')
    if (command === `merge-base --is-ancestor ${SOURCE} ${PARENT}`) throw new Error('not an ancestor')
    if (command === `log -1 --format=%H ${HEAD} -- ${PATH}`) return CANDIDATE
    if (command === `merge-base --is-ancestor ${CANDIDATE} ${HEAD}`) {
      if (options.candidateReachable === false) throw new Error('not an ancestor')
      return ''
    }
    if (command === `diff-tree --no-commit-id --name-only -r ${CANDIDATE}`) return options.changedPaths ?? PATH
    if (command === `rev-parse --verify ${CANDIDATE}^`) return PARENT
    throw new Error(`unexpected git command: ${command}`)
  }
}

describe('prepared canonical candidate provenance', () => {
  it('adopts an unchanged earlier one-file candidate whose parent is the exact released tree', () => {
    expect(resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({}),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toEqual({
      raw: 'released bytes',
      adoptedEquivalentTree: true,
      adoptedPreparedCandidate: true,
    })
  })

  it('fails closed when the current canonical file is not the prepared candidate', () => {
    expect(() => resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({ headRaw: 'different candidate' }),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toThrow(/does not exactly match/)
  })

  it('fails closed when the historical candidate bytes do not match', () => {
    expect(() => resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({ candidateRaw: 'different candidate' }),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toThrow(/does not exactly match/)
  })

  it('fails closed when the historical candidate is not an ancestor of canonical head', () => {
    expect(() => resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({ candidateReachable: false }),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toThrow(/not reachable/)
  })

  it('fails closed when the prepared commit changes another file', () => {
    expect(() => resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({ changedPaths: `${PATH}\nother.md` }),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toThrow(/must change only/)
  })

  it('fails closed when the prepared commit parent is not the released tree', () => {
    expect(() => resolveReleasedCanonicalSourceForPreparedCandidate({
      git: preparedReader({ parentRaw: 'different released bytes' }),
      sourceCommitSha: SOURCE,
      canonicalBaseRef: HEAD,
      sourcePath: PATH,
      preparedCandidateRaw: 'approved candidate\n',
    })).toThrow(/does not exactly match/)
  })
})

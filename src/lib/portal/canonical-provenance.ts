export type CanonicalGitReader = (args: string[]) => string

export type CanonicalSourceResolution = {
  raw: string
  adoptedEquivalentTree: boolean
}

export function resolveReleasedCanonicalSource(options: {
  git: CanonicalGitReader
  sourceCommitSha: string
  canonicalBaseRef: string
  sourcePath: string
}): CanonicalSourceResolution {
  const { git, sourceCommitSha, canonicalBaseRef, sourcePath } = options
  const raw = git(['show', `${sourceCommitSha}:${sourcePath}`])

  try {
    git(['merge-base', '--is-ancestor', sourceCommitSha, canonicalBaseRef])
    return { raw, adoptedEquivalentTree: false }
  } catch {
    const canonicalRaw = git(['show', `${canonicalBaseRef}:${sourcePath}`])
    if (canonicalRaw !== raw) {
      throw new Error('Canonical source provenance is not reachable and the canonical file does not exactly match the released source')
    }
    return { raw, adoptedEquivalentTree: true }
  }
}

export function resolveReleasedCanonicalSourceForPreparedCandidate(options: {
  git: CanonicalGitReader
  sourceCommitSha: string
  canonicalBaseRef: string
  sourcePath: string
  preparedCandidateRaw: string
}): CanonicalSourceResolution & { adoptedPreparedCandidate: boolean } {
  const { git, sourceCommitSha, canonicalBaseRef, sourcePath, preparedCandidateRaw } = options

  try {
    return {
      ...resolveReleasedCanonicalSource({ git, sourceCommitSha, canonicalBaseRef, sourcePath }),
      adoptedPreparedCandidate: false,
    }
  } catch (originalError) {
    const canonicalRaw = git(['show', `${canonicalBaseRef}:${sourcePath}`])
    if (canonicalRaw !== preparedCandidateRaw.trimEnd()) throw originalError

    const changedPaths = git([
      'diff-tree', '--no-commit-id', '--name-only', '-r', canonicalBaseRef,
    ]).split('\n').filter(Boolean)
    if (changedPaths.length !== 1 || changedPaths[0] !== sourcePath) {
      throw new Error('Prepared candidate commit must change only the reviewed canonical file')
    }

    const parent = git(['rev-parse', '--verify', `${canonicalBaseRef}^`])
    const released = resolveReleasedCanonicalSource({
      git,
      sourceCommitSha,
      canonicalBaseRef: parent,
      sourcePath,
    })
    return { ...released, adoptedPreparedCandidate: true }
  }
}

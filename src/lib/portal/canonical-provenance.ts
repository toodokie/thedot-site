export type CanonicalGitReader = (args: string[]) => string

export function resolveReleasedCanonicalSource(options: {
  git: CanonicalGitReader
  sourceCommitSha: string
  canonicalBaseRef: string
  sourcePath: string
}): { raw: string; adoptedEquivalentTree: boolean } {
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

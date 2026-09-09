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

    const candidateCommit = git([
      'log', '-1', '--format=%H', canonicalBaseRef, '--', sourcePath,
    ])
    if (!/^[0-9a-f]{40}$/.test(candidateCommit)) {
      throw new Error('Prepared candidate commit is not reachable from canonical history')
    }
    try {
      git(['merge-base', '--is-ancestor', candidateCommit, canonicalBaseRef])
    } catch {
      throw new Error('Prepared candidate commit is not reachable from canonical history')
    }
    const candidateRaw = git(['show', `${candidateCommit}:${sourcePath}`])
    if (candidateRaw !== preparedCandidateRaw.trimEnd()) throw originalError

    const changedPaths = git([
      'diff-tree', '--no-commit-id', '--name-only', '-r', candidateCommit,
    ]).split('\n').filter(Boolean)
    if (changedPaths.length !== 1 || changedPaths[0] !== sourcePath) {
      throw new Error('Prepared candidate commit must change only the reviewed canonical file')
    }

    const parent = git(['rev-parse', '--verify', `${candidateCommit}^`])
    const released = resolveReleasedCanonicalSource({
      git,
      sourceCommitSha,
      canonicalBaseRef: parent,
      sourcePath,
    })
    return { ...released, adoptedPreparedCandidate: true }
  }
}

export type AdoptedCandidateCommit = {
  commit: string
  adoptedRecordedProvenance: boolean
}

/**
 * Choose the commit a reconciliation should report when the reviewed candidate is already
 * committed and the canonical working tree is unchanged.
 *
 * `sync_content_item_versions` returns `exact_retry` for an identical re-sync and never
 * refreshes `source_commit_sha`, so a working version keeps the commit that first introduced
 * it. The prepared-reconciliation boundaries then require the reported commit to equal that
 * recorded commit. Reporting the canonical head instead makes the two permanently
 * irreconcilable once a squash merge or an ancestry repair moves the head past that commit.
 *
 * The recorded commit is adopted only when it is reachable from the canonical head and its
 * bytes for this exact path equal the reviewed candidate. Anything else falls back to the
 * head, so a genuine mismatch is still refused by the database boundary.
 */
export function resolveAdoptedCandidateCommit(options: {
  git: CanonicalGitReader
  canonicalBaseRef: string
  sourcePath: string
  candidateRaw: string
  recordedWorkingCommitSha: string | null
}): AdoptedCandidateCommit {
  const { git, canonicalBaseRef, sourcePath, candidateRaw, recordedWorkingCommitSha } = options
  const head = git(['rev-parse', canonicalBaseRef])
  const expected = candidateRaw.trimEnd()
  if (git(['show', `${head}:${sourcePath}`]) !== expected) {
    throw new Error('Unchanged canonical file does not match the reviewed package candidate')
  }
  if (!recordedWorkingCommitSha
    || !/^[0-9a-f]{40}$/.test(recordedWorkingCommitSha)
    || recordedWorkingCommitSha === head) {
    return { commit: head, adoptedRecordedProvenance: false }
  }
  try {
    git(['merge-base', '--is-ancestor', recordedWorkingCommitSha, head])
  } catch {
    return { commit: head, adoptedRecordedProvenance: false }
  }
  let recordedRaw: string
  try {
    recordedRaw = git(['show', `${recordedWorkingCommitSha}:${sourcePath}`])
  } catch {
    return { commit: head, adoptedRecordedProvenance: false }
  }
  if (recordedRaw !== expected) return { commit: head, adoptedRecordedProvenance: false }
  return { commit: recordedWorkingCommitSha, adoptedRecordedProvenance: true }
}

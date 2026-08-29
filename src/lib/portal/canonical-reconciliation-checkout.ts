import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  inspectCanonicalContentRoot,
  normalizeGitRemote,
  type GitRunner,
  type SyncMode,
} from './canonical-content-root'

type InspectCanonicalRoot = (options: {
  directory: string
  fixtureDirectory: string
  supabaseUrl: string
  mode: SyncMode
  expectedRemote?: string
}) => unknown

export type CanonicalReconciliationCheckout = {
  directory: string
  baseCommitSha: string
  upstreamBranch: string
  push(expectedSourcePath: string): string
  dispose(): void
}

export type CanonicalReconciliationDependencies = {
  git: GitRunner
  inspect: InspectCanonicalRoot
  makeTemporaryDirectory(prefix: string): string
  removeTemporaryDirectory(path: string): void
}

const defaultDependencies: CanonicalReconciliationDependencies = {
  git: (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
  inspect: inspectCanonicalContentRoot,
  makeTemporaryDirectory: (prefix) => mkdtempSync(prefix),
  removeTemporaryDirectory: (path) => rmSync(path, { recursive: true }),
}

function runGit(
  git: GitRunner,
  cwd: string,
  args: string[],
  message: string,
): string {
  try {
    return git(cwd, args).trim()
  } catch {
    throw new Error(message)
  }
}

function upstreamBranch(git: GitRunner, directory: string): string {
  const upstream = runGit(
    git,
    directory,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    'Canonical repository must track an origin branch',
  )
  if (!upstream.startsWith('origin/')) {
    throw new Error('Canonical repository upstream must use origin')
  }
  const branch = upstream.slice('origin/'.length)
  runGit(
    git,
    directory,
    ['check-ref-format', '--branch', branch],
    'Canonical repository upstream branch is invalid',
  )
  return branch
}

export function createCanonicalReconciliationCheckout(
  options: {
    directory: string
    fixtureDirectory: string
    supabaseUrl: string
    expectedRemote?: string
  },
  dependencies: CanonicalReconciliationDependencies = defaultDependencies,
): CanonicalReconciliationCheckout {
  const { git, inspect } = dependencies
  const sourceDirectory = resolve(options.directory)
  if (!options.expectedRemote) throw new Error('Missing PORTAL_CONTENT_EXPECTED_REMOTE')

  // Validate the authoring checkout's shape, but do not use its working tree or
  // index for a release. Active drafts are allowed to remain uncommitted here.
  inspect({
    ...options,
    directory: sourceDirectory,
    mode: 'preview',
  })
  const actualRemote = runGit(
    git,
    sourceDirectory,
    ['remote', 'get-url', 'origin'],
    'Canonical Git origin is missing',
  )
  if (normalizeGitRemote(actualRemote) !== normalizeGitRemote(options.expectedRemote)) {
    throw new Error('Canonical Git origin does not match PORTAL_CONTENT_EXPECTED_REMOTE')
  }
  const branch = upstreamBranch(git, sourceDirectory)
  const remoteTrackingRefspec = `refs/heads/${branch}:refs/remotes/origin/${branch}`
  runGit(
    git,
    sourceDirectory,
    ['fetch', '--quiet', 'origin', remoteTrackingRefspec],
    'Could not fetch canonical origin',
  )
  const baseCommitSha = runGit(
    git,
    sourceDirectory,
    ['rev-parse', '--verify', `refs/remotes/origin/${branch}`],
    'Canonical upstream commit is missing',
  )
  if (!/^[0-9a-f]{40}$/.test(baseCommitSha)) {
    throw new Error('Canonical upstream commit is not a full commit SHA')
  }

  const temporaryDirectory = dependencies.makeTemporaryDirectory(
    join(tmpdir(), 'portal-canonical-reconcile-'),
  )
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    dependencies.removeTemporaryDirectory(temporaryDirectory)
  }

  try {
    runGit(
      git,
      sourceDirectory,
      ['clone', '--quiet', '--no-hardlinks', '--no-checkout', '--', sourceDirectory, temporaryDirectory],
      'Could not create isolated canonical checkout',
    )
    runGit(
      git,
      temporaryDirectory,
      ['remote', 'set-url', 'origin', actualRemote],
      'Could not configure isolated canonical origin',
    )
    runGit(
      git,
      temporaryDirectory,
      ['checkout', '--quiet', '--detach', baseCommitSha],
      'Could not check out canonical upstream commit',
    )
    inspect({
      ...options,
      directory: temporaryDirectory,
      mode: 'apply',
    })
  } catch (error) {
    dispose()
    throw error
  }

  return {
    directory: temporaryDirectory,
    baseCommitSha,
    upstreamBranch: branch,
    push: (expectedSourcePath) => {
      const commitParent = runGit(
        git,
        temporaryDirectory,
        ['rev-parse', '--verify', 'HEAD^'],
        'Canonical reconciliation commit has no parent',
      )
      if (commitParent !== baseCommitSha) {
        throw new Error('Canonical reconciliation must contain exactly one new commit')
      }
      const changedPaths = runGit(
        git,
        temporaryDirectory,
        ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
        'Could not inspect canonical reconciliation commit',
      ).split('\n').filter(Boolean)
      if (changedPaths.length !== 1 || changedPaths[0] !== expectedSourcePath) {
        throw new Error('Canonical reconciliation commit must change only the reviewed target file')
      }
      runGit(
        git,
        temporaryDirectory,
        ['fetch', '--quiet', 'origin', remoteTrackingRefspec],
        'Could not refresh canonical origin before push',
      )
      const remoteCommitSha = runGit(
        git,
        temporaryDirectory,
        ['rev-parse', '--verify', `refs/remotes/origin/${branch}`],
        'Canonical upstream commit disappeared before push',
      )
      if (remoteCommitSha !== baseCommitSha) {
        throw new Error('Canonical remote advanced during reconciliation; rerun against the new head')
      }
      runGit(
        git,
        temporaryDirectory,
        ['push', 'origin', `HEAD:refs/heads/${branch}`],
        'Canonical push was rejected; no remote content was overwritten',
      )
      return runGit(
        git,
        temporaryDirectory,
        ['rev-parse', '--verify', 'HEAD'],
        'Canonical reconciliation commit is missing after push',
      )
    },
    dispose,
  }
}

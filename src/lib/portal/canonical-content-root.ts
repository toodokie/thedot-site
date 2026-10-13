import {
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
  type Dirent,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

export type SyncMode = 'preview' | 'apply'

export type CanonicalContentFile = {
  absolutePath: string
  sourcePath: string
}

export type CanonicalContentInspection = {
  files: CanonicalContentFile[]
  sourceCommitSha: string | null
  dirtySourcePaths: string[]
  fixture: boolean
}

export type CanonicalFs = {
  lstat(path: string): { isSymbolicLink(): boolean; isFile(): boolean }
  stat(path: string): { dev: number; ino: number }
  realpath(path: string): string
  readdir(path: string): Dirent[]
}

export type GitRunner = (cwd: string, args: string[]) => string

export type CanonicalContentDependencies = {
  fs: CanonicalFs
  git: GitRunner
}

const defaultDependencies: CanonicalContentDependencies = {
  fs: {
    lstat: lstatSync,
    stat: statSync,
    realpath: realpathSync,
    readdir: (path) => readdirSync(path, { withFileTypes: true }),
  },
  git: (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

export function isLoopbackSupabaseUrl(value: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname)
  } catch {
    return false
  }
}

export function normalizeGitRemote(value: string): string {
  const remote = value.trim()
  if (!remote || /[?#]/.test(remote)) throw new Error('Invalid canonical Git remote')

  let host: string
  let path: string
  if (/^[^/@:]+@[^/:]+:.+/.test(remote)) {
    const match = remote.match(/^([^/@:]+)@([^/:]+):(.+)$/)
    if (!match) throw new Error('Invalid canonical Git remote')
    if (match[1] !== 'git') throw new Error('Canonical SSH remote must use the standard git user')
    host = match[2]
    path = match[3]
  } else {
    let parsed: URL
    try { parsed = new URL(remote) } catch { throw new Error('Invalid canonical Git remote') }
    if (!['https:', 'ssh:'].includes(parsed.protocol) || parsed.password) {
      throw new Error('Invalid canonical Git remote')
    }
    if (parsed.protocol === 'https:' && parsed.username) {
      throw new Error('Canonical Git remote must not embed credentials')
    }
    if (parsed.protocol === 'ssh:' && parsed.username && parsed.username !== 'git') {
      throw new Error('Canonical SSH remote must use the standard git user')
    }
    host = parsed.hostname
    path = parsed.pathname.replace(/^\//, '')
  }

  path = path.replace(/\.git$/i, '').replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean)
  if (!host || parts.length !== 2 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Canonical Git remote must identify exactly one owner/repository')
  }
  return `${host.toLowerCase()}/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`
}

function gitOrThrow(git: GitRunner, cwd: string, args: string[], message: string): string {
  try { return git(cwd, args).trim() } catch { throw new Error(message) }
}

function gitRawOrThrow(git: GitRunner, cwd: string, args: string[], message: string): string {
  try { return git(cwd, args).replace(/\n$/, '') } catch { throw new Error(message) }
}

export function inspectCanonicalContentRoot(
  options: {
    directory: string
    fixtureDirectory: string
    supabaseUrl: string
    mode: SyncMode
    expectedRemote?: string
  },
  dependencies: CanonicalContentDependencies = defaultDependencies,
): CanonicalContentInspection {
  const { fs, git } = dependencies
  const rootInput = resolve(options.directory)
  let rootStat: ReturnType<CanonicalFs['lstat']>
  let root: string
  try {
    rootStat = fs.lstat(rootInput)
    root = fs.realpath(rootInput)
  } catch {
    throw new Error('PORTAL_CONTENT_DIR is missing or unreadable')
  }
  if (rootStat.isSymbolicLink()) throw new Error('PORTAL_CONTENT_DIR must not be a symlink')
  const fixture = root === fs.realpath(resolve(options.fixtureDirectory))
  if (fixture && !isLoopbackSupabaseUrl(options.supabaseUrl)) {
    throw new Error('Fixture portal content is forbidden for a hosted Supabase project')
  }

  const entries = fs.readdir(root)
  const files: CanonicalContentFile[] = []
  const inodes = new Set<string>()
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.name === '.git') {
      if (fs.lstat(path).isSymbolicLink()) throw new Error('Canonical Git metadata must not be a symlink')
      continue
    }
    if (entry.isDirectory()) throw new Error(`Nested directory is forbidden in canonical content: ${entry.name}`)
    const entryStat = fs.lstat(path)
    if (entry.isSymbolicLink() || entryStat.isSymbolicLink() || !entry.isFile() || !entryStat.isFile()) {
      throw new Error(`Canonical content entry must be a regular file: ${entry.name}`)
    }
    if (/\.md$/i.test(entry.name) && !entry.name.endsWith('.md')) {
      throw new Error(`Canonical Markdown filename must use lowercase .md: ${entry.name}`)
    }
    if (!entry.name.endsWith('.md')) continue
    if (entry.name !== entry.name.toLowerCase() || !/^[a-z0-9][a-z0-9._-]*\.md$/.test(entry.name)) {
      throw new Error(`Canonical Markdown filename must be lowercase and portable: ${entry.name}`)
    }
    const real = fs.realpath(path)
    if (!inside(root, real) || basename(real) !== entry.name) {
      throw new Error(`Canonical content file escapes its source root: ${entry.name}`)
    }
    const physical = fs.stat(real)
    const inode = `${physical.dev}:${physical.ino}`
    if (inodes.has(inode)) throw new Error(`Duplicate physical canonical file: ${entry.name}`)
    inodes.add(inode)
    files.push({ absolutePath: real, sourcePath: entry.name })
  }
  files.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
  if (files.length === 0) throw new Error('No canonical Markdown files found')

  const repoRoot = fs.realpath(gitOrThrow(
    git, root, ['rev-parse', '--show-toplevel'], 'PORTAL_CONTENT_DIR must be a Git checkout',
  ))
  if (!inside(repoRoot, root)) throw new Error('Canonical content root is outside its Git checkout')
  if (!fixture && repoRoot !== root) {
    throw new Error('PORTAL_CONTENT_DIR must be the root of the dedicated canonical checkout')
  }

  const commit = gitOrThrow(git, repoRoot, ['rev-parse', '--verify', 'HEAD'], 'Canonical Git HEAD is missing')
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Canonical Git HEAD is not a full commit SHA')

  for (const file of files) {
    const sourcePath = relative(repoRoot, file.absolutePath).split(sep).join('/')
    if (!sourcePath || sourcePath.startsWith('../') || sourcePath.startsWith('/')) {
      throw new Error(`Invalid repository-relative source path: ${file.sourcePath}`)
    }
    file.sourcePath = sourcePath
  }

  if (!fixture && options.mode === 'apply') {
    if (!options.expectedRemote) throw new Error('Missing PORTAL_CONTENT_EXPECTED_REMOTE')
    const actualRemote = gitOrThrow(
      git, repoRoot, ['remote', 'get-url', 'origin'], 'Canonical Git origin is missing',
    )
    if (normalizeGitRemote(actualRemote) !== normalizeGitRemote(options.expectedRemote)) {
      throw new Error('Canonical Git origin does not match PORTAL_CONTENT_EXPECTED_REMOTE')
    }
  }

  const sourcePaths = files.map((file) => file.sourcePath)
  const dirtyOutput = gitRawOrThrow(
    git,
    repoRoot,
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...sourcePaths],
    'Could not inspect canonical Git status',
  )
  const dirty = dirtyOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
  if (options.mode === 'apply' && !fixture && dirty.length > 0) {
    throw new Error(`Canonical source must be committed before apply: ${dirty.join(', ')}`)
  }
  if (options.mode === 'apply' && !fixture) {
    for (const sourcePath of sourcePaths) {
      gitOrThrow(
        git, repoRoot, ['ls-files', '--error-unmatch', '--', sourcePath],
        `Canonical source is not tracked at HEAD: ${sourcePath}`,
      )
    }
  }

  return {
    files,
    sourceCommitSha: fixture ? null : commit,
    dirtySourcePaths: dirty,
    fixture,
  }
}

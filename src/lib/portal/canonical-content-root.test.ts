import { describe, expect, it } from 'vitest'
import type { Dirent } from 'node:fs'
import {
  inspectCanonicalContentRoot,
  isLoopbackSupabaseUrl,
  normalizeGitRemote,
  type CanonicalContentDependencies,
} from './canonical-content-root'

function entry(name: string, kind: 'file' | 'directory' | 'symlink' = 'file'): Dirent {
  return {
    name,
    parentPath: '/repo',
    path: '/repo',
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => kind === 'symlink',
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent
}

function dependencies(options: {
  entries?: Dirent[]
  dirty?: string
  remote?: string
  repoRoot?: string
  aliasInode?: boolean
} = {}): CanonicalContentDependencies {
  const entries = options.entries ?? [entry('.git', 'directory'), entry('piece.md')]
  return {
    fs: {
      lstat: (path) => ({
        isSymbolicLink: () => entries.some((item) => path.endsWith(item.name) && item.isSymbolicLink()),
        isFile: () => !path.endsWith('/repo') && !path.endsWith('/fixtures'),
      }),
      stat: (path) => ({ dev: 1, ino: options.aliasInode ? 1 : path.length }),
      realpath: (path) => path,
      readdir: () => entries,
    },
    git: (_cwd, args) => {
      const command = args.join(' ')
      if (command === 'rev-parse --show-toplevel') return options.repoRoot ?? '/repo'
      if (command === 'rev-parse --verify HEAD') return '0123456789abcdef0123456789abcdef01234567'
      if (command === 'remote get-url origin') return options.remote ?? 'git@github.com:the-dot/kanset-content.git'
      if (command.startsWith('status ')) return options.dirty ?? ''
      if (command.startsWith('ls-files ')) return args.at(-1) ?? ''
      throw new Error(`unexpected git call ${command}`)
    },
  }
}

const base = {
  directory: '/repo',
  fixtureDirectory: '/repo/fixtures',
  supabaseUrl: 'https://project.supabase.co',
  mode: 'apply' as const,
  expectedRemote: 'https://github.com/the-dot/kanset-content.git',
}

describe('canonical content root', () => {
  it('normalizes HTTPS/SSH remotes but rejects embedded HTTPS credentials', () => {
    expect(normalizeGitRemote('git@github.com:The-Dot/Kanset-Content.git'))
      .toBe('github.com/the-dot/kanset-content')
    expect(normalizeGitRemote('https://github.com/the-dot/kanset-content.git'))
      .toBe('github.com/the-dot/kanset-content')
    expect(() => normalizeGitRemote('https://token@github.com/the-dot/kanset-content.git'))
      .toThrow(/credentials/)
    expect(() => normalizeGitRemote('token@github.com:the-dot/kanset-content.git'))
      .toThrow(/standard git user/)
  })

  it('accepts only actual loopback Supabase hosts', () => {
    expect(isLoopbackSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLoopbackSupabaseUrl('http://localhost:54321')).toBe(true)
    expect(isLoopbackSupabaseUrl('https://localhost.evil.test')).toBe(false)
  })

  it('returns committed relative provenance for a clean expected checkout', () => {
    expect(inspectCanonicalContentRoot(base, dependencies())).toMatchObject({
      files: [{ absolutePath: '/repo/piece.md', sourcePath: 'piece.md' }],
      sourceCommitSha: '0123456789abcdef0123456789abcdef01234567',
      fixture: false,
    })
  })

  it('allows a dirty dry run but blocks apply', () => {
    const deps = dependencies({ dirty: ' M piece.md' })
    expect(inspectCanonicalContentRoot({ ...base, mode: 'preview' }, deps).dirtySourcePaths)
      .toEqual(['piece.md'])
    expect(() => inspectCanonicalContentRoot(base, deps)).toThrow(/committed before apply/)
  })

  it('unconditionally blocks fixture content against hosted Supabase', () => {
    expect(() => inspectCanonicalContentRoot({ ...base, directory: '/repo/fixtures' }, dependencies({ repoRoot: '/repo' })))
      .toThrow(/forbidden for a hosted/)
  })

  it('allows fixtures only on loopback without treating them as canonical provenance', () => {
    const result = inspectCanonicalContentRoot({
      ...base,
      directory: '/repo/fixtures',
      supabaseUrl: 'http://127.0.0.1:54321',
    }, dependencies({ repoRoot: '/repo' }))
    expect(result.fixture).toBe(true)
    expect(result.sourceCommitSha).toBeNull()
  })

  it('rejects nested directories, links, uppercase names, inode aliases, and wrong remotes', () => {
    expect(() => inspectCanonicalContentRoot(base, dependencies({
      entries: [entry('.git', 'directory'), entry('nested', 'directory')],
    }))).toThrow(/Nested directory/)
    expect(() => inspectCanonicalContentRoot(base, dependencies({
      entries: [entry('.git', 'directory'), entry('piece.md', 'symlink')],
    }))).toThrow(/regular file/)
    expect(() => inspectCanonicalContentRoot(base, dependencies({
      entries: [entry('.git', 'directory'), entry('Piece.md')],
    }))).toThrow(/lowercase/)
    expect(() => inspectCanonicalContentRoot(base, dependencies({
      entries: [entry('.git', 'directory'), entry('one.md'), entry('two.md')], aliasInode: true,
    }))).toThrow(/Duplicate physical/)
    expect(() => inspectCanonicalContentRoot(base, dependencies({ remote: 'git@github.com:other/repo.git' })))
      .toThrow(/does not match/)
  })

  it('requires the canonical directory to be the dedicated repository root', () => {
    expect(() => inspectCanonicalContentRoot(base, dependencies({ repoRoot: '/' })))
      .toThrow(/root of the dedicated/)
  })
})

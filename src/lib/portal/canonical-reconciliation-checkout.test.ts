import { describe, expect, it, vi } from 'vitest'
import {
  createCanonicalReconciliationCheckout,
  type CanonicalReconciliationDependencies,
} from './canonical-reconciliation-checkout'

const BASE = '0123456789abcdef0123456789abcdef01234567'
const COMMIT = '89abcdef0123456789abcdef0123456789abcdef'

function harness(options: { changedPaths?: string; remoteAfterFetch?: string } = {}) {
  const calls: Array<{ cwd: string; args: string[] }> = []
  const inspections: Array<{ directory: string; mode: string }> = []
  let remoteRead = 0
  const remove = vi.fn()
  const dependencies: CanonicalReconciliationDependencies = {
    git: (cwd, args) => {
      calls.push({ cwd, args })
      const command = args.join(' ')
      if (command === 'remote get-url origin') return 'git@github.com:the-dot/kanset-content.git\n'
      if (command === 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}') return 'origin/main\n'
      if (command === 'check-ref-format --branch main') return 'main\n'
      if (command === 'rev-parse --verify refs/remotes/origin/main') {
        remoteRead += 1
        return `${remoteRead > 1 ? options.remoteAfterFetch ?? BASE : BASE}\n`
      }
      if (command === 'rev-parse --verify HEAD') return `${COMMIT}\n`
      if (command === 'rev-parse --verify HEAD^') return `${BASE}\n`
      if (command === 'diff-tree --no-commit-id --name-only -r HEAD') return `${options.changedPaths ?? 'piece.md'}\n`
      if (['fetch --quiet origin refs/heads/main:refs/remotes/origin/main',
        'clone --quiet --no-hardlinks --no-checkout -- /canonical /tmp/checkout',
        'remote set-url origin git@github.com:the-dot/kanset-content.git',
        `checkout --quiet --detach ${BASE}`,
        'push origin HEAD:refs/heads/main'].includes(command)) return ''
      throw new Error(`unexpected git command: ${command}`)
    },
    inspect: (inspection) => {
      inspections.push({ directory: inspection.directory, mode: inspection.mode })
      return {}
    },
    makeTemporaryDirectory: () => '/tmp/checkout',
    removeTemporaryDirectory: remove,
  }
  return { calls, inspections, remove, dependencies }
}

const options = {
  directory: '/canonical',
  fixtureDirectory: '/app/content/portal',
  supabaseUrl: 'https://project.supabase.co',
  expectedRemote: 'https://github.com/the-dot/kanset-content.git',
}

describe('canonical reconciliation checkout', () => {
  it('allows dirty authoring state by releasing from an isolated clean upstream checkout', () => {
    const test = harness()
    const checkout = createCanonicalReconciliationCheckout(options, test.dependencies)

    expect(test.inspections).toEqual([
      { directory: '/canonical', mode: 'preview' },
      { directory: '/tmp/checkout', mode: 'apply' },
    ])
    expect(checkout.directory).toBe('/tmp/checkout')
    expect(checkout.baseCommitSha).toBe(BASE)
    expect(checkout.push('piece.md')).toBe(COMMIT)
    expect(test.calls).toContainEqual({
      cwd: '/tmp/checkout',
      args: ['push', 'origin', 'HEAD:refs/heads/main'],
    })
    expect(test.calls.some(({ args }) => args.includes('--force'))).toBe(false)

    checkout.dispose()
    checkout.dispose()
    expect(test.remove).toHaveBeenCalledTimes(1)
  })

  it('rejects a remote race before push and leaves overwrite disabled', () => {
    const test = harness({ remoteAfterFetch: 'fedcba9876543210fedcba9876543210fedcba98' })
    const checkout = createCanonicalReconciliationCheckout(options, test.dependencies)

    expect(() => checkout.push('piece.md')).toThrow(/remote advanced/)
    expect(test.calls.some(({ args }) => args[0] === 'push')).toBe(false)
    checkout.dispose()
  })

  it('rejects a commit that contains an unrelated canonical file', () => {
    const test = harness({ changedPaths: 'piece.md\nunrelated-draft.md' })
    const checkout = createCanonicalReconciliationCheckout(options, test.dependencies)

    expect(() => checkout.push('piece.md')).toThrow(/only the reviewed target/)
    expect(test.calls.some(({ args }) => args[0] === 'push')).toBe(false)
    checkout.dispose()
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Spec 9.4 (2026-10-03): one danger colour, defined once as --dot-danger in the design-system
// tokens. Three different reds had drifted into the portal. This scan keeps them out.
const ROOT = process.cwd()
const SCANNED = [
  'src/app/client',
  'src/app/admin/portal',
  'packages/design-system/src/components',
]
const RETIRED_REDS = /#(?:9f241b|c0392b|b4502f)\b/i

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('danger colour comes from the token', () => {
  it('no portal or design-system component hard-codes a red', () => {
    const offenders = SCANNED.flatMap((dir) => files(join(ROOT, dir)))
      .filter((path) => RETIRED_REDS.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })

  it('the admin danger alias points at the shared token', () => {
    const css = readFileSync(join(ROOT, 'src/app/admin/portal/admin-shell.module.css'), 'utf8')
    expect(css).toMatch(/--admin-danger:\s*var\(--dot-danger\)/)
  })
})

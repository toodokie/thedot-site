import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The CLI is an I/O shell with no harness of its own, so this pins the ORDER that makes the
// on-screen text refusal safe: it must run before every preview RPC and every mutation.
const src = readFileSync(resolve(process.cwd(), 'scripts/update-portal.ts'), 'utf8')

function body(name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('update-portal enforces the on-screen text rule before writing', () => {
  it('imports the pure rule', () => {
    expect(src).toMatch(/import \{[^}]*checkOnScreenTextBlock[^}]*readOnScreenTextOptOut[^}]*\} from '\.\.\/src\/lib\/portal\/on-screen-text-rule'/)
  })

  it('runSync refuses before the preview RPC and before any write', () => {
    const fn = body('runSync')
    const check = fn.indexOf('refuseMissingOnScreenText(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf('PREVIEW_RPC'))
    expect(check).toBeLessThan(fn.indexOf('writeFileSync('))
    expect(check).toBeLessThan(fn.indexOf("inspect(ctx.portalDir, 'apply')"))
  })

  it('runReshare refuses before opening a revision', () => {
    const fn = body('runReshare')
    const check = fn.indexOf('refuseMissingOnScreenText(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf("runAdmin(['begin-revision'"))
    expect(check).toBeLessThan(fn.indexOf('writeFileSync('))
  })

  it('uses its own exit code', () => {
    expect(src).toMatch(/process\.exitCode = 5/)
  })
})

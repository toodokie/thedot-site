import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The scripts are I/O shells with no harness of their own, so this pins the ORDER that makes the
// friendly refusal useful (the media check runs before each release call) and that the override
// the operator typed is the one forwarded, never dropped or replaced.
const read = (name: string) => readFileSync(resolve(process.cwd(), 'scripts', name), 'utf8')

function body(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

// The text of one release branch: from its run([...]) call to the closing `])`.
function runCall(src: string, opener: string): string {
  const start = src.indexOf(opener)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('])', start)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end + 2)
}

describe('release media pre-check wiring', () => {
  it('portal-admin ready checks before mark_content_ready and accepts --no-media', () => {
    const src = read('portal-admin.ts')
    const fn = body(src, 'ready')
    expect(fn.indexOf('ensureReleaseMedia(')).toBeGreaterThan(-1)
    expect(fn.indexOf('ensureReleaseMedia(')).toBeLessThan(fn.indexOf("rpc('mark_content_ready'"))
    expect(fn).toMatch(/ensureReleaseMedia\(admin, \{[^}]*\bnoMediaReason\b[^}]*\}\)/)
    expect(src).toContain("'--no-media'")
    expect(src).toContain('await ready(slug, contentId, version, noMediaReason)')
  })

  it('update-portal checks before both release routes, forwards the flag and exits 6', () => {
    const src = read('update-portal.ts')
    const fn = body(src, 'releaseReshared')
    const check = fn.indexOf('ensureReleaseMedia(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf("runAdmin(['ready'"))
    expect(check).toBeLessThan(fn.indexOf("'record_agency_supersession'"))
    expect(fn).toContain('noMediaReason: ctx.noMediaReason,')
    expect(fn).toMatch(/process\.exitCode = 6/)
    expect(src).toContain("'--no-media'")
    expect(src).toContain('noMediaReason: flags.noMediaReason, report })')
  })

  it('portal-write checks courtesy, applied and supersede releases before the RPC', () => {
    const src = read('portal-write.ts')
    for (const rpc of ['record_content_courtesy_release', 'record_agency_applied_release', 'record_agency_supersession']) {
      const at = src.indexOf(`rpc = '${rpc}'`)
      expect(at).toBeGreaterThan(-1)
      expect(src.slice(Math.max(0, at - 200), at))
        .toContain('releaseCommand = true; releaseMediaReason = validateNoMediaReason(payload.noMediaReason)')
    }
    const check = src.indexOf('ensureReleaseMedia(')
    expect(check).toBeGreaterThan(src.indexOf('if(externalContentId){'))
    expect(check).toBeLessThan(src.indexOf('await admin.rpc(rpc,args)'))
    expect(src.indexOf('await admin.rpc(rpc,args)')).toBeGreaterThan(-1)
    expect(src.slice(check, src.indexOf('})', check))).toContain('noMediaReason: releaseMediaReason,')
  })

  it('portal-ship forwards the override on each of its three release branches', () => {
    const src = read('portal-ship.ts')
    expect(src).toContain("'--no-media'")
    expect(runCall(src, "run(['scripts/portal-write.ts', 'applied-release'"))
      .toContain('...(noMediaReason ? { noMediaReason } : {}),')
    expect(runCall(src, "run(['scripts/portal-write.ts', 'courtesy-release'"))
      .toContain('...(noMediaReason ? { noMediaReason } : {}),')
    expect(runCall(src, "run(['scripts/portal-admin.ts', 'ready'"))
      .toContain("...(noMediaReason ? ['--no-media', noMediaReason] : [])")
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The scripts are I/O shells with no harness of their own, so this pins the ORDER that makes the
// friendly refusal useful: the media check runs before each release call.
const read = (name: string) => readFileSync(resolve(process.cwd(), 'scripts', name), 'utf8')

function body(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('release media pre-check wiring', () => {
  it('portal-admin ready checks before mark_content_ready and accepts --no-media', () => {
    const src = read('portal-admin.ts')
    const fn = body(src, 'ready')
    expect(fn.indexOf('ensureReleaseMedia(')).toBeGreaterThan(-1)
    expect(fn.indexOf('ensureReleaseMedia(')).toBeLessThan(fn.indexOf("rpc('mark_content_ready'"))
    expect(src).toContain("'--no-media'")
  })

  it('update-portal checks before both release routes and exits 6', () => {
    const src = read('update-portal.ts')
    const fn = body(src, 'releaseReshared')
    const check = fn.indexOf('ensureReleaseMedia(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(fn.indexOf("runAdmin(['ready'"))
    expect(check).toBeLessThan(fn.indexOf("'record_agency_supersession'"))
    expect(fn).toMatch(/process\.exitCode = 6/)
    expect(src).toContain("'--no-media'")
  })

  it('portal-write checks courtesy, applied and supersede releases before the RPC', () => {
    const src = read('portal-write.ts')
    for (const rpc of ['record_content_courtesy_release', 'record_agency_applied_release', 'record_agency_supersession']) {
      const at = src.indexOf(`rpc = '${rpc}'`)
      expect(at).toBeGreaterThan(-1)
      expect(src.slice(Math.max(0, at - 200), at)).toContain('releaseCommand = true')
    }
    expect(src.indexOf('ensureReleaseMedia(')).toBeGreaterThan(src.indexOf('if(externalContentId){'))
    expect(src).toContain('payload.noMediaReason')
  })

  it('portal-ship passes the override through to every release it runs', () => {
    const src = read('portal-ship.ts')
    expect(src).toContain("'--no-media'")
    expect(src.match(/noMediaReason/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})

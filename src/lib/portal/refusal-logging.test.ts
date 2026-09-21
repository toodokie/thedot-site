import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The failure this guards against is the one that actually happened: a refusal path nobody knew
// about. Migration 0088 raised the character limit in four database functions and in the form, and
// missed the server action in between, so Maria's edit was still refused and still told nobody.
// A reviewer cannot see a missing log call, and no mocked test exercises every branch, so assert
// the shape of the file instead: inside the two actions that carry her copy, a refusal returns
// through refuse(), never as a bare object.
const SOURCE = resolve(process.cwd(), 'src/app/client/[slug]/request-actions.ts')
const source = readFileSync(SOURCE, 'utf8')

function actionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

describe('every refusal that carries the client’s copy is written down', () => {
  // The two paths that can lose her words. Both accept copy she has typed.
  it.each(['sendReviewBundle', 'suggestContentEdit'])('%s never returns a bare error', (name) => {
    const body = actionBody(name)
    const bare = [...body.matchAll(/return \{ error:[^}]*\}/g)].map((m) => m[0])
    // Two deliberate exceptions, both cases where there is nothing of hers to preserve: a form so
    // malformed there is no session to attribute it to, and copy she has not actually changed.
    const allowed = bare.filter((line) =>
      line.includes('This form expired') || line.includes('The proposed copy is unchanged'))
    expect(bare.filter((line) => !allowed.includes(line)),
      `${name} refuses without logging; use refuse() so her text survives`).toEqual([])
  })

  it('routes every logged refusal through one helper', () => {
    expect(source).toContain('async function refuse(')
    expect(source).toContain("import { recordRefusal")
  })

  it('tells her the real reason when her copy is too long', () => {
    // "One of the edits is incomplete. Review it and try again" was what she saw. It names no
    // cause and invites her to send the identical thing again.
    for (const name of ['sendReviewBundle', 'suggestContentEdit']) {
      const body = actionBody(name)
      expect(body, `${name} should name the limit`).toMatch(/too long \(\$\{MAX_PROPOSED_TEXT/)
      expect(body, `${name} should say we kept her text`).toContain('We have your text')
    }
  })
})

describe('the reason codes match the database', () => {
  it('uses only codes migration 0089 accepts', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0089_client_request_failures.sql'), 'utf8')
    const constraint = migration.slice(migration.indexOf('reason_code in ('))
    const dbCodes = new Set([...constraint.slice(0, constraint.indexOf('))')).matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1]))
    const used = new Set([...source.matchAll(/'([a-z_]+)', (?:bundle|attempt|failed|withItem)\)/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(5)
    for (const code of used) expect(dbCodes, `reason "${code}" is not in the check constraint`).toContain(code)
  })
})

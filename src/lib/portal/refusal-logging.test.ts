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

describe('the durable send path logs every refusal too (migration 0093)', () => {
  const DRAFT_SOURCE = readFileSync(resolve(process.cwd(), 'src/app/client/[slug]/draft-actions.ts'), 'utf8')

  it('sendReviewDrafts never returns a bare error', () => {
    const start = DRAFT_SOURCE.indexOf('export async function sendReviewDrafts(')
    expect(start).toBeGreaterThan(-1)
    const next = DRAFT_SOURCE.indexOf('\nexport async function ', start + 1)
    const body = DRAFT_SOURCE.slice(start, next === -1 ? DRAFT_SOURCE.length : next)
    expect([...body.matchAll(/return \{ error:[^}]*\}/g)].map((m) => m[0])).toEqual([])
    expect(body).toMatch(/too long \(\$\{MAX_PROPOSED_TEXT/)
    expect(body).toContain('We have your text')
  })

  it('uses only reason codes the database accepts after 0093', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0093_durable_review_drafts.sql'), 'utf8')
    const marker = migration.indexOf('add constraint client_request_failures_reason_code_check')
    const constraint = migration.slice(migration.indexOf('reason_code in (', marker))
    const dbCodes = new Set([...constraint.slice(0, constraint.indexOf('))')).matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1]))
    const used = new Set([...DRAFT_SOURCE.matchAll(/'([a-z_]+)',\s+(?:await withText|context)/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(5)
    for (const code of used) expect(dbCodes, `reason "${code}" is not in the 0093 constraint`).toContain(code)
  })
})

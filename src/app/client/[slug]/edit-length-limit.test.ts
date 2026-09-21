import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Regression, 2026-09-21. The 8,000-character cap lived in FOUR database functions, the
// form's maxLength AND this server action. Migration 0088 raised the first two and missed
// the third, so a long-form edit passed validation at both ends and was refused in the
// middle. Maria could not send edits on the ep3 article (15,483 characters) for four days
// after the cap was "lifted", and the failure looked identical to the original bug.
//
// These read the source rather than calling the action, because the point is that the
// NUMBER agrees across layers. A behavioural test on one layer is what let this through.
const LIMIT = 50000
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('client edit length limit stays in step across layers', () => {
  it('the server action allows long-form', () => {
    const src = read('./request-actions.ts')
    expect(src).toContain(`const MAX_PROPOSED_TEXT = ${LIMIT}`)
    expect(src).not.toMatch(/proposedText[^\n]*length > 8000/)
    expect(src).not.toMatch(/proposedText\.trim\(\)\.length > 8000/)
  })

  it('the client edit form accepts as much as the server action does', () => {
    const src = read('./piece/[contentId]/SuggestEditForm.tsx')
    expect(src).toContain(`maxLength={${LIMIT}}`)
    expect(src).not.toContain('maxLength={8000}')
  })

  // The agency side matters just as much: applying her long-form edit goes through the
  // safe-merge candidate field, which was still at 8,000 AND silently sliced.
  it('the agency safe-merge field accepts long-form and never truncates silently', () => {
    const src = read('../../admin/portal/RequestAdmin.tsx')
    expect(src).toContain(`const MAX_CANDIDATE_TEXT = ${LIMIT}`)
    expect(src).not.toContain('slice(0, 8000)')
    expect(src).not.toContain('maxLength={8000}')
  })

  it('migration 0088 raised the database bound to the same number', () => {
    const src = read('../../../../supabase/migrations/0088_long_form_edit_limit.sql')
    expect(src).toContain(String(LIMIT))
  })

  it('the real ep3 article length would be accepted', () => {
    expect(15483).toBeLessThan(LIMIT)
    expect(15483).toBeGreaterThan(8000)
  })
})

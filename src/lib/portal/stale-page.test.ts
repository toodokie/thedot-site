import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { describe, expect, it } from 'vitest'
import { isStalePageError } from './stale-page'

describe('isStalePageError', () => {
  it('recognizes the Next.js stale server action error', () => {
    expect(isStalePageError(new UnrecognizedActionError('Failed to find Server Action'))).toBe(true)
  })

  it('does not classify ordinary failures as a stale page', () => {
    expect(isStalePageError(new Error('network failed'))).toBe(false)
    expect(isStalePageError(null)).toBe(false)
  })
})

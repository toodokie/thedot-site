import { describe, expect, it } from 'vitest'
import { isUnresolvedContentRequest } from './request-status'

describe('isUnresolvedContentRequest', () => {
  it.each([
    ['pending', true], ['applying', true], ['prepared', true], ['conflicted', true],
    ['applied', false], ['answered', false], ['rejected', false], ['superseded', false],
  ])('maps %s to %s', (status, expected) => {
    expect(isUnresolvedContentRequest(status)).toBe(expected)
  })
})

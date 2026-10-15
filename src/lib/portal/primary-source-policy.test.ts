import { describe, expect, it } from 'vitest'
import { isAllowedPrimarySourceHostname, parsePrimarySourceUrl } from './primary-source-policy'

describe('provincial primary-source policy', () => {
  it('accepts each reviewed provincial host and its real subdomains', () => {
    for (const url of [
      'https://alberta.ca/immigration',
      'https://www.alberta.ca/immigration',
      'https://immigratemanitoba.com/immigrate',
      'https://www.immigratemanitoba.com/immigrate',
      'https://welcomebc.ca/immigrate-to-b-c',
      'https://www.welcomebc.ca/immigrate-to-b-c',
    ]) {
      expect(parsePrimarySourceUrl(url, 'provincial-source.md'), url).toBe(url)
      expect(isAllowedPrimarySourceHostname(new URL(url).hostname), url).toBe(true)
    }
  })

  it('refuses provincial lookalike hosts', () => {
    for (const url of [
      'https://welcomebc.ca.evil.com/source',
      'https://notalberta.ca/source',
      'https://alberta.ca-gov.com/source',
      'https://immigratemanitoba.com.example/source',
    ]) {
      expect(() => parsePrimarySourceUrl(url, 'provincial-source.md'), url)
        .toThrow(/approved primary source/)
      expect(isAllowedPrimarySourceHostname(new URL(url).hostname), url).toBe(false)
    }
  })
})

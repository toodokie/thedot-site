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


describe('reviewed original minister interview', () => {
  const interview = 'https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/'

  it('accepts the exact original interview without approving its news host', () => {
    expect(parsePrimarySourceUrl(interview, 'interview.md')).toBe(interview)
    expect(isAllowedPrimarySourceHostname('www.ctvnews.ca')).toBe(false)
  })

  it.each([
    interview.replace('immigration-minister-says', 'another-minister-says'),
    interview + '?redirect=https://example.com',
    interview + '#changed',
    interview.replace('www.ctvnews.ca', 'www.ctvnews.ca.evil.com'),
    interview.replace('https://', 'http://'),
    interview.replace('https://', 'https://someone@'),
    interview.replace('www.ctvnews.ca', 'WWW.CTVNEWS.CA'),
    interview.replace('www.ctvnews.ca', 'www.ctvnews.ca:443'),
    interview.replace('/politics/', '/discard/../politics/'),
    ' ' + interview,
    interview + '\n',
  ])('refuses altered or unreviewed interview URL %s', (url) => {
    expect(() => parsePrimarySourceUrl(url, 'interview.md')).toThrow()
  })
})

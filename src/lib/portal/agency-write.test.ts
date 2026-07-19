import { describe, expect, it } from 'vitest'
import { assertClientSafeAgencyText, assertReportMetrics, assertReviewedHttpsUrl } from './agency-write'

describe('agency write validation', () => {
  it('rejects raw email/PII before network access', () => {
    expect(() => assertClientSafeAgencyText({ title: 'Subject: case', summary: 'From: maria@example.com' })).toThrow()
  })
  it('accepts versioned numeric report metrics', () => {
    expect(assertReportMetrics({ reach: 12, saves: { value: 4, prev: 2 }, ctr: null })).toBeTruthy()
    expect(() => assertReportMetrics({ top_posts: [{ title: 'x' }] })).toThrow()
  })
  it('uses the reviewed client-link host boundary', () => {
    expect(assertReviewedHttpsUrl('https://drive.google.com/open?id=x')).toContain('drive.google.com')
    expect(() => assertReviewedHttpsUrl('https://evil.example/file')).toThrow()
  })
})

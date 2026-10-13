import { describe, expect, it } from 'vitest'
import { getFeaturedReportChunk } from './featured-report-context'

describe('featured report assistant context', () => {
  it('grounds Kanset report questions in the complete July report', () => {
    const chunk = getFeaturedReportChunk('kanset')

    expect(chunk).not.toBeNull()
    expect(chunk?.chunk_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(chunk?.document_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(chunk?.related_route).toBe('reports/july-2026')
    expect(chunk?.answer_eligibility).toBe('grounded_answer')
    expect(chunk?.excerpt).toContain('12,811')
    expect(chunk?.excerpt).toContain('351 to 499')
    expect(chunk?.excerpt).toContain('not a tracked conversion funnel')
    expect(chunk?.excerpt).toContain('required source field')
    expect(chunk?.excerpt.length).toBeLessThanOrEqual(700)
  })

  it('does not expose Kanset report context to another tenant', () => {
    expect(getFeaturedReportChunk('another-client')).toBeNull()
  })
})

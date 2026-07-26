import { describe, expect, it } from 'vitest'
import type { AgencyPieceCalendarRow } from '@/lib/portal/gates-loader'
import { buildAgencyCalendarDays, torontoTodayIso } from './AgencyMonthCalendar'

function row(overrides: Partial<AgencyPieceCalendarRow> = {}): AgencyPieceCalendarRow {
  return {
    clientId: 'client-a',
    clientName: 'Kanset',
    clientSlug: 'kanset',
    contentId: 'piece-1',
    title: 'A planned piece',
    format: 'reel',
    pillar: 'employer',
    producer: 'the_dot',
    calendarNote: null,
    workingVersion: 1,
    visibleVersion: 1,
    released: true,
    status: 'draft',
    factCheck: 'confirmed',
    factCheckExempt: false,
    factCheckValid: true,
    currentDecision: null,
    ideaDecision: null,
    ideaDecisionSource: null,
    ideaDecisionNote: null,
    ideaApprovalSentAt: null,
    approvalSentAt: null,
    platforms: ['instagram'],
    archived: false,
    exceptions: [],
    legacy: null,
    gates: [],
    dests: [{
      destination: 'instagram',
      required: true,
      scheduleStatus: null,
      publicationStatus: null,
      verified: false,
      scheduledAt: null,
      liveUrl: null,
    }],
    plannedDate: '2026-07-27',
    notShared: false,
    ...overrides,
  }
}

describe('AgencyMonthCalendar data', () => {
  it('places active dated pieces in the month grid with the admin piece route', () => {
    const days = buildAgencyCalendarDays([row()])
    expect(days['2026-07-27']).toHaveLength(1)
    expect(days['2026-07-27'][0]).toMatchObject({
      id: 'client-a:piece-1',
      href: '/admin/portal/pieces/piece-1',
      title: 'A planned piece',
      meta: 'reel · employer',
      accent: 'yellow',
    })
  })

  it('does not create calendar chips for archived or undated rows', () => {
    expect(buildAgencyCalendarDays([
      row({ contentId: 'archived', archived: true }),
      row({ contentId: 'undated', plannedDate: null }),
    ])).toEqual({})
  })

  it('shows publication evidence as done even when the legacy base status still says draft', () => {
    const days = buildAgencyCalendarDays([row({
      status: 'draft',
      dests: [{
        destination: 'instagram',
        required: true,
        scheduleStatus: null,
        publicationStatus: 'live',
        verified: true,
        scheduledAt: null,
        liveUrl: 'https://www.instagram.com/p/example/',
      }],
    })])
    expect(days['2026-07-27'][0]).toMatchObject({
      stateNote: 'Done',
      accent: 'grey',
    })
  })

  it('does not flatten a legacy posted piece into the Draft label', () => {
    const days = buildAgencyCalendarDays([row({
      legacy: { classification: 'legacy_verified' },
    })])
    expect(days['2026-07-27'][0].stateNote).toContain('Posted')
  })

  it('uses the Toronto business date around the UTC day boundary', () => {
    expect(torontoTodayIso(new Date('2026-07-25T02:00:00Z'))).toBe('2026-07-24')
  })
})

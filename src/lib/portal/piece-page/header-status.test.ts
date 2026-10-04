import { describe, expect, it } from 'vitest'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ScheduleTargetRow } from '@/lib/portal/schedule'
import { destinationLabel, headerStatus, plannedDateLabel, torontoDateLabel, torontoTimeLabel } from './header-status'

const target = (destination: string, scheduled_at: string | null, status: ScheduleTargetRow['status'] = 'scheduled'): ScheduleTargetRow => ({
  id: destination, content_id: 'i', content_version: 1, destination, required: true, scheduled_at, status,
  verified_at: null, verification_label: '',
})
const live = (destination: string, live_url: string | null, published_at: string): PublicationTargetRow => ({
  id: destination, content_id: 'i', content_version: 1, destination, required: true, expected_visibility: 'public',
  status: 'live', live_url, published_at, first_verified_at: null, last_verified_at: null,
  reconciliation_status: 'verified', verification_label: '', current_provider_state: null,
} as PublicationTargetRow)

describe('labels', () => {
  it('formats Toronto dates and times the way the mockups read', () => {
    expect(torontoDateLabel('2026-10-02T22:00:00Z')).toBe('Fri Oct 2')
    expect(torontoTimeLabel('2026-10-02T22:00:00Z')).toBe('6 p.m.')
    expect(torontoTimeLabel('2026-10-02T13:30:00Z')).toBe('9:30 a.m.')
    expect(plannedDateLabel('2026-09-17')).toBe('Thu Sep 17')
    expect(plannedDateLabel('soon')).toBeNull()
    expect(destinationLabel('youtube')).toBe('YouTube')
    expect(destinationLabel('squarespace')).toBe('kanset.com')
  })
})

describe('headerStatus', () => {
  const base = { isPublished: false, publication: [], plannedDate: '2026-10-02', layout: 'vertical' as const }

  it('groups confirmed times by hour', () => {
    const status = headerStatus({ ...base, schedule: [
      target('instagram', '2026-10-02T22:00:00Z'), target('facebook', '2026-10-02T22:00:00Z'),
      target('youtube', '2026-10-02T23:00:00Z'),
    ] })
    expect(status).toEqual({
      kind: 'scheduled', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2',
      groups: [{ time: '6 p.m.', destinations: 'Instagram, Facebook' }, { time: '7 p.m.', destinations: 'YouTube' }],
    })
  })

  it('says times are not confirmed when any required time is missing', () => {
    const status = headerStatus({ ...base, schedule: [target('instagram', null, 'pending')] })
    expect(status).toEqual({ kind: 'unconfirmed', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2' })
  })

  it('uses Publishes for an article', () => {
    expect(headerStatus({ ...base, layout: 'article', schedule: [] }).keyFact).toBe('Publishes Fri Oct 2')
  })

  it('shows live links once published', () => {
    const status = headerStatus({ ...base, isPublished: true, schedule: [], publication: [
      live('instagram', 'https://instagram.com/p/x', '2026-10-02T22:01:00Z'), live('youtube', null, '2026-10-02T23:00:00Z'),
    ] })
    expect(status).toEqual({
      kind: 'live', keyFact: 'Live', postedLabel: 'Posted Fri Oct 2',
      links: [{ label: 'Instagram', url: 'https://instagram.com/p/x' }],
    })
  })

  it('has no date when nothing is planned', () => {
    expect(headerStatus({ ...base, plannedDate: null, schedule: [] })).toEqual({ kind: 'undated', keyFact: 'No date yet' })
  })
})

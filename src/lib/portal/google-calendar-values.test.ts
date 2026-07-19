import { describe, expect, it } from 'vitest'
import { googleEventStart, safeEditorialEvent, stableEditorialKey } from './google-calendar-values'

const integrationId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const contentId = '33333333-3333-4333-8333-333333333333'

describe('Google Calendar projection values', () => {
  it('uses an opaque deterministic mapping key', () => {
    expect(stableEditorialKey(integrationId, contentId))
      .toBe(`portal:${integrationId}:${contentId}:editorial`)
  })

  it('projects only a safe all-day editorial hold', () => {
    const event = safeEditorialEvent({ integrationId, clientId, contentId, version: 7,
      revision: 12, title: 'Client-safe title', plannedDate: '2026-07-31' })
    expect(event.start.date).toBe('2026-07-31')
    expect(event.end.date).toBe('2026-08-01')
    expect(event.visibility).toBe('default')
    expect(event.extendedProperties.private).toEqual(expect.objectContaining({
      portal_client_id: clientId, portal_content_id: contentId, portal_content_version: '7',
      portal_object_revision: '12', portal_schedule_target_id: '',
    }))
    expect(JSON.stringify(event)).not.toContain('client_body')
    expect(JSON.stringify(event)).not.toContain('internal_notes')
  })

  it('keeps all-day and timed events distinct', () => {
    expect(googleEventStart({ id: 'a', etag: 'e', updated: '2026-07-18T00:00:00Z',
      start: { date: '2026-07-20' }, end: { date: '2026-07-21' } }))
      .toEqual({ date: '2026-07-20', startAt: null, endAt: null })
    expect(googleEventStart({ id: 'b', etag: 'e', updated: '2026-07-18T00:00:00Z',
      start: { dateTime: '2026-07-20T10:00:00-04:00' }, end: { dateTime: '2026-07-20T10:30:00-04:00' } }))
      .toEqual({ date: null, startAt: '2026-07-20T10:00:00-04:00', endAt: '2026-07-20T10:30:00-04:00' })
  })
})

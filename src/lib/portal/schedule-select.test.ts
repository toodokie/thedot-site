import { describe, expect, it } from 'vitest'
import { CALENDAR_SELECT, DECISION_SELECT } from './schedule'

// A column asked of the wrong view is not a type error and no mocked test catches it: PostgREST
// answers "column X does not exist" at request time, the reader throws PortalDataError, and every
// surface built on it renders "Something went wrong loading your workspace". That is what happened
// on 2026-09-21 when current_decision was added to the calendar select. It lives on
// content_with_state, not on content_calendar_client, whose column list is fixed by migration 0025.
describe('schedule read model column contracts', () => {
  const CALENDAR_VIEW_COLUMNS = new Set([
    'id', 'content_id', 'client_id', 'title', 'format', 'pillar', 'platforms', 'status',
    'planned_date', 'version', 'calendar_note', 'client_state', 'schedule_state',
    'publication_state', 'updated_at',
  ])

  const columns = (select: string) => select.split(',').map((part) => part.trim())

  it('asks the calendar view only for columns migration 0025 gives it', () => {
    for (const column of columns(CALENDAR_SELECT)) {
      expect(CALENDAR_VIEW_COLUMNS, `content_calendar_client has no column "${column}"`)
        .toContain(column)
    }
  })

  it('never asks the calendar view for current_decision', () => {
    expect(columns(CALENDAR_SELECT)).not.toContain('current_decision')
  })

  it('gets current_decision from content_with_state instead, keyed by id', () => {
    expect(columns(DECISION_SELECT)).toEqual(['id', 'current_decision'])
  })
})

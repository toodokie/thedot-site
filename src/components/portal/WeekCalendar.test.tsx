import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WeekCalendar, { addCalendarDays, mondayOf } from './WeekCalendar'

describe('WeekCalendar', () => {
  it('uses a Monday-start Toronto date range and crosses month boundaries safely', () => {
    expect(mondayOf('2026-08-02')).toBe('2026-07-27')
    expect(addCalendarDays('2026-07-27', 6)).toBe('2026-08-02')
  })

  it('navigates by a full week and keeps calendar pieces clickable', () => {
    render(<WeekCalendar todayIso="2026-07-29" days={{
      '2026-07-29': [{
        id: 'one', href: '/client/kanset/piece/one', title: 'A calendar piece', meta: 'reel',
        platforms: ['instagram'], stateNote: null, syncLabel: null, accent: 'yellow',
      }],
    }} />)
    expect(screen.getByText('Jul 27 to Aug 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /a calendar piece/i })).toHaveAttribute('href', '/client/kanset/piece/one')
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByText('Aug 3 to Aug 9')).toBeInTheDocument()
  })
})

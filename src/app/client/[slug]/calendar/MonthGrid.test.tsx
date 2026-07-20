import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MonthGrid, { type CalendarChip } from './MonthGrid'

// The server passes "today" in the business timezone; the grid must OPEN on that month
// (the live-review complaint was a long scroll that opened on next month instead).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

function torontoTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function chip(id: string, title: string): CalendarChip {
  return {
    id, title,
    href: `/client/kanset/piece/${id}`,
    meta: 'reel · employer',
    platforms: ['instagram'],
    stateNote: null,
    syncLabel: null,
    accent: 'graphite',
  }
}

describe('calendar MonthGrid', () => {
  it('defaults to the CURRENT month (request-time, business timezone)', () => {
    const todayIso = torontoTodayIso()
    const [year, month] = todayIso.split('-').map(Number)
    render(<MonthGrid days={{}} todayIso={todayIso} />)
    expect(
      screen.getByRole('heading', { level: 3, name: `${MONTHS[month - 1]} ${year}` }),
    ).toBeInTheDocument()
    // on the current month there is no "This month" jump-back affordance
    expect(screen.queryByRole('button', { name: 'This month' })).toBeNull()
  })

  it('navigates with accessible prev/next buttons and returns via This month', () => {
    render(<MonthGrid days={{}} todayIso="2026-07-20" />)
    expect(screen.getByRole('heading', { level: 3, name: 'July 2026' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('heading', { level: 3, name: 'August 2026' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { level: 3, name: 'June 2026' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByRole('heading', { level: 3, name: 'July 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'This month' })).toBeNull()
  })

  it('crosses year boundaries in both directions', () => {
    render(<MonthGrid days={{}} todayIso="2026-01-15" />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { level: 3, name: 'December 2025' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('heading', { level: 3, name: 'January 2026' })).toBeInTheDocument()
  })

  it('renders event chips inside the day cells of the shown month only', () => {
    const days = {
      '2026-07-20': [chip('lmia-decoder-reel', 'LMIA decoder reel')],
      '2026-08-03': [chip('hc-post', 'H&C carousel')],
    }
    render(<MonthGrid days={days} todayIso="2026-07-20" />)
    expect(screen.getByRole('link', { name: 'LMIA decoder reel' })).toHaveAttribute(
      'href', '/client/kanset/piece/lmia-decoder-reel',
    )
    expect(screen.queryByRole('link', { name: 'H&C carousel' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('link', { name: 'H&C carousel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'LMIA decoder reel' })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CalendarLegend, { CALENDAR_LEGEND } from './CalendarLegend'
import { statusAccent } from '@/lib/portal/schedule'

describe('CalendarLegend', () => {
  it('names all three states', () => {
    render(<CalendarLegend />)
    expect(screen.getByText('In planning')).toBeTruthy()
    expect(screen.getByText('Approved or scheduled')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
  })

  it('gives every accent its own swatch, so no two states can share a colour', () => {
    const accents = CALENDAR_LEGEND.map((entry) => entry.accent)
    expect(new Set(accents).size).toBe(accents.length)
  })

  // The legend is only honest while it covers every accent the calendars can produce.
  it('covers every accent the client mapping returns', () => {
    const produced = new Set([
      statusAccent('with_dot'), statusAccent('needs_review'),
      statusAccent('approved'), statusAccent('scheduled'),
      statusAccent('live'), statusAccent('archived'),
    ])
    const legendAccents = new Set(CALENDAR_LEGEND.map((entry) => entry.accent))
    for (const accent of produced) expect(legendAccents.has(accent)).toBe(true)
    expect(produced.size).toBe(legendAccents.size)
  })
})

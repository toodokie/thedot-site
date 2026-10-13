import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/request-actions', () => ({ requestContentRemoval: vi.fn(async () => ({})) }))

import PieceHeader from './PieceHeader'
import type { HeaderStatus } from '@/lib/portal/piece-page/header-status'

let scrollY = 0
beforeEach(() => {
  scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
})
afterEach(() => vi.unstubAllGlobals())

const scheduled: HeaderStatus = {
  kind: 'scheduled', verb: 'Posts', dateLabel: 'Fri Oct 2', keyFact: 'Posts Fri Oct 2',
  groups: [{ time: '6 p.m.', destinations: 'Instagram, Facebook' }, { time: '7 p.m.', destinations: 'YouTube' }],
}

function subject(overrides: Partial<React.ComponentProps<typeof PieceHeader>> = {}) {
  return <PieceHeader title="What does hiring a foreign worker cost?" formatLabel="Reel · Instagram, Facebook, YouTube"
    backHref="/client/kanset" backLabel="Back to calendar" status={scheduled} updatedLine={null}
    questionsCount={1} onOpenQuestions={vi.fn()} scheduleSlot={null} removal={null} {...overrides} />
}

describe('PieceHeader', () => {
  it('shows one heading, the format and the one status line', () => {
    render(subject())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What does hiring a foreign worker cost?')
    expect(screen.getByText('Reel · Instagram, Facebook, YouTube')).toBeInTheDocument()
    const status = screen.getByTestId('status-line')
    expect(status).toHaveTextContent('Posts Fri Oct 2 · 6 p.m. Instagram, Facebook · 7 p.m. YouTube')
  })

  it('says times are not confirmed, and links each live destination once published', () => {
    const { rerender } = render(subject({ status: { kind: 'unconfirmed', verb: 'Posts', dateLabel: 'Thu Sep 17', keyFact: 'Posts Thu Sep 17' } }))
    expect(screen.getByTestId('status-line')).toHaveTextContent('Posts Thu Sep 17 · Times not confirmed yet')
    rerender(subject({ status: { kind: 'live', keyFact: 'Live', postedLabel: 'Posted Fri Oct 2', links: [{ label: 'Instagram', url: 'https://instagram.com/p/x' }] } }))
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/p/x')
    expect(screen.getByTestId('status-line')).toHaveTextContent('Live · Instagram · Posted Fri Oct 2')
  })

  it('names the areas updated after her feedback', () => {
    render(subject({ updatedLine: 'on-screen text, caption' }))
    expect(screen.getByText('Updated after your feedback: on-screen text, caption')).toBeInTheDocument()
  })

  it('names each date when a piece posts on different days', () => {
    render(subject({ status: { ...scheduled, groups: [
      { time: 'Fri Oct 2, 6 p.m.', destinations: 'Instagram, Facebook' }, { time: 'Sat Oct 3, 7 p.m.', destinations: 'YouTube' },
    ] } }))
    expect(screen.getByTestId('status-line')).toHaveTextContent('Posts Fri Oct 2 · Fri Oct 2, 6 p.m. Instagram, Facebook · Sat Oct 3, 7 p.m. YouTube')
  })

  it('opens Questions & sources', () => {
    const onOpenQuestions = vi.fn()
    render(subject({ onOpenQuestions }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Questions and sources, 1 message' })[0])
    expect(onOpenQuestions).toHaveBeenCalled()
  })

  it('shows the condensed bar past 120px and hides it under 40px, inert while hidden', () => {
    render(subject())
    const bar = screen.getByTestId('condensed-header')
    expect(bar).toHaveAttribute('data-collapsed', 'false')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toHaveAttribute('inert')
    scrollY = 200
    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(bar).toHaveAttribute('data-collapsed', 'true')
    expect(bar).not.toHaveAttribute('inert')
    expect(bar).toHaveTextContent('Posts Fri Oct 2')
  })
})

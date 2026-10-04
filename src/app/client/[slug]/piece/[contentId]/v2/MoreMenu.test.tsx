import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/request-actions', () => ({ requestContentRemoval: vi.fn(async () => ({})) }))

import MoreMenu from './MoreMenu'
import { stubDialogs } from './test-utils'

const writeText = vi.fn(async () => undefined)
beforeEach(() => {
  stubDialogs()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

describe('MoreMenu', () => {
  it('opens a keyboard-navigable menu and closes on Escape', () => {
    render(<MoreMenu idPrefix="t" removal={{ slug: 'kanset', contentId: 'piece', idempotencyKey: 'k' }} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Copy link', 'Request removal'])
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('copies the page link', async () => {
    render(<MoreMenu idPrefix="t" removal={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Request removal' })).not.toBeInTheDocument()
    window.history.pushState({}, '', '/client/kanset/piece/abc?tab=caption#frame-2')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    // The page itself, without the open tab or a fragment from this session.
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/client/kanset/piece/abc`)
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('opens the removal request form in a dialog', () => {
    render(<MoreMenu idPrefix="t" removal={{ slug: 'kanset', contentId: 'piece', idempotencyKey: 'k' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Request removal' }))
    expect(screen.getByRole('dialog', { name: 'Request removal' })).toBeVisible()
    // Portalled to <body>, so the condensed bar's inert never disables it.
    expect(screen.getByRole('dialog', { name: 'Request removal' }).parentElement).toBe(document.body)
    expect(screen.getByLabelText(/Why should this piece be removed/)).toHaveFocus()
  })
})

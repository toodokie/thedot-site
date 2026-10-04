import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/request-actions', () => ({ requestContentRemoval: vi.fn(async () => ({})) }))

import MoreMenu from './MoreMenu'
import { stubDialogs } from './test-utils'

const writeText = vi.fn(async () => undefined)
beforeEach(() => {
  stubDialogs()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => vi.unstubAllGlobals())

function phoneWidth(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query === '(max-width: 767px)', media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }))
}

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

  it('opens as a bottom sheet with a backdrop on a phone, and tapping outside returns focus to the trigger', () => {
    phoneWidth(true)
    const { container } = render(<MoreMenu idPrefix="t" removal={{ slug: 'kanset', contentId: 'piece', idempotencyKey: 'k' }} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    // Portalled out of the header so no ancestor clips it.
    expect(container.contains(menu)).toBe(false)
    expect(menu).toHaveAttribute('data-variant', 'sheet')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Copy link', 'Request removal'])
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
    const backdrop = screen.getByTestId('t-menu-backdrop')
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByTestId('t-menu-backdrop')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the phone sheet on Escape and on Tab, and focus goes back to the trigger', () => {
    phoneWidth(true)
    render(<MoreMenu idPrefix="t" removal={null} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps the dropdown beside the trigger on a computer, with no backdrop', () => {
    phoneWidth(false)
    const { container } = render(<MoreMenu idPrefix="t" removal={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(container.contains(screen.getByRole('menu'))).toBe(true)
    expect(screen.getByRole('menu')).toHaveAttribute('data-variant', 'dropdown')
    expect(screen.queryByTestId('t-menu-backdrop')).not.toBeInTheDocument()
  })

  it('shifts the dropdown back inside the viewport when it would run off the left edge', () => {
    phoneWidth(false)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu'
        ? { left: -50, right: 190, top: 0, bottom: 100, width: 240, height: 100, x: -50, y: 0, toJSON: () => ({}) } as DOMRect
        : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
    render(<MoreMenu idPrefix="t" removal={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu').style.transform).toBe('translateX(66px)')
    rect.mockRestore()
  })
})


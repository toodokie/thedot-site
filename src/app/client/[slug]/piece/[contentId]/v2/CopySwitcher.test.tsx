import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CopySwitcher, { tabDomId } from './CopySwitcher'

const tabs = [{ key: 'onscreen', label: 'On-screen text' }, { key: 'caption', label: 'Caption' }, { key: 'youtube', label: 'YouTube' }]

function subject(overrides: Partial<React.ComponentProps<typeof CopySwitcher>> = {}) {
  return <CopySwitcher idPrefix="piece" tabs={tabs} active="onscreen" onSelect={vi.fn()}
    ticked={new Set(['onscreen', 'caption'])} draftCounts={{ onscreen: 2 }} updated={new Set(['caption'])} {...overrides} />
}

describe('CopySwitcher', () => {
  it('is a tab list with one selected, focusable tab', () => {
    render(subject())
    expect(screen.getByRole('tablist', { name: 'Copy' })).toBeInTheDocument()
    const selected = screen.getByRole('tab', { selected: true })
    expect(selected).toHaveAccessibleName(/On-screen text/)
    expect(selected).toHaveAttribute('tabindex', '0')
    expect(selected).toHaveAttribute('aria-controls', 'piece-panel')
    expect(screen.getByRole('tab', { name: /YouTube/ })).toHaveAttribute('tabindex', '-1')
    expect(selected.id).toBe(tabDomId('piece', 'onscreen'))
  })

  it('says which tabs are reviewed, updated, and holding unsent edits', () => {
    render(subject())
    expect(screen.getByRole('tab', { name: /On-screen text.*2 unsent edits.*reviewed/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Caption.*updated.*reviewed/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /YouTube.*not reviewed yet/ })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-checked="true"]')).toHaveLength(2)
  })

  it('shows no review status on a decided piece', () => {
    render(subject({ showTicks: false }))
    expect(screen.queryByText('not reviewed yet')).not.toBeInTheDocument()
    expect(screen.queryByText('reviewed')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-checked]')).toHaveLength(0)
    expect(screen.getByRole('tab', { name: /Caption.*updated/ })).toBeInTheDocument()
  })

  it('moves with the arrow keys, Home and End', () => {
    const onSelect = vi.fn()
    render(subject({ onSelect }))
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('caption')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('youtube')
    fireEvent.keyDown(list, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('youtube')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith('onscreen')
  })

  it('selects on click', () => {
    const onSelect = vi.fn()
    render(subject({ onSelect }))
    fireEvent.click(screen.getByRole('tab', { name: /YouTube/ }))
    expect(onSelect).toHaveBeenCalledWith('youtube')
  })
})

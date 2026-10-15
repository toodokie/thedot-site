import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { reportStalePage } from '@/lib/portal/stale-page'
import StalePageNotice from './StalePageNotice'

describe('StalePageNotice', () => {
  it('appears on the stale-page event and reloads from its button', () => {
    const reload = vi.fn()
    render(<StalePageNotice reload={reload} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    act(() => reportStalePage())

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The portal was just updated. Reload the page to continue. Anything you typed is kept on this device.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})

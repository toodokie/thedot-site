import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LengthCounter from './LengthCounter'

describe('LengthCounter', () => {
  it('stays hidden under 45,000 characters', () => {
    const { container } = render(<LengthCounter text={'a'.repeat(44_999)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts from 45,000', () => {
    render(<LengthCounter text={'a'.repeat(45_000)} />)
    expect(screen.getByText('45,000 of 50,000 characters')).toBeInTheDocument()
  })

  it('announces the count politely to screen readers', () => {
    render(<LengthCounter text={'a'.repeat(45_000)} />)
    expect(screen.getByText('45,000 of 50,000 characters')).toHaveAttribute('aria-live', 'polite')
  })

  it('says how far over the limit, and that nothing was cut', () => {
    render(<LengthCounter text={'a'.repeat(50_002)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('2 characters over the 50,000 limit. Shorten it before you send. Nothing has been cut.')
  })
})

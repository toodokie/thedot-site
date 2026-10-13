import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewDots } from './ReviewDots';

function dots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-filled]'));
}

describe('ReviewDots', () => {
  it('renders one dot per item and fills the first n', () => {
    const { container } = render(<ReviewDots total={3} filled={2} />);
    expect(dots(container).map((d) => d.getAttribute('data-filled'))).toEqual(['true', 'true', 'false']);
  });

  it('is decorative unless given a label, because the bar prints "2 of 3 reviewed" beside it', () => {
    const { container } = render(<ReviewDots total={3} filled={1} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes one accessible name for the whole row when labelled', () => {
    render(<ReviewDots total={5} filled={4} label="Rated 4 of 5" />);
    expect(screen.getByRole('img', { name: 'Rated 4 of 5' })).toBeInTheDocument();
  });

  it('clamps filled to the range 0..total', () => {
    const over = render(<ReviewDots total={2} filled={9} />);
    expect(dots(over.container).every((d) => d.getAttribute('data-filled') === 'true')).toBe(true);
    const under = render(<ReviewDots total={2} filled={-1} />);
    expect(dots(under.container).every((d) => d.getAttribute('data-filled') === 'false')).toBe(true);
  });

  it('renders nothing inside for a zero or invalid total', () => {
    const { container } = render(<ReviewDots total={0} filled={0} />);
    expect(dots(container)).toHaveLength(0);
    const nan = render(<ReviewDots total={Number.NaN} filled={1} />);
    expect(dots(nan.container)).toHaveLength(0);
  });

  it('records its size for styling', () => {
    const { container } = render(<ReviewDots total={1} filled={1} size="sm" />);
    expect(container.firstElementChild).toHaveAttribute('data-size', 'sm');
  });
});

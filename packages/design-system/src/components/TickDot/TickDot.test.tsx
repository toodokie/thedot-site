import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TickDot } from './TickDot';

describe('TickDot', () => {
  it('is decorative by default, so a visible text label carries the meaning', () => {
    const { container } = render(<TickDot checked={false} />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toHaveAttribute('data-checked', 'false');
  });

  it('exposes a name when it is the only signal', () => {
    render(<TickDot checked label="Reviewed" />);
    const dot = screen.getByRole('img', { name: 'Reviewed' });
    expect(dot).toHaveAttribute('data-checked', 'true');
    expect(dot).not.toHaveAttribute('aria-hidden');
  });

  it('passes a className through', () => {
    const { container } = render(<TickDot checked className="extra" />);
    expect(container.firstElementChild).toHaveClass('extra');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Selector } from './Selector';

describe('Selector', () => {
  it('renders a pressable option reflecting selected state', () => {
    render(<Selector selected>Half day</Selector>);
    expect(screen.getByRole('button', { name: 'Half day' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<Selector onSelect={onSelect}>Full day</Selector>);
    await userEvent.click(screen.getByRole('button', { name: 'Full day' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

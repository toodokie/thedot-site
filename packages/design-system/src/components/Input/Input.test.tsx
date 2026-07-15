import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Input } from './Input';

describe('Input', () => {
  it('associates the label with the field', () => {
    render(<Input label="Email" id="email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('marks the field invalid via aria-invalid', () => {
    render(<Input label="Email" id="email" invalid />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is controllable', async () => {
    function Controlled() {
      const [v, setV] = useState('');
      return <Input label="Name" id="name" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Controlled />);
    await userEvent.type(screen.getByLabelText('Name'), 'Dot');
    expect(screen.getByLabelText('Name')).toHaveValue('Dot');
  });
});

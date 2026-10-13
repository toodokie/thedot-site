import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('associates the label', () => {
    render(<Textarea label="Message" id="msg" />);
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });
  it('accepts typed input', async () => {
    render(<Textarea label="Message" id="msg" />);
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    expect(screen.getByLabelText('Message')).toHaveValue('hi');
  });
});

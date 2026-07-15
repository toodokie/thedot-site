import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Selector } from './Selector';

const meta: Meta<typeof Selector> = { title: 'Forms/Selector', component: Selector };
export default meta;
type Story = StoryObj<typeof Selector>;

export const Group: Story = {
  render: () => {
    const [sel, setSel] = useState('half');
    return (
      <div style={{ display: 'flex', gap: 16 }}>
        <Selector selected={sel === 'half'} onSelect={() => setSel('half')}>Half day</Selector>
        <Selector selected={sel === 'full'} onSelect={() => setSel('full')}>Full day</Selector>
      </div>
    );
  },
};

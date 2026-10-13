import type { Meta, StoryObj } from '@storybook/react';
import { TickDot } from './TickDot';

const meta: Meta<typeof TickDot> = { title: 'Brand/TickDot', component: TickDot };
export default meta;
type Story = StoryObj<typeof TickDot>;

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontFamily: 'var(--dot-font-display)' }}>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>CAPTION <TickDot checked={false} /></span>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>ON-SCREEN TEXT <TickDot checked label="Reviewed" /></span>
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { Arrow } from './Arrow';

const meta: Meta<typeof Arrow> = { title: 'Brand/Arrow', component: Arrow };
export default meta;
type Story = StoryObj<typeof Arrow>;

export const Directions: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <Arrow direction="right" /><Arrow direction="down" /><Arrow direction="left" /><Arrow direction="up" />
    </div>
  ),
};

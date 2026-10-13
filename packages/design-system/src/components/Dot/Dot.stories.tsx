import type { Meta, StoryObj } from '@storybook/react';
import { Dot } from './Dot';

const meta: Meta<typeof Dot> = { title: 'Brand/Dot', component: Dot };
export default meta;
type Story = StoryObj<typeof Dot>;

export const Fills: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <Dot fill="silver" /><Dot fill="black" /><Dot fill="yellow" />
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = { title: 'Actions/Button', component: Button };
export default meta;
type Story = StoryObj<typeof Button>;

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Button variant="yellow">Start a project</Button>
      <Button variant="black">View work</Button>
      <Button variant="ghost">Learn more</Button>
      <Button variant="black" size="sm">Small</Button>
    </div>
  ),
};

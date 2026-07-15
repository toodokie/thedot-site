import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { title: 'Content/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card eyebrow="Service" title="Conversion-first web design">
      Editorial layouts, sharp corners, a warm canvas — and one confident yellow glow.
    </Card>
  ),
};

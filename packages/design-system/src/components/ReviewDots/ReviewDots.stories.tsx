import type { Meta, StoryObj } from '@storybook/react';
import { ReviewDots } from './ReviewDots';

const meta: Meta<typeof ReviewDots> = { title: 'Brand/ReviewDots', component: ReviewDots };
export default meta;
type Story = StoryObj<typeof ReviewDots>;

export const Progress: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'var(--dot-font-display)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.8rem' }}>
      <ReviewDots total={3} filled={2} /> <strong>2 of 3 reviewed</strong>
    </div>
  ),
};

export const Rating: Story = {
  render: () => <ReviewDots total={5} filled={4} label="Rated 4 of 5" />,
};

export const Small: Story = {
  render: () => <ReviewDots total={9} filled={5} size="sm" label="5 of 9 gates done" />,
};

import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = { title: 'Content/Tag', component: Tag };
export default meta;
type Story = StoryObj<typeof Tag>;

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}><Tag>New</Tag><Tag tone="black">Case study</Tag></div>
  ),
};

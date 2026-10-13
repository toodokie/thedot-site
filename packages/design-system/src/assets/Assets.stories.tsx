import type { Meta, StoryObj } from '@storybook/react';
import logo from './main-logo.svg';
import dotPattern from './dot-pattern.svg';

const meta: Meta = { title: 'Brand/Assets' };
export default meta;
type Story = StoryObj;

export const Vectors: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <img src={logo} alt="The Dot logo" style={{ height: 60 }} />
      <img src={dotPattern} alt="Dot pattern" style={{ width: 320 }} />
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { DotGrid } from './DotGrid';

const meta: Meta<typeof DotGrid> = { title: 'Brand/DotGrid', component: DotGrid };
export default meta;
type Story = StoryObj<typeof DotGrid>;

export const Signature: Story = { args: { cols: 8, rows: 6 } };

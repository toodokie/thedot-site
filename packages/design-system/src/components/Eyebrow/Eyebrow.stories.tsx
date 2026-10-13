import type { Meta, StoryObj } from '@storybook/react';
import { Eyebrow } from './Eyebrow';

const meta: Meta<typeof Eyebrow> = { title: 'Type/Eyebrow', component: Eyebrow };
export default meta;
type Story = StoryObj<typeof Eyebrow>;

export const Default: Story = { render: () => <Eyebrow>Selected Work · 2026</Eyebrow> };

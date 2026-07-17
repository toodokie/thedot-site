import type { Meta, StoryObj } from '@storybook/react';
import { ReadMore } from './ReadMore';

const meta: Meta<typeof ReadMore> = { title: 'Content/ReadMore', component: ReadMore };
export default meta;
type Story = StoryObj<typeof ReadMore>;

export const Default: Story = { render: () => <ReadMore /> };
export const CustomLabel: Story = { render: () => <ReadMore>Read the case study →</ReadMore> };

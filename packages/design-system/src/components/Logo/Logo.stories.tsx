import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = { title: 'Brand/Logo', component: Logo };
export default meta;
type Story = StoryObj<typeof Logo>;

export const Default: Story = { render: () => <Logo height={48} /> };
export const Small: Story = { render: () => <Logo height={28} /> };

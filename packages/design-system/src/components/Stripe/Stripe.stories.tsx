import type { Meta, StoryObj } from '@storybook/react';
import { Stripe } from './Stripe';

const meta: Meta<typeof Stripe> = { title: 'Brand/Stripe', component: Stripe, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof Stripe>;

export const Divider: Story = { render: () => <div style={{ padding: 24 }}><Stripe /></div> };

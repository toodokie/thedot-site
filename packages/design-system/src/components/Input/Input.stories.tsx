import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta: Meta<typeof Input> = { title: 'Forms/Input', component: Input };
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Email', id: 'email', placeholder: 'you@company.com' } };
export const Invalid: Story = { args: { label: 'Email', id: 'email2', invalid: true, defaultValue: 'nope' } };

import type { Meta, StoryObj } from '@storybook/react';
import { Heading } from './Heading';

const meta: Meta<typeof Heading> = { title: 'Type/Heading', component: Heading };
export default meta;
type Story = StoryObj<typeof Heading>;

export const AllLevels: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <Heading variant="display">Design that gets to the point</Heading>
      <Heading level={1}>Brands that attract</Heading>
      <Heading level={2}>Websites that convert</Heading>
      <Heading variant="section">Systems that grow</Heading>
      <Heading level={3}>Strategic web design</Heading>
      <Heading level={4}>Business systems integration</Heading>
    </div>
  ),
};

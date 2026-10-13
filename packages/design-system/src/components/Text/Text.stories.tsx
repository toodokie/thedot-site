import type { Meta, StoryObj } from '@storybook/react';
import { Text } from './Text';

const meta: Meta<typeof Text> = { title: 'Type/Text', component: Text };
export default meta;
type Story = StoryObj<typeof Text>;

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <Text size="lg">Large body — we build fast, distinctive websites.</Text>
      <Text size="md">Medium body — consistent color, type, and components.</Text>
      <Text size="sm" tone="grey">Small / grey — captions and meta.</Text>
      <Text tone="graphite">Graphite tone body copy.</Text>
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';
import { Tag } from '../Tag/Tag';
import { Text } from '../Text/Text';
import { ReadMore } from '../ReadMore/ReadMore';

const meta: Meta<typeof Card> = { title: 'Content/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

// The blog-card pattern (matches the site's .post-card): Tag category + title +
// body Text + ReadMore pinned to the bottom.
export const Default: Story = {
  render: () => (
    <div style={{ width: 360 }}>
      <Card eyebrow={<Tag>Strategy</Tag>} title="How emotional branding drives 306% lifetime value">
        <Text size="lg" tone="grey">A warm, human brand identity compounds over time — here&apos;s the Ontario data behind it.</Text>
        <ReadMore />
      </Card>
    </div>
  ),
};

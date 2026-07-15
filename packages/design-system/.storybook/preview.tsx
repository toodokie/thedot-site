import type { Preview } from '@storybook/react-vite';
import '../src/styles/fonts.css';
import '../src/tokens/tokens.css';
import '../src/styles/reset.css';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'cream', values: [{ name: 'cream', value: '#faf9f6' }] },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="dot-root">
        <Story />
      </div>
    ),
  ],
};
export default preview;

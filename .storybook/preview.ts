import '../extension/src/ui/styles/panel.css';
import '../extension/src/ui/styles/handoff-baseline.css';
import '../extension/src/ui/styles/destinations.css';

import type { Preview } from '@storybook/html-vite';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    layout: 'fullscreen',
  },
};

export default preview;

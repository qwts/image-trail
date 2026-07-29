import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';

import type { BufferedNavigationStatusSnapshot } from '../panel/buffered-navigation-status.js';
import { panelStory } from '../stories/story-host.js';
import { createNeighborStatusView } from './neighbor-status-view.js';

const outcomeSnapshot: BufferedNavigationStatusSnapshot = {
  total: 8,
  warmed: 3,
  warming: 2,
  failed: 1,
  skipped: 1,
  unknown: 1,
  failuresVisible: true,
};

const meta = {
  title: 'Extension UI/Neighbor status',
  render: () => panelStory(createNeighborStatusView(outcomeSnapshot)),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedOutcomes: Story = {
  play: async ({ canvasElement }) => {
    const status = canvasElement.querySelector('.image-trail-panel__neighbor-status-pill');
    await expect(status).toHaveTextContent('3 warmed · 2 warming · 1 failed · 1 skipped · 1 unknown');
    await expect(status).not.toHaveTextContent(/https?:|blob:|image=/u);
  },
};

export const FailureFeedbackMuted: Story = {
  render: () => panelStory(createNeighborStatusView({ ...outcomeSnapshot, failuresVisible: false })),
  play: async ({ canvasElement }) => {
    const status = canvasElement.querySelector('.image-trail-panel__neighbor-status-pill');
    await expect(status).toHaveTextContent('3 warmed · 2 warming · 1 unknown');
    await expect(status).not.toHaveTextContent(/failed|skipped/u);
  },
};

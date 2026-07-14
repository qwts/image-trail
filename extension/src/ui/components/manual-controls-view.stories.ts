import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';

import { createInitialPanelState } from '../../core/state.js';
import type { PanelState } from '../../core/types.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';
import { createManualControlsView } from './manual-controls-view.js';

const meta = {
  title: 'Extension UI/Primary workflow',
  render: () => controlsStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '◀ Prev' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Capture original' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Start slideshow' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Grab Mode' })).toBeVisible();
  },
};

export const Running: Story = {
  render: () => {
    const initial = createInitialPanelState(0);
    return controlsStory({
      automation: { ...initial.automation, slideshowPhase: 'running', slideshowCount: 4 },
    });
  },
};

export const GrabMode: Story = {
  render: () => {
    const initial = createInitialPanelState(0);
    return controlsStory({ target: { ...initial.target, selectedUrl: 'https://images.example.test/photo.jpg', grabModeActive: true } });
  },
};

export const MoreControls: Story = {
  render: () => controlsStory({ secondaryControlsOpen: true }),
};

export const Narrow: Story = {
  render: () => controlsStory({}, 300),
  play: async ({ canvasElement }) => {
    const workflow = canvasElement.querySelector<HTMLElement>('.image-trail-panel__primary-workflow');
    await expect(workflow?.scrollWidth).toBeLessThanOrEqual(workflow?.clientWidth ?? 0);
  },
};

function controlsStory(overrides: Partial<PanelState> = {}, width = 420): HTMLElement {
  const initial = createInitialPanelState(0);
  const selectedUrl = 'https://images.example.test/photo.jpg';
  return panelStory(
    createManualControlsView({
      state: {
        ...initial,
        target: { ...initial.target, selectedUrl },
        ...overrides,
      },
      previousFieldId: 'path:0:0',
      nextFieldId: 'query:page:0',
      dispatch: mockDispatch('primary workflow story action'),
    }),
    { width },
  );
}

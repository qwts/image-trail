import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { settingsGroupStory } from '../stories/settings-story-host.js';
import {
  createNeighborPreloadSettingsView,
  createRequestThrottleSettingsView,
  createUrlReviewStatusSettingsView,
} from './automation-settings-view.js';

const dispatchSpy = fn();
const meta = {
  title: 'Extension UI/Automation settings',
  render: () =>
    settingsGroupStory('Automation', [
      createRequestThrottleSettingsView({ minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 }, dispatchSpy),
      createNeighborPreloadSettingsView({ enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' }, dispatchSpy),
      createUrlReviewStatusSettingsView({ limit: 5_000, clearAfterExport: false }, dispatchSpy),
    ]),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ControlsDispatch: Story = {
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const feedback = Array.from(canvasElement.querySelectorAll('label')).find((label) => label.textContent?.includes('Failure feedback'));
    const select = feedback?.querySelector('select');
    if (!select) throw new Error('expected Failure feedback control');
    await userEvent.selectOptions(select, 'alert');
    await expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'settings/update-neighbor-preload', loadFailureFeedback: 'alert' }),
    );
    await userEvent.click(Array.from(canvasElement.querySelectorAll('button')).find((button) => button.textContent === 'Preload more')!);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'neighbor-preload/manual', radius: 3, cacheLimit: 24 });
  },
};

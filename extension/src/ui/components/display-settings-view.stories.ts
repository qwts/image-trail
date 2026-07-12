import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { settingsGroupStory } from '../stories/settings-story-host.js';
import { createVisiblePinsSettingsView } from './display-settings-view.js';
import { createRecentsSettingsView } from './recents-settings-view.js';

const dispatchSpy = fn();
const meta = {
  title: 'Extension UI/Display settings',
  render: () =>
    settingsGroupStory('Display', [
      createVisiblePinsSettingsView(30, dispatchSpy),
      createRecentsSettingsView(
        { limit: 3, retainedLimit: 10, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
        dispatchSpy,
      ),
    ]),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ControlsDispatch: Story = {
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const pins = Array.from(canvasElement.querySelectorAll('label')).find((label) => label.textContent?.includes('Visible pins'));
    const input = pins?.querySelector('input');
    const form = pins?.closest('form');
    if (!input || !form) throw new Error('expected Visible pins form');
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(form.querySelector('button')!);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'settings/update-visible-bookmark-soft-max', value: 12 });
  },
};

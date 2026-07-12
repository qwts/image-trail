import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { settingsGroupStory } from '../stories/settings-story-host.js';
import {
  createBuildIdentitySettingsView,
  createDestructiveSettingsView,
  createStorageHealthSettingsView,
} from './maintenance-settings-view.js';
import { createPanelLayoutSettingsView } from './panel-layout-settings-view.js';

const dispatchSpy = fn();
const meta = {
  title: 'Extension UI/Maintenance settings',
  render: () =>
    settingsGroupStory('Maintenance', [
      createPanelLayoutSettingsView(false, dispatchSpy),
      createBuildIdentitySettingsView(
        {
          overlayVisible: true,
          identity: {
            schemaVersion: 1,
            version: '0.1.0',
            builtAt: '2026-07-12T12:00:00.000Z',
            commit: 'abc123',
            branch: 'codex/story',
            worktree: 'image-trail',
            timezone: 'America/Chicago',
            mode: 'local',
          },
        },
        dispatchSpy,
      ),
      createStorageHealthSettingsView({ blobCount: 2, totalBytes: 2048 }),
      createDestructiveSettingsView({ visibleQueueCount: 2, recallCount: 3, busy: false }, dispatchSpy),
    ]),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmedDeleteDispatchesOnce: Story = {
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const button = Array.from(canvasElement.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.startsWith('Delete current queue'),
    );
    if (!button) throw new Error('expected queue deletion control');
    await userEvent.click(button);
    await expect(dispatchSpy).not.toHaveBeenCalledWith({ name: 'bookmarks/delete-visible' });
    await expect(button).toHaveTextContent('Confirm Delete current queue (2)');
    await userEvent.click(button);
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'bookmarks/delete-visible' });
  },
};

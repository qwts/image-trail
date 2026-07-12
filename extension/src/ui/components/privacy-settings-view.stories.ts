import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { settingsGroupStory } from '../stories/settings-story-host.js';
import {
  createPrivacyModeSettingsView,
  createPrivatePinSettingsView,
  createSearchableMetadataSettingsView,
} from './privacy-settings-view.js';

const dispatchSpy = fn();
const meta = {
  title: 'Extension UI/Privacy settings',
  render: () =>
    settingsGroupStory('Privacy', [
      createPrivatePinSettingsView({ pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: true, blobKeyAvailable: true }, dispatchSpy),
      createPrivacyModeSettingsView(false, dispatchSpy),
      createSearchableMetadataSettingsView({ urlDerived: 'encrypted', albumName: 'plaintext', thumbnail: 'encrypted' }, dispatchSpy),
    ]),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ControlsDispatch: Story = {
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const privacy = Array.from(canvasElement.querySelectorAll('label')).find((label) => label.textContent?.includes('Privacy mode'));
    const input = privacy?.querySelector('input');
    if (!input) throw new Error('expected Privacy mode control');
    await userEvent.click(input);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'settings/update-privacy-mode', enabled: true });
    const thumbnails = Array.from(canvasElement.querySelectorAll('label')).find((label) => label.textContent?.includes('Thumbnails'));
    await expect(thumbnails?.querySelector('select')).toBeDisabled();
  },
};

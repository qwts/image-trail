import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { PanelAction } from '../../core/types.js';
import { settingsGroupStory } from '../stories/settings-story-host.js';
import { createKeybindingSettingsView } from './keybinding-settings-view.js';

const dispatched = fn<(action: PanelAction) => void>();

const meta = {
  title: 'Extension UI/Settings/Keybindings',
  render: () => keybindingStory(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CaptureDefault: Story = {
  play: async ({ canvasElement }) => {
    dispatched.mockClear();
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Down arrow action' });
    await expect(select).toHaveValue('capture');
    await userEvent.selectOptions(select, 'download');
    await expect(dispatched).toHaveBeenCalledWith({ name: 'settings/update-down-arrow-action', value: 'download' });
  },
};

export const UnassignedNarrow: Story = {
  render: () => keybindingStory('off', 300),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Down arrow action' })).toHaveValue('off');
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

function keybindingStory(value: 'capture' | 'download' | 'off' = 'capture', width?: number): HTMLElement {
  return settingsGroupStory('Automation', [createKeybindingSettingsView(value, dispatched)], width ? { width } : {});
}

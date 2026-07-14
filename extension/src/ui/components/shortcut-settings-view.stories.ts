import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';

import { settingsGroupStory } from '../stories/settings-story-host.js';
import { createShortcutSettingsView } from './shortcut-settings-view.js';

const meta = {
  title: 'Extension UI/Shortcut settings',
  render: () => shortcutSettingsStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  play: async ({ canvasElement }) => {
    await expectShortcutRowsFit(canvasElement);
  },
};

export const Narrow: Story = {
  render: () => shortcutSettingsStory({ width: 300 }),
  play: async ({ canvasElement }) => {
    await expectShortcutRowsFit(canvasElement);
  },
};

function shortcutSettingsStory(storyOptions: { readonly width?: number } = {}): HTMLElement {
  return settingsGroupStory('Shortcuts', [createShortcutSettingsView()], storyOptions);
}

async function expectShortcutRowsFit(canvasElement: HTMLElement): Promise<void> {
  const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('.image-trail-panel__shortcut-row'));

  await expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const rowBox = row.getBoundingClientRect();
    const keysBox = row.querySelector<HTMLElement>('.image-trail-panel__shortcut-keys')?.getBoundingClientRect();
    const bodyBox = row.querySelector<HTMLElement>('.image-trail-panel__shortcut-body')?.getBoundingClientRect();

    await expect(keysBox?.left ?? rowBox.left).toBeGreaterThanOrEqual(rowBox.left - 1);
    await expect((bodyBox?.right ?? rowBox.right) <= rowBox.right + 1).toBe(true);
  }
}

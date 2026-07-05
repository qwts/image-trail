import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';

import { panelStory } from '../stories/story-host.js';
import { createShortcutSettingsView } from './shortcut-settings-view.js';

const meta = {
  title: 'Extension UI/Shortcut settings',
  render: () => panelStory(shortcutSettingsStory()),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  play: async ({ canvasElement }) => {
    await expectShortcutRowsFit(canvasElement);
  },
};

export const Narrow: Story = {
  render: () => panelStory(shortcutSettingsStory(), { width: 300 }),
  play: async ({ canvasElement }) => {
    await expectShortcutRowsFit(canvasElement);
  },
};

function shortcutSettingsStory(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';

  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section';
  group.open = true;

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.textContent = 'Shortcuts';

  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';
  body.append(createShortcutSettingsView());

  group.append(summary, body);
  section.append(heading, group);
  return section;
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

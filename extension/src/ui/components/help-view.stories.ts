import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';

import { panelStory } from '../stories/story-host.js';
import { createHelpView } from './help-view.js';

const meta = {
  title: 'Extension UI/Help',
  render: () => helpStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  play: verifyHelp,
};

export const Narrow: Story = {
  render: () => helpStory({ width: 300 }),
  play: verifyHelp,
};

function helpStory(storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createHelpView(), storyOptions);
}

async function verifyHelp({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const help = canvasElement.querySelector<HTMLElement>('.image-trail-ds__help');
  await expect(help).not.toBeNull();
  await expect(help?.querySelectorAll('.image-trail-ds__kbd').length).toBeGreaterThan(0);
  await expect(help?.scrollWidth ?? 1).toBeLessThanOrEqual((help?.clientWidth ?? 0) + 1);
}

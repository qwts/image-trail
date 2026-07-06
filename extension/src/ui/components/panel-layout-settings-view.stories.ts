import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { panelStory } from '../stories/story-host.js';
import { createPanelLayoutSettingsView } from './panel-layout-settings-view.js';

const meta = {
  title: 'Extension UI/Panel layout settings',
  render: () => panelLayoutStory(false),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const WorkspaceRestoreOff: Story = {};

export const WorkspaceRestoreOn: Story = {
  render: () => panelLayoutStory(true),
};

const dispatchSpy = fn();

export const ControlsDispatch: Story = {
  render: () => panelStory(groupHost(createPanelLayoutSettingsView(false, dispatchSpy))),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const checkbox = canvasElement.querySelector('.image-trail-panel__settings-checkbox input');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('expected the workspace-layout checkbox to render');
    await userEvent.click(checkbox);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'settings/update-workspace-layout-restore', enabled: true });

    const buttons = Array.from(canvasElement.querySelectorAll('button'));
    const resetWorkspace = buttons.find((button) => button.textContent === 'Reset workspace layout');
    if (!resetWorkspace) throw new Error('expected the workspace reset button to render');
    await userEvent.click(resetWorkspace);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'settings/reset-workspace-layout' });
  },
};

function panelLayoutStory(restoreWorkspaceLayoutEnabled: boolean): HTMLElement {
  return panelStory(groupHost(createPanelLayoutSettingsView(restoreWorkspaceLayoutEnabled, () => {})));
}

function groupHost(view: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';

  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section';
  group.open = true;

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.textContent = 'Maintenance';

  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';
  body.append(view);

  group.append(summary, body);
  section.append(heading, group);
  return section;
}

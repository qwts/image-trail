import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, fn, userEvent } from 'storybook/test';

import type { PanelAction } from '../../core/types.js';
import { createHistoryView } from './history-view.js';
import { createDetachedSectionPlaceholder, createDetachedSectionWindow, createSectionDetachControl } from './detachable-section.js';
import { recentFixtures, selectedRecord } from '../stories/fixtures.js';
import { drawerStory, mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Detachable sections',
  render: () => windowStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const DetachedWindow: Story = {};

export const DetachedWindowNarrow: Story = {
  render: () => windowStory({ inlineSize: 260 }),
};

export const DetachedWindowMinimized: Story = {
  render: () => windowStory({ minimized: true }),
};

export const MinimizeTogglesWindowBody: Story = {
  render: () => windowStory(),
  play: async ({ canvasElement }) => {
    const minimize = canvasElement.querySelector('[data-image-trail-minimize="history"]');
    if (!(minimize instanceof HTMLElement)) throw new Error('expected the minimize control to render');
    const windowEl = canvasElement.querySelector('[data-image-trail-detached-window="history"]');
    if (!(windowEl instanceof HTMLElement)) throw new Error('expected the detached window to render');
    await expect(minimize.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(minimize);
    await expect(windowEl.classList.contains('is-minimized')).toBe(true);
    await expect(minimize.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(minimize);
    await expect(windowEl.classList.contains('is-minimized')).toBe(false);
    await expect(minimize.getAttribute('aria-expanded')).toBe('true');
  },
};

export const Placeholder: Story = {
  render: () => panelStory(createDetachedSectionPlaceholder('history', 'Recent history', mockDispatch())),
};

export const SectionWithDetachControl: Story = {
  render: () => panelStory(historySectionWithControl(mockDispatch('detach action'))),
};

const dispatchSpy = fn();

export const DetachControlDispatches: Story = {
  render: () => panelStory(historySectionWithControl(dispatchSpy)),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const detach = canvasElement.querySelector('[data-image-trail-detach="history"]');
    if (!(detach instanceof HTMLElement)) throw new Error('expected the detach control to render');
    await userEvent.click(detach);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'section/detach', sectionId: 'history' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
  },
};

export const RestorePathsDispatch: Story = {
  render: () => windowStory({}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const restore = canvasElement.querySelector('[data-image-trail-restore="history"]');
    if (!(restore instanceof HTMLElement)) throw new Error('expected the window restore control to render');
    await userEvent.click(restore);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'section/restore', sectionId: 'history' });

    dispatchSpy.mockClear();
    const windowEl = canvasElement.querySelector('[data-image-trail-detached-window="history"]');
    if (!(windowEl instanceof HTMLElement)) throw new Error('expected the detached window to render');
    await fireEvent.keyDown(windowEl, { key: 'Escape' });
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'section/restore', sectionId: 'history' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
  },
};

/** Mirrors the registry's generic control injection for a standalone section story. */
function historySectionWithControl(dispatch: (action: PanelAction) => void): HTMLElement {
  const section = createHistoryView(recentFixtures, [], false, true, mockDispatch(), {
    blobKeyAvailable: true,
    listBlockSize: null,
    onListResize: mockDispatch<number>('history resize'),
  });
  section.querySelector('.image-trail-panel__section-header')?.append(createSectionDetachControl('history', 'Recent history', dispatch));
  return section;
}

function windowStory(
  options: { readonly inlineSize?: number; readonly minimized?: boolean } = {},
  dispatch: (action: PanelAction) => void = mockDispatch(),
): HTMLElement {
  const content = createHistoryView(recentFixtures, [selectedRecord.id], false, true, dispatch, {
    blobKeyAvailable: true,
    listBlockSize: null,
    onListResize: mockDispatch<number>('history resize'),
  });
  const windowEl = createDetachedSectionWindow(
    {
      sectionId: 'history',
      sectionTitle: 'Recent history',
      geometry: { left: 16, top: 16, inlineSize: options.inlineSize ?? 340 },
      minimized: options.minimized,
      onPositionChange: mockDispatch('window position'),
      onMinimizedChange: mockDispatch('window minimized'),
    },
    content,
    dispatch,
  );
  return drawerStory(windowEl);
}

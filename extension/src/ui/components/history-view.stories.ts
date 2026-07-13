import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, fn, userEvent } from 'storybook/test';

import { createHistoryView } from './history-view.js';
import { resetPreviewRowClickTracking } from './record-row-preview-click.js';
import {
  capturedRecord,
  lockedPrivateRecord,
  longOverflowRecord,
  pinnedRecentRecord,
  recentFixtures,
  selectedRecord,
} from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Recent history',
  render: () => historyStory(recentFixtures, []),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

export const Empty: Story = {
  render: () => historyStory([], []),
};

export const Selected: Story = {
  render: () => historyStory(recentFixtures, [selectedRecord.id]),
};

export const PinnedAndCaptured: Story = {
  render: () => historyStory([pinnedRecentRecord, capturedRecord], []),
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector<HTMLElement>('.image-trail-panel__history-label');
    const row = canvasElement.querySelector<HTMLElement>('.image-trail-panel__history-item');
    const thumbnail = row?.querySelector<HTMLElement>('.image-trail-panel__record-thumbnail');
    if (!label) throw new Error('expected a two-row Recent label to render');
    if (!row || !thumbnail) throw new Error('expected a two-row Recent background to render');
    await expect(getComputedStyle(label).alignSelf).toBe('start');
    await expect(thumbnail.getBoundingClientRect().width).toBeGreaterThan(row.getBoundingClientRect().width * 0.95);
  },
};

export const ThreeRowsCentered: Story = {
  render: () => historyStory(recentFixtures.slice(0, 3), []),
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector<HTMLElement>('.image-trail-panel__history-label');
    if (!label) throw new Error('expected a three-row Recent label to render');
    await expect(getComputedStyle(label).alignSelf).toBe('center');
    await expect(getComputedStyle(label).paddingLeft).toBe('84px');
  },
};

export const LockedPrivate: Story = {
  render: () => historyStory([lockedPrivateRecord], []),
};

export const LongOverflow: Story = {
  render: () => historyStory([longOverflowRecord], []),
};

export const Narrow: Story = {
  render: () => historyStory(recentFixtures, [selectedRecord.id], { width: 300 }),
};

const dispatchSpy = fn();

export const SelectsRow: Story = {
  render: () => historyStory(recentFixtures, [], {}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const row = canvasElement.querySelector('[data-image-trail-row-id="recent-normal"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the recent-normal row to render');
    await userEvent.click(row);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'history-selection/select', ids: ['recent-normal'] });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockClear();
    await fireEvent.click(row, { ctrlKey: true });
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'history-selection/toggle', id: 'recent-normal' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
  },
};

export const PreviewsSelectedRow: Story = {
  render: () => historyStory(recentFixtures, ['recent-normal'], {}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    resetPreviewRowClickTracking();
    const row = canvasElement.querySelector('[data-image-trail-row-id="recent-normal"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the recent-normal row to render');
    // Preview requires a real double-click (#426): the first click re-selects, the second previews.
    await userEvent.dblClick(row);
    await expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'history-selection/select' }));
    await expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'capture/preview' }));
    await expect(dispatchSpy).toHaveBeenCalledTimes(2);
  },
};

function historyStory(
  items: Parameters<typeof createHistoryView>[0],
  selectedIds: readonly string[],
  options: { readonly width?: number } = {},
  dispatch: Parameters<typeof createHistoryView>[4] = mockDispatch(),
) {
  return panelStory(
    createHistoryView(items, selectedIds, false, true, dispatch, {
      blobKeyAvailable: true,
      listBlockSize: null,
      onListResize: mockDispatch<number>('history resize'),
    }),
    options,
  );
}

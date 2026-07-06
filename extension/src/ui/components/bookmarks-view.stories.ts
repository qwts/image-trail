import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, fn, userEvent } from 'storybook/test';

import { createBookmarksView } from './bookmarks-view.js';
import { resetPreviewRowClickTracking } from './record-row-preview-click.js';
import { bookmarkFixtures, capturedRecord, lockedPrivateRecord, longOverflowRecord } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Queue',
  render: () => bookmarksStory(bookmarkFixtures, []),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

export const EmptyQueue: Story = {
  render: () => bookmarksStory([], []),
};

export const SelectedQueue: Story = {
  render: () => bookmarksStory(bookmarkFixtures, ['queue-normal']),
};

export const CapturedOriginalIndicator: Story = {
  render: () => bookmarksStory([capturedRecord], []),
};

export const LockedPrivate: Story = {
  render: () => bookmarksStory([lockedPrivateRecord], []),
};

export const LongOverflow: Story = {
  render: () => bookmarksStory([longOverflowRecord], []),
};

export const Narrow: Story = {
  render: () => bookmarksStory(bookmarkFixtures, ['queue-normal'], { width: 300 }),
};

const dispatchSpy = fn();

export const SelectsRow: Story = {
  render: () => bookmarksStory(bookmarkFixtures, [], {}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const row = canvasElement.querySelector('[data-image-trail-scroll-anchor="bookmark:queue-normal"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the queue-normal row to render');
    await userEvent.click(row);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'bookmark-selection/single', id: 'queue-normal' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockClear();
    await fireEvent.click(row, { ctrlKey: true });
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'bookmark-selection/toggle', id: 'queue-normal' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
  },
};

export const PreviewsSelectedRow: Story = {
  render: () => bookmarksStory(bookmarkFixtures, ['queue-normal'], {}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    resetPreviewRowClickTracking();
    const row = canvasElement.querySelector('[data-image-trail-scroll-anchor="bookmark:queue-normal"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the queue-normal row to render');
    // Preview requires a real double-click (#426): the first click re-selects, the second previews.
    await userEvent.dblClick(row);
    await expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'bookmark-selection/single' }));
    await expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'capture/preview', scrollAnchorId: 'bookmark:queue-normal' }),
    );
    await expect(dispatchSpy).toHaveBeenCalledTimes(2);
  },
};

function bookmarksStory(
  items: Parameters<typeof createBookmarksView>[1],
  selectedIds: readonly string[],
  options: { readonly width?: number } = {},
  dispatch: Parameters<typeof createBookmarksView>[10] = mockDispatch(),
) {
  return panelStory(
    createBookmarksView(
      'https://images.example.test/gallery/current.jpg',
      items,
      selectedIds,
      false,
      true,
      true,
      'global',
      {
        offset: 0,
        limit: Math.max(items.length, 1),
        total: items.length,
        hasOlder: items.length > 2,
        hasNewer: false,
      },
      { recallOpen: false },
      { privacyMode: false },
      dispatch,
    ),
    options,
  );
}

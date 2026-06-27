import type { Meta, StoryObj } from '@storybook/html-vite';

import { createBookmarksView } from './bookmarks-view.js';
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

function bookmarksStory(
  items: Parameters<typeof createBookmarksView>[1],
  selectedIds: readonly string[],
  options: { readonly width?: number } = {},
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
      mockDispatch(),
    ),
    options,
  );
}

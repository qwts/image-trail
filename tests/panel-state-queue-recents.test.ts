import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import { isLockedPrivatePin } from '../extension/src/ui/panel/record-export-helpers.js';
import {
  PRIVACY_RECORD_META,
  PRIVACY_RECORD_NAME,
  recordDisplayName,
  recordMetadataText,
} from '../extension/src/ui/components/record-metadata.js';
import { selectedRangeIds } from '../extension/src/ui/components/selection-ranges.js';
import { recallDeleteCountForQueue } from '../extension/src/ui/recall-delete-count.js';
import { createPanelRecordFixture } from './support/panel-state-fixtures.js';

test('record selection toggles can span visible lists', () => {
  const state = {
    ...createInitialPanelState(),
    selectedBookmarkIds: ['bookmark-1'],
  };

  const historySelected = reducePanelAction(state, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historySelected.selectedHistoryIds, ['history-1']);
  assert.deepEqual(historySelected.selectedBookmarkIds, ['bookmark-1']);

  const historyUnselected = reducePanelAction(historySelected, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historyUnselected.selectedHistoryIds, []);

  const bookmarkSelected = reducePanelAction(historySelected, { name: 'bookmark-selection/toggle', id: 'bookmark-2' });
  assert.deepEqual(bookmarkSelected.selectedBookmarkIds, ['bookmark-1', 'bookmark-2']);
  assert.deepEqual(bookmarkSelected.selectedHistoryIds, ['history-1']);

  const historyCleared = reducePanelAction(
    { ...createInitialPanelState(), selectedHistoryIds: ['history-1', 'history-2'] },
    { name: 'history-selection/clear' },
  );
  assert.deepEqual(historyCleared.selectedHistoryIds, []);

  const bookmarksCleared = reducePanelAction(
    { ...createInitialPanelState(), selectedBookmarkIds: ['bookmark-1', 'bookmark-2'] },
    { name: 'bookmark-selection/clear' },
  );
  assert.deepEqual(bookmarksCleared.selectedBookmarkIds, []);
});

test('select-all and range actions update only their own selection surface', () => {
  const state = {
    ...createInitialPanelState(),
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
    recall: { ...createInitialPanelState().recall, selectedIds: ['recall-1'] },
  };

  const historySelected = reducePanelAction(state, {
    name: 'history-selection/select',
    ids: ['history-2', 'history-3', 'history-2'],
  });
  assert.deepEqual(historySelected.selectedHistoryIds, ['history-2', 'history-3']);
  assert.deepEqual(historySelected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(historySelected.recall.selectedIds, ['recall-1']);

  const bookmarkRange = reducePanelAction(historySelected, {
    name: 'bookmark-selection/select',
    ids: ['bookmark-2', 'bookmark-3'],
    mode: 'add',
  });
  assert.deepEqual(bookmarkRange.selectedBookmarkIds, ['bookmark-1', 'bookmark-2', 'bookmark-3']);
  assert.deepEqual(bookmarkRange.selectedHistoryIds, ['history-2', 'history-3']);

  const recallRange = reducePanelAction(bookmarkRange, {
    name: 'recall-selection/select',
    ids: ['recall-2', 'recall-3'],
    mode: 'add',
  });
  assert.deepEqual(recallRange.recall.selectedIds, ['recall-1', 'recall-2', 'recall-3']);
  assert.deepEqual(recallRange.selectedBookmarkIds, ['bookmark-1', 'bookmark-2', 'bookmark-3']);
});

test('select visible selects recents, visible queue rows, and loaded Recall rows', () => {
  const state = {
    ...createInitialPanelState(),
    activeDestination: 'recall' as const,
    history: [
      createPanelRecordFixture({ id: 'history-1', source: 'history' }),
      createPanelRecordFixture({ id: 'history-2', source: 'history', timestamp: '2026-06-20T00:00:01.000Z' }),
    ],
    bookmarks: [createPanelRecordFixture({ id: 'bookmark-1', source: 'bookmark' })],
    recall: {
      ...createInitialPanelState().recall,
      candidates: [
        {
          id: 'recall-1',
          url: 'https://example.test/recall-1.jpg',
          timestamp: '2026-06-20T00:00:00.000Z',
          source: 'bookmark' as const,
          envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    },
  };

  const selected = reducePanelAction(state, { name: 'selection/select-visible' });

  assert.deepEqual(selected.selectedHistoryIds, ['history-1', 'history-2']);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(selected.recall.selectedIds, ['recall-1']);
});

test('select visible ignores cached Recall rows while Recall is not active', () => {
  const state = {
    ...createInitialPanelState(),
    history: [createPanelRecordFixture({ id: 'history-1', source: 'history' })],
    bookmarks: [createPanelRecordFixture({ id: 'bookmark-1', source: 'bookmark' })],
    recall: {
      ...createInitialPanelState().recall,
      candidates: [
        {
          id: 'hidden-recall-1',
          url: 'https://example.test/hidden-recall-1.jpg',
          timestamp: '2026-06-20T00:00:00.000Z',
          source: 'bookmark' as const,
          envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    },
  };

  const selected = reducePanelAction(state, { name: 'selection/select-visible' });

  assert.deepEqual(selected.selectedHistoryIds, ['history-1']);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(selected.recall.selectedIds, []);
});

test('visible range selection uses the most recent selected anchor', () => {
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], ['b'], 'd'), ['b', 'c', 'd']);
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], ['a', 'c'], 'b'), ['b', 'c']);
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], [], 'c'), ['c']);
});

test('single bookmark selection clears history selection and selects only clicked bookmark', () => {
  const state = {
    ...createInitialPanelState(),
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1', 'bookmark-2'],
  };

  const selected = reducePanelAction(state, { name: 'bookmark-selection/single', id: 'bookmark-3' });

  assert.deepEqual(selected.selectedHistoryIds, []);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-3']);
});

test('clearing visible bookmarks is presentation-only state', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    selectedBookmarkIds: ['bookmark-1'],
    bookmarkTotal: 2,
    hasOlderBookmarks: true,
  };

  const cleared = reducePanelAction(state, { name: 'bookmarks/clear-visible' });

  assert.deepEqual(cleared.bookmarks, []);
  assert.deepEqual(cleared.selectedBookmarkIds, []);
  assert.equal(cleared.bookmarkTotal, 0);
  assert.equal(cleared.hasOlderBookmarks, false);
});

test('deleting recents drops transient history and selections', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'history' as const },
    ],
    selectedHistoryIds: ['history-1'],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const deleted = reducePanelAction(state, { name: 'history/delete-all' });

  assert.deepEqual(deleted.history, []);
  assert.deepEqual(deleted.selectedHistoryIds, []);
  assert.equal(deleted.bookmarks, state.bookmarks);
});

test('recall delete count is derived from durable queue totals', () => {
  assert.equal(recallDeleteCountForQueue({ bookmarkTotal: 47, bookmarkLimit: 3 }), 44);
  assert.equal(recallDeleteCountForQueue({ bookmarkTotal: 2, bookmarkLimit: 3 }), 0);
});

test('record selection prunes removed and unloaded rows', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    history: [
      { id: 'history-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'history' as const },
    ],
    selectedBookmarkIds: ['bookmark-1', 'bookmark-2'],
    selectedHistoryIds: ['history-1', 'history-2'],
  };

  const removedHistory = reducePanelAction(state, { name: 'history/remove', id: 'history-1' });
  assert.deepEqual(removedHistory.selectedHistoryIds, ['history-2']);

  const removedBookmark = reducePanelAction(state, { name: 'bookmark/remove', id: 'bookmark-1' });
  assert.deepEqual(removedBookmark.selectedBookmarkIds, ['bookmark-2']);

  const reloadedBookmarks = reducePanelAction(state, {
    name: 'bookmarks/page-loaded',
    bookmarks: [
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    offset: 0,
    limit: 30,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  assert.deepEqual(reloadedBookmarks.selectedBookmarkIds, ['bookmark-2']);
});

test('Recall destination loads candidates and toggles selection', () => {
  const state = createInitialPanelState();
  const opened = reducePanelAction(state, { name: 'recall/open' });
  const loading = reducePanelAction(opened, { name: 'recall/load-start' });
  const loaded = reducePanelAction(loading, {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'history' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: false,
    total: 1,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });
  const selected = reducePanelAction(loaded, { name: 'recall-selection/toggle', id: 'recall-1' });
  const closed = reducePanelAction(selected, { name: 'recall/close' });

  assert.equal(opened.activeDestination, 'recall');
  assert.equal(loading.recall.busy, true);
  assert.equal(loaded.recall.busy, false);
  assert.equal(loaded.recall.candidates.length, 1);
  assert.equal(loaded.recall.nextOffset, 31);
  assert.equal(loaded.recall.hasMore, false);
  assert.deepEqual(selected.recall.selectedIds, ['recall-1']);
  assert.equal(closed.activeDestination, null);
  assert.deepEqual(closed.recall.selectedIds, []);
});

test('clearing recall results does not mutate visible bookmarks', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: true,
    total: 4,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });
  const selected = reducePanelAction(state, { name: 'recall-selection/toggle', id: 'recall-1' });

  const cleared = reducePanelAction(selected, { name: 'recall/clear-results' });

  assert.deepEqual(cleared.recall.candidates, []);
  assert.deepEqual(cleared.recall.selectedIds, []);
  assert.equal(cleared.recall.hasMore, false);
  assert.equal(cleared.bookmarks.length, 0);
});

test('locked private placeholders are detected before image export', () => {
  assert.equal(
    isLockedPrivatePin({
      id: 'private-pin',
      url: 'image-trail-private:private-pin',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
      privacyStatus: 'locked',
    }),
    true,
  );
  assert.equal(
    isLockedPrivatePin({
      id: 'plain-pin',
      url: 'https://example.test/plain.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
    }),
    false,
  );
});

test('privacy display helpers mask row name and metadata only in privacy mode', () => {
  const record = {
    id: 'record-1',
    url: 'https://example.test/private-name.jpg',
    label: 'private-name.jpg',
    timestamp: '2026-06-20T00:00:00.000Z',
    width: 640,
    height: 480,
    source: 'bookmark' as const,
  };

  assert.equal(recordDisplayName(record), 'private-name.jpg');
  assert.notEqual(recordMetadataText(record), PRIVACY_RECORD_META);
  assert.equal(recordDisplayName(record, { privacyMode: true }), PRIVACY_RECORD_NAME);
  assert.equal(recordMetadataText(record, { privacyMode: true }), PRIVACY_RECORD_META);
});

test('recall drawer appends paged candidates without duplicating rows', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall-1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: true,
    total: 3,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });

  const appended = reducePanelAction(state, {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall-1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
      {
        id: 'recall-2',
        url: 'https://example.test/recall-2.jpg',
        timestamp: '2026-06-20T00:00:02.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:03.000Z',
      },
    ],
    append: true,
    offset: 31,
    nextOffset: 33,
    hasMore: false,
    total: 3,
    failedCount: 0,
    message: 'Loaded 2 recall records.',
  });

  assert.deepEqual(
    appended.recall.candidates.map((candidate) => candidate.id),
    ['recall-1', 'recall-2'],
  );
  assert.equal(appended.recall.hasMore, false);
});

test('recall message clear restores default instructions without clearing errors', () => {
  const loaded = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [],
    append: false,
    offset: 30,
    nextOffset: 30,
    hasMore: false,
    total: 0,
    failedCount: 0,
    message: 'Loaded 0 recall records.',
  });

  const staleClear = reducePanelAction(loaded, { name: 'recall/message-clear', message: 'Loaded 1 recall record.' });
  const cleared = reducePanelAction(loaded, { name: 'recall/message-clear', message: 'Loaded 0 recall records.' });
  const errored = reducePanelAction(loaded, { name: 'recall/error', message: 'Recall failed.' });
  const errorClear = reducePanelAction(errored, { name: 'recall/message-clear', message: 'Recall failed.' });

  assert.equal(staleClear.recall.message, 'Loaded 0 recall records.');
  assert.equal(cleared.recall.message, undefined);
  assert.equal(errorClear.recall.message, 'Recall failed.');
  assert.equal(errorClear.recall.messageIsError, true);
});

test('recall completion clears drawer state without mutating visible recents directly', () => {
  const baseHistory = [
    {
      id: 'history-1',
      url: 'https://example.test/history.jpg',
      timestamp: '2026-06-20T00:00:00.000Z',
      source: 'history' as const,
    },
  ];
  const recalled = [
    {
      id: 'bookmark-1',
      url: 'https://example.test/new.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark' as const,
    },
  ];

  const completed = reducePanelAction(
    {
      ...createInitialPanelState(),
      history: baseHistory,
      recall: { ...createInitialPanelState().recall, selectedIds: ['bookmark-1'], busy: true },
    },
    {
      name: 'recall/complete',
      records: recalled,
      failedCount: 0,
      message: 'Recalled 1 record.',
    },
  );

  assert.deepEqual(completed.history, baseHistory);
  assert.deepEqual(completed.recall.selectedIds, []);
  assert.equal(completed.recall.busy, false);
  assert.equal(completed.recall.message, 'Recalled 1 record.');
});

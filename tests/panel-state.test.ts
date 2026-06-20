import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldLoadFailureToState, reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState, setTargetState } from '../extension/src/core/state.js';
import type { UrlFieldSplitSpec } from '../extension/src/core/url/types.js';

test('switching active fields clears a previous failed field marker', () => {
  const failed = { ...createInitialPanelState(), activeFieldId: 'query-src-0', failedFieldId: 'query-src-0' };

  const next = reducePanelAction(failed, { name: 'active-field/set', id: 'query-page-0' });

  assert.equal(next.activeFieldId, 'query-page-0');
  assert.equal(next.failedFieldId, null);
});

test('target changes clear failed field markers', () => {
  const failed = {
    ...createInitialPanelState(),
    failedFieldId: 'query-src-0',
    successfulFieldIds: ['query-src-0'],
    unchangedFieldIds: ['query-page-0'],
    unlockedFieldIds: ['query-src-0'],
    manuallyExcludedFieldIds: ['query-src-0'],
    fieldSplitSpecs: [
      {
        baseFieldId: 'q:0:0',
        location: 'query' as const,
        queryIndex: 0,
        tokenIndex: 0,
        lengths: [2, 2, 4],
        pattern: '2-2-4',
      },
    ],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(failed, {
    mode: 'manual',
    picking: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    message: 'Target selected.',
  });

  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, []);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
  assert.equal(next.currentImageFingerprint, null);
});

test('same target load snapshots preserve learned field markers', () => {
  const learned = {
    ...createInitialPanelState(),
    target: {
      mode: 'manual' as const,
      picking: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-1.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      message: 'Target selected.',
    },
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: ['q:1:0'],
    unlockedFieldIds: ['q:0:0'],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(learned, {
    mode: 'manual',
    picking: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image-2.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    message: 'Target loaded.',
  });

  assert.deepEqual(next.successfulFieldIds, ['q:0:0']);
  assert.deepEqual(next.unchangedFieldIds, ['q:1:0']);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0']);
  assert.equal(next.currentImageFingerprint, 'a'.repeat(64));
});

test('Previous/Next inclusion toggle only changes successful fields', () => {
  const state = { ...createInitialPanelState(), successfulFieldIds: ['q:0:0'] };

  const included = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(included.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(included.manuallyExcludedFieldIds, []);

  const excluded = reducePanelAction(included, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const includedAgain = reducePanelAction(excluded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(includedAgain.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(includedAgain.manuallyExcludedFieldIds, []);

  const ignored = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:1:0' });
  assert.deepEqual(ignored.unlockedFieldIds, []);
  assert.deepEqual(ignored.manuallyExcludedFieldIds, []);
});

test('failed field load preserves Previous/Next inclusion choices', () => {
  const state = {
    ...createInitialPanelState(),
    successfulFieldIds: ['q:0:0', 'q:1:0'],
    unchangedFieldIds: ['q:0:0'],
    unlockedFieldIds: ['q:0:0', 'q:1:0'],
    manuallyExcludedFieldIds: ['q:2:0'],
  };

  const next = applyFieldLoadFailureToState(state, {
    draftUrl: 'https://example.test/missing.jpg?date=02012001&page=2',
    attemptedFieldIds: ['q:0:0', 'q:1:0'],
    message: 'Image failed to load: HTTP 404',
  });

  assert.equal(next.failedFieldId, 'q:0:0');
  assert.equal(next.draftUrl, 'https://example.test/missing.jpg?date=02012001&page=2');
  assert.deepEqual(next.successfulFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.manuallyExcludedFieldIds, ['q:2:0']);
});

test('record selection toggles one list at a time', () => {
  const state = {
    ...createInitialPanelState(),
    selectedBookmarkIds: ['bookmark-1'],
  };

  const historySelected = reducePanelAction(state, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historySelected.selectedHistoryIds, ['history-1']);
  assert.deepEqual(historySelected.selectedBookmarkIds, []);

  const historyUnselected = reducePanelAction(historySelected, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historyUnselected.selectedHistoryIds, []);

  const bookmarkSelected = reducePanelAction(
    {
      ...historySelected,
      selectedBookmarkIds: [],
    },
    { name: 'bookmark-selection/toggle', id: 'bookmark-2' },
  );
  assert.deepEqual(bookmarkSelected.selectedBookmarkIds, ['bookmark-2']);
  assert.deepEqual(bookmarkSelected.selectedHistoryIds, []);

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

test('clearing split specs collapses fields and clears related markers', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const state = {
    ...createInitialPanelState(),
    activeFieldId: 'q:0:2',
    failedFieldId: 'q:0:1',
    successfulFieldIds: ['q:0:0', 'q:0:2', 'q:1:0'],
    unchangedFieldIds: ['q:0:1'],
    unlockedFieldIds: ['q:0:0', 'q:0:2'],
    manuallyExcludedFieldIds: ['q:0:1'],
    fieldSplitSpecs: [splitSpec],
  };

  const next = reducePanelAction(state, { name: 'field-split/clear', baseFieldId: 'q:0:0' });

  assert.equal(next.activeFieldId, null);
  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, ['q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
});

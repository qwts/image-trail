import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldLoadFailureToState, reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState, setTargetState } from '../extension/src/core/state.js';
import { isLockedPrivatePin } from '../extension/src/ui/panel.js';
import {
  PRIVACY_RECORD_META,
  PRIVACY_RECORD_NAME,
  recordDisplayName,
  recordMetadataText,
} from '../extension/src/ui/components/record-metadata.js';
import { recallDeleteCountForQueue } from '../extension/src/ui/render.js';
import type { UrlFieldSplitSpec } from '../extension/src/core/url/types.js';
import type { UrlTemplateRecord } from '../extension/src/core/url/templates.js';

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
    grabModeActive: false,
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
      grabModeActive: false,
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
    grabModeActive: false,
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

test('Grab Mode actions expose sticky page-image grab status', () => {
  const state = createInitialPanelState();

  const started = reducePanelAction(state, { name: 'grab-mode/start' });
  assert.equal(started.status, 'ready');
  assert.match(started.message, /Grab Mode is active/u);

  const stopped = reducePanelAction(started, { name: 'grab-mode/stop' });
  assert.equal(stopped.status, 'ready');
  assert.equal(stopped.message, 'Grab Mode stopped.');
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

test('loaded active URL templates restore included fields for navigation', () => {
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 1,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'exact',
      pathShapeSignature: 'shape',
      querySignature: 'page:int',
    },
    fields: [
      {
        id: 'q:0:0',
        label: 'query page',
        placeholder: '{query-page}',
        location: 'query',
        tokenKind: 'int',
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: true,
    autoApplyEnabled: true,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const loaded = reducePanelAction(createInitialPanelState(), {
    name: 'url-templates/load',
    templates: [template],
    activeTemplateId: template.id,
  });
  assert.equal(loaded.activeUrlTemplateId, template.id);
  assert.deepEqual(loaded.unlockedFieldIds, ['q:0:0']);

  const excluded = reducePanelAction(loaded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const inactive = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-templates/load', templates: [template], activeTemplateId: null },
  );
  assert.equal(inactive.activeUrlTemplateId, null);
  assert.deepEqual(inactive.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(inactive.manuallyExcludedFieldIds, ['q:0:0', 'q:2:0']);

  const cleared = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-template/remove', id: template.id },
  );
  assert.equal(cleared.activeUrlTemplateId, null);
  assert.deepEqual(cleared.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(cleared.manuallyExcludedFieldIds, ['q:2:0']);
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

test('updating visible bookmark soft max resets the queue window', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarkOffset: 30,
    bookmarkLimit: 30,
  };

  const updated = reducePanelAction(state, { name: 'settings/update-visible-bookmark-soft-max', value: 10 });

  assert.equal(updated.bookmarkLimit, 10);
  assert.equal(updated.bookmarkOffset, 0);
});

test('toggling privacy mode does not mutate rows or selections', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
  };

  const updated = reducePanelAction(state, { name: 'settings/update-privacy-mode', enabled: true });

  assert.equal(updated.privacyModeEnabled, true);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
  assert.deepEqual(updated.selectedHistoryIds, ['history-1']);
  assert.deepEqual(updated.selectedBookmarkIds, ['bookmark-1']);
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

test('settings toggle opens and closes the panel settings section', () => {
  const opened = reducePanelAction(createInitialPanelState(), { name: 'settings/toggle' });
  assert.equal(opened.settingsOpen, true);

  const closed = reducePanelAction(opened, { name: 'settings/toggle' });
  assert.equal(closed.settingsOpen, false);
});

test('updating pin save storage preference only changes future save preference state', () => {
  const state = createInitialPanelState();
  const updated = reducePanelAction(state, { name: 'settings/update-pin-save-storage-preference', value: 'plaintext' });

  assert.equal(updated.pinSaveStoragePreference, 'plaintext');
  assert.equal(updated.bookmarkOffset, state.bookmarkOffset);
  assert.deepEqual(updated.bookmarks, state.bookmarks);
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

test('recall drawer loads candidates and toggles selection', () => {
  const state = createInitialPanelState();
  const opened = reducePanelAction(state, { name: 'recall/open', side: 'left' });
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

  assert.equal(opened.recall.open, true);
  assert.equal(opened.recall.side, 'left');
  assert.equal(loading.recall.busy, true);
  assert.equal(loaded.recall.busy, false);
  assert.equal(loaded.recall.candidates.length, 1);
  assert.equal(loaded.recall.nextOffset, 31);
  assert.equal(loaded.recall.hasMore, false);
  assert.deepEqual(selected.recall.selectedIds, ['recall-1']);
  assert.equal(closed.recall.open, false);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { createRuntimeHistoryState, getVisibleHistory, reduceRuntimeHistory } from '../extension/src/data/runtime/runtime-history.js';
import { UndoStack } from '../extension/src/data/runtime/undo-stack.js';

test('runtime history keeps loaded images newest-first, deduped, and visibly bounded', () => {
  let state = createRuntimeHistoryState(3, 5);
  for (let index = 0; index < 6; index += 1) {
    state = reduceRuntimeHistory(state, {
      name: 'history/add-loaded',
      item: { url: `https://example.test/${index}.jpg`, timestamp: `2026-06-17T00:00:0${index}.000Z` },
    });
  }

  state = reduceRuntimeHistory(state, {
    name: 'history/add-loaded',
    item: { url: 'https://example.test/3.jpg', timestamp: '2026-06-17T00:00:09.000Z' },
  });

  assert.deepEqual(
    state.items.map((item) => item.url),
    [
      'https://example.test/3.jpg',
      'https://example.test/5.jpg',
      'https://example.test/4.jpg',
      'https://example.test/2.jpg',
      'https://example.test/1.jpg',
    ],
  );
  assert.deepEqual(
    getVisibleHistory(state).map((item) => item.url),
    ['https://example.test/3.jpg', 'https://example.test/5.jpg', 'https://example.test/4.jpg'],
  );
});

test('history/add-loaded preserves session thumbnail for matching visible record', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/thumb.jpg',
    thumbnail: 'data:image/jpeg;base64,abc',
    timestamp: '2026-06-19T00:00:00.000Z',
  });

  assert.equal(state.history[0]?.thumbnail, 'data:image/jpeg;base64,abc');
});

test('history/mark-pinned records durable queue state on recent rows', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/pin.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
  });
  const recordId = state.history[0].id;

  state = reducePanelAction(state, {
    name: 'history/mark-pinned',
    id: recordId,
    pinnedAt: '2026-06-19T00:00:01.000Z',
    pinnedRecordId: 'bookmark-1',
  });

  assert.equal(state.history[0].pinnedAt, '2026-06-19T00:00:01.000Z');
  assert.equal(state.history[0].pinnedRecordId, 'bookmark-1');
});

test('history/add-loaded preserves durable state for matching visible recents', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/preserved.jpg',
    thumbnail: 'data:image/jpeg;base64,abc',
    timestamp: '2026-06-19T00:00:00.000Z',
  });
  const recordId = state.history[0].id;
  state = reducePanelAction(state, {
    name: 'history/mark-pinned',
    id: recordId,
    pinnedAt: '2026-06-19T00:00:01.000Z',
    pinnedRecordId: 'bookmark-1',
  });
  state = reducePanelAction(state, { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 100 },
    sourceRecordId: recordId,
  });

  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/preserved.jpg',
    timestamp: '2026-06-19T00:00:02.000Z',
  });

  assert.equal(state.history[0].id, recordId);
  assert.equal(state.history[0].pinnedRecordId, 'bookmark-1');
  assert.equal(state.history[0].captureStatus, 'captured');
  assert.equal(state.history[0].blobId, 'blob-1');
  assert.equal(state.history[0].thumbnail, 'data:image/jpeg;base64,abc');
});

test('bookmarks/page-loaded syncs captured original state to pinned recents', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/captured.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
  });
  const recordId = state.history[0].id;
  state = reducePanelAction(state, {
    name: 'history/mark-pinned',
    id: recordId,
    pinnedAt: '2026-06-19T00:00:01.000Z',
    pinnedRecordId: 'bookmark-1',
  });

  state = reducePanelAction(state, {
    name: 'bookmarks/page-loaded',
    bookmarks: [
      {
        id: 'bookmark-1',
        url: 'https://example.test/captured.jpg',
        title: 'Captured',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
        captureStatus: 'captured',
        blobId: 'blob-1',
        capturedAt: '2026-06-19T00:00:02.000Z',
        storedOriginal: {
          blobId: 'blob-1',
          mimeType: 'image/jpeg',
          byteLength: 100,
          capturedAt: '2026-06-19T00:00:02.000Z',
        },
      },
    ],
    offset: 0,
    limit: 30,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });

  assert.equal(state.history[0].captureStatus, 'captured');
  assert.equal(state.history[0].blobId, 'blob-1');
  assert.equal(state.history[0].storedOriginal?.blobId, 'blob-1');
});

test('bookmarks/page-loaded clears captured original state from exact pinned recents when queue row clears it', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.test/cleared.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
  });
  const recordId = state.history[0].id;
  state = reducePanelAction(state, {
    name: 'history/mark-pinned',
    id: recordId,
    pinnedAt: '2026-06-19T00:00:01.000Z',
    pinnedRecordId: 'bookmark-1',
  });
  state = reducePanelAction(state, { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 100 },
    sourceRecordId: recordId,
  });

  state = reducePanelAction(state, {
    name: 'bookmarks/page-loaded',
    bookmarks: [
      {
        id: 'bookmark-1',
        url: 'https://example.test/cleared.jpg',
        title: 'Cleared',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      },
    ],
    offset: 0,
    limit: 30,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });

  assert.equal(state.history[0].pinnedRecordId, 'bookmark-1');
  assert.equal(state.history[0].captureStatus, undefined);
  assert.equal(state.history[0].blobId, undefined);
  assert.equal(state.history[0].storedOriginal, undefined);
});

test('history/add-loaded uses the configured visible recent limit', () => {
  let state = reducePanelAction(createInitialPanelState(0), {
    name: 'settings/update-recent-history-retention',
    limit: 2,
    overflowBehavior: 'drop-oldest',
  });
  for (let index = 0; index < 3; index += 1) {
    state = reducePanelAction(state, {
      name: 'history/add-loaded',
      url: `https://example.test/${index}.jpg`,
      timestamp: `2026-06-19T00:00:0${index}.000Z`,
    });
  }

  assert.deepEqual(
    state.history.map((item) => item.url),
    ['https://example.test/2.jpg', 'https://example.test/1.jpg'],
  );
});

test('recent retention setting prunes visible rows and stale selections', () => {
  const state = {
    ...createInitialPanelState(0),
    history: [
      { id: 'history-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-19T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-19T00:00:01.000Z', source: 'history' as const },
      { id: 'history-3', url: 'https://example.test/3.jpg', timestamp: '2026-06-19T00:00:02.000Z', source: 'history' as const },
    ],
    selectedHistoryIds: ['history-1', 'history-3'],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-recent-history-retention',
    limit: 2,
    overflowBehavior: 'keep-session',
  });

  assert.deepEqual(
    updated.history.map((item) => item.id),
    ['history-1', 'history-2'],
  );
  assert.deepEqual(updated.selectedHistoryIds, ['history-1']);
  assert.equal(updated.recentHistoryLimit, 2);
  assert.equal(updated.recentHistoryOverflowBehavior, 'keep-session');
});

test('bookmark thumbnail refresh action is a reducer no-op', () => {
  const state = createInitialPanelState(0);
  assert.equal(reducePanelAction(state, { name: 'bookmarks/refresh-thumbnails' }), state);
});

test('undo stack returns session restore actions in last-action-first order', () => {
  const undo = new UndoStack<{ readonly name: 'bookmark/restore'; readonly id: string }>(2);
  undo.push({ label: 'Restore first', action: { name: 'bookmark/restore', id: 'first' } });
  undo.push({ label: 'Restore second', action: { name: 'bookmark/restore', id: 'second' } });
  undo.push({ label: 'Restore third', action: { name: 'bookmark/restore', id: 'third' } });

  assert.equal(undo.size, 2);
  assert.equal(undo.pop()?.action.id, 'third');
  assert.equal(undo.pop()?.action.id, 'second');
  assert.equal(undo.pop(), undefined);
});

test('target selection alone does not commit runtime history before load success', async () => {
  const { createInitialPanelState, setTargetState } = await import('../extension/src/core/state.js');
  const state = createInitialPanelState(0);
  const selected = setTargetState(
    state,
    {
      mode: 'manual',
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/pending.jpg',
      selectedHandleId: 'target-1',
      selectedDimensions: '640×480',
      fillScreen: false,
      objectFit: 'contain',
      message: 'Selected pending image.',
    },
    1,
  );

  assert.deepEqual(selected.history, []);
});

test('capture/start sets captureInProgress and clears previous result', () => {
  const initial = createInitialPanelState(0);
  const started = reducePanelAction(initial, { name: 'capture/start' });

  assert.equal(started.captureInProgress, true);
  assert.equal(started.captureResult, null);
});

test('capture/complete stores result and clears in-progress flag', () => {
  let state: PanelState = reducePanelAction(createInitialPanelState(0), { name: 'capture/start' });

  const result = { status: 'captured' as const, blobId: 'b-1', mimeType: 'image/png', byteLength: 2048 };
  state = reducePanelAction(state, { name: 'capture/complete', result });

  assert.equal(state.captureInProgress, false);
  assert.deepEqual(state.captureResult, result);
});

test('capture/complete with sourceRecordId updates matching history record', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, {
    name: 'history/add-loaded',
    url: 'https://example.com/img.jpg',
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  const recordId = state.history[0].id;

  state = reducePanelAction(state, { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'captured', blobId: 'blob-42', mimeType: 'image/jpeg', byteLength: 4096 },
    sourceRecordId: recordId,
  });

  assert.equal(state.history[0].captureStatus, 'captured');
  assert.equal(state.history[0].blobId, 'blob-42');
  assert.deepEqual(state.history[0].storedOriginal, {
    blobId: 'blob-42',
    mimeType: 'image/jpeg',
    byteLength: 4096,
    capturedAt: state.history[0].capturedAt,
  });
});

test('capture/complete with failed result does not modify records', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, { name: 'history/add-loaded', url: 'https://example.com/img.jpg' });
  const recordId = state.history[0].id;

  state = reducePanelAction(state, { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'failed', reason: 'too-large', message: 'Too big.' },
    sourceRecordId: recordId,
  });

  assert.equal(state.history[0].captureStatus, undefined);
  assert.equal(state.history[0].blobId, undefined);
  assert.equal(state.captureResult?.status, 'failed');
});

test('capture/clear dismisses the current capture result', () => {
  let state = reducePanelAction(createInitialPanelState(0), { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'failed', reason: 'network-error', message: 'Network down.' },
  });
  assert.ok(state.captureResult);

  state = reducePanelAction(state, { name: 'capture/clear' });
  assert.equal(state.captureResult, null);
});

test('capture/delete clears capture status and blobId from matching records', () => {
  let state = createInitialPanelState(0);
  state = reducePanelAction(state, { name: 'history/add-loaded', url: 'https://example.com/a.jpg' });
  const recordId = state.history[0].id;

  state = reducePanelAction(state, { name: 'capture/start' });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'captured', blobId: 'blob-99', mimeType: 'image/png', byteLength: 512 },
    sourceRecordId: recordId,
  });
  assert.equal(state.history[0].captureStatus, 'captured');

  state = reducePanelAction(state, { name: 'capture/delete', id: recordId, blobId: 'blob-99' });
  assert.equal(state.history[0].captureStatus, undefined);
  assert.equal(state.history[0].blobId, undefined);
});

test('capture/delete clears paired bookmark, recent, and recall original state by blob id', () => {
  const storedOriginal = {
    blobId: 'blob-paired',
    mimeType: 'image/jpeg',
    byteLength: 2048,
    capturedAt: '2026-06-28T01:00:00.000Z',
  };
  const capturedRecord = {
    id: 'bookmark-paired',
    url: 'https://example.test/paired.jpg',
    title: 'Paired',
    timestamp: '2026-06-28T00:59:00.000Z',
    source: 'bookmark' as const,
    captureStatus: 'captured' as const,
    blobId: 'blob-paired',
    capturedAt: storedOriginal.capturedAt,
    storedOriginal,
  };
  const state: PanelState = {
    ...createInitialPanelState(0),
    history: [
      {
        ...capturedRecord,
        id: 'recent-paired',
        source: 'history',
        pinnedRecordId: 'bookmark-paired',
        pinnedAt: '2026-06-28T00:59:00.000Z',
      },
    ],
    bookmarks: [capturedRecord],
    recall: {
      ...createInitialPanelState(0).recall,
      open: true,
      candidates: [{ ...capturedRecord, id: 'recall-paired', envelopeCreatedAt: '2026-06-28T00:58:00.000Z' }],
      selectedIds: ['recall-paired'],
      total: 1,
      nextOffset: 1,
    },
  };

  const updated = reducePanelAction(state, { name: 'capture/delete', id: 'recent-paired', blobId: 'blob-paired' });

  assert.equal(updated.history[0].captureStatus, undefined);
  assert.equal(updated.history[0].blobId, undefined);
  assert.equal(updated.history[0].capturedAt, undefined);
  assert.equal(updated.history[0].storedOriginal, undefined);
  assert.equal(updated.bookmarks[0].captureStatus, undefined);
  assert.equal(updated.bookmarks[0].blobId, undefined);
  assert.equal(updated.bookmarks[0].storedOriginal, undefined);
  assert.equal(updated.recall.candidates[0]?.captureStatus, undefined);
  assert.equal(updated.recall.candidates[0]?.blobId, undefined);
  assert.equal(updated.recall.candidates[0]?.storedOriginal, undefined);
});

test('bookmark/remove unlinks pinned recent rows and clears stale original state', () => {
  const state: PanelState = {
    ...createInitialPanelState(0),
    history: [
      {
        id: 'recent-linked',
        url: 'https://example.test/linked.jpg',
        timestamp: '2026-06-28T01:00:00.000Z',
        source: 'history',
        pinnedAt: '2026-06-28T01:00:01.000Z',
        pinnedRecordId: 'bookmark-linked',
        captureStatus: 'captured',
        blobId: 'blob-linked',
        capturedAt: '2026-06-28T01:00:02.000Z',
        storedOriginal: {
          blobId: 'blob-linked',
          mimeType: 'image/png',
          byteLength: 1024,
          capturedAt: '2026-06-28T01:00:02.000Z',
        },
      },
    ],
    bookmarks: [
      {
        id: 'bookmark-linked',
        url: 'https://example.test/linked.jpg',
        title: 'Linked',
        timestamp: '2026-06-28T01:00:01.000Z',
        source: 'bookmark',
        captureStatus: 'captured',
        blobId: 'blob-linked',
      },
    ],
    selectedBookmarkIds: ['bookmark-linked'],
    recall: {
      ...createInitialPanelState(0).recall,
      open: true,
      candidates: [
        {
          id: 'bookmark-linked',
          url: 'https://example.test/linked.jpg',
          title: 'Linked',
          timestamp: '2026-06-28T01:00:01.000Z',
          source: 'bookmark',
          envelopeCreatedAt: '2026-06-28T00:59:00.000Z',
        },
      ],
      selectedIds: ['bookmark-linked'],
      total: 1,
      nextOffset: 1,
    },
  };

  const updated = reducePanelAction(state, { name: 'bookmark/remove', id: 'bookmark-linked' });

  assert.deepEqual(updated.bookmarks, []);
  assert.deepEqual(updated.selectedBookmarkIds, []);
  assert.deepEqual(updated.recall.candidates, []);
  assert.deepEqual(updated.recall.selectedIds, []);
  assert.equal(updated.recall.nextOffset, 0);
  assert.equal(updated.recall.total, 0);
  assert.equal(updated.history[0].pinnedAt, undefined);
  assert.equal(updated.history[0].pinnedRecordId, undefined);
  assert.equal(updated.history[0].captureStatus, undefined);
  assert.equal(updated.history[0].blobId, undefined);
  assert.equal(updated.history[0].storedOriginal, undefined);
});

test('bookmark/clear hides the visible queue row without unlinking durable paired state', () => {
  const storedOriginal = {
    blobId: 'blob-clear-linked',
    mimeType: 'image/png',
    byteLength: 1024,
    capturedAt: '2026-06-28T01:00:02.000Z',
  };
  const state: PanelState = {
    ...createInitialPanelState(0),
    history: [
      {
        id: 'recent-clear-linked',
        url: 'https://example.test/clear-linked.jpg',
        timestamp: '2026-06-28T01:00:00.000Z',
        source: 'history',
        pinnedAt: '2026-06-28T01:00:01.000Z',
        pinnedRecordId: 'bookmark-clear-linked',
        captureStatus: 'captured',
        blobId: storedOriginal.blobId,
        capturedAt: storedOriginal.capturedAt,
        storedOriginal,
      },
    ],
    bookmarks: [
      {
        id: 'bookmark-clear-linked',
        url: 'https://example.test/clear-linked.jpg',
        title: 'Clear linked',
        timestamp: '2026-06-28T01:00:01.000Z',
        source: 'bookmark',
        captureStatus: 'captured',
        blobId: storedOriginal.blobId,
        capturedAt: storedOriginal.capturedAt,
        storedOriginal,
      },
    ],
    selectedBookmarkIds: ['bookmark-clear-linked'],
    recall: {
      ...createInitialPanelState(0).recall,
      open: true,
      candidates: [
        {
          id: 'bookmark-clear-linked',
          url: 'https://example.test/clear-linked.jpg',
          title: 'Clear linked',
          timestamp: '2026-06-28T01:00:01.000Z',
          source: 'bookmark',
          captureStatus: 'captured',
          blobId: storedOriginal.blobId,
          capturedAt: storedOriginal.capturedAt,
          storedOriginal,
          envelopeCreatedAt: '2026-06-28T00:59:00.000Z',
        },
      ],
      selectedIds: ['bookmark-clear-linked'],
      total: 1,
      nextOffset: 1,
    },
  };

  const updated = reducePanelAction(state, { name: 'bookmark/clear', id: 'bookmark-clear-linked' });

  assert.deepEqual(updated.bookmarks, []);
  assert.deepEqual(updated.selectedBookmarkIds, []);
  assert.equal(updated.history[0].pinnedRecordId, 'bookmark-clear-linked');
  assert.equal(updated.history[0].captureStatus, 'captured');
  assert.equal(updated.history[0].blobId, storedOriginal.blobId);
  assert.deepEqual(updated.history[0].storedOriginal, storedOriginal);
  assert.equal(updated.recall.candidates[0]?.id, 'bookmark-clear-linked');
  assert.deepEqual(updated.recall.selectedIds, ['bookmark-clear-linked']);
  assert.equal(updated.recall.candidates[0]?.storedOriginal?.blobId, storedOriginal.blobId);
});

test('storage/update sets storage usage summary on panel state', () => {
  let state = createInitialPanelState(0);
  assert.equal(state.storageUsage, null);

  state = reducePanelAction(state, { name: 'storage/update', usage: { totalBytes: 10240, blobCount: 2, orphanedBlobCount: 1 } });
  assert.deepEqual(state.storageUsage, { totalBytes: 10240, blobCount: 2, orphanedBlobCount: 1 });

  state = reducePanelAction(state, { name: 'storage/update', usage: { totalBytes: 0, blobCount: 0 } });
  assert.deepEqual(state.storageUsage, { totalBytes: 0, blobCount: 0 });
});

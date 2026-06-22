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

test('storage/update sets storage usage summary on panel state', () => {
  let state = createInitialPanelState(0);
  assert.equal(state.storageUsage, null);

  state = reducePanelAction(state, { name: 'storage/update', usage: { totalBytes: 10240, blobCount: 2, orphanedBlobCount: 1 } });
  assert.deepEqual(state.storageUsage, { totalBytes: 10240, blobCount: 2, orphanedBlobCount: 1 });

  state = reducePanelAction(state, { name: 'storage/update', usage: { totalBytes: 0, blobCount: 0 } });
  assert.deepEqual(state.storageUsage, { totalBytes: 0, blobCount: 0 });
});

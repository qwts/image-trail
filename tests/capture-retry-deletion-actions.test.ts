import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelAction, PanelState } from '../extension/src/core/types.js';
import { buildLibraryActionEntries } from '../extension/src/ui/panel/actions/library-actions.js';
import type { PanelActionDeps } from '../extension/src/ui/panel/actions/deps.js';

function createHarness(): {
  readonly deps: PanelActionDeps;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
} {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const record = (name: string) => {
    log.push(name);
    return Promise.resolve();
  };
  const deps = {
    getState: () => state,
    reduce: (action: PanelAction) => {
      state = reducePanelAction(state, action);
      log.push('reduce');
    },
    removeRecentHistory: () => record('removeRecentHistory'),
    deleteRecentHistory: () => record('deleteRecentHistory'),
    removeBookmark: () => record('removeBookmark'),
    deleteVisibleBookmarks: () => record('deleteVisibleBookmarks'),
  } as unknown as PanelActionDeps;
  return {
    deps,
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

test('source-row deletion clears a matching capture retry before asynchronous removal', () => {
  const historyRemove = createHarness();
  historyRemove.patchState({
    captureRetryRequest: { url: 'https://cdn.example.test/history.jpg', sourceType: 'history', sourceRecordId: 'history-1' },
  });
  buildLibraryActionEntries(historyRemove.deps)['history/remove'].handle({ name: 'history/remove', id: 'history-1' });
  assert.equal(historyRemove.getState().captureRetryRequest, null);
  assert.deepEqual(historyRemove.log, ['reduce', 'removeRecentHistory']);

  const historyDeleteAll = createHarness();
  historyDeleteAll.patchState({
    captureRetryRequest: { url: 'https://cdn.example.test/history.jpg', sourceType: 'history', sourceRecordId: 'history-1' },
  });
  buildLibraryActionEntries(historyDeleteAll.deps)['history/delete-all'].handle({ name: 'history/delete-all' });
  assert.equal(historyDeleteAll.getState().captureRetryRequest, null);
  assert.deepEqual(historyDeleteAll.log, ['reduce', 'deleteRecentHistory']);

  const bookmarkRemove = createHarness();
  bookmarkRemove.patchState({
    captureRetryRequest: { url: 'https://cdn.example.test/bookmark.jpg', sourceType: 'bookmark', sourceRecordId: 'bookmark-1' },
  });
  buildLibraryActionEntries(bookmarkRemove.deps)['bookmark/remove'].handle({ name: 'bookmark/remove', id: 'bookmark-1' });
  assert.equal(bookmarkRemove.getState().captureRetryRequest, null);
  assert.deepEqual(bookmarkRemove.log, ['reduce', 'removeBookmark']);

  const deleteVisible = createHarness();
  deleteVisible.patchState({
    bookmarks: [createDisplayRecord({ id: 'bookmark-1', url: 'https://cdn.example.test/bookmark.jpg', source: 'bookmark' })],
    captureRetryRequest: { url: 'https://cdn.example.test/bookmark.jpg', sourceType: 'bookmark', sourceRecordId: 'bookmark-1' },
  });
  buildLibraryActionEntries(deleteVisible.deps)['bookmarks/delete-visible'].handle({ name: 'bookmarks/delete-visible' });
  assert.equal(deleteVisible.getState().captureRetryRequest, null);
  assert.deepEqual(deleteVisible.log, ['reduce', 'deleteVisibleBookmarks']);
});

test('deleting another row leaves the retained capture retry intact', () => {
  const harness = createHarness();
  const request = { url: 'https://cdn.example.test/bookmark.jpg', sourceType: 'bookmark' as const, sourceRecordId: 'bookmark-1' };
  harness.patchState({ captureRetryRequest: request });

  buildLibraryActionEntries(harness.deps)['bookmark/remove'].handle({ name: 'bookmark/remove', id: 'bookmark-2' });

  assert.deepEqual(harness.getState().captureRetryRequest, request);
  assert.deepEqual(harness.log, ['removeBookmark']);
});

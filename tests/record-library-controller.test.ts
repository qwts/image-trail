import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState } from '../extension/src/core/types.js';
import type { RecentHistoryStore } from '../extension/src/content/recent-history-store.js';
import { RecordLibraryController, type RecordLibraryControllerDeps } from '../extension/src/ui/panel/record-library-controller.js';

interface Harness {
  readonly controller: RecordLibraryController;
  readonly log: string[];
  readonly savedBookmarks: ImageDisplayRecord[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

interface HarnessOptions {
  readonly bookmarkStore?: Partial<BookmarkStore> | null;
  readonly fetchThumbnailOk?: boolean;
  readonly thumbnailFromUrl?: string | null;
  readonly isProjectionActive?: () => boolean;
}

// Window-free paths only: the injected thumbnail-generator stubs replace the network/canvas seam,
// and recentHistoryStore is null so no code path reaches window.location (those flows are covered
// by tests/dom/record-library-controller.test.ts). Store fakes implement only the touched methods.
function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const savedBookmarks: ImageDisplayRecord[] = [];
  const defaultBookmarkStore: Partial<BookmarkStore> = {
    save: async (record) => {
      savedBookmarks.push(record);
      return record;
    },
    remove: async () => {},
    removeMany: async (ids) => {
      log.push(`removeMany:${ids.join(',')}`);
      return { removedCount: ids.length };
    },
  };
  const bookmarkStore = options.bookmarkStore === null ? null : { ...defaultBookmarkStore, ...options.bookmarkStore };
  const deps: RecordLibraryControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      log.push('render');
    },
    renderPanelAndRefreshRecall: () => {
      log.push('renderPanelAndRefreshRecall');
    },
    loadBookmarkPage: async (offset, opts) => {
      log.push(`loadBookmarkPage:${offset}:${String(opts?.render ?? true)}`);
    },
    refreshStorageUsage: async (opts) => {
      log.push(`refreshStorageUsage:${String(opts?.render ?? false)}`);
    },
    scheduleFiniteCaptureErrorReset: (_updatedAt, mode) => {
      log.push(`scheduleFiniteCaptureErrorReset:${mode}`);
    },
    findSelectedImage: () => null,
    isProjectionActive: options.isProjectionActive ?? (() => true),
    applySelectedUrl: async (url, attemptedFieldIds, opts) => {
      log.push(`applySelectedUrl:${url}:${attemptedFieldIds.length}:${opts.reason}`);
      return true;
    },
    removeCapturedBlobReference: async (blobId, opts) => {
      log.push(`removeCapturedBlobReference:${blobId}:${String(opts?.render ?? false)}`);
    },
    bookmarkStore: () => bookmarkStore as BookmarkStore | null,
    recentHistoryStore: () => null as RecentHistoryStore | null,
    createThumbnailDataUrlFromImage: async () => 'data:image/png;base64,from-image',
    createThumbnailDataUrlFromUrl: (async () =>
      options.thumbnailFromUrl === undefined
        ? 'data:image/png;base64,from-url'
        : options.thumbnailFromUrl) as RecordLibraryControllerDeps['createThumbnailDataUrlFromUrl'],
    createThumbnailDataUrlFromDataUrl: async (dataUrl) => dataUrl,
    fetchThumbnailSource: (async () =>
      options.fetchThumbnailOk === false
        ? { ok: false as const, reason: 'network-error' as const, message: 'offline' }
        : {
            ok: true as const,
            dataUrl: 'data:image/png;base64,fetched',
            mimeType: 'image/png',
            byteLength: 64,
          }) as RecordLibraryControllerDeps['fetchThumbnailSource'],
  };
  return {
    controller: new RecordLibraryController(deps),
    log,
    savedBookmarks,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function historyRecord(overrides: Partial<ImageDisplayRecord> = {}): ImageDisplayRecord {
  return createDisplayRecord({
    id: 'history-1',
    url: 'https://example.test/image-1.jpg',
    source: 'history',
    ...overrides,
  });
}

test('bookmarkUrl rejects an invalid URL without touching the bookmark store', async () => {
  const harness = createHarness();
  const saved = await harness.controller.bookmarkUrl('not-a-url');
  assert.equal(saved, false);
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /not a valid URL/);
  assert.deepEqual(harness.savedBookmarks, []);
  assert.deepEqual(harness.log, ['render']);
});

test('bookmarkUrl saves an http URL with the fetched preload thumbnail and refreshes in order', async () => {
  const harness = createHarness();
  const saved = await harness.controller.bookmarkUrl('https://example.test/image-1.jpg');
  assert.equal(saved, true);
  assert.equal(harness.savedBookmarks.length, 1);
  assert.equal(harness.savedBookmarks[0]?.thumbnail, 'data:image/png;base64,fetched');
  assert.equal(harness.getState().message, 'Added to Image Trail: https://example.test/image-1.jpg');
  assert.deepEqual(harness.log, ['loadBookmarkPage:0:false', 'renderPanelAndRefreshRecall', 'refreshStorageUsage:true']);
});

test('bookmarkUrl surfaces a failed thumbnail fetch as a finite error', async () => {
  const harness = createHarness({ fetchThumbnailOk: false });
  const saved = await harness.controller.bookmarkUrl('https://example.test/image-1.jpg');
  assert.equal(saved, false);
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /image failed to load: offline/);
  assert.deepEqual(harness.log, ['scheduleFiniteCaptureErrorReset:status', 'render']);
  assert.deepEqual(harness.savedBookmarks, []);
});

test('enqueueBookmarkMutation serializes work and keeps running after a rejection', async () => {
  const harness = createHarness();
  const order: string[] = [];
  let releaseFirst = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  harness.controller.enqueueBookmarkMutation(async () => {
    await firstGate;
    order.push('first');
    throw new Error('first failed');
  });
  harness.controller.enqueueBookmarkMutation(async () => {
    order.push('second');
  });
  assert.deepEqual(order, [], 'queued work must not run synchronously');
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ['first', 'second']);
});

test('saveRecentRecordAsBookmark re-keys http records to their URL but keeps data-URL record ids', async () => {
  const harness = createHarness();
  const httpRecord = historyRecord();
  const httpResult = await harness.controller.saveRecentRecordAsBookmark(httpRecord);
  assert.ok(httpResult.ok);
  assert.equal(httpResult.record.id, httpRecord.url);

  const dataRecord = historyRecord({ id: 'imported-1', url: 'data:image/png;base64,abc' });
  const dataResult = await harness.controller.saveRecentRecordAsBookmark(dataRecord);
  assert.ok(dataResult.ok);
  assert.equal(dataResult.record.id, 'imported-1');
});

test('saveRecentRecordAsBookmark reports unavailable storage and propagates saveResult failures', async () => {
  const noStore = createHarness({ bookmarkStore: null });
  const unavailable = await noStore.controller.saveRecentRecordAsBookmark(historyRecord());
  assert.deepEqual(unavailable, { ok: false, message: 'Bookmark storage is unavailable.' });

  const failing = createHarness({ bookmarkStore: { saveResult: async () => ({ ok: false as const, message: 'quota exceeded' }) } });
  const failed = await failing.controller.saveRecentRecordAsBookmark(historyRecord());
  assert.deepEqual(failed, { ok: false, message: 'quota exceeded' });
  assert.deepEqual(failing.log, [], 'a failed save must not page or render');
});

test('saveRecentRecordAsBookmark with render:false suppresses the recall refresh but still reloads the page', async () => {
  const harness = createHarness();
  const result = await harness.controller.saveRecentRecordAsBookmark(historyRecord(), { render: false });
  assert.ok(result.ok);
  assert.deepEqual(harness.log, ['loadBookmarkPage:0:false', 'refreshStorageUsage:false']);
});

test('pinRecentHistory surfaces a failed pin as an error state', async () => {
  const harness = createHarness({ bookmarkStore: { saveResult: async () => ({ ok: false as const, message: 'quota exceeded' }) } });
  harness.patchState({ history: [historyRecord()] });
  await harness.controller.pinRecentHistory('history-1');
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'quota exceeded');
  assert.deepEqual(harness.log, ['render']);
});

test('pinRecentHistory is a no-op for an unknown history id', async () => {
  const harness = createHarness();
  await harness.controller.pinRecentHistory('missing');
  assert.deepEqual(harness.log, []);
});

test('addRecentHistory bails out silently once its projection is superseded', async () => {
  const harness = createHarness({ isProjectionActive: () => false });
  await harness.controller.addRecentHistory('https://example.test/image-1.jpg', undefined, { projectionId: 'stale' });
  assert.deepEqual(harness.log, []);
  assert.deepEqual(harness.getState().history, []);
});

test('loadBookmark projects the bookmarked URL with the bookmark-load reason', async () => {
  const harness = createHarness();
  harness.patchState({ bookmarks: [historyRecord({ id: 'bookmark-1', source: 'bookmark' })] });
  await harness.controller.loadBookmark('bookmark-1');
  assert.deepEqual(harness.log, ['applySelectedUrl:https://example.test/image-1.jpg:0:bookmark-load']);
});

test('removeBookmark removes, re-pages the current offset, and refreshes recall', async () => {
  const harness = createHarness();
  harness.patchState({ bookmarks: [historyRecord({ id: 'bookmark-1', source: 'bookmark' })], bookmarkOffset: 20 });
  await harness.controller.removeBookmark('bookmark-1');
  assert.deepEqual(harness.log, ['loadBookmarkPage:20:false', 'renderPanelAndRefreshRecall', 'refreshStorageUsage:true']);
});

test('deleteVisibleBookmarks reports the removed count with pluralization', async () => {
  const harness = createHarness();
  harness.patchState({
    bookmarks: [historyRecord({ id: 'b-1', source: 'bookmark' }), historyRecord({ id: 'b-2', source: 'bookmark' })],
  });
  await harness.controller.deleteVisibleBookmarks();
  assert.ok(harness.log.includes('removeMany:b-1,b-2'));
  assert.equal(harness.getState().message, 'Deleted 2 queue items.');
});

test('refreshBookmarkThumbnails counts refreshed and unavailable thumbnails', async () => {
  const harness = createHarness({ thumbnailFromUrl: null });
  harness.patchState({
    bookmarks: [historyRecord({ id: 'b-1', source: 'bookmark' }), historyRecord({ id: 'b-2', source: 'bookmark' })],
  });
  await harness.controller.refreshBookmarkThumbnails();
  assert.equal(harness.getState().message, 'Refreshed 0 thumbnails; 2 unavailable.');
  assert.equal(harness.log.at(-1), 'renderPanelAndRefreshRecall');
});

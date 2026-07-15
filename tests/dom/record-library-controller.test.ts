import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState } from '../../extension/src/core/types.js';
import type { RecentHistoryStore } from '../../extension/src/content/recent-history-store.js';
import { RecordLibraryController, type RecordLibraryControllerDeps } from '../../extension/src/ui/panel/record-library-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise the paths that read
// window.location.href (recent-history store writes, recall deletion) and document.baseURI (the
// trusted-loaded-image URL validation), plus bookmarkCurrentImage against a real <img> element.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: RecordLibraryController;
  readonly log: string[];
  readonly savedBookmarks: ImageDisplayRecord[];
  readonly historyAddLog: { record: ImageDisplayRecord; pageUrl: string }[];
  readonly historyUpdateLog: { record: ImageDisplayRecord; pageUrl: string }[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

function createHarness(options: { readonly findSelectedImage?: () => HTMLImageElement | null } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const savedBookmarks: ImageDisplayRecord[] = [];
  const historyAddLog: { record: ImageDisplayRecord; pageUrl: string }[] = [];
  const historyUpdateLog: { record: ImageDisplayRecord; pageUrl: string }[] = [];
  let historyRows: ImageDisplayRecord[] = [];
  const bookmarkStore = {
    findByUrl: async () => null,
    save: async (record: ImageDisplayRecord) => {
      savedBookmarks.push(record);
      return record;
    },
    removeRecallPage: async (input: { readonly offset: number; readonly scope?: 'global' | 'site'; readonly currentPageUrl?: string }) => {
      log.push(`removeRecallPage:${input.offset}:${input.scope ?? 'none'}:${input.currentPageUrl}`);
      return { removedCount: 1 };
    },
  } as unknown as BookmarkStore;
  const recentHistoryStore = {
    add: async (record: ImageDisplayRecord, pageUrl: string) => {
      historyAddLog.push({ record, pageUrl });
      historyRows = [record, ...historyRows.filter((row) => row.id !== record.id)];
      return historyRows;
    },
    update: async (record: ImageDisplayRecord, pageUrl: string) => {
      historyUpdateLog.push({ record, pageUrl });
      historyRows = [record, ...historyRows.filter((row) => row.id !== record.id)];
      return historyRows;
    },
    remove: async (id: string, pageUrl: string) => {
      log.push(`historyRemove:${id}:${pageUrl}`);
      historyRows = historyRows.filter((row) => row.id !== id);
      return historyRows;
    },
  } as unknown as RecentHistoryStore;
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
    findSelectedImage: options.findSelectedImage ?? (() => null),
    isProjectionActive: () => true,
    applySelectedUrl: async () => true,
    removeCapturedBlobReference: async (blobId, opts) => {
      log.push(`removeCapturedBlobReference:${blobId}:${String(opts?.render ?? false)}`);
    },
    bookmarkStore: () => bookmarkStore,
    recentHistoryStore: () => recentHistoryStore,
    createThumbnailDataUrlFromImage: async () => 'data:image/png;base64,from-image',
    createThumbnailDataUrlFromUrl: async () => 'data:image/png;base64,from-url',
    createThumbnailDataUrlFromDataUrl: async (dataUrl) => dataUrl,
    fetchThumbnailSource: (async () => ({
      ok: true as const,
      dataUrl: 'data:image/png;base64,fetched',
      mimeType: 'image/png',
      byteLength: 64,
    })) as RecordLibraryControllerDeps['fetchThumbnailSource'],
  };
  return {
    controller: new RecordLibraryController(deps),
    log,
    savedBookmarks,
    historyAddLog,
    historyUpdateLog,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function capturedHistoryRecord(id: string, blobId?: string): ImageDisplayRecord {
  return createDisplayRecord({
    id,
    url: `https://images.example.test/${id}.jpg`,
    source: 'history',
    ...(blobId ? { captureStatus: 'captured' as const, blobId } : {}),
  });
}

test('addImportedImage rejects non-image data URLs', async () => {
  const harness = createHarness();
  assert.equal(await harness.controller.addImportedImage({ name: 'notes.txt', dataUrl: 'data:text/plain;base64,aGk=' }), false);
  assert.deepEqual(harness.log, []);
  assert.deepEqual(harness.savedBookmarks, []);
});

test('addImportedImage saves a paired bookmark and history row against the page URL', async () => {
  const harness = createHarness();
  const added = await harness.controller.addImportedImage({ name: 'photo.png', dataUrl: 'data:image/png;base64,abc' });
  assert.equal(added, true);
  assert.equal(harness.savedBookmarks.length, 1);
  assert.match(harness.savedBookmarks[0]?.id ?? '', /:photo\.png$/);
  assert.equal(harness.historyAddLog.length, 1);
  assert.match(harness.historyAddLog[0]?.record.id ?? '', /:history:photo\.png$/);
  assert.equal(harness.historyAddLog[0]?.pageUrl, 'https://images.example.test/gallery');
  assert.equal(harness.getState().history.length, 1);
  assert.deepEqual(harness.log, ['loadBookmarkPage:0:false', 'renderPanelAndRefreshRecall', 'refreshStorageUsage:true']);
});

test('removeRecentHistory removes the row first, then cleans up its encrypted blob with a render', async () => {
  const harness = createHarness();
  harness.patchState({ history: [capturedHistoryRecord('history-1', 'blob-1')] });
  await harness.controller.removeRecentHistory('history-1');
  assert.deepEqual(harness.log, [
    'historyRemove:history-1:https://images.example.test/gallery',
    'render',
    'removeCapturedBlobReference:blob-1:true',
  ]);
});

test('removeRecentHistory leaves linked durable originals intact', async () => {
  const harness = createHarness();
  harness.patchState({
    history: [capturedHistoryRecord('history-1', 'blob-1'), { ...capturedHistoryRecord('history-2', 'blob-2'), pinnedRecordId: 'pin-2' }],
  });

  await harness.controller.removeRecentHistory('history-2');

  assert.deepEqual(harness.log, ['historyRemove:history-2:https://images.example.test/gallery', 'render']);
});

test('deleteRecentHistory cleans blobs without rendering and refreshes storage once at the end', async () => {
  const harness = createHarness();
  harness.patchState({ history: [capturedHistoryRecord('history-1', 'blob-1'), capturedHistoryRecord('history-2')] });
  await harness.controller.deleteRecentHistory();
  assert.deepEqual(harness.log, [
    'historyRemove:history-1:https://images.example.test/gallery',
    'historyRemove:history-2:https://images.example.test/gallery',
    'render',
    'removeCapturedBlobReference:blob-1:false',
    'refreshStorageUsage:true',
  ]);
  assert.deepEqual(harness.getState().history, []);
});

test('deleteRecentHistory leaves linked durable originals intact', async () => {
  const harness = createHarness();
  harness.patchState({
    history: [capturedHistoryRecord('history-1', 'blob-1'), { ...capturedHistoryRecord('history-2', 'blob-2'), pinnedRecordId: 'pin-2' }],
  });

  await harness.controller.deleteRecentHistory();

  assert.deepEqual(harness.log, [
    'historyRemove:history-1:https://images.example.test/gallery',
    'historyRemove:history-2:https://images.example.test/gallery',
    'render',
    'removeCapturedBlobReference:blob-1:false',
    'refreshStorageUsage:true',
  ]);
});

test('markRecentHistoryRowPinned updates the original transient row and prunes stale selections', async () => {
  const harness = createHarness();
  const row = capturedHistoryRecord('history-1');
  harness.patchState({ history: [row], selectedHistoryIds: ['history-1', 'gone'] });
  const bookmark = createDisplayRecord({ ...row, id: row.url, source: 'bookmark' });
  await harness.controller.markRecentHistoryRowPinned('history-1', bookmark);
  assert.equal(harness.historyAddLog.length, 0);
  assert.equal(harness.historyUpdateLog.length, 1);
  assert.equal(harness.historyUpdateLog[0]?.record.pinnedRecordId, bookmark.id);
  assert.equal(harness.historyUpdateLog[0]?.pageUrl, 'https://images.example.test/gallery');
  assert.deepEqual(harness.getState().selectedHistoryIds, ['history-1']);
});

test('deleteRecallBookmarks pages by the visible soft max and scopes to the current page URL', async () => {
  const harness = createHarness();
  harness.patchState({ bookmarkLimit: 12 });
  await harness.controller.deleteRecallBookmarks();
  assert.ok(harness.log.includes('removeRecallPage:12:global:https://images.example.test/gallery'));
  assert.equal(harness.getState().message, 'Deleted 1 Recall item.');
});

test('bookmarkCurrentImage derives trust from a real image element and saves its thumbnail', async () => {
  const image = document.createElement('img');
  const harness = createHarness({ findSelectedImage: () => image });
  const initial = createInitialPanelState(0);
  harness.patchState({
    target: { ...initial.target, selectedUrl: 'https://images.example.test/pic.jpg', selectedHandleId: 'handle-1' },
  });
  await harness.controller.bookmarkCurrentImage();
  // A blank <img> is not complete/decoded, so trustLoadedImage is false and the URL goes through
  // the fetch-validated path; the thumbnail comes from the injected createThumbnailDataUrlFromImage.
  assert.equal(harness.savedBookmarks.length, 1);
  assert.equal(harness.savedBookmarks[0]?.thumbnail, 'data:image/png;base64,from-image');
});

test('a trusted loaded image resolves relative URLs against the document base', async () => {
  const harness = createHarness();
  const saved = await harness.controller.bookmarkUrl('pics/relative.jpg', undefined, { trustLoadedImage: true });
  assert.equal(saved, true);
  assert.equal(harness.savedBookmarks[0]?.url, 'https://images.example.test/pics/relative.jpg');
});

test('a trusted loaded image with a non-http scheme is rejected without saving', async () => {
  const harness = createHarness();
  const saved = await harness.controller.bookmarkUrl('blob:https://images.example.test/x', undefined, { trustLoadedImage: true });
  // Unlike the untrusted validation path, the trusted-image validator rejects silently — no error
  // state, no render — matching the panel's behavior before extraction.
  assert.equal(saved, false);
  assert.deepEqual(harness.savedBookmarks, []);
  assert.deepEqual(harness.log, []);
});

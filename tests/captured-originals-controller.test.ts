import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { CaptureResult, StorageUsageSummary } from '../extension/src/core/image/capture-result.js';
import type { BookmarkStore, PanelState } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { RecentHistoryStore } from '../extension/src/content/recent-history-store.js';
import {
  CapturedOriginalsController,
  type CapturedOriginalsControllerDeps,
} from '../extension/src/ui/panel/captured-originals-controller.js';

const USAGE: StorageUsageSummary = { blobCount: 2, totalBytes: 4096 };
const CAPTURED: CaptureResult = { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 2048 };

interface Harness {
  readonly controller: CapturedOriginalsController;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

interface HarnessOptions {
  readonly captureStore?: Partial<CaptureStore> | null;
  readonly bookmarkStore?: Partial<BookmarkStore> | null;
  readonly captureResult?: CaptureResult;
  readonly deleteBlobThrows?: boolean;
}

// Window-free capture paths only; the history-sourceType flow reaches window.location.href on its
// pin-failure branch and is covered by tests/dom/captured-originals-controller.test.ts.
function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const defaultCaptureStore: Partial<CaptureStore> = {
    requestCapture: async (url, sourceType) => {
      log.push(`requestCapture:${url}:${sourceType}`);
      return options.captureResult ?? CAPTURED;
    },
    requestDeleteBlob: async (blobId) => {
      log.push(`requestDeleteBlob:${blobId}`);
      if (options.deleteBlobThrows) throw new Error('delete failed');
      return { deleted: true, usage: USAGE };
    },
    requestCleanupOrphanedBlobs: async () => {
      log.push('requestCleanupOrphanedBlobs');
      return { deletedCount: 2, usage: USAGE };
    },
  };
  const defaultBookmarkStore: Partial<BookmarkStore> = {
    save: async (record: ImageDisplayRecord) => {
      log.push(`bookmarkSave:${record.id}`);
      return record;
    },
  };
  const captureStore = options.captureStore === null ? null : { ...defaultCaptureStore, ...options.captureStore };
  const bookmarkStore = options.bookmarkStore === null ? null : { ...defaultBookmarkStore, ...options.bookmarkStore };
  const deps: CapturedOriginalsControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: (opts) => {
      log.push(`render:${String(opts?.includeRecall ?? true)}`);
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
    applyStorageUsage: (usage) => {
      log.push(`applyStorageUsage:${usage.blobCount}`);
    },
    invalidateStorageUsageRequests: () => {
      log.push('invalidateStorageUsageRequests');
    },
    scheduleFiniteCaptureErrorReset: (_updatedAt, mode) => {
      log.push(`scheduleFiniteCaptureErrorReset:${mode}`);
    },
    refreshBlobKeyStatus: async () => {
      log.push('refreshBlobKeyStatus');
    },
    saveRecentRecordAsBookmark: async (record) => {
      log.push(`saveRecentRecordAsBookmark:${record.id}`);
      return { ok: true, record };
    },
    markRecentHistoryRowPinned: async (id) => {
      log.push(`markRecentHistoryRowPinned:${id}`);
    },
    captureStore: () => captureStore as CaptureStore | null,
    bookmarkStore: () => bookmarkStore as BookmarkStore | null,
    recentHistoryStore: () => null as RecentHistoryStore | null,
  };
  return {
    controller: new CapturedOriginalsController(deps),
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

test('captureImage is a silent no-op without a capture store or while a capture is in flight', async () => {
  const noStore = createHarness({ captureStore: null });
  await noStore.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.deepEqual(noStore.log, []);

  const busy = createHarness();
  busy.patchState({ captureInProgress: true });
  await busy.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.deepEqual(busy.log, []);
});

test('captureImage rejects non-durable URLs with a finite status error scheduled after the render', async () => {
  const harness = createHarness();
  await harness.controller.captureImage('blob:https://example.test/x', 'target');
  assert.equal(harness.getState().status, 'error');
  assert.equal(harness.getState().message, 'Only http(s) image URLs can be captured as encrypted originals.');
  assert.deepEqual(harness.log, ['render:true', 'scheduleFiniteCaptureErrorReset:status']);
});

test('captureImage refreshes the blob-key status on an encryption-locked failure, then schedules the capture-result reset', async () => {
  const harness = createHarness({
    captureResult: { status: 'failed', reason: 'encryption-locked', message: 'Encrypted storage is locked.' },
  });
  await harness.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.deepEqual(harness.log, [
    'render:true',
    'requestCapture:https://example.test/pic.jpg:target',
    'refreshBlobKeyStatus',
    'refreshStorageUsage:false',
    'scheduleFiniteCaptureErrorReset:capture-result',
    'render:true',
  ]);
});

test('captureImage target flow discards the captured blob when the pin cannot be saved', async () => {
  const harness = createHarness({
    bookmarkStore: { saveResult: async () => ({ ok: false as const, message: 'quota exceeded' }) },
  });
  await harness.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /discarded because the target pin was not saved: quota exceeded/);
  assert.ok(harness.log.includes('requestDeleteBlob:blob-1'), 'the orphaned blob must be deleted');
  assert.equal(harness.log.at(-1), 'render:true', 'a failed pin must not refresh the recall pipeline');
});

test('captureImage target flow discards the captured blob when bookmark storage is unavailable', async () => {
  const harness = createHarness({ bookmarkStore: null });
  await harness.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.match(harness.getState().message, /discarded because bookmark storage is unavailable/);
  assert.ok(harness.log.includes('requestDeleteBlob:blob-1'));
});

test('captureImage target flow saves a stored-original pin with parsed dimensions and refreshes recall', async () => {
  const initial = createInitialPanelState(0);
  const savedDrafts: ImageDisplayRecord[] = [];
  const capturing = createHarness({
    bookmarkStore: {
      saveResult: async (record) => {
        savedDrafts.push(record);
        return { ok: true as const, record };
      },
    },
  });
  capturing.patchState({ target: { ...initial.target, selectedDimensions: '800 x 600' } });
  await capturing.controller.captureImage('https://example.test/pic.jpg', 'target');
  assert.equal(savedDrafts.length, 1);
  assert.equal(savedDrafts[0]?.width, 800);
  assert.equal(savedDrafts[0]?.height, 600);
  assert.equal(savedDrafts[0]?.storedOriginal?.blobId, 'blob-1');
  assert.match(capturing.getState().message, /^Captured 2\.0 KB image\./);
  assert.equal(capturing.log.at(-1), 'renderPanelAndRefreshRecall');
  assert.ok(capturing.log.indexOf('refreshStorageUsage:false') < capturing.log.indexOf('renderPanelAndRefreshRecall'));
});

test('captureImage bookmark flow re-saves the updated bookmark and re-pages the current offset', async () => {
  const harness = createHarness();
  const bookmark = createDisplayRecord({ id: 'bookmark-1', url: 'https://example.test/pic.jpg', source: 'bookmark' });
  harness.patchState({ bookmarks: [bookmark], bookmarkOffset: 24 });
  await harness.controller.captureImage('https://example.test/pic.jpg', 'bookmark', 'bookmark-1');
  assert.ok(harness.log.includes('bookmarkSave:bookmark-1'));
  assert.ok(harness.log.includes('loadBookmarkPage:24:false'));
  assert.equal(harness.log.at(-1), 'renderPanelAndRefreshRecall');
});

test('cleanupOrphanedBlobs applies the usage, invalidates in-flight refreshes, and renders panel-only', async () => {
  const harness = createHarness();
  await harness.controller.cleanupOrphanedBlobs();
  assert.equal(harness.getState().message, 'Cleaned up 2 unused originals.');
  assert.equal(harness.getState().storageUsage?.blobCount, 2);
  assert.deepEqual(harness.log, ['requestCleanupOrphanedBlobs', 'invalidateStorageUsageRequests', 'render:false']);
});

test('removeCapturedBlobReference applies the returned usage and only renders when asked', async () => {
  const silent = createHarness();
  await silent.controller.removeCapturedBlobReference('blob-9');
  assert.deepEqual(silent.log, ['requestDeleteBlob:blob-9', 'applyStorageUsage:2']);

  const rendering = createHarness();
  await rendering.controller.removeCapturedBlobReference('blob-9', { render: true });
  assert.deepEqual(rendering.log, ['requestDeleteBlob:blob-9', 'applyStorageUsage:2', 'render:true']);
});

test('removeCapturedBlobReference falls back to a storage refresh when the delete fails', async () => {
  const harness = createHarness({ deleteBlobThrows: true });
  await harness.controller.removeCapturedBlobReference('blob-9', { render: true });
  assert.deepEqual(harness.log, ['requestDeleteBlob:blob-9', 'refreshStorageUsage:true']);
});

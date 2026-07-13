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
  readonly permissionRetryResult?: CaptureResult;
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
    requestPermissionAndRetry: async (url, sourceType, sourceRecordId) => {
      log.push(`requestPermissionAndRetry:${url}:${sourceType}:${sourceRecordId ?? ''}`);
      return options.permissionRetryResult ?? CAPTURED;
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
    findByUrl: async () => null,
    loadByIds: async () => [],
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

test('captureImage ignores a second request while saved-row lookup is pending', async () => {
  let resolveLookup: (record: ImageDisplayRecord | null) => void = () => {};
  const lookup = new Promise<ImageDisplayRecord | null>((resolve) => {
    resolveLookup = resolve;
  });
  let lookupCount = 0;
  const harness = createHarness({
    bookmarkStore: {
      findByUrl: async () => {
        lookupCount += 1;
        return lookup;
      },
    },
  });

  const first = harness.controller.captureImage('https://example.test/pic.jpg', 'target');
  const second = harness.controller.captureImage('https://example.test/pic.jpg', 'target');

  await second;
  assert.equal(lookupCount, 1);
  assert.deepEqual(harness.log, []);

  resolveLookup(null);
  await first;

  assert.equal(harness.log.filter((entry) => entry === 'requestCapture:https://example.test/pic.jpg:target').length, 1);
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

test('retryCaptureWithPermission preserves context after denial', async () => {
  const request = { url: 'https://cdn.example.test/pic.jpg', sourceType: 'history' as const, sourceRecordId: 'recent-1' };
  const harness = createHarness({
    permissionRetryResult: { status: 'failed', reason: 'permission-needed', message: 'Permission was not granted.' },
  });
  harness.patchState({ captureRetryRequest: request });

  await harness.controller.retryCaptureWithPermission(request);

  assert.equal(harness.getState().captureInProgress, false);
  assert.deepEqual(harness.getState().captureRetryRequest, request);
  assert.deepEqual(harness.log, [
    'render:true',
    'requestPermissionAndRetry:https://cdn.example.test/pic.jpg:history:recent-1',
    'refreshStorageUsage:false',
    'render:true',
  ]);
});

test('retryCaptureWithPermission uses normal target completion after grant', async () => {
  const request = { url: 'https://cdn.example.test/pic.jpg', sourceType: 'target' as const };
  const harness = createHarness();
  harness.patchState({ captureRetryRequest: request });

  await harness.controller.retryCaptureWithPermission(request);

  assert.equal(harness.getState().captureRetryRequest, null);
  assert.ok(harness.log.includes('requestPermissionAndRetry:https://cdn.example.test/pic.jpg:target:'));
  assert.ok(harness.log.includes('bookmarkSave:https://cdn.example.test/pic.jpg'));
  assert.equal(harness.log.at(-1), 'renderPanelAndRefreshRecall');
});

test('retryCaptureWithPermission ignores a request that is no longer retained', async () => {
  const harness = createHarness();

  await harness.controller.retryCaptureWithPermission({
    url: 'https://cdn.example.test/pic.jpg',
    sourceType: 'history',
    sourceRecordId: 'recent-deleted',
  });

  assert.deepEqual(harness.log, []);
});

test('permission retry deletes a captured blob when its retained row is removed in flight', async () => {
  for (const sourceType of ['history', 'bookmark'] as const) {
    let resolveRetry: (result: CaptureResult) => void = () => {};
    const retryResult = new Promise<CaptureResult>((resolve) => {
      resolveRetry = resolve;
    });
    const request = {
      url: `https://cdn.example.test/${sourceType}.jpg`,
      sourceType,
      sourceRecordId: `${sourceType}-deleted`,
    };
    const harness = createHarness({
      captureStore: { requestPermissionAndRetry: async () => retryResult },
    });
    harness.patchState({ captureRetryRequest: request });

    const pending = harness.controller.retryCaptureWithPermission(request);
    await Promise.resolve();
    harness.patchState({ captureRetryRequest: null });
    resolveRetry(CAPTURED);
    await pending;

    assert.ok(harness.log.includes('requestDeleteBlob:blob-1'), sourceType);
    assert.equal(
      harness.log.some((entry) => entry.startsWith('bookmarkSave:')),
      false,
      sourceType,
    );
    assert.equal(harness.getState().captureInProgress, false, sourceType);
    assert.equal(harness.getState().captureResult?.status, 'failed', sourceType);
    assert.equal(
      harness.getState().message,
      `Captured original was discarded because its ${sourceType === 'history' ? 'recent' : 'queue'} row was removed.`,
    );
  }
});

test('captureImage skips target capture when a saved row already has an original', async () => {
  const existing = createDisplayRecord({
    id: 'bookmark-existing',
    url: 'https://example.test/pic.jpg',
    label: 'pic.jpg',
    source: 'bookmark',
    captureStatus: 'captured',
    blobId: 'blob-existing',
    storedOriginal: {
      blobId: 'blob-existing',
      mimeType: 'image/jpeg',
      byteLength: 4096,
      capturedAt: '2026-06-19T00:00:01.000Z',
    },
  });
  const harness = createHarness({ bookmarkStore: { findByUrl: async () => existing } });

  await harness.controller.captureImage('https://example.test/pic.jpg', 'target');

  assert.equal(harness.log.includes('requestCapture:https://example.test/pic.jpg:target'), false);
  assert.equal(harness.getState().message, 'Original already stored for pic.jpg.');
  assert.deepEqual(harness.log, ['loadBookmarkPage:0:false', 'renderPanelAndRefreshRecall']);
});

test('repairBookmarkOriginal bypasses stale stored-original metadata and preserves queue time', async () => {
  const existing = createDisplayRecord({
    id: 'bookmark-existing',
    url: 'https://example.test/pic.jpg',
    source: 'bookmark',
    queueUpdatedAt: '2026-06-19T00:00:01.000Z',
    captureStatus: 'captured',
    blobId: 'blob-missing',
    storedOriginal: {
      blobId: 'blob-missing',
      mimeType: 'image/jpeg',
      byteLength: 4096,
      capturedAt: '2026-06-19T00:00:01.000Z',
    },
  });
  const savedDrafts: ImageDisplayRecord[] = [];
  const harness = createHarness({
    bookmarkStore: {
      findByUrl: async () => existing,
      save: async (record) => {
        savedDrafts.push(record);
        return record;
      },
    },
  });
  harness.patchState({ bookmarks: [existing] });

  const result = await harness.controller.repairBookmarkOriginal(existing);

  assert.equal(result?.status, 'captured');
  assert.ok(harness.log.includes('requestCapture:https://example.test/pic.jpg:bookmark'));
  assert.equal(savedDrafts[0]?.storedOriginal?.blobId, 'blob-1');
  assert.equal(savedDrafts[0]?.queueUpdatedAt, existing.queueUpdatedAt);
});

test('captureImage target flow updates an existing uncaptured saved row', async () => {
  const existing = createDisplayRecord({ id: 'bookmark-existing', url: 'https://example.test/pic.jpg', source: 'bookmark' });
  const savedDrafts: ImageDisplayRecord[] = [];
  const harness = createHarness({
    bookmarkStore: {
      findByUrl: async () => existing,
      saveResult: async (record) => {
        savedDrafts.push(record);
        return { ok: true as const, record: { ...record, id: existing.id } };
      },
    },
  });

  await harness.controller.captureImage('https://example.test/pic.jpg', 'target');

  assert.ok(harness.log.includes('requestCapture:https://example.test/pic.jpg:target'));
  assert.equal(savedDrafts[0]?.url, existing.url);
  assert.equal(savedDrafts[0]?.storedOriginal?.blobId, 'blob-1');
  assert.equal(harness.log.at(-1), 'renderPanelAndRefreshRecall');
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

test('deleteCapturedBlob updates a linked saved row even when it is not visible', async () => {
  const storedOriginal = {
    blobId: 'blob-1',
    mimeType: 'image/jpeg',
    byteLength: 2048,
    capturedAt: '2026-06-19T00:00:01.000Z',
  };
  const saved = createDisplayRecord({
    id: 'bookmark-existing',
    url: 'https://example.test/pic.jpg',
    source: 'bookmark',
    captureStatus: 'captured',
    blobId: storedOriginal.blobId,
    storedOriginal,
  });
  const savedDrafts: ImageDisplayRecord[] = [];
  const harness = createHarness({
    bookmarkStore: {
      loadByIds: async () => [saved],
      save: async (record) => {
        savedDrafts.push(record);
        return record;
      },
    },
  });
  harness.patchState({
    history: [
      createDisplayRecord({
        id: 'history-1',
        url: saved.url,
        source: 'history',
        pinnedRecordId: saved.id,
        captureStatus: 'captured',
        blobId: storedOriginal.blobId,
        storedOriginal,
      }),
    ],
    bookmarkOffset: 12,
  });

  await harness.controller.deleteCapturedBlob('history-1', 'blob-1');

  assert.equal(savedDrafts.length, 1);
  assert.equal(savedDrafts[0]?.id, saved.id);
  assert.equal(savedDrafts[0]?.captureStatus, undefined);
  assert.equal(savedDrafts[0]?.storedOriginal, undefined);
  assert.ok(harness.log.includes('loadBookmarkPage:12:false'));
  assert.ok(harness.log.includes('renderPanelAndRefreshRecall'));
  assert.ok(harness.log.includes('requestDeleteBlob:blob-1'));
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

import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { CaptureResult, StorageUsageSummary } from '../../extension/src/core/image/capture-result.js';
import type { BookmarkStore, PanelState } from '../../extension/src/core/types.js';
import type { CaptureStore } from '../../extension/src/content/capture-controller.js';
import type { RecentHistoryStore } from '../../extension/src/content/recent-history-store.js';
import {
  CapturedOriginalsController,
  type CapturedOriginalsControllerDeps,
} from '../../extension/src/ui/panel/captured-originals-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) for the history-sourceType flows
// that write recent rows back against window.location.href (the pin-failure re-add in captureImage
// and the row re-add in deleteCapturedBlob).
window.location.href = 'https://images.example.test/gallery';

const USAGE: StorageUsageSummary = { blobCount: 1, totalBytes: 1024 };
const CAPTURED: CaptureResult = { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 3072 };

interface Harness {
  readonly controller: CapturedOriginalsController;
  readonly log: string[];
  readonly historyAddLog: { record: ImageDisplayRecord; pageUrl: string }[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

function createHarness(options: { readonly pinFails?: boolean } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const historyAddLog: { record: ImageDisplayRecord; pageUrl: string }[] = [];
  const captureStore = {
    requestCapture: async () => CAPTURED,
    requestDeleteBlob: async (blobId: string) => {
      log.push(`requestDeleteBlob:${blobId}`);
      return { deleted: true, usage: USAGE };
    },
  } as unknown as CaptureStore;
  const bookmarkStore = {
    save: async (record: ImageDisplayRecord) => {
      log.push(`bookmarkSave:${record.id}`);
      return record;
    },
  } as unknown as BookmarkStore;
  const recentHistoryStore = {
    add: async (record: ImageDisplayRecord, pageUrl: string) => {
      historyAddLog.push({ record, pageUrl });
      log.push(`historyAdd:${record.id}`);
      return [record];
    },
  } as unknown as RecentHistoryStore;
  const deps: CapturedOriginalsControllerDeps = {
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
    refreshStorageUsage: async () => {
      log.push('refreshStorageUsage');
    },
    applyStorageUsage: () => {
      log.push('applyStorageUsage');
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
      if (options.pinFails) return { ok: false, message: 'quota exceeded' };
      return { ok: true, record: createDisplayRecord({ ...record, id: record.url, source: 'bookmark' }) };
    },
    markRecentHistoryRowPinned: async (id) => {
      log.push(`markRecentHistoryRowPinned:${id}`);
    },
    captureStore: () => captureStore,
    bookmarkStore: () => bookmarkStore,
    recentHistoryStore: () => recentHistoryStore,
  };
  return {
    controller: new CapturedOriginalsController(deps),
    log,
    historyAddLog,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function historyRow(id: string, blobId?: string): ImageDisplayRecord {
  return createDisplayRecord({
    id,
    url: `https://images.example.test/${id}.jpg`,
    source: 'history',
    ...(blobId ? { captureStatus: 'captured' as const, blobId } : {}),
  });
}

test('captureImage history flow pins the row and reports the combined capture message', async () => {
  const harness = createHarness();
  harness.patchState({ history: [historyRow('history-1')] });
  await harness.controller.captureImage('https://images.example.test/history-1.jpg', 'history', 'history-1');
  const savedAt = harness.log.indexOf('saveRecentRecordAsBookmark:history-1');
  const pinnedAt = harness.log.indexOf('markRecentHistoryRowPinned:history-1');
  assert.ok(savedAt !== -1 && pinnedAt !== -1 && savedAt < pinnedAt, `pin order wrong: ${harness.log.join(', ')}`);
  assert.match(harness.getState().message, /^Captured 3\.0 KB image\. Added to Image Trail:/);
  assert.equal(harness.log.at(-1), 'renderPanelAndRefreshRecall');
});

test('captureImage history flow re-adds the row against the page URL when the pin fails', async () => {
  const harness = createHarness({ pinFails: true });
  harness.patchState({ history: [historyRow('history-1')] });
  await harness.controller.captureImage('https://images.example.test/history-1.jpg', 'history', 'history-1');
  assert.equal(harness.historyAddLog.length, 1);
  assert.equal(harness.historyAddLog[0]?.pageUrl, 'https://images.example.test/gallery');
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /but the recent row was not pinned: quota exceeded/);
  assert.equal(harness.log.at(-1), 'render', 'a failed pin must not refresh the recall pipeline');
});

test('deleteCapturedBlob re-adds the history row, re-saves the bookmark, and fires the blob cleanup last', async () => {
  const harness = createHarness();
  const record = historyRow('record-1', 'blob-1');
  harness.patchState({
    history: [record],
    bookmarks: [createDisplayRecord({ ...record, id: 'record-1', source: 'bookmark' })],
    bookmarkOffset: 12,
  });
  await harness.controller.deleteCapturedBlob('record-1', 'blob-1');
  assert.ok(harness.log.includes('historyAdd:record-1'));
  assert.ok(harness.log.includes('bookmarkSave:record-1'));
  assert.ok(harness.log.includes('loadBookmarkPage:12:false'));
  const renderAt = harness.log.indexOf('renderPanelAndRefreshRecall');
  const deleteAt = harness.log.indexOf('requestDeleteBlob:blob-1');
  assert.ok(
    renderAt !== -1 && deleteAt !== -1 && renderAt < deleteAt,
    `fire-and-forget cleanup must come after the render: ${harness.log.join(', ')}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(harness.log.includes('applyStorageUsage'), 'the deferred blob cleanup must complete');
});

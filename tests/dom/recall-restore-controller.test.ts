import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState, UrlReviewStatusStore } from '../../extension/src/core/types.js';
import type { CaptureStore } from '../../extension/src/content/capture-controller.js';
import type { RecentHistoryStore } from '../../extension/src/content/recent-history-store.js';
import { DEFAULT_LOCAL_SETTINGS, exportPlainHistory } from '../../extension/src/content/panel-services.js';
import { historyRecordToExportEntry } from '../../extension/src/ui/panel/record-export-helpers.js';
import { RecallRestoreController, type RecallRestoreControllerDeps } from '../../extension/src/ui/panel/recall-restore-controller.js';

// The history restore path reads window.location.href (in importHistory and the retained-history
// duplicate check), so this suite runs under happy-dom (tests/dom/register.ts preload).
window.location.href = 'https://images.example.test/gallery';

function history(url: string): ImageDisplayRecord {
  return createDisplayRecord({ url, source: 'history', timestamp: '2026-06-20T00:00:00.000Z' });
}

interface RestoreHarness {
  readonly controller: RecallRestoreController;
  getState(): PanelState;
  readonly addedHistory: ImageDisplayRecord[];
}

function createRestoreHarness(retained: readonly ImageDisplayRecord[] = []): RestoreHarness {
  let state = createInitialPanelState(0);
  const addedHistory: ImageDisplayRecord[] = [];

  const recentHistoryStore = {
    load: async () => retained,
    add: async (record: ImageDisplayRecord) => {
      addedHistory.push(record);
      return addedHistory;
    },
  } as unknown as RecentHistoryStore;

  const deps: RecallRestoreControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    renderPanelAndRefreshRecall: () => {},
    loadBookmarkPage: async () => {},
    loadRecentHistory: async () => {},
    refreshStorageUsage: async () => {},
    addImportedImage: async () => true,
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    bookmarkStore: () => null as BookmarkStore | null,
    albumStore: () => null,
    captureStore: () => null as CaptureStore | null,
    recentHistoryStore: () => recentHistoryStore,
    urlReviewStatusStore: () => null as UrlReviewStatusStore | null,
    listPCloudBackups: (async () => ({ ok: false, message: 'unused' })) as unknown as RecallRestoreControllerDeps['listPCloudBackups'],
    downloadPCloudBackup: (async () => ({
      ok: false,
      message: 'unused',
    })) as unknown as RecallRestoreControllerDeps['downloadPCloudBackup'],
    loadAllBookmarks: async () => [],
    refreshBlobKeyStatus: async () => {},
  };

  return { controller: new RecallRestoreController(deps), getState: () => state, addedHistory };
}

test('history preview → confirm imports the records into the recent-history store', async () => {
  const fileContent = exportPlainHistory({
    entries: [historyRecordToExportEntry(history('https://images.example.test/one.jpg'))],
  }).fileContent!;
  const harness = createRestoreHarness();

  await harness.controller.previewHistoryImport(fileContent, '');
  await harness.controller.confirmRestorePreview();

  assert.deepEqual(
    harness.addedHistory.map((record) => record.url),
    ['https://images.example.test/one.jpg'],
  );
  assert.match(harness.getState().message, /Imported 1 record/u);
});

test('history preview skips a duplicate already retained in recent history', async () => {
  const fileContent = exportPlainHistory({
    entries: [historyRecordToExportEntry(history('https://images.example.test/dup.jpg'))],
  }).fileContent!;
  const harness = createRestoreHarness([history('https://images.example.test/dup.jpg')]);

  await harness.controller.previewHistoryImport(fileContent, '');
  await harness.controller.confirmRestorePreview();

  assert.equal(harness.addedHistory.length, 0, 'the duplicate record is not re-imported');
  assert.match(harness.getState().message, /1 duplicate record/u);
});

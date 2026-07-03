import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState, UrlReviewStatusRecord, UrlReviewStatusStore } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { RecentHistoryStore } from '../extension/src/content/recent-history-store.js';
import { DEFAULT_LOCAL_SETTINGS, exportPlainBookmarks, exportUrlReviewStatus } from '../extension/src/content/panel-services.js';
import { bookmarkRecordToExportEntry } from '../extension/src/ui/panel/record-export-helpers.js';
import { RecallRestoreController, type RecallRestoreControllerDeps } from '../extension/src/ui/panel/recall-restore-controller.js';

function bookmark(url: string): ImageDisplayRecord {
  return createDisplayRecord({ url, source: 'bookmark', timestamp: '2026-06-20T00:00:00.000Z' });
}

function urlReviewRecord(sourceUrl: string): UrlReviewStatusRecord {
  return {
    schemaVersion: 1,
    hostname: 'images.example.test',
    pageUrl: 'https://images.example.test/gallery',
    sourceUrl,
    status: 'passed',
    fieldIds: ['field-1'],
    activeFieldId: 'field-1',
    updatedAt: '2026-06-20T00:00:00.000Z',
  };
}

interface RestoreHarnessConfig {
  readonly existingBookmarks?: readonly ImageDisplayRecord[];
}

interface RestoreHarness {
  readonly controller: RecallRestoreController;
  getState(): PanelState;
  readonly savedBookmarks: ImageDisplayRecord[];
  readonly importedStatusRecords: (readonly UrlReviewStatusRecord[])[];
  readonly importedImages: number;
}

// Store harness backed by canned fakes. previewBookmarksImport reaches loadAllBookmarks only through the
// injected dep (no window), so the bookmarks/url-review-status flows are window-free; the history flow
// (which touches window.location.href) is covered by tests/dom/recall-restore-controller.test.ts.
function createRestoreHarness(config: RestoreHarnessConfig = {}): RestoreHarness {
  let state = createInitialPanelState(0);
  const savedBookmarks: ImageDisplayRecord[] = [];
  const importedStatusRecords: (readonly UrlReviewStatusRecord[])[] = [];
  let importedImages = 0;

  const bookmarkStore = {
    save: async (record: ImageDisplayRecord) => {
      savedBookmarks.push(record);
      return record;
    },
  } as unknown as BookmarkStore;

  const urlReviewStatusStore = {
    importMany: async (records: readonly UrlReviewStatusRecord[]) => {
      importedStatusRecords.push(records);
      return records.length;
    },
  } as unknown as UrlReviewStatusStore;

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
    addImportedImage: async () => {
      importedImages += 1;
      return true;
    },
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    bookmarkStore: () => bookmarkStore,
    captureStore: () => null as CaptureStore | null,
    recentHistoryStore: () => null as RecentHistoryStore | null,
    urlReviewStatusStore: () => urlReviewStatusStore,
    listPCloudBackups: (async () => ({ ok: false, message: 'unused' })) as unknown as RecallRestoreControllerDeps['listPCloudBackups'],
    downloadPCloudBackup: (async () => ({
      ok: false,
      message: 'unused',
    })) as unknown as RecallRestoreControllerDeps['downloadPCloudBackup'],
    loadAllBookmarks: async () => config.existingBookmarks ?? [],
    refreshBlobKeyStatus: async () => {},
  };

  return {
    controller: new RecallRestoreController(deps),
    getState: () => state,
    savedBookmarks,
    importedStatusRecords,
    get importedImages() {
      return importedImages;
    },
  };
}

test('bookmarks preview → confirm imports only the unique entries and reports the duplicate count', async () => {
  const fileContent = exportPlainBookmarks({
    entries: [
      bookmarkRecordToExportEntry(bookmark('https://images.example.test/dup.jpg')),
      bookmarkRecordToExportEntry(bookmark('https://images.example.test/new.jpg')),
    ],
  }).fileContent!;
  const harness = createRestoreHarness({ existingBookmarks: [bookmark('https://images.example.test/dup.jpg')] });

  await harness.controller.previewBookmarksImport(fileContent, '');
  await harness.controller.confirmRestorePreview();

  assert.deepEqual(
    harness.savedBookmarks.map((record) => record.url),
    ['https://images.example.test/new.jpg'],
    'only the non-duplicate bookmark is persisted',
  );
  assert.match(harness.getState().message, /Imported 1 bookmark/u);
  assert.match(harness.getState().message, /1 duplicate bookmark/u);
});

test('url-review-status preview → confirm persists records via the store', async () => {
  const fileContent = exportUrlReviewStatus({ records: [urlReviewRecord('https://images.example.test/one.jpg')] }).fileContent!;
  const harness = createRestoreHarness();

  harness.controller.previewUrlReviewStatusImport(fileContent);
  await harness.controller.confirmRestorePreview();

  assert.equal(harness.importedStatusRecords.length, 1, 'importMany is called once');
  assert.deepEqual(
    harness.importedStatusRecords[0]!.map((record) => record.sourceUrl),
    ['https://images.example.test/one.jpg'],
  );
  assert.match(harness.getState().message, /saved to extension state/u);
});

test('cancelRestorePreview clears the pending import so confirm has nothing to apply', async () => {
  const fileContent = exportUrlReviewStatus({ records: [urlReviewRecord('https://images.example.test/one.jpg')] }).fileContent!;
  const harness = createRestoreHarness();
  harness.controller.previewUrlReviewStatusImport(fileContent);

  harness.controller.cancelRestorePreview();
  await harness.controller.confirmRestorePreview();

  assert.match(harness.getState().message, /Choose an import file before confirming restore\./u);
  assert.equal(harness.importedStatusRecords.length, 0, 'nothing is imported after cancel');
});

test('importImages delegates each file to addImportedImage and reports the count', async () => {
  const harness = createRestoreHarness();

  await harness.controller.importImages([
    { name: 'a.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' },
    { name: 'b.jpg', dataUrl: 'data:image/jpeg;base64,BBBB' },
  ]);

  assert.equal(harness.importedImages, 2);
  assert.match(harness.getState().message, /Imported 2 images into bookmarks and recent history\./u);
});

test('previewPCloudRestoreFile requires a cloud password before downloading', async () => {
  const harness = createRestoreHarness();

  await harness.controller.previewPCloudRestoreFile(1, 'backup.json', 'abc');

  assert.match(harness.getState().pcloudBackup.message ?? '', /Enter the cloud backup password/u);
});

test('choosePCloudRestoreFile surfaces a listing failure as a restore error', async () => {
  const harness = createRestoreHarness();

  await harness.controller.choosePCloudRestoreFile();

  assert.match(harness.getState().pcloudBackup.message ?? '', /unused/u);
});

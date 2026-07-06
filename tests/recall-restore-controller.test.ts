import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState, UrlReviewStatusRecord, UrlReviewStatusStore } from '../extension/src/core/types.js';
import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { RecentHistoryStore } from '../extension/src/content/recent-history-store.js';
import {
  DEFAULT_LOCAL_SETTINGS,
  exportEncryptedFullBackup,
  exportPlainBookmarks,
  exportUrlReviewStatus,
  type AlbumBackupEntry,
} from '../extension/src/content/panel-services.js';
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
  readonly albumImports: {
    readonly albums: readonly AlbumBackupEntry[];
    readonly recordIdMap: ReadonlyMap<string, string>;
  }[];
  readonly importedStatusRecords: (readonly UrlReviewStatusRecord[])[];
  readonly importedImages: number;
}

// Store harness backed by canned fakes. previewBookmarksImport reaches loadAllBookmarks only through the
// injected dep (no window), so the bookmarks/url-review-status flows are window-free; the history flow
// (which touches window.location.href) is covered by tests/dom/recall-restore-controller.test.ts.
function createRestoreHarness(config: RestoreHarnessConfig = {}): RestoreHarness {
  let state = createInitialPanelState(0);
  const savedBookmarks: ImageDisplayRecord[] = [];
  const albumImports: {
    readonly albums: readonly AlbumBackupEntry[];
    readonly recordIdMap: ReadonlyMap<string, string>;
  }[] = [];
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
    albumStore: () => ({
      importBackupEntries: async (albums, recordIdMap) => {
        albumImports.push({ albums, recordIdMap: new Map(recordIdMap) });
        const requestedMembershipCount = albums.reduce((sum, album) => sum + album.recordIds.length, 0);
        const importedMembershipCount = albums.reduce(
          (sum, album) => sum + album.recordIds.filter((recordId) => recordIdMap.has(recordId)).length,
          0,
        );
        return {
          importedAlbumCount: albums.length,
          importedMembershipCount,
          skippedMembershipCount: requestedMembershipCount - importedMembershipCount,
        };
      },
    }),
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
    albumImports,
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

test('full backup restore remaps album memberships to duplicate and imported local record ids', async () => {
  const duplicateBackup = createDisplayRecord({
    id: 'backup-dup',
    url: 'https://images.example.test/dup.jpg',
    source: 'bookmark',
    timestamp: '2026-06-20T00:00:00.000Z',
  });
  const newBackup = createDisplayRecord({
    id: 'backup-new',
    url: 'https://images.example.test/new.jpg',
    source: 'bookmark',
    timestamp: '2026-06-20T00:00:01.000Z',
  });
  const localDuplicate = createDisplayRecord({
    id: 'local-dup',
    url: duplicateBackup.url,
    source: 'bookmark',
    timestamp: '2026-06-19T00:00:00.000Z',
  });
  const exported = await exportEncryptedFullBackup({
    bookmarks: [bookmarkRecordToExportEntry(duplicateBackup), bookmarkRecordToExportEntry(newBackup)],
    albums: [
      {
        id: 'backup-album',
        name: 'Restored',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        recordIds: ['backup-dup', 'backup-new', 'missing-record'],
      },
    ],
    originalBlobs: [],
    password: 'backup-pass',
    now: '2026-06-20T00:00:00.000Z',
  });
  assert.ok(exported.status.ok, exported.status.message);
  const harness = createRestoreHarness({ existingBookmarks: [localDuplicate] });

  await harness.controller.previewBookmarksImport(exported.fileContent!, 'backup-pass');
  await harness.controller.confirmRestorePreview();

  assert.deepEqual(
    harness.savedBookmarks.map((record) => record.id),
    ['backup-new'],
  );
  assert.equal(harness.albumImports.length, 1);
  assert.equal(harness.albumImports[0]!.recordIdMap.get('backup-dup'), 'local-dup');
  assert.equal(harness.albumImports[0]!.recordIdMap.get('backup-new'), 'backup-new');
  assert.equal(harness.albumImports[0]!.recordIdMap.has('missing-record'), false);
  assert.match(harness.getState().message, /Restored 1 album with 2 memberships/u);
  assert.match(harness.getState().message, /Skipped 1 album membership/u);
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

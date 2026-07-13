import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState, UrlReviewStatusStore } from '../../extension/src/core/types.js';
import type { CaptureStore } from '../../extension/src/content/capture-controller.js';
import { DEFAULT_LOCAL_SETTINGS, importBookmarks, type AlbumBackupEntry } from '../../extension/src/content/panel-services.js';
import { PRIVATE_PIN_EXPORT_LOCKED_MESSAGE } from '../../extension/src/ui/panel/record-export-helpers.js';
import { RecallExportController, type RecallExportControllerDeps } from '../../extension/src/ui/panel/recall-export-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload). backupPCloudNow reaches
// window.location.href via loadAllBookmarksForExport, so it needs the DOM globals; the pCloud client
// and stores are injected fakes, and the real full-backup encryption runs (crypto is available in node).
window.location.href = 'https://images.example.test/gallery';

const CONNECTED_STATUS = { connected: true, apiHost: 'api.pcloud.com' as const, connectedAt: '2026-01-01T00:00:00.000Z' };

function bookmark(overrides: Partial<ImageDisplayRecord> = {}): ImageDisplayRecord {
  return createDisplayRecord({
    url: 'https://images.example.test/one.jpg',
    source: 'bookmark',
    timestamp: '2026-06-20T00:00:00.000Z',
    ...overrides,
  });
}

interface ExportHarnessConfig {
  readonly bookmarks?: readonly ImageDisplayRecord[];
  readonly albums?: readonly AlbumBackupEntry[];
  readonly captureStore?: Partial<Record<keyof CaptureStore, unknown>>;
}

interface ExportHarness {
  readonly controller: RecallExportController;
  getState(): PanelState;
  readonly requestedOriginalBlobIds: string[][];
  readonly uploads: { readonly fileName: string; readonly fileContent: string }[];
}

function createExportHarness(config: ExportHarnessConfig = {}): ExportHarness {
  let state = createInitialPanelState(0);
  const requestedOriginalBlobIds: string[][] = [];
  const uploads: { readonly fileName: string; readonly fileContent: string }[] = [];

  const bookmarkStore = {
    loadPage: async () => ({
      items: config.bookmarks ?? [],
      offset: 0,
      limit: 100,
      total: config.bookmarks?.length ?? 0,
      hasOlder: false,
      hasNewer: false,
    }),
  } as unknown as BookmarkStore;

  const captureStore = {
    requestOriginalBlobRecords: async (blobIds: readonly string[]) => {
      requestedOriginalBlobIds.push([...blobIds]);
      return { ok: true as const, records: [], missingBlobIds: [...blobIds] };
    },
    ...config.captureStore,
  } as unknown as CaptureStore;

  const deps: RecallExportControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    renderPanelAndRefreshRecall: () => {},
    loadBookmarkPage: async () => {},
    getLocalSettings: () => DEFAULT_LOCAL_SETTINGS,
    findSelectedImage: () => null,
    bookmarkStore: () => bookmarkStore,
    albumStore: () => ({ listBackupEntries: async () => config.albums ?? [] }),
    captureStore: () => captureStore,
    urlReviewStatusStore: () => null as UrlReviewStatusStore | null,
    loadPCloudProviderStatus: (async () => ({ connected: false })) as RecallExportControllerDeps['loadPCloudProviderStatus'],
    connectPCloudProvider: (async () => ({ ok: true, status: CONNECTED_STATUS })) as RecallExportControllerDeps['connectPCloudProvider'],
    disconnectPCloudProvider: (async () => ({
      ok: true,
      status: { connected: false },
    })) as RecallExportControllerDeps['disconnectPCloudProvider'],
    uploadPCloudBackup: (async (input: { readonly fileName: string; readonly fileContent: string }) => {
      uploads.push({ fileName: input.fileName, fileContent: input.fileContent });
      const uploadedAt = '2026-06-20T00:00:00.000Z';
      const sha256 = 'a'.repeat(64);
      return {
        ok: true,
        status: CONNECTED_STATUS,
        fileId: 42,
        fileName: input.fileName,
        folderPath: '/Image Trail',
        apiHost: 'api.pcloud.com',
        sizeBytes: input.fileContent.length,
        sha256,
        uploadedAt,
        verificationMethod: 'download-byte-match',
        historyRecord: {
          schemaVersion: 1,
          provider: 'pcloud',
          destination: '/Image Trail/backups',
          fileName: input.fileName,
          completedAt: uploadedAt,
          sizeBytes: input.fileContent.length,
          sha256,
          verificationMethod: 'download-byte-match',
        },
        historyPersisted: true,
        message: 'Uploaded encrypted backup to pCloud.',
      };
    }) as RecallExportControllerDeps['uploadPCloudBackup'],
  };

  return { controller: new RecallExportController(deps), getState: () => state, requestedOriginalBlobIds, uploads };
}

test('backupPCloudNow blocks a locked private pin with the export-locked message', async () => {
  const harness = createExportHarness({ bookmarks: [bookmark({ privacyStatus: 'locked' })] });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.equal(harness.getState().pcloudBackup.message, PRIVATE_PIN_EXPORT_LOCKED_MESSAGE);
  assert.equal(harness.uploads.length, 0);
});

test('backupPCloudNow rejects an empty backup set', async () => {
  const harness = createExportHarness({ bookmarks: [] });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.match(harness.getState().pcloudBackup.message ?? '', /No durable pins, bookmarks, or albums to back up\./u);
  assert.equal(harness.uploads.length, 0);
});

test('backupPCloudNow collects full-backup original blob ids from stored originals', async () => {
  const harness = createExportHarness({
    bookmarks: [bookmark({ storedOriginal: { blobId: 'blob-1' } as ImageDisplayRecord['storedOriginal'] })],
    captureStore: {
      // Short-circuit before the crypto stage to assert only the blob-id collection.
      requestOriginalBlobRecords: async (blobIds: readonly string[]) => ({ ok: false as const, message: `collected:${blobIds.join(',')}` }),
    },
  });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.equal(harness.getState().pcloudBackup.message, 'collected:blob-1');
  assert.equal(harness.uploads.length, 0);
});

test('backupPCloudNow uploads an encrypted backup and reports success', async () => {
  const harness = createExportHarness({
    bookmarks: [bookmark({ id: 'bookmark-1' })],
    albums: [
      {
        id: 'album-1',
        name: 'Reference',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        recordIds: ['bookmark-1'],
      },
    ],
  });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.equal(harness.uploads.length, 1, 'the encrypted backup is uploaded');
  assert.ok(harness.uploads[0]!.fileContent.length > 0, 'the uploaded backup has encrypted content');
  const imported = await importBookmarks(harness.uploads[0]!.fileContent, 'cloud-pass');
  assert.deepEqual(
    imported.albums.map((album) => ({ name: album.name, recordIds: album.recordIds })),
    [{ name: 'Reference', recordIds: ['bookmark-1'] }],
  );
  assert.equal(harness.getState().pcloudBackup.lastBackupMissingOriginalCount, 0);
  assert.equal(harness.getState().pcloudBackup.messageIsError, false);
});

test('backupPCloudNow uploads album-only backups', async () => {
  const harness = createExportHarness({
    bookmarks: [],
    albums: [
      {
        id: 'empty-album',
        name: 'Empty album',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        recordIds: [],
      },
    ],
  });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.equal(harness.uploads.length, 1, 'the album-only backup is uploaded');
  const imported = await importBookmarks(harness.uploads[0]!.fileContent, 'cloud-pass');
  assert.equal(imported.entries.length, 0);
  assert.deepEqual(
    imported.albums.map((album) => ({ name: album.name, recordIds: album.recordIds })),
    [{ name: 'Empty album', recordIds: [] }],
  );
  assert.equal(harness.getState().pcloudBackup.messageIsError, false);
});

test('backupPCloudNow surfaces the missing-original count in the completion state', async () => {
  const harness = createExportHarness({
    bookmarks: [bookmark({ storedOriginal: { blobId: 'blob-1' } as ImageDisplayRecord['storedOriginal'] })],
  });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.deepEqual(harness.requestedOriginalBlobIds, [['blob-1']]);
  assert.equal(harness.uploads.length, 1);
  assert.equal(harness.getState().pcloudBackup.lastBackupMissingOriginalCount, 1);
});

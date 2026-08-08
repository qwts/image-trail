import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState, UrlReviewStatusStore } from '../../extension/src/core/types.js';
import type { CaptureStore } from '../../extension/src/content/capture-controller.js';
import { DEFAULT_LOCAL_SETTINGS, type AlbumBackupEntry } from '../../extension/src/content/panel-services.js';
import { decryptCloudBackupManifest, decryptCloudBackupPart } from '../../extension/src/data/import-export/chunked-cloud-backup.js';
import type { PCloudBackupUploadInput } from '../../extension/src/core/cloud/pcloud-provider.js';
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
  readonly selectedBookmarkIds?: readonly string[];
  readonly albums?: readonly AlbumBackupEntry[];
  readonly captureStore?: Partial<Record<keyof CaptureStore, unknown>>;
  readonly failUploadAttempt?: number;
}

interface ExportHarness {
  readonly controller: RecallExportController;
  getState(): PanelState;
  readonly requestedOriginalBlobIds: string[][];
  readonly uploads: { readonly fileId: number; readonly fileName: string; readonly fileContent: string; readonly recordHistory: boolean }[];
  readonly cleanups: readonly number[][];
  readonly backupCompletions: number;
}

function createExportHarness(config: ExportHarnessConfig = {}): ExportHarness {
  let state: PanelState = {
    ...createInitialPanelState(0),
    bookmarks: config.bookmarks ?? [],
    selectedBookmarkIds: config.selectedBookmarkIds ?? [],
  };
  const requestedOriginalBlobIds: string[][] = [];
  const uploads: { fileId: number; fileName: string; fileContent: string; recordHistory: boolean }[] = [];
  const cleanups: number[][] = [];
  let backupCompletions = 0;

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

  const configuredOriginalRequest = config.captureStore?.requestOriginalBlobRecords as
    CaptureStore['requestOriginalBlobRecords'] | undefined;
  const captureStore = {
    ...config.captureStore,
    requestOriginalBlobRecords: async (blobIds: readonly string[]) => {
      requestedOriginalBlobIds.push([...blobIds]);
      if (configuredOriginalRequest) return configuredOriginalRequest(blobIds);
      return { ok: true as const, records: [], missingBlobIds: [...blobIds] };
    },
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
    backupCompleted: () => {
      backupCompletions += 1;
    },
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
    uploadPCloudBackup: (async (input: PCloudBackupUploadInput) => {
      if (input.operation === 'cleanup') {
        cleanups.push([...input.fileIds]);
        return {
          ok: true,
          status: CONNECTED_STATUS,
          deletedFileIds: input.fileIds,
          message: `Cleaned up ${input.fileIds.length} partial backup part(s).`,
        };
      }
      const fileId = 42 + uploads.length;
      if (config.failUploadAttempt === uploads.length + 1) {
        return {
          ok: false,
          status: CONNECTED_STATUS,
          reason: 'upload-failed',
          message: 'Injected part upload failure.',
          cleanupFileId: 99,
          cleanupNeeded: true,
        };
      }
      uploads.push({
        fileId,
        fileName: input.fileName,
        fileContent: input.fileContent,
        recordHistory: input.recordHistory !== false,
      });
      const uploadedAt = '2026-06-20T00:00:00.000Z';
      const sha256 = 'a'.repeat(64);
      return {
        ok: true,
        status: CONNECTED_STATUS,
        fileId,
        fileName: input.fileName,
        folderPath: '/Applications/Playbook-Eng-Trail-Overlook-1/backups',
        apiHost: 'api.pcloud.com',
        sizeBytes: input.fileContent.length,
        sha256,
        uploadedAt,
        verificationMethod: 'download-byte-match',
        historyRecord: {
          schemaVersion: 1,
          provider: 'pcloud',
          destination: '/Applications/Playbook-Eng-Trail-Overlook-1/backups',
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

  return {
    controller: new RecallExportController(deps),
    getState: () => state,
    requestedOriginalBlobIds,
    uploads,
    cleanups,
    get backupCompletions() {
      return backupCompletions;
    },
  };
}

async function decryptedParts(harness: ExportHarness, password: string) {
  const manifestUpload = harness.uploads.at(-1);
  assert.ok(manifestUpload);
  const decrypted = await decryptCloudBackupManifest(manifestUpload.fileContent, password);
  const payloads = [];
  for (const reference of decrypted.manifest.parts) {
    const upload = harness.uploads.find((candidate) => candidate.fileId === reference.fileId);
    assert.ok(upload);
    payloads.push(await decryptCloudBackupPart(upload.fileContent, decrypted.session, reference));
  }
  return { ...decrypted, payloads };
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
  assert.equal(harness.backupCompletions, 0);
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

  assert.equal(harness.uploads.length, 3, 'metadata, records, and the manifest are uploaded separately');
  assert.deepEqual(
    harness.uploads.map((upload) => upload.recordHistory),
    [false, false, true],
    'only the published manifest enters backup history',
  );
  const backup = await decryptedParts(harness, 'cloud-pass');
  const metadata = backup.payloads.find((payload) => payload.kind === 'metadata');
  assert.ok(metadata?.kind === 'metadata');
  assert.deepEqual(
    metadata.albums.map((album) => ({ name: album.name, recordIds: album.recordIds })),
    [{ name: 'Reference', recordIds: ['bookmark-1'] }],
  );
  assert.equal(backup.payloads.filter((payload) => payload.kind === 'records').length, 1);
  assert.equal(harness.getState().pcloudBackup.lastBackupMissingOriginalCount, 0);
  assert.equal(harness.getState().pcloudBackup.messageIsError, false);
  assert.equal(harness.backupCompletions, 1);
});

test('only encrypted bookmark export completion counts as a manual backup', async () => {
  const encrypted = createExportHarness({ bookmarks: [bookmark({ id: 'bookmark-1' })] });
  await encrypted.controller.exportBookmarks('backup-password', false);
  assert.equal(encrypted.backupCompletions, 1);

  const plaintext = createExportHarness({ bookmarks: [bookmark({ id: 'bookmark-1' })] });
  await plaintext.controller.exportBookmarks('', true);
  assert.equal(plaintext.backupCompletions, 0);

  const selected = createExportHarness({
    bookmarks: [bookmark({ id: 'bookmark-1' }), bookmark({ id: 'bookmark-2' })],
    selectedBookmarkIds: ['bookmark-1'],
  });
  await selected.controller.exportBookmarks('backup-password', false);
  assert.equal(selected.backupCompletions, 0, 'a selected-only export leaves other durable records unprotected');
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

  assert.equal(harness.uploads.length, 2, 'metadata is uploaded before the album-only manifest');
  const backup = await decryptedParts(harness, 'cloud-pass');
  assert.equal(backup.manifest.recordCount, 0);
  const metadata = backup.payloads.find((payload) => payload.kind === 'metadata');
  assert.ok(metadata?.kind === 'metadata');
  assert.deepEqual(
    metadata.albums.map((album) => ({ name: album.name, recordIds: album.recordIds })),
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
  assert.equal(harness.uploads.length, 3);
  assert.equal(harness.getState().pcloudBackup.lastBackupMissingOriginalCount, 1);
  assert.equal(harness.backupCompletions, 0, 'an incomplete original set must not postpone the next backup reminder');
});

test('backupPCloudNow requests and uploads encrypted originals one at a time', async () => {
  const record = (id: string) => ({
    id,
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    iv: 'blob-iv',
    ciphertext: 'AQID',
    encryptedByteLength: 3,
    createdAt: '2026-06-20T00:00:00.000Z',
    key: { kind: 'blob' as const, uuid: 'key-1', reference: 'blob:key-1' as const },
    referenceCount: 1,
  });
  const harness = createExportHarness({
    bookmarks: [
      bookmark({ id: 'one', storedOriginal: { blobId: 'blob-1' } as ImageDisplayRecord['storedOriginal'] }),
      bookmark({ id: 'two', storedOriginal: { blobId: 'blob-2' } as ImageDisplayRecord['storedOriginal'] }),
    ],
    captureStore: {
      requestOriginalBlobRecords: async (blobIds: readonly string[]) => ({
        ok: true as const,
        records: [record(blobIds[0]!)],
        missingBlobIds: [],
      }),
      exportBlobKeyBackup: async () => ({
        ok: true as const,
        keyReference: 'blob:key-1',
        fileContent: '{"encryptedKey":true}',
        message: 'Exported.',
      }),
    },
  });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.deepEqual(harness.requestedOriginalBlobIds, [['blob-1'], ['blob-2']]);
  const backup = await decryptedParts(harness, 'cloud-pass');
  assert.deepEqual(
    backup.payloads.filter((payload) => payload.kind === 'original').map((payload) => payload.originalBlob.id),
    ['blob-1', 'blob-2'],
  );
  assert.equal(harness.getState().pcloudBackup.lastBackupOriginalCount, 2);
});

test('backupPCloudNow cleans verified parts when a later part upload fails', async () => {
  const harness = createExportHarness({ bookmarks: [bookmark({ id: 'bookmark-1' })], failUploadAttempt: 2 });

  await harness.controller.backupPCloudNow('cloud-pass');

  assert.equal(harness.uploads.length, 1);
  assert.deepEqual(harness.cleanups, [[harness.uploads[0]!.fileId, 99]]);
  assert.match(harness.getState().pcloudBackup.message ?? '', /Injected part upload failure/u);
  assert.match(harness.getState().pcloudBackup.message ?? '', /Cleaned up 2 partial backup part/u);
  assert.equal(harness.backupCompletions, 0);
});

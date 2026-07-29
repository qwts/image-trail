import assert from 'node:assert/strict';
import test from 'node:test';

import type { PCloudBackupUploadInput } from '../extension/src/core/cloud/pcloud-provider.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { PCloudBackupExportCoordinator, type PCloudBackupExportDeps } from '../extension/src/ui/panel/pcloud-backup-export.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

test('cancel waits for the current provider request, removes verified parts, and never publishes a manifest', async () => {
  let state: PanelState = {
    ...createInitialPanelState(0),
    pcloudBackup: { connectionState: 'connected', apiHost: 'api.pcloud.com' },
  };
  const uploadStarted = deferred<void>();
  const uploadResult = deferred<{
    readonly ok: true;
    readonly status: { readonly connected: true; readonly apiHost: 'api.pcloud.com' };
    readonly fileId: number;
    readonly fileName: string;
    readonly folderPath: string;
    readonly apiHost: 'api.pcloud.com';
    readonly sizeBytes: number;
    readonly sha256: string;
    readonly uploadedAt: string;
    readonly verificationMethod: 'download-byte-match';
    readonly historyRecord: {
      readonly schemaVersion: 1;
      readonly provider: 'pcloud';
      readonly destination: string;
      readonly fileName: string;
      readonly completedAt: string;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly verificationMethod: 'download-byte-match';
    };
    readonly historyPersisted: false;
    readonly message: string;
  }>();
  const uploadedNames: string[] = [];
  const cleanupRequests: number[][] = [];
  const deps: PCloudBackupExportDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    captureStore: () => null,
    albumStore: () => ({ listBackupEntries: async () => [] }),
    loadAllBookmarks: async () => [
      createDisplayRecord({
        id: 'bookmark-1',
        url: 'https://example.test/one.jpg',
        source: 'bookmark',
        timestamp: '2026-07-28T12:00:00.000Z',
      }),
    ],
    uploadPCloudBackup: (async (input: PCloudBackupUploadInput) => {
      if (input.operation === 'cleanup') {
        cleanupRequests.push([...input.fileIds]);
        return {
          ok: true as const,
          status: { connected: true as const, apiHost: 'api.pcloud.com' as const },
          deletedFileIds: input.fileIds,
          message: `Cleaned up ${input.fileIds.length} partial backup part(s).`,
        };
      }
      uploadedNames.push(input.fileName);
      uploadStarted.resolve();
      return uploadResult.promise;
    }) as PCloudBackupExportDeps['uploadPCloudBackup'],
  };
  const coordinator = new PCloudBackupExportCoordinator(deps);

  const running = coordinator.backup('backup-password');
  await uploadStarted.promise;
  coordinator.cancel();
  const fileName = uploadedNames[0]!;
  uploadResult.resolve({
    ok: true,
    status: { connected: true, apiHost: 'api.pcloud.com' },
    fileId: 701,
    fileName,
    folderPath: '/Image Trail/backups',
    apiHost: 'api.pcloud.com',
    sizeBytes: 128,
    sha256: 'a'.repeat(64),
    uploadedAt: '2026-07-28T12:00:00.000Z',
    verificationMethod: 'download-byte-match',
    historyRecord: {
      schemaVersion: 1,
      provider: 'pcloud',
      destination: '/Image Trail/backups',
      fileName,
      completedAt: '2026-07-28T12:00:00.000Z',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      verificationMethod: 'download-byte-match',
    },
    historyPersisted: false,
    message: 'Uploaded and verified part.',
  });
  await running;

  assert.equal(uploadedNames.length, 1, 'the manifest is never published after cancellation');
  assert.deepEqual(cleanupRequests, [[701]]);
  assert.equal(state.pcloudBackup.connectionState, 'connected');
  assert.match(state.pcloudBackup.message ?? '', /Backup canceled.*Cleaned up 1 partial backup part/u);
});

test('cancel during local part encryption never starts a provider upload', async () => {
  let state: PanelState = {
    ...createInitialPanelState(0),
    pcloudBackup: { connectionState: 'connected', apiHost: 'api.pcloud.com' },
  };
  const encryptionStarted = deferred<void>();
  const encryptionResult = deferred<string>();
  const uploadedNames: string[] = [];
  const cleanupRequests: number[][] = [];
  const deps: PCloudBackupExportDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    captureStore: () => null,
    albumStore: () => ({ listBackupEntries: async () => [] }),
    loadAllBookmarks: async () => [
      createDisplayRecord({
        id: 'bookmark-1',
        url: 'https://example.test/one.jpg',
        source: 'bookmark',
        timestamp: '2026-07-28T12:00:00.000Z',
      }),
    ],
    uploadPCloudBackup: (async (input: PCloudBackupUploadInput) => {
      if (input.operation === 'cleanup') {
        cleanupRequests.push([...input.fileIds]);
        return {
          ok: true as const,
          status: { connected: true as const, apiHost: 'api.pcloud.com' as const },
          deletedFileIds: input.fileIds,
          message: `Cleaned up ${input.fileIds.length} partial backup part(s).`,
        };
      }
      uploadedNames.push(input.fileName);
      throw new Error('Cancellation should prevent the provider upload.');
    }) as PCloudBackupExportDeps['uploadPCloudBackup'],
  };
  const coordinator = new PCloudBackupExportCoordinator(deps, async () => {
    encryptionStarted.resolve();
    return encryptionResult.promise;
  });

  const running = coordinator.backup('backup-password');
  await encryptionStarted.promise;
  coordinator.cancel();
  encryptionResult.resolve('encrypted-part');
  await running;

  assert.deepEqual(uploadedNames, []);
  assert.deepEqual(cleanupRequests, [[]]);
  assert.equal(state.pcloudBackup.connectionState, 'connected');
  assert.match(state.pcloudBackup.message ?? '', /Backup canceled.*Cleaned up 0 partial backup part/u);
});

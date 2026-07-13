import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { originalBlobIdsForFullBackup } from '../extension/src/ui/panel/record-export-helpers.js';
import type { ImportRestorePreviewState } from '../extension/src/core/types.js';
import { createPanelRecordFixture } from './support/panel-state-fixtures.js';

function restorePreviewFixture(overrides: Partial<ImportRestorePreviewState> = {}): ImportRestorePreviewState {
  return {
    fileName: 'image-trail-bookmarks-2026-06-27.json',
    payloadLabel: 'Bookmarks',
    recordCount: 2,
    capturedOriginalCount: 1,
    skippedCount: 0,
    unsupportedCount: 0,
    plaintext: false,
    message: 'Preview loaded.',
    samples: [
      {
        label: 'sample.jpg',
        url: 'https://example.test/sample.jpg',
        detail: 'Bookmark metadata with original reference',
      },
    ],
    ...overrides,
  };
}

test('updating visible bookmark soft max resets the queue window', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarkOffset: 30,
    bookmarkLimit: 30,
  };

  const updated = reducePanelAction(state, { name: 'settings/update-visible-bookmark-soft-max', value: 10 });

  assert.equal(updated.bookmarkLimit, 10);
  assert.equal(updated.bookmarkOffset, 0);
});

test('toggling privacy mode does not mutate rows or selections', () => {
  const state = {
    ...createInitialPanelState(),
    history: [createPanelRecordFixture({ id: 'history-1', source: 'history' })],
    bookmarks: [createPanelRecordFixture({ id: 'bookmark-1', source: 'bookmark' })],
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
  };

  const updated = reducePanelAction(state, { name: 'settings/update-privacy-mode', enabled: true });

  assert.equal(updated.privacyModeEnabled, true);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
  assert.deepEqual(updated.selectedHistoryIds, ['history-1']);
  assert.deepEqual(updated.selectedBookmarkIds, ['bookmark-1']);
});

test('updating build info overlay visibility only changes the overlay setting', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
  };

  const updated = reducePanelAction(state, { name: 'settings/update-build-info-overlay-visibility', visible: false });

  assert.equal(updated.buildInfoOverlayVisible, false);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
  assert.deepEqual(updated.selectedHistoryIds, ['history-1']);
  assert.deepEqual(updated.selectedBookmarkIds, ['bookmark-1']);
});

test('updating URL review status retention settings only changes review policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-url-review-status-retention',
    limit: 250,
    clearAfterExport: true,
  });

  assert.equal(updated.urlReviewStatusLimit, 250);
  assert.equal(updated.clearUrlReviewStatusAfterExport, true);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('updating neighbor preload settings only changes preload policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-neighbor-preload',
    enabled: true,
    radius: 2,
    cacheLimit: 0,
    probeMethod: 'head',
    loadFailureFeedback: 'display',
  });

  assert.equal(updated.neighborPreloadEnabled, true);
  assert.equal(updated.neighborPreloadRadius, 2);
  assert.equal(updated.neighborPreloadCacheLimit, 0);
  assert.equal(updated.neighborPreloadProbeMethod, 'head');
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('updating request throttle settings only changes throttle policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-request-throttle',
    minimumIntervalMs: 100,
    maxRequests: 12,
    windowMs: 5_000,
  });

  assert.equal(updated.requestThrottleMs, 100);
  assert.equal(updated.requestThrottleMaxRequests, 12);
  assert.equal(updated.requestThrottleWindowMs, 5_000);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('settings toggle opens and closes the panel settings section', () => {
  const opened = reducePanelAction(createInitialPanelState(), { name: 'settings/toggle' });
  assert.equal(opened.settingsOpen, true);

  const closed = reducePanelAction(opened, { name: 'settings/toggle' });
  assert.equal(closed.settingsOpen, false);
});

test('updating pin save storage preference only changes future save preference state', () => {
  const state = createInitialPanelState();
  const updated = reducePanelAction(state, { name: 'settings/update-pin-save-storage-preference', value: 'plaintext' });

  assert.equal(updated.pinSaveStoragePreference, 'plaintext');
  assert.equal(updated.bookmarkOffset, state.bookmarkOffset);
  assert.deepEqual(updated.bookmarks, state.bookmarks);
});

test('import restore preview ready stores preview and status message', () => {
  const preview = restorePreviewFixture({ message: 'Preview loaded. Import has not changed local records yet.' });

  const next = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  assert.equal(next.importExportBusy, false);
  assert.equal(next.importExportMessage, preview.message);
  assert.equal(next.importExportMessageIsError, false);
  assert.equal(next.importRestorePreview, preview);
  assert.equal(next.message, preview.message);
  assert.equal(next.status, 'ready');
});

test('import restore preview ready preserves error review state', () => {
  const preview = restorePreviewFixture({ message: 'Some sections cannot be imported by this version.', messageIsError: true });

  const next = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  assert.equal(next.importExportMessageIsError, true);
  assert.equal(next.importRestorePreview, preview);
  assert.equal(next.message, preview.message);
  assert.equal(next.status, 'error');
});

test('import restore preview clears on cancel and new import start', () => {
  const preview = restorePreviewFixture({ message: 'Preview loaded. Import has not changed local records yet.' });
  const ready = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  const canceled = reducePanelAction(ready, { name: 'import/cancel-restore-preview' });
  assert.equal(canceled.importRestorePreview, undefined);
  assert.equal(canceled.importExportMessage, 'Restore preview canceled.');
  assert.equal(canceled.status, 'ready');

  const restarted = reducePanelAction(ready, { name: 'import-export/start' });
  assert.equal(restarted.importRestorePreview, undefined);
  assert.equal(restarted.importExportBusy, true);
  assert.equal(restarted.importExportMessage, 'Import/export is running...');
});

test('pCloud backup reducer tracks backing-up state and verified upload metadata', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-06-27T00:00:00.000Z',
      message: 'pCloud is connected.',
    },
  });
  const backingUp = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'backing-up',
    message: 'Uploading encrypted backup to pCloud...',
  });

  assert.equal(backingUp.pcloudBackup.connectionState, 'busy');
  assert.equal(backingUp.pcloudBackup.pendingOperation, 'backing-up');

  const uploaded = reducePanelAction(backingUp, {
    name: 'pcloud-backup/upload-complete',
    apiHost: 'api.pcloud.com',
    originalCount: 1,
    originalBytes: 96937,
    missingOriginalCount: 0,
    historyRecord: {
      schemaVersion: 1,
      provider: 'pcloud',
      destination: '/Image Trail/backups',
      fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
      completedAt: '2026-06-27T00:00:01.000Z',
      sizeBytes: 512,
      sha256: 'b'.repeat(64),
      verificationMethod: 'download-byte-match',
    },
    message: 'Uploaded and verified backup.',
  });

  assert.equal(uploaded.pcloudBackup.connectionState, 'connected');
  assert.equal(uploaded.pcloudBackup.pendingOperation, undefined);
  assert.equal(uploaded.pcloudBackup.lastBackupFileName, 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json');
  assert.equal(uploaded.pcloudBackup.lastBackupSizeBytes, 512);
  assert.equal(uploaded.pcloudBackup.lastBackupSha256, 'b'.repeat(64));
  assert.equal(uploaded.pcloudBackup.lastBackupOriginalCount, 1);
  assert.equal(uploaded.pcloudBackup.lastBackupOriginalBytes, 96937);
  assert.equal(uploaded.pcloudBackup.lastBackupMissingOriginalCount, 0);
  assert.equal(uploaded.pcloudBackup.backupHistory?.[0]?.verificationMethod, 'download-byte-match');
  assert.equal(uploaded.pcloudBackup.messageIsError, false);
});

test('pCloud status hydrates persisted backup history while disconnected', () => {
  const initial = createInitialPanelState();
  const state = reducePanelAction(
    {
      ...initial,
      pcloudBackup: {
        ...initial.pcloudBackup,
        lastBackupOriginalCount: 2,
        lastBackupOriginalBytes: 1_500_000,
        lastBackupMissingOriginalCount: 1,
      },
    },
    {
      name: 'pcloud-backup/status',
      status: {
        connected: false,
        backupHistory: [
          {
            schemaVersion: 1,
            provider: 'pcloud',
            destination: '/Image Trail/backups',
            fileName: 'persisted.image-trail-encrypted.json',
            completedAt: '2026-06-27T00:00:01.000Z',
            sizeBytes: 768,
            sha256: 'c'.repeat(64),
            verificationMethod: 'provider-checksum',
          },
        ],
      },
    },
  );

  assert.equal(state.pcloudBackup.connectionState, 'disconnected');
  assert.equal(state.pcloudBackup.lastBackupFileName, 'persisted.image-trail-encrypted.json');
  assert.equal(state.pcloudBackup.lastBackupSizeBytes, 768);
  assert.equal(state.pcloudBackup.backupHistory?.[0]?.sha256, 'c'.repeat(64));
  assert.equal(state.pcloudBackup.lastBackupOriginalCount, undefined);
  assert.equal(state.pcloudBackup.lastBackupOriginalBytes, undefined);
  assert.equal(state.pcloudBackup.lastBackupMissingOriginalCount, undefined);
});

test('pCloud status distinguishes omitted history from an authoritative empty history', () => {
  const initial = createInitialPanelState();
  const stale = {
    ...initial,
    pcloudBackup: {
      ...initial.pcloudBackup,
      lastBackupAt: '2026-06-27T00:00:01.000Z',
      lastBackupFileName: 'stale.image-trail-encrypted.json',
      lastBackupSizeBytes: 768,
      lastBackupSha256: 'c'.repeat(64),
      lastBackupOriginalCount: 2,
      lastBackupOriginalBytes: 1_500_000,
      lastBackupMissingOriginalCount: 1,
    },
  };

  const preserved = reducePanelAction(stale, { name: 'pcloud-backup/status', status: { connected: true } });
  assert.equal(preserved.pcloudBackup.lastBackupFileName, 'stale.image-trail-encrypted.json');
  assert.equal(preserved.pcloudBackup.lastBackupOriginalCount, 2);

  const cleared = reducePanelAction(stale, { name: 'pcloud-backup/status', status: { connected: true, backupHistory: [] } });
  assert.deepEqual(cleared.pcloudBackup.backupHistory, []);
  assert.equal(cleared.pcloudBackup.lastBackupAt, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupFileName, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupSizeBytes, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupSha256, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupOriginalCount, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupOriginalBytes, undefined);
  assert.equal(cleared.pcloudBackup.lastBackupMissingOriginalCount, undefined);
});

test('pCloud full backup collects captured blob ids from durable records', () => {
  const records = [
    createDisplayRecord({
      id: 'captured',
      url: 'https://example.test/captured.jpg',
      timestamp: '2026-06-28T02:26:41.854Z',
      captureStatus: 'captured',
      blobId: 'captured-blob',
    }),
    createDisplayRecord({
      id: 'stored',
      url: 'https://example.test/stored.jpg',
      timestamp: '2026-06-28T02:26:42.854Z',
      storedOriginal: {
        blobId: 'stored-blob',
        mimeType: 'image/jpeg',
        byteLength: 447304,
        capturedAt: '2026-06-28T02:26:42.854Z',
      },
    }),
  ];

  assert.deepEqual([...originalBlobIdsForFullBackup(records)].sort(), ['captured-blob', 'stored-blob']);
});

test('pCloud upload errors keep connected provider state for retry', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'eapi.pcloud.com',
      message: 'pCloud is connected.',
    },
  });

  const failed = reducePanelAction(state, {
    name: 'pcloud-backup/upload-error',
    message: 'Downloaded pCloud backup bytes did not match the local export.',
  });

  assert.equal(failed.pcloudBackup.connectionState, 'connected');
  assert.equal(failed.pcloudBackup.pendingOperation, undefined);
  assert.equal(failed.pcloudBackup.messageIsError, true);
  assert.match(failed.pcloudBackup.message ?? '', /Downloaded pCloud backup bytes/u);
});

test('pCloud upload errors apply disconnected provider status for reconnect recovery', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-06-27T00:00:00.000Z',
      message: 'pCloud is connected.',
    },
  });
  const backingUp = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'backing-up',
    message: 'Uploading encrypted backup to pCloud...',
  });

  const failed = reducePanelAction(backingUp, {
    name: 'pcloud-backup/upload-error',
    message: 'Connect pCloud before backing up.',
    status: {
      connected: false,
      message: 'Connect pCloud before backing up.',
      messageIsError: true,
    },
  });

  assert.equal(failed.pcloudBackup.connectionState, 'disconnected');
  assert.equal(failed.pcloudBackup.pendingOperation, undefined);
  assert.equal(failed.pcloudBackup.apiHost, undefined);
  assert.equal(failed.pcloudBackup.messageIsError, true);
  assert.match(failed.pcloudBackup.message ?? '', /Connect pCloud/u);
});

test('pCloud restore reducer tracks candidates and downloaded metadata', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      message: 'pCloud is connected.',
    },
  });
  const restoring = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'restoring',
    message: 'Checking pCloud backups...',
  });

  assert.equal(restoring.pcloudBackup.connectionState, 'busy');
  assert.equal(restoring.pcloudBackup.pendingOperation, 'restoring');

  const candidates = reducePanelAction(restoring, {
    name: 'pcloud-backup/restore-candidates-loaded',
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    candidates: [
      {
        fileId: 402,
        fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
        sizeBytes: 512,
        modifiedAt: 'Sat, 27 Jun 2026 00:00:00 +0000',
      },
    ],
    message: 'Found 1 encrypted pCloud backup.',
  });

  assert.equal(candidates.pcloudBackup.connectionState, 'connected');
  assert.equal(candidates.pcloudBackup.pendingOperation, undefined);
  assert.equal(candidates.pcloudBackup.restoreCandidates?.[0]?.fileId, 402);

  const downloaded = reducePanelAction(candidates, {
    name: 'pcloud-backup/restore-downloaded',
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    sizeBytes: 512,
    sha256: 'c'.repeat(64),
    downloadedAt: '2026-06-27T00:00:01.000Z',
    message: 'Downloaded backup.',
  });

  assert.equal(downloaded.pcloudBackup.lastRestoreFileName, 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json');
  assert.equal(downloaded.pcloudBackup.lastRestoreSizeBytes, 512);
  assert.equal(downloaded.pcloudBackup.lastRestoreSha256, 'c'.repeat(64));
  assert.equal(downloaded.pcloudBackup.lastRestoreDownloadedAt, '2026-06-27T00:00:01.000Z');
});

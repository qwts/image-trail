import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../../extension/src/core/actions.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { createSettingsSection } from '../../extension/src/ui/settings-section.js';

function build(state: PanelState, actions: unknown[] = [], pcloudBackupEnabled = true): HTMLElement {
  return createSettingsSection(state, { fields: [], activeTemplateId: null }, (action) => actions.push(action), {
    pcloudBackupEnabled,
  });
}

test('createSettingsSection renders the full settings surface from an initial state', () => {
  const section = build({ ...createInitialPanelState(0), visible: true });

  assert.ok(section.classList.contains('image-trail-panel__settings-section'));
  assert.ok(section.querySelector('.image-trail-panel__settings-checkbox input'), 'settings checkboxes render');
  assert.match(section.textContent ?? '', /pCloud/u, 'the cloud backup utility renders');
});

test('createSettingsSection hides regular pCloud backup when its build-time client id gate is disabled', () => {
  const section = build({ ...createInitialPanelState(0), visible: true }, [], false);

  assert.equal(section.querySelector('.image-trail-panel__cloud-backup'), null);
  assert.doesNotMatch(section.textContent ?? '', /Connect pCloud/u);
});

test('createSettingsSection reflects populated backup, restore, and selection state', () => {
  const state: PanelState = {
    ...createInitialPanelState(0),
    visible: true,
    blobKeyUnlocked: true,
    importExportMessage: 'Exported 3 rows.',
    importExportMessageIsError: false,
    selectedHistoryIds: ['recent-1'],
    selectedBookmarkIds: ['queue-1'],
    activeDestination: 'recall',
    recall: { ...createInitialPanelState(0).recall, selectedIds: ['recall-1'], candidates: [] },
    target: { ...createInitialPanelState(0).target, selectedUrl: 'https://images.example.test/a/1.jpg' },
    pcloudBackup: {
      connectionState: 'connected',
      apiHost: 'api.pcloud.example',
      connectedAt: '2026-06-25T15:30:00.000Z',
      lastBackupAt: '2026-06-25T15:31:00.000Z',
      lastBackupFileName: 'image-trail-backup.json',
      lastBackupSizeBytes: 2048,
      lastBackupOriginalCount: 2,
      lastBackupOriginalBytes: 1_500_000,
      lastBackupMissingOriginalCount: 0,
      lastBackupSha256: 'a'.repeat(64),
      backupHistory: [
        {
          schemaVersion: 1,
          provider: 'pcloud',
          destination: '/Applications/Playbook-Eng-Trail-Overlook-1/backups',
          fileName: 'image-trail-backup.json',
          completedAt: '2026-06-25T15:31:00.000Z',
          sizeBytes: 2048,
          sha256: 'a'.repeat(64),
          verificationMethod: 'download-byte-match',
        },
      ],
      restoreCandidates: [
        {
          fileId: 7,
          fileName: 'image-trail-backup.json',
          sizeBytes: 2048,
          modifiedAt: '2026-06-25T15:31:00.000Z',
        },
      ],
      lastRestoreFileName: 'image-trail-backup.json',
      lastRestoreSizeBytes: 512,
      lastRestoreSha256: 'b'.repeat(64),
      lastRestoreDownloadedAt: '2026-06-25T15:32:00.000Z',
      message: 'Backup complete.',
      messageIsError: false,
    },
  };

  const section = build(state);

  assert.match(section.textContent ?? '', /2\.0 KB/u, 'backup sizes format through formatCloudBackupBytes');
  assert.match(section.textContent ?? '', /Backup complete\./u, 'the cloud backup message surfaces');
  assert.match(section.textContent ?? '', /Backup history \(1\)/u, 'persisted backup history surfaces');
  assert.match(section.textContent ?? '', /Image Trail SHA-256/u, 'history identifies the locally computed verification hash');
  assert.match(section.textContent ?? '', /Downloaded bytes matched export/u, 'history explains the verification method');
  assert.match(section.textContent ?? '', /Exported 3 rows\./u, 'the import–export message surfaces');
});

test('an authoritative empty backup history removes stale backup metadata', () => {
  const initial = createInitialPanelState(0);
  const stale: PanelState = {
    ...initial,
    pcloudBackup: {
      ...initial.pcloudBackup,
      lastBackupAt: '2026-06-25T15:31:00.000Z',
      lastBackupFileName: 'stale-backup.json',
      lastBackupSizeBytes: 2048,
      lastBackupOriginalCount: 2,
      lastBackupOriginalBytes: 1_500_000,
      lastBackupMissingOriginalCount: 1,
      lastBackupSha256: 'a'.repeat(64),
    },
  };
  const cleared = reducePanelAction(stale, {
    name: 'pcloud-backup/status',
    status: { connected: false, backupHistory: [] },
  });

  const cloudBackup = build(cleared).querySelector('.image-trail-panel__cloud-backup');
  assert.ok(cloudBackup);
  const text = cloudBackup.textContent ?? '';
  assert.doesNotMatch(text, /stale-backup\.json/u);
  assert.doesNotMatch(text, /Last backup|Encrypted originals|Original bytes|Missing originals|SHA-256/u);
});

test('an in-progress chunked backup exposes a cooperative cancel action', () => {
  const initial = createInitialPanelState(0);
  const actions: unknown[] = [];
  const section = build(
    {
      ...initial,
      pcloudBackup: {
        ...initial.pcloudBackup,
        connectionState: 'busy',
        pendingOperation: 'backing-up',
        message: 'Uploading and verifying records part 2...',
      },
    },
    actions,
  );
  const cancel = [...section.querySelectorAll('button')].find((button) => button.textContent === 'Cancel current operation');

  assert.ok(cancel);
  assert.equal(cancel.disabled, false);
  cancel.click();
  assert.deepEqual(actions, [{ name: 'cloud-backup/cancel', provider: 'pcloud' }]);
});

test('encrypted export stays disabled for selected video originals', () => {
  const initial = createInitialPanelState(0);
  const video = createDisplayRecord({
    id: 'video-1',
    url: 'image-trail://local-media/video-1/clip.ts',
    timestamp: '2026-07-29T00:00:00.000Z',
    source: 'bookmark',
    captureStatus: 'captured',
    blobId: 'blob-video-1',
    storedOriginal: {
      blobId: 'blob-video-1',
      mimeType: 'video/mp2t',
      byteLength: 188 * 4,
      capturedAt: '2026-07-29T00:00:00.000Z',
      fileName: 'clip.ts',
    },
  });
  const section = build({
    ...initial,
    blobKeyUnlocked: true,
    bookmarks: [video],
    selectedBookmarkIds: [video.id],
  });
  const encryptedExport = [...section.querySelectorAll('button')].find((button) => button.textContent === 'Export encrypted');

  assert.ok(encryptedExport);
  assert.equal(encryptedExport.disabled, true);
});

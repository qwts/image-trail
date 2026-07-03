import test from 'node:test';
import assert from 'node:assert/strict';

import { createDisplayRecord } from '../extension/src/core/display-records.js';
import {
  bookmarkRecordToExportEntry,
  bookmarkSaveMessage,
  formatCloudBackupBytes,
  historyRecordToExportEntry,
  isLockedPrivatePin,
  originalBlobIdsForFullBackup,
  pcloudBackupFileName,
  pcloudBackupUploadMessage,
  recordHasBlobId,
  selectedRecords,
  urlReviewStatusClearScopeLabel,
  withoutRecentPinState,
} from '../extension/src/ui/panel/record-export-helpers.js';

const STORED_ORIGINAL = {
  blobId: 'blob-1',
  mimeType: 'image/jpeg',
  byteLength: 2048,
  capturedAt: '2026-06-20T00:00:00.000Z',
} as const;

test('withoutRecentPinState strips pin bookkeeping and keeps the rest of the record', () => {
  const record = createDisplayRecord({
    id: 'record-1',
    url: 'https://example.test/one.jpg',
    timestamp: '2026-06-21T00:00:00.000Z',
    source: 'history',
    pinnedAt: '2026-06-21T01:00:00.000Z',
    pinnedRecordId: 'pin-1',
  });

  const cleared = withoutRecentPinState(record);

  assert.equal(cleared.pinnedAt, undefined);
  assert.equal(cleared.pinnedRecordId, undefined);
  assert.equal(cleared.id, 'record-1');
  assert.equal(cleared.url, 'https://example.test/one.jpg');
  assert.equal(record.pinnedAt, '2026-06-21T01:00:00.000Z');
});

test('historyRecordToExportEntry marks stored originals as downloaded', () => {
  const captured = historyRecordToExportEntry(
    createDisplayRecord({
      id: 'record-1',
      url: 'https://example.test/one.jpg',
      title: 'One',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'history',
      storedOriginal: STORED_ORIGINAL,
    }),
  );
  assert.equal(captured.uuid, 'record-1');
  assert.equal(captured.payload.captureStatus, 'downloaded');
  assert.equal(captured.payload.capturedAt, '2026-06-21T00:00:00.000Z');
  assert.equal(captured.payload.storedOriginal?.blobId, 'blob-1');

  const remote = historyRecordToExportEntry(
    createDisplayRecord({
      id: 'record-2',
      url: 'https://example.test/two.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'history',
    }),
  );
  assert.equal(remote.payload.captureStatus, 'remote-only');
});

test('bookmarkRecordToExportEntry keeps legacy favorites compatibility only for favorites records', () => {
  const favorite = bookmarkRecordToExportEntry(
    createDisplayRecord({
      id: 'record-1',
      url: 'https://example.test/one.jpg',
      width: 800,
      height: 600,
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'favorites',
    }),
  );
  assert.equal(favorite.payload.sourceCompatibility, 'favorites');
  assert.equal(favorite.payload.bookmarkedAt, '2026-06-21T00:00:00.000Z');
  assert.equal(favorite.payload.width, 800);

  const bookmark = bookmarkRecordToExportEntry(
    createDisplayRecord({
      id: 'record-2',
      url: 'https://example.test/two.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
    }),
  );
  assert.equal(bookmark.payload.sourceCompatibility, undefined);
});

test('selectedRecords returns every record when the selection is empty and filters otherwise', () => {
  const records = ['a', 'b', 'c'].map((id) =>
    createDisplayRecord({ id, url: `https://example.test/${id}.jpg`, timestamp: '2026-06-21T00:00:00.000Z', source: 'history' }),
  );

  assert.deepEqual(selectedRecords(records, []), records);
  assert.deepEqual(
    selectedRecords(records, ['c', 'a']).map((record) => record.id),
    ['a', 'c'],
  );
  assert.deepEqual(selectedRecords(records, ['missing']), []);
});

test('originalBlobIdsForFullBackup dedupes blob ids across capture, stored-original, and protected-pin slots', () => {
  const records = [
    createDisplayRecord({
      id: 'record-1',
      url: 'https://example.test/one.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
      storedOriginal: STORED_ORIGINAL,
    }),
    createDisplayRecord({
      id: 'record-2',
      url: 'https://example.test/two.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
      storedOriginal: { ...STORED_ORIGINAL, blobId: 'blob-1' },
    }),
  ];

  assert.deepEqual(originalBlobIdsForFullBackup(records), ['blob-1']);
});

test('isLockedPrivatePin detects locked status and private placeholder URLs', () => {
  const locked = createDisplayRecord({
    id: 'private-pin',
    url: 'image-trail-private:private-pin',
    timestamp: '2026-06-21T00:00:00.000Z',
    source: 'bookmark',
    privacyStatus: 'locked',
  });
  const plain = createDisplayRecord({
    id: 'plain-pin',
    url: 'https://example.test/plain.jpg',
    timestamp: '2026-06-21T00:00:00.000Z',
    source: 'bookmark',
  });

  assert.equal(isLockedPrivatePin(locked), true);
  assert.equal(isLockedPrivatePin(plain), false);
});

test('pcloudBackupFileName normalizes ISO timestamps into a filename-safe form', () => {
  assert.equal(
    pcloudBackupFileName('2026-06-21T10:20:30.123Z'),
    'image-trail-pcloud-backup-2026-06-21T10-20-30Z.image-trail-encrypted.json',
  );
});

test('pcloudBackupUploadMessage summarizes included originals and missing references', () => {
  assert.equal(pcloudBackupUploadMessage('Backup uploaded.', 1, 2048, 0), 'Backup uploaded. Included 1 encrypted original (2.0 KB).');
  assert.equal(
    pcloudBackupUploadMessage('Backup uploaded.', 2, 3 * 1024 * 1024, 1),
    'Backup uploaded. Included 2 encrypted originals (3.0 MB); 1 referenced original missing.',
  );
});

test('formatCloudBackupBytes picks bytes, kilobytes, or megabytes', () => {
  assert.equal(formatCloudBackupBytes(512), '512 B');
  assert.equal(formatCloudBackupBytes(1536), '1.5 KB');
  assert.equal(formatCloudBackupBytes(2.5 * 1024 * 1024), '2.5 MB');
});

test('bookmarkSaveMessage explains why a pin was stored as plaintext', () => {
  const record = (reason: 'setting' | 'failed' | 'unavailable' | 'locked') =>
    createDisplayRecord({
      id: 'record-1',
      url: 'https://example.test/one.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
      pinSaveStorage: { destination: 'plaintext', reason },
    });

  assert.equal(
    bookmarkSaveMessage(
      createDisplayRecord({ id: 'r', url: 'https://example.test/e.jpg', timestamp: '2026-06-21T00:00:00.000Z', source: 'bookmark' }),
    ),
    'Added to Image Trail: https://example.test/e.jpg',
  );
  assert.equal(bookmarkSaveMessage(record('setting'), 'One'), 'Saved plaintext pin by current storage setting: One');
  assert.equal(bookmarkSaveMessage(record('failed'), 'One'), 'Saved plaintext pin because encrypted storage failed: One');
  assert.equal(bookmarkSaveMessage(record('unavailable'), 'One'), 'Saved plaintext pin because encrypted storage is not set up: One');
  assert.equal(bookmarkSaveMessage(record('locked'), 'One'), 'Saved plaintext pin because encrypted storage is locked: One');
});

test('recordHasBlobId matches capture, stored-original, and protected-pin blob slots', () => {
  assert.equal(recordHasBlobId({ blobId: 'blob-1' }, 'blob-1'), true);
  assert.equal(recordHasBlobId({ storedOriginal: STORED_ORIGINAL }, 'blob-1'), true);
  assert.equal(
    recordHasBlobId(
      {
        protectedPin: {
          plainPinId: 'pin-1',
          storedOriginalBlobId: 'blob-1',
          hasEncryptedMetadata: false,
          hasEncryptedThumbnail: false,
          hasStoredOriginal: true,
        },
      },
      'blob-1',
    ),
    true,
  );
  assert.equal(recordHasBlobId({ blobId: 'other' }, 'blob-1'), false);
});

test('urlReviewStatusClearScopeLabel names each clearing scope', () => {
  assert.equal(urlReviewStatusClearScopeLabel('all'), 'all sites');
  assert.equal(urlReviewStatusClearScopeLabel('page'), 'this page');
  assert.equal(urlReviewStatusClearScopeLabel('source'), 'the selected URL');
  assert.equal(urlReviewStatusClearScopeLabel('hostname'), 'this site');
});

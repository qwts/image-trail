import test from 'node:test';
import assert from 'node:assert/strict';

import { formatStorageHealthBytes, storageHealthRows } from '../extension/src/ui/components/settings-view.js';

test('storage health rows separate queue metadata, thumbnails, and originals', () => {
  const rows = storageHealthRows({
    blobCount: 2,
    totalBytes: 37_888,
    orphanedBlobCount: 2,
    originals: { count: 2, totalBytes: 30_720 },
    queueRecords: { count: 3, totalBytes: 6_144 },
    thumbnails: { count: 1, totalBytes: 1_024 },
  });

  assert.deepEqual(rows, [
    { label: 'Queue metadata', count: 3, bytes: 6_144 },
    { label: 'Thumbnails', count: 1, bytes: 1_024 },
    { label: 'Encrypted originals', count: 2, bytes: 30_720 },
    { label: 'Total tracked storage', count: 6, bytes: 37_888 },
    { label: 'Unlinked originals', count: 2, bytes: null },
  ]);
});

test('storage health rows fall back when detailed buckets are not available', () => {
  const rows = storageHealthRows({ blobCount: 2, totalBytes: 2048 });

  assert.deepEqual(
    rows.find((row) => row.label === 'Encrypted originals'),
    {
      label: 'Encrypted originals',
      count: 2,
      bytes: 2048,
    },
  );
});

test('storage health bytes stay compact', () => {
  assert.equal(formatStorageHealthBytes(512), '512 B');
  assert.equal(formatStorageHealthBytes(1536), '1.5 KB');
  assert.equal(formatStorageHealthBytes(2 * 1024 * 1024), '2.0 MB');
});

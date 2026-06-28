import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIdentityRows,
  formatBuildIdentityLocalTimestamp,
  formatBuildIdentityTimestamp,
  formatStorageHealthBytes,
  storageHealthRows,
} from '../extension/src/ui/components/settings-view.js';

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

test('build identity rows include only available local build fields', () => {
  const rows = buildIdentityRows({
    schemaVersion: 1,
    version: '0.1.0',
    builtAt: '2026-06-28T03:30:00.000Z',
    commit: 'abc123def456',
    branch: 'codex/dev',
    worktree: 'image-bookmarklet',
    timezone: 'America/Chicago',
    mode: 'local',
  });

  assert.deepEqual(rows.slice(0, 4), [
    { label: 'Version', value: '0.1.0' },
    { label: 'Commit', value: 'abc123def456' },
    { label: 'Branch', value: 'codex/dev' },
    { label: 'Worktree', value: 'image-bookmarklet' },
  ]);
  assert.equal(rows[4]?.label, 'Built local');
  assert.match(rows[4]?.value ?? '', /^06\/27\/2026, 10:30:00 PM (CDT|GMT-5)$/u);
  assert.deepEqual(rows[5], { label: 'Built UTC', value: '2026-06-28 03:30:00 UTC' });
});

test('build identity timestamp falls back to source text when invalid', () => {
  assert.equal(formatBuildIdentityTimestamp('not-a-date'), 'not-a-date');
  assert.equal(formatBuildIdentityLocalTimestamp('not-a-date', 'America/Chicago'), 'not-a-date');
});

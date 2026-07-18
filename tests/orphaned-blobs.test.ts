import test from 'node:test';
import assert from 'node:assert/strict';
import { ORPHANED_BLOB_GRACE_PERIOD_MS, findDeletableOrphanBlobIds } from '../extension/src/background/orphaned-blobs.js';

const now = Date.parse('2026-07-18T16:00:00.000Z');

test('orphan cleanup protects new blobs and selects only old unreferenced blobs', () => {
  const blobs = [
    { id: 'fresh-orphan', createdAt: new Date(now).toISOString() },
    { id: 'old-orphan', createdAt: new Date(now - ORPHANED_BLOB_GRACE_PERIOD_MS - 1).toISOString() },
    { id: 'old-referenced', createdAt: new Date(now - ORPHANED_BLOB_GRACE_PERIOD_MS - 1).toISOString() },
  ];

  const deletable = findDeletableOrphanBlobIds(blobs, new Set(['old-referenced']), now);

  assert.deepEqual(deletable, ['old-orphan']);
  assert.equal(deletable.length, 1, 'the displayed orphan count must match the cleanup selection');
});

test('orphan cleanup fails safe for invalid or future creation times', () => {
  const blobs = [
    { id: 'invalid-time', createdAt: 'not-a-date' },
    { id: 'parseable-invalid-time', createdAt: '0' },
    { id: 'future-time', createdAt: new Date(now + 1).toISOString() },
  ];

  assert.deepEqual(findDeletableOrphanBlobIds(blobs, new Set(), now), []);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { sortQueueRecords, sortRecentRecords } from '../extension/src/core/display-order.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';

function record(id: string, timestamp: string, queueUpdatedAt?: string): ImageDisplayRecord {
  return { id, url: `https://example.test/${id}.jpg`, timestamp, queueUpdatedAt, source: 'bookmark' };
}

test('recent display order sorts timestamps while preserving equal-key input order', () => {
  const records = [
    record('first', '2026-07-01T00:00:00.000Z'),
    record('second', '2026-07-01T00:00:00.000Z'),
    record('older', '2026-06-01T00:00:00.000Z'),
  ];

  assert.deepEqual(
    sortRecentRecords(records, 'newest-first').map((item) => item.id),
    ['first', 'second', 'older'],
  );
  assert.deepEqual(
    sortRecentRecords(records, 'oldest-first').map((item) => item.id),
    ['older', 'first', 'second'],
  );
});

test('queue display order uses queue time with timestamp fallback and keeps invalid keys stable', () => {
  const records = [
    record('invalid-first', 'not-a-time'),
    record('fallback', '2026-07-02T00:00:00.000Z'),
    record('front', '2026-07-01T00:00:00.000Z', '2026-07-03T00:00:00.000Z'),
    record('invalid-second', 'also-not-a-time'),
  ];

  assert.deepEqual(
    sortQueueRecords(records, 'front-first').map((item) => item.id),
    ['front', 'fallback', 'invalid-first', 'invalid-second'],
  );
  assert.deepEqual(
    sortQueueRecords(records, 'back-first').map((item) => item.id),
    ['fallback', 'front', 'invalid-first', 'invalid-second'],
  );
});

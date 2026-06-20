import test from 'node:test';
import assert from 'node:assert/strict';
import { fitThumbnailSize, THUMBNAIL_MAX_EDGE } from '../extension/src/core/image/thumbnail.js';

test('fitThumbnailSize keeps small images unchanged', () => {
  assert.deepEqual(fitThumbnailSize({ width: 120, height: 80 }), { width: 120, height: 80 });
});

test('fitThumbnailSize caps the largest edge and preserves aspect ratio', () => {
  assert.deepEqual(fitThumbnailSize({ width: 1024, height: 512 }), { width: THUMBNAIL_MAX_EDGE, height: 128 });
  assert.deepEqual(fitThumbnailSize({ width: 512, height: 1024 }), { width: 128, height: THUMBNAIL_MAX_EDGE });
});

test('fitThumbnailSize rejects invalid dimensions', () => {
  assert.deepEqual(fitThumbnailSize({ width: 0, height: 100 }), { width: 0, height: 0 });
  assert.deepEqual(fitThumbnailSize({ width: 100, height: -1 }), { width: 0, height: 0 });
});

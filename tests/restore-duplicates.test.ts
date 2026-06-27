import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyRestoreDuplicates, normalizedRestoreSourceUrl } from '../extension/src/core/import/restore-duplicates.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('restore duplicate detection prefers verified SHA-256 over URL', () => {
  const classifications = classifyRestoreDuplicates(
    [{ id: 'incoming-1', url: 'https://example.test/new.jpg', sha256: HASH_B }],
    [
      { id: 'existing-url', url: 'https://example.test/new.jpg', sha256: HASH_A },
      { id: 'existing-hash', url: 'https://example.test/other.jpg', sha256: HASH_B },
    ],
  );

  assert.equal(classifications[0]?.duplicate?.existingId, 'existing-hash');
  assert.equal(classifications[0]?.duplicate?.matchedBy, 'sha256');
});

test('restore duplicate detection falls back to normalized source URLs', () => {
  const source = 'https://cdn.example.test/images/frame-042.webp';
  const proxy = `https://external-content.example.test/iu/?u=${encodeURIComponent(source)}`;
  const classifications = classifyRestoreDuplicates([{ id: 'incoming-1', url: proxy }], [{ id: 'existing-1', url: source }]);

  assert.equal(normalizedRestoreSourceUrl(proxy), source);
  assert.equal(classifications[0]?.duplicate?.existingId, 'existing-1');
  assert.equal(classifications[0]?.duplicate?.matchedBy, 'url');
});

test('restore duplicate detection ignores invalid SHA-256 values', () => {
  const classifications = classifyRestoreDuplicates(
    [{ id: 'incoming-1', url: 'https://example.test/incoming.jpg', sha256: 'not-a-hash' }],
    [{ id: 'existing-1', url: 'https://example.test/existing.jpg', sha256: 'not-a-hash' }],
  );

  assert.equal(classifications[0]?.duplicate, undefined);
});

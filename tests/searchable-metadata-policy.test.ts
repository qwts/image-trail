import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bookmarkSearchIndexKey,
  DEFAULT_SEARCHABLE_METADATA_POLICY,
  hashSearchableUrl,
  isSearchableMetadataMode,
  isSearchableMetadataPolicy,
  looksLikeSearchableUrlHash,
  needsUrlRedaction,
  sanitizeSearchableMetadataPolicy,
  type SearchableMetadataPolicy,
} from '../extension/src/core/metadata-policy.js';
import { migrateLocalSettings } from '../extension/src/data/local-settings.js';

const PLAINTEXT_POLICY: SearchableMetadataPolicy = { urlDerived: 'plaintext', albumName: 'plaintext', thumbnail: 'plaintext' };

test('the default policy keeps every optional class out of plaintext (privacy-max)', () => {
  assert.deepEqual(DEFAULT_SEARCHABLE_METADATA_POLICY, { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' });
});

test('bookmarkSearchIndexKey returns the URL under plaintext policy and its hash under encrypted', async () => {
  const url = 'https://example.test/photo.jpg';
  assert.equal(await bookmarkSearchIndexKey(url, PLAINTEXT_POLICY), url);
  assert.equal(await bookmarkSearchIndexKey(url, DEFAULT_SEARCHABLE_METADATA_POLICY), await hashSearchableUrl(url));
});

test('the encrypted index key is a 64-char hex hash that looksLikeSearchableUrlHash recognises', async () => {
  const hash = await bookmarkSearchIndexKey('https://example.test/photo.jpg', DEFAULT_SEARCHABLE_METADATA_POLICY);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(looksLikeSearchableUrlHash(hash), true);
  assert.equal(looksLikeSearchableUrlHash('https://example.test/photo.jpg'), false);
});

test('needsUrlRedaction flags real URLs but skips hashes and synthetic tokens', async () => {
  assert.equal(needsUrlRedaction('https://example.test/photo.jpg'), true);
  assert.equal(needsUrlRedaction(await hashSearchableUrl('https://example.test/photo.jpg')), false);
  assert.equal(needsUrlRedaction('image-trail-import:abc-123'), false);
  assert.equal(needsUrlRedaction('private-pin:def-456'), false);
});

test('policy guards accept valid values and reject malformed ones', () => {
  assert.equal(isSearchableMetadataMode('plaintext'), true);
  assert.equal(isSearchableMetadataMode('encrypted'), true);
  assert.equal(isSearchableMetadataMode('mute'), false);
  assert.equal(isSearchableMetadataPolicy(DEFAULT_SEARCHABLE_METADATA_POLICY), true);
  assert.equal(isSearchableMetadataPolicy({ urlDerived: 'plaintext' }), false);
  assert.equal(isSearchableMetadataPolicy(null), false);
});

test('sanitizeSearchableMetadataPolicy repairs missing or invalid fields to the privacy-max default', () => {
  assert.deepEqual(sanitizeSearchableMetadataPolicy(undefined), DEFAULT_SEARCHABLE_METADATA_POLICY);
  assert.deepEqual(sanitizeSearchableMetadataPolicy({ urlDerived: 'plaintext', albumName: 'bogus', thumbnail: 'plaintext' }), {
    urlDerived: 'plaintext',
    albumName: 'encrypted',
    thumbnail: 'plaintext',
  });
});

test('migrateLocalSettings defaults the policy for legacy settings and preserves a valid one', () => {
  assert.deepEqual(migrateLocalSettings({}).searchableMetadataPolicy, DEFAULT_SEARCHABLE_METADATA_POLICY);
  assert.deepEqual(migrateLocalSettings({ searchableMetadataPolicy: PLAINTEXT_POLICY }).searchableMetadataPolicy, PLAINTEXT_POLICY);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bookmarkSearchIndexKey,
  DEFAULT_SEARCHABLE_METADATA_POLICY,
  hashSearchableUrl,
  isSearchableMetadataMode,
  isSearchableMetadataPolicy,
  sanitizeSearchableMetadataPolicy,
  type SearchableMetadataPolicy,
} from '../extension/src/core/metadata-policy.js';
import { migrateLocalSettings } from '../extension/src/data/local-settings.js';

const ENCRYPTED_POLICY: SearchableMetadataPolicy = { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' };

test('the default policy preserves today plaintext behaviour (opt-in only, no data change)', () => {
  assert.deepEqual(DEFAULT_SEARCHABLE_METADATA_POLICY, { urlDerived: 'plaintext', albumName: 'plaintext', thumbnail: 'plaintext' });
});

test('bookmarkSearchIndexKey returns the URL under the default policy and its hash only when opted in', async () => {
  const url = 'https://example.test/photo.jpg';
  assert.equal(await bookmarkSearchIndexKey(url, DEFAULT_SEARCHABLE_METADATA_POLICY), url);
  assert.equal(await bookmarkSearchIndexKey(url, ENCRYPTED_POLICY), await hashSearchableUrl(url));
});

test('the encrypted index key is a deterministic 64-char hex hash', async () => {
  const url = 'https://example.test/photo.jpg';
  const first = await bookmarkSearchIndexKey(url, ENCRYPTED_POLICY);
  const second = await bookmarkSearchIndexKey(url, ENCRYPTED_POLICY);
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(first, second);
});

test('policy guards accept valid values and reject malformed ones', () => {
  assert.equal(isSearchableMetadataMode('plaintext'), true);
  assert.equal(isSearchableMetadataMode('encrypted'), true);
  assert.equal(isSearchableMetadataMode('mute'), false);
  assert.equal(isSearchableMetadataPolicy(DEFAULT_SEARCHABLE_METADATA_POLICY), true);
  assert.equal(isSearchableMetadataPolicy({ urlDerived: 'plaintext' }), false);
  assert.equal(isSearchableMetadataPolicy(null), false);
});

test('sanitizeSearchableMetadataPolicy repairs missing or invalid fields to the default', () => {
  assert.deepEqual(sanitizeSearchableMetadataPolicy(undefined), DEFAULT_SEARCHABLE_METADATA_POLICY);
  assert.deepEqual(sanitizeSearchableMetadataPolicy({ urlDerived: 'encrypted', albumName: 'bogus', thumbnail: 'plaintext' }), {
    urlDerived: 'encrypted',
    albumName: 'plaintext',
    thumbnail: 'plaintext',
  });
});

test('migrateLocalSettings defaults the policy for legacy settings and preserves a valid one', () => {
  assert.deepEqual(migrateLocalSettings({}).searchableMetadataPolicy, DEFAULT_SEARCHABLE_METADATA_POLICY);
  assert.deepEqual(migrateLocalSettings({ searchableMetadataPolicy: ENCRYPTED_POLICY }).searchableMetadataPolicy, ENCRYPTED_POLICY);
});

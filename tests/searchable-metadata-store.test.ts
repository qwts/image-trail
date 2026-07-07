import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { hashSearchableUrl, type SearchableMetadataPolicy } from '../extension/src/core/metadata-policy.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

const PLAINTEXT_POLICY: SearchableMetadataPolicy = { urlDerived: 'plaintext', albumName: 'encrypted', thumbnail: 'encrypted' };
const ENCRYPTED_POLICY: SearchableMetadataPolicy = { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' };
const URL = 'https://example.test/photo.jpg';

// Opens a fresh connection, reports whether the URL is indexed by its plaintext value and/or its hash,
// then closes the connection so the test process can exit and stays isolated between cases.
async function indexPresence(): Promise<{ readonly plaintext: boolean; readonly hashed: boolean }> {
  const result = await openImageTrailDb();
  assert.ok(result.db);
  try {
    const repository = new BookmarksRepository(result.db);
    const plaintext = !!(await repository.getEncryptedByUrl(URL));
    const hashed = !!(await repository.getEncryptedByUrl(await hashSearchableUrl(URL)));
    return { plaintext, hashed };
  } finally {
    result.db.close();
  }
}

function bookmark(url = URL): ReturnType<typeof createDisplayRecord> {
  return createDisplayRecord({ id: url, url, label: 'photo.jpg', timestamp: '2026-06-19T00:00:00.000Z', source: 'bookmark' });
}

test('a plain bookmark saved under the default policy stores a hashed URL index but stays findable by URL', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark());

    assert.deepEqual(
      await indexPresence(),
      { plaintext: false, hashed: true },
      'the raw URL must not sit in plaintext searchable metadata',
    );

    const found = await store.findByUrl(URL);
    assert.equal(found?.url, URL, 'the record is still findable by its real URL, and display shows the real URL');
  } finally {
    await store.close();
  }
});

test('saving the same URL twice under the default policy dedups to a single record', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark());
    await store.save(bookmark());
    const page = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(page.total, 1);
  } finally {
    await store.close();
  }
});

test('a plaintext policy keeps the raw URL as the searchable index value', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore({ getSearchableMetadataPolicy: () => PLAINTEXT_POLICY });
  try {
    await store.save(bookmark());
    assert.deepEqual(await indexPresence(), { plaintext: true, hashed: false }, 'plaintext policy indexes by the raw URL');
  } finally {
    await store.close();
  }
});

test('applySearchableMetadataPolicy redacts a lingering plaintext URL to its hash and is idempotent', async () => {
  await deleteImageTrailDb();
  // Seed a legacy plaintext-URL row by saving under a plaintext policy.
  const legacyStore = new IndexedDbBookmarkStore({ getSearchableMetadataPolicy: () => PLAINTEXT_POLICY });
  try {
    await legacyStore.save(bookmark());
  } finally {
    await legacyStore.close();
  }
  assert.deepEqual(await indexPresence(), { plaintext: true, hashed: false }, 'precondition: the seeded row is plaintext-indexed');

  const store = new IndexedDbBookmarkStore();
  try {
    await store.applySearchableMetadataPolicy(ENCRYPTED_POLICY);
    assert.deepEqual(await indexPresence(), { plaintext: false, hashed: true }, 'the legacy plaintext URL is redacted to its hash');
    assert.equal((await store.findByUrl(URL))?.url, URL, 'dedup lookup still resolves the redacted row');

    // A second application is a cheap no-op (applied-mode marker) and leaves the row hashed.
    await store.applySearchableMetadataPolicy(ENCRYPTED_POLICY);
    assert.deepEqual(await indexPresence(), { plaintext: false, hashed: true });
  } finally {
    await store.close();
  }
});

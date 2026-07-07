import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { hashSearchableUrl, type SearchableMetadataPolicy } from '../extension/src/core/metadata-policy.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

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

test('the default policy keeps the raw URL as the searchable index value (no data-format change)', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark());
    assert.deepEqual(await indexPresence(), { plaintext: true, hashed: false }, 'the default preserves the plaintext URL index');
    assert.equal((await store.findByUrl(URL))?.url, URL);
  } finally {
    await store.close();
  }
});

test('opting URLs into encrypted stores a hashed index for new records yet stays findable by URL', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore({ getSearchableMetadataPolicy: () => ENCRYPTED_POLICY });
  try {
    await store.save(bookmark());

    assert.deepEqual(await indexPresence(), { plaintext: false, hashed: true }, 'the URL is hashed, not stored in plaintext');
    // The real URL still lives in the encrypted payload, so display and dedup lookup resolve it.
    assert.equal((await store.findByUrl(URL))?.url, URL, 'findByUrl resolves the hashed row');
  } finally {
    await store.close();
  }
});

test('saving the same URL twice under the encrypted policy dedups to a single record', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore({ getSearchableMetadataPolicy: () => ENCRYPTED_POLICY });
  try {
    await store.save(bookmark());
    await store.save(bookmark());
    const page = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(page.total, 1);
  } finally {
    await store.close();
  }
});

test('a legacy plaintext row is still found after switching to encrypted, and is never rewritten', async () => {
  await deleteImageTrailDb();
  // Save under the default (plaintext) policy, then reopen under an encrypted policy.
  const plaintextStore = new IndexedDbBookmarkStore();
  try {
    await plaintextStore.save(bookmark());
  } finally {
    await plaintextStore.close();
  }

  const encryptedStore = new IndexedDbBookmarkStore({ getSearchableMetadataPolicy: () => ENCRYPTED_POLICY });
  try {
    // Dual-encoding lookup resolves the legacy plaintext row without any migration pass.
    assert.equal((await encryptedStore.findByUrl(URL))?.url, URL, 'the legacy plaintext row is still found by URL');
  } finally {
    await encryptedStore.close();
  }

  // Simply opening under a different policy must not have rewritten anything on disk.
  assert.deepEqual(await indexPresence(), { plaintext: true, hashed: false }, 'the legacy row stays plaintext — never rewritten');
});

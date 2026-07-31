import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { reconcileBookmarkUrlIndexes } from '../extension/src/data/bookmark-url-index-reconciliation.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import {
  DEFAULT_SEARCHABLE_METADATA_POLICY,
  hashSearchableUrl,
  type SearchableMetadataPolicy,
} from '../extension/src/core/metadata-policy.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { ensureDurableBookmarkKey } from '../extension/src/data/durable-bookmark-key.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import { createUrlMetadataStores } from '../extension/src/data/url-metadata-stores.js';
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

async function reconcilePolicy(policy: SearchableMetadataPolicy): Promise<number> {
  const result = await openImageTrailDb();
  assert.ok(result.db);
  try {
    const repository = new BookmarksRepository(result.db);
    const bookmarkKey = await ensureDurableBookmarkKey(new KeysRepository(result.db));
    return (await reconcileBookmarkUrlIndexes(repository, bookmarkKey.key, policy)).length;
  } finally {
    result.db.close();
  }
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

test('a legacy plaintext row is found after switching to encrypted, then redacted when policy is applied', async () => {
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
    // Dual-encoding lookup resolves the legacy plaintext row before the settings-save reconciliation runs.
    assert.equal((await encryptedStore.findByUrl(URL))?.url, URL, 'the legacy plaintext row is still found by URL');
    assert.equal(await reconcilePolicy(ENCRYPTED_POLICY), 1);
  } finally {
    await encryptedStore.close();
  }

  assert.deepEqual(
    await indexPresence(),
    { plaintext: false, hashed: true },
    'the legacy row URL index is hashed after policy reconciliation',
  );
});

test('settings reconciliation scans bookmark indexes only for the transition to encrypted', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark());
    const result = await openImageTrailDb();
    assert.ok(result.db);
    const metadataStores = createUrlMetadataStores({
      getDb: async () => result.db,
      getSearchableMetadataPolicy: () => ENCRYPTED_POLICY,
    });

    await metadataStores.reconcileSearchableMetadataPolicy(ENCRYPTED_POLICY);
    assert.deepEqual(await indexPresence(), { plaintext: true, hashed: false });

    await metadataStores.reconcileSearchableMetadataPolicy(ENCRYPTED_POLICY, DEFAULT_SEARCHABLE_METADATA_POLICY);
    assert.deepEqual(await indexPresence(), { plaintext: false, hashed: true });
    result.db.close();
  } finally {
    await store.close();
  }
});

test('settings reconciliation fails closed when bookmark storage is unavailable', async () => {
  const metadataStores = createUrlMetadataStores({
    getDb: async () => null,
    getSearchableMetadataPolicy: () => ENCRYPTED_POLICY,
  });

  await assert.rejects(
    metadataStores.reconcileSearchableMetadataPolicy(ENCRYPTED_POLICY, DEFAULT_SEARCHABLE_METADATA_POLICY),
    /bookmark storage is unavailable/iu,
  );
});

test('policy reconciliation preserves opaque interop indexes for duplicate payload URLs', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark());
    const result = await openImageTrailDb();
    assert.ok(result.db);
    const repository = new BookmarksRepository(result.db);
    const [plainRecord] = await repository.listEncrypted();
    assert.ok(plainRecord);
    const interopRecord = {
      ...plainRecord,
      uuid: 'interop-copy',
      url: 'image-trail-interop:duplicate-source',
      queueUpdatedAt: '2026-06-18T00:00:00.000Z',
    };
    await repository.putEncrypted(interopRecord);

    assert.equal(await reconcilePolicy(ENCRYPTED_POLICY), 1);
    const redacted = await repository.getEncrypted(plainRecord.uuid);
    const preservedInterop = await repository.getEncrypted(interopRecord.uuid);
    assert.equal(redacted?.url, await hashSearchableUrl(URL));
    assert.equal(preservedInterop?.url, interopRecord.url);
    assert.deepEqual(preservedInterop?.envelope, interopRecord.envelope);
    assert.equal(preservedInterop?.queueUpdatedAt, interopRecord.queueUpdatedAt);
    result.db.close();
  } finally {
    await store.close();
  }
});

test('batch URL index updates skip duplicate targets without changing queue or envelope data', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(bookmark('https://example.test/first.jpg'));
    await store.save(bookmark('https://example.test/second.jpg'));
    const result = await openImageTrailDb();
    assert.ok(result.db);
    const repository = new BookmarksRepository(result.db);
    const before = await repository.listEncrypted();
    const target = await hashSearchableUrl('https://example.test/shared.jpg');
    const updated = await repository.updateUrlIndexes(before.map((record) => ({ uuid: record.uuid, url: target })));

    assert.equal(updated.length, 1);
    const after = await repository.listEncrypted();
    assert.equal(after.filter((record) => record.url === target).length, 1);
    for (const record of after) {
      const original = before.find((candidate) => candidate.uuid === record.uuid);
      assert.ok(original);
      assert.deepEqual(record.envelope, original.envelope);
      assert.equal(record.queueUpdatedAt, original.queueUpdatedAt);
    }
    result.db.close();
  } finally {
    await store.close();
  }
});

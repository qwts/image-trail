import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

test('locked-session bookmark thumbnails remain inside an AES-GCM envelope at rest', async () => {
  await deleteImageTrailDb();
  const thumbnail = 'data:image/png;base64,bG9ja2VkLXRodW1i';
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => null,
    getPinSaveStoragePreference: () => 'encrypted',
  });
  const saved = await store.save(
    createDisplayRecord({
      id: 'https://secret.example.test/locked-thumbnail.jpg',
      url: 'https://secret.example.test/locked-thumbnail.jpg',
      label: 'locked-thumbnail.jpg',
      thumbnail,
      timestamp: '2026-07-15T00:00:00.000Z',
      source: 'bookmark',
    }),
  );
  await store.close();
  assert.deepEqual(saved.pinSaveStorage, { destination: 'plaintext', reason: 'locked' });
  const savedId = saved.id;

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    const repository = new BookmarksRepository(db.db);
    const raw = await repository.getEncrypted(savedId);
    assert.ok(raw);
    assert.equal(raw.envelope.algorithm, 'AES-GCM');
    assert.equal(JSON.stringify(raw).includes('bG9ja2VkLXRodW1i'), false);
    assert.equal('thumbnail' in raw, false);

    const bookmarkKey = (await new KeysRepository(db.db).listByKind('bookmark')).find(
      (record): record is StoredKeyRecord<'bookmark'> & { readonly key: CryptoKey } =>
        record.kind === 'bookmark' && record.key instanceof CryptoKey,
    );
    assert.ok(bookmarkKey);
    assert.equal((await repository.open(savedId, bookmarkKey.key))?.thumbnail, thumbnail);
  } finally {
    db.db.close();
    await deleteImageTrailDb();
  }
});

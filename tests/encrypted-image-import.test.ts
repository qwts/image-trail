import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { importEncryptedImageToDurableStorage } from '../extension/src/background/encrypted-image-import.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { createEncryptedImageFile } from '../extension/src/data/import-export/encrypted-image.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import type { StoredBlobRecord } from '../extension/src/data/types.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

async function encryptedFixture(sourceUrl = 'data:image/png;base64,AQID') {
  const key = await generateAesGcmKey(false);
  const reference = createKeyReference('blob', 'import-key');
  const exported = await createEncryptedImageFile({
    bytes: new Uint8Array([1, 2, 3]).buffer,
    mimeType: 'image/png',
    sourceUrl,
    fileName: 'secret.png',
    key,
    keyReference: reference,
    now: '2026-07-20T00:00:00.000Z',
  });
  return { exported, active: { key, reference } };
}

test('protected encrypted import stores ciphertext, confirms the durable bookmark, and returns no byte-bearing presentation', async () => {
  const { exported, active } = await encryptedFixture();
  const stored: StoredBlobRecord[] = [];
  const removed: string[] = [];
  const saved: ImageDisplayRecord[] = [];
  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => ({}) as IDBDatabase,
    createBlobsRepository: () => ({
      put: async (record) => {
        stored.push(record);
        return record;
      },
      remove: async (id) => {
        removed.push(id);
      },
    }),
    saveBookmark: async (record) => {
      saved.push(record);
      return { ok: true, record: { ...record, id: 'durable-import' } };
    },
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-imported',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.id, 'blob-imported');
  assert.equal(stored[0]?.referenceCount, 1);
  assert.ok(stored[0]?.ciphertext.byteLength);
  assert.equal(saved[0]?.storedOriginal?.blobId, 'blob-imported');
  assert.equal(result.record.id, 'durable-import');
  assert.equal(result.record.url, 'image-trail-private:blob-imported');
  assert.equal(result.record.thumbnail, undefined);
  assert.equal(JSON.stringify(result).includes('data:image'), false);
  assert.deepEqual(removed, []);
});

test('protected encrypted import fails closed when durable storage is unavailable', async () => {
  const { exported, active } = await encryptedFixture('https://images.example.test/secret.png');
  let saved = false;
  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => null,
    saveBookmark: async (record) => {
      saved = true;
      return { ok: true, record };
    },
  });
  assert.deepEqual(result, { ok: false, reason: 'storage-unavailable', message: 'Bookmark storage is unavailable.' });
  assert.equal(saved, false);
});

test('protected encrypted import releases the new blob when the durable bookmark save fails', async () => {
  const { exported, active } = await encryptedFixture('https://images.example.test/secret.png');
  const removed: string[] = [];
  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => ({}) as IDBDatabase,
    createBlobsRepository: () => ({
      put: async (record) => record,
      remove: async (id) => {
        removed.push(id);
      },
    }),
    saveBookmark: async () => ({ ok: false, message: 'quota exceeded' }),
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-failed',
  });

  assert.deepEqual(result, { ok: false, reason: 'durable-save-failed', message: 'quota exceeded' });
  assert.deepEqual(removed, ['blob-failed']);
});

test('successful protected import leaves the durable queue record pointing at an existing encrypted original', async (t) => {
  await deleteImageTrailDb();
  const { exported, active } = await encryptedFixture('https://images.example.test/durable.png');
  const opened = await openImageTrailDb();
  assert.ok(opened.db);
  const db = opened.db;
  const store = new IndexedDbBookmarkStore();
  t.after(async () => {
    await store.close();
    db.close();
    await deleteImageTrailDb();
  });

  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => db,
    saveBookmark: (record) => store.saveResult(record),
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-durable',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const durable = (await store.loadByIds([result.record.id]))[0];
  assert.equal(durable?.storedOriginal?.blobId, 'blob-durable');
  assert.equal((await new BlobsRepository(db).get('blob-durable'))?.referenceCount, 1);
});

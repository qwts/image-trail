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
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  t.after(async () => {
    await store.close();
    db.close();
    await deleteImageTrailDb();
  });

  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => db,
    saveBookmark: (record, importKey) => store.saveProtectedResult(record, importKey),
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-durable',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const durable = (await store.loadByIds([result.record.id]))[0];
  assert.equal(durable?.storedOriginal?.blobId, 'blob-durable');
  assert.equal((await new BlobsRepository(db).get('blob-durable'))?.referenceCount, 1);
});

test('protected import preserves existing bookmark metadata and queue order while attaching the original', async () => {
  const { exported, active } = await encryptedFixture('https://images.example.test/existing.png');
  const existing: ImageDisplayRecord = {
    id: 'existing-id',
    url: 'https://images.example.test/existing.png',
    title: 'Curated title',
    label: 'Curated label',
    width: 2048,
    height: 1024,
    downloadedAt: '2026-06-01T00:00:00.000Z',
    timestamp: '2026-05-01T00:00:00.000Z',
    queueUpdatedAt: '2026-05-02T00:00:00.000Z',
    source: 'bookmark',
  };
  let saved: ImageDisplayRecord | undefined;
  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => ({}) as IDBDatabase,
    createBlobsRepository: () => ({ put: async (record) => record, remove: async () => undefined }),
    findBookmarkByUrl: async () => existing,
    saveBookmark: async (record) => {
      saved = record;
      return { ok: true, record };
    },
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-existing',
  });

  assert.equal(result.ok, true);
  assert.equal(saved?.title, existing.title);
  assert.equal(saved?.label, existing.label);
  assert.equal(saved?.width, existing.width);
  assert.equal(saved?.height, existing.height);
  assert.equal(saved?.downloadedAt, existing.downloadedAt);
  assert.equal(saved?.queueUpdatedAt, existing.queueUpdatedAt);
  assert.equal(saved?.storedOriginal?.blobId, 'blob-existing');
});

test('protected import releases its blob when the active key changes before the durable save', async (t) => {
  await deleteImageTrailDb();
  const { exported, active } = await encryptedFixture('https://images.example.test/key-switch.png');
  const switched = { key: await generateAesGcmKey(false), reference: createKeyReference('blob', 'switched-key') };
  let current = active;
  const opened = await openImageTrailDb();
  assert.ok(opened.db);
  const db = opened.db;
  const blobs = new BlobsRepository(db);
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => current });
  t.after(async () => {
    await store.close();
    db.close();
    await deleteImageTrailDb();
  });

  const result = await importEncryptedImageToDurableStorage(exported.fileContent, {
    restoreActiveBlobKey: async () => active,
    getDb: async () => db,
    createBlobsRepository: () => ({
      put: async (record) => {
        const saved = await blobs.put(record);
        current = switched;
        return saved;
      },
      remove: (id) => blobs.remove(id),
    }),
    saveBookmark: (record, importKey) => store.saveProtectedResult(record, importKey),
    now: () => '2026-07-20T00:00:01.000Z',
    randomUuid: () => 'blob-key-switch',
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'durable-save-failed',
    message: 'Encrypted original key changed during import.',
  });
  assert.equal(await blobs.get('blob-key-switch'), undefined);
  assert.equal((await store.loadPage({ offset: 0, limit: 30 })).total, 0);
});

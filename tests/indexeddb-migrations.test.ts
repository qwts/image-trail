import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { DataStore, IMAGE_TRAIL_DB_NAME, SchemaIndex } from '../extension/src/data/schema.js';
import { deleteImageTrailDb, openFreshImageTrailDb, asArray, requestToPromise, transactionDone } from './indexeddb-test-helpers.js';

test('IndexedDB migrations create data stores, indexes, and schema metadata', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());

  assert.deepEqual(
    asArray(db.objectStoreNames),
    [
      DataStore.Blobs,
      DataStore.Bookmarks,
      DataStore.Downloads,
      DataStore.EncryptedPins,
      DataStore.EncryptedPinThumbnails,
      DataStore.History,
      DataStore.Keys,
      DataStore.Metadata,
    ].sort(),
  );

  const transaction = db.transaction(
    [
      DataStore.Metadata,
      DataStore.Keys,
      DataStore.History,
      DataStore.Bookmarks,
      DataStore.Blobs,
      DataStore.Downloads,
      DataStore.EncryptedPins,
      DataStore.EncryptedPinThumbnails,
    ],
    'readonly',
  );
  const keys = transaction.objectStore(DataStore.Keys);
  const history = transaction.objectStore(DataStore.History);
  const bookmarks = transaction.objectStore(DataStore.Bookmarks);
  const blobs = transaction.objectStore(DataStore.Blobs);
  const downloads = transaction.objectStore(DataStore.Downloads);
  const encryptedPins = transaction.objectStore(DataStore.EncryptedPins);
  const encryptedPinThumbnails = transaction.objectStore(DataStore.EncryptedPinThumbnails);

  assert.deepEqual(asArray(keys.indexNames), [SchemaIndex.KeysByKind, SchemaIndex.KeysByReference, SchemaIndex.KeysByUuid].sort());
  assert.deepEqual(asArray(history.indexNames), [SchemaIndex.HistoryByKeyReference, SchemaIndex.HistoryByUpdatedAt].sort());
  assert.deepEqual(
    asArray(bookmarks.indexNames),
    [
      SchemaIndex.BookmarksByKeyReference,
      SchemaIndex.BookmarksByQueueUpdatedAt,
      SchemaIndex.BookmarksByUpdatedAt,
      SchemaIndex.BookmarksByUrl,
    ].sort(),
  );
  assert.deepEqual(asArray(blobs.indexNames), [SchemaIndex.BlobsByCreatedAt, SchemaIndex.BlobsByKeyReference].sort());
  assert.deepEqual(asArray(downloads.indexNames), [SchemaIndex.DownloadsByDownloadedAt, SchemaIndex.DownloadsByKeyReference].sort());
  assert.deepEqual(
    asArray(encryptedPins.indexNames),
    [
      SchemaIndex.EncryptedPinsByKeyReference,
      SchemaIndex.EncryptedPinsByPlainPinId,
      SchemaIndex.EncryptedPinsByQueueUpdatedAt,
      SchemaIndex.EncryptedPinsByUrlHash,
    ].sort(),
  );
  assert.deepEqual(
    asArray(encryptedPinThumbnails.indexNames),
    [
      SchemaIndex.EncryptedPinThumbnailsByByteLength,
      SchemaIndex.EncryptedPinThumbnailsByCreatedAt,
      SchemaIndex.EncryptedPinThumbnailsByKeyReference,
      SchemaIndex.EncryptedPinThumbnailsByPinId,
    ].sort(),
  );

  const metadata = await new Promise((resolve, reject) => {
    const request = transaction.objectStore(DataStore.Metadata).get('schema');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal((metadata as { databaseVersion: number }).databaseVersion, db.version);
  assert.match((metadata as { migratedAt: string }).migratedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('IndexedDB v4 migration preserves existing blob records', async (t) => {
  await deleteImageTrailDb();
  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IMAGE_TRAIL_DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(DataStore.Metadata, { keyPath: 'key' });
      db.createObjectStore(DataStore.Keys, { keyPath: 'reference' });
      db.createObjectStore(DataStore.History, { keyPath: 'uuid' });
      db.createObjectStore(DataStore.Bookmarks, { keyPath: 'uuid' });
      const blobs = db.createObjectStore(DataStore.Blobs, { keyPath: 'id' });
      blobs.createIndex(SchemaIndex.BlobsBySha256, 'sha256', { unique: false });
      blobs.createIndex(SchemaIndex.BlobsByCreatedAt, 'createdAt', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const write = legacyDb.transaction(DataStore.Blobs, 'readwrite');
  const legacyBlob = {
    id: 'legacy-blob',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'legacy-iv',
    ciphertext: new ArrayBuffer(8),
    encryptedByteLength: 8,
    createdAt: '2026-06-19T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    referenceCount: 1,
  };
  write.objectStore(DataStore.Blobs).put(legacyBlob);
  await transactionDone(write);
  legacyDb.close();

  const db = await openImageTrailDb();
  assert.equal(db.status.ok, true, db.status.message);
  assert.ok(db.db);
  t.after(() => db.db?.close());

  const read = db.db.transaction(DataStore.Blobs, 'readonly');
  const store = read.objectStore(DataStore.Blobs);
  assert.deepEqual(asArray(store.indexNames), [SchemaIndex.BlobsByCreatedAt, SchemaIndex.BlobsByKeyReference].sort());
  const migrated = await requestToPromise(store.get('legacy-blob'));
  await transactionDone(read);
  assert.deepEqual(migrated, legacyBlob);
});

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
      DataStore.OriginalBlobIndex,
      DataStore.Bookmarks,
      DataStore.Downloads,
      DataStore.EncryptedPins,
      DataStore.EncryptedPinThumbnails,
      DataStore.Albums,
      DataStore.AlbumMemberships,
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
      DataStore.OriginalBlobIndex,
      DataStore.Downloads,
      DataStore.EncryptedPins,
      DataStore.EncryptedPinThumbnails,
      DataStore.Albums,
      DataStore.AlbumMemberships,
    ],
    'readonly',
  );
  const keys = transaction.objectStore(DataStore.Keys);
  const history = transaction.objectStore(DataStore.History);
  const bookmarks = transaction.objectStore(DataStore.Bookmarks);
  const blobs = transaction.objectStore(DataStore.Blobs);
  const originalBlobIndex = transaction.objectStore(DataStore.OriginalBlobIndex);
  const downloads = transaction.objectStore(DataStore.Downloads);
  const encryptedPins = transaction.objectStore(DataStore.EncryptedPins);
  const encryptedPinThumbnails = transaction.objectStore(DataStore.EncryptedPinThumbnails);
  const albums = transaction.objectStore(DataStore.Albums);
  const albumMemberships = transaction.objectStore(DataStore.AlbumMemberships);

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
  assert.deepEqual(asArray(originalBlobIndex.indexNames), []);
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
  assert.deepEqual(asArray(albums.indexNames), [SchemaIndex.AlbumsByUpdatedAt].sort());
  assert.deepEqual(
    asArray(albumMemberships.indexNames),
    [
      SchemaIndex.AlbumMembershipsByAlbumId,
      SchemaIndex.AlbumMembershipsByAlbumPosition,
      SchemaIndex.AlbumMembershipsByAlbumRecord,
      SchemaIndex.AlbumMembershipsByRecordId,
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

test('IndexedDB v9 migration indexes only schema-valid original blobs', async (t) => {
  await deleteImageTrailDb();
  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IMAGE_TRAIL_DB_NAME, 8);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DataStore.Metadata, { keyPath: 'key' });
      request.result.createObjectStore(DataStore.Blobs, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const write = legacyDb.transaction(DataStore.Blobs, 'readwrite');
  write.objectStore(DataStore.Blobs).put({
    id: 'valid-original',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: new ArrayBuffer(8),
    encryptedByteLength: 8,
    createdAt: '2026-07-13T00:00:00.000Z',
    key: { kind: 'blob', uuid: 'key-1', reference: 'blob:key-1' },
    referenceCount: 1,
  });
  write.objectStore(DataStore.Blobs).put({ id: 'thumbnail', kind: 'thumbnail', schemaVersion: 1 });
  write.objectStore(DataStore.Blobs).put({ id: 'malformed-original', kind: 'original', schemaVersion: 1 });
  await transactionDone(write);
  legacyDb.close();

  const opened = await openImageTrailDb();
  assert.equal(opened.status.ok, true, opened.status.message);
  assert.ok(opened.db);
  t.after(() => opened.db?.close());

  const read = opened.db.transaction(DataStore.OriginalBlobIndex, 'readonly');
  const indexed = await requestToPromise<unknown[]>(read.objectStore(DataStore.OriginalBlobIndex).getAll());
  await transactionDone(read);
  assert.deepEqual(indexed, [{ id: 'valid-original' }]);
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

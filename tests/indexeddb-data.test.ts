import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { DataStore, IMAGE_TRAIL_DB_NAME, SchemaIndex } from '../extension/src/data/schema.js';
import { HistoryRepository, type EncryptedHistoryRecord } from '../extension/src/data/repositories/history-repository.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../extension/src/data/repositories/bookmarks-repository.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';

async function deleteImageTrailDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMAGE_TRAIL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Timed out deleting test IndexedDB database.'));
  });
}

async function openFreshImageTrailDb(): Promise<IDBDatabase> {
  await deleteImageTrailDb();
  const result = await openImageTrailDb();
  assert.equal(result.status.ok, true, result.status.message);
  assert.ok(result.db);
  return result.db;
}

function asArray(list: DOMStringList): string[] {
  return Array.from({ length: list.length }, (_, index) => list.item(index)).filter((value): value is string => value !== null);
}

function storedKeyRecord(reference: `history:${string}` = 'history:key-001', uuid = 'key-001'): StoredKeyRecord<'history'> {
  return {
    kind: 'history',
    uuid,
    reference,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    wrapping: {
      mode: 'session',
      algorithm: 'none',
    },
    extractable: false,
  };
}

function bookmarkRecord(uuid = 'bookmark-001'): EncryptedBookmarkRecord {
  return {
    uuid,
    url: 'https://example.test/bookmark.jpg',
    envelope: {
      schemaVersion: 1,
      payloadVersion: 1,
      algorithm: 'AES-GCM',
      iv: 'test-iv',
      ciphertext: 'test-ciphertext',
      key: {
        kind: 'bookmark',
        uuid: 'key-001',
        reference: 'bookmark:key-001',
      },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:01.000Z',
      authenticatedMetadata: { recordType: 'bookmark' },
    },
  };
}

function historyRecord(uuid = 'history-001'): EncryptedHistoryRecord {
  return {
    uuid,
    envelope: {
      schemaVersion: 1,
      payloadVersion: 1,
      algorithm: 'AES-GCM',
      iv: 'test-iv',
      ciphertext: 'test-ciphertext',
      key: {
        kind: 'history',
        uuid: 'key-001',
        reference: 'history:key-001',
      },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:01.000Z',
      authenticatedMetadata: { recordType: 'history' },
    },
  };
}

test('IndexedDB migrations create data stores, indexes, and schema metadata', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());

  assert.deepEqual(
    asArray(db.objectStoreNames),
    [
      DataStore.Bookmarks,
      DataStore.CaptureAttempts,
      DataStore.History,
      DataStore.ImageBlobs,
      DataStore.Keys,
      DataStore.Metadata,
      DataStore.StorageStats,
    ].sort(),
  );

  const transaction = db.transaction(
    [DataStore.Metadata, DataStore.Keys, DataStore.History, DataStore.Bookmarks, DataStore.ImageBlobs, DataStore.CaptureAttempts],
    'readonly',
  );
  const keys = transaction.objectStore(DataStore.Keys);
  const history = transaction.objectStore(DataStore.History);
  const bookmarks = transaction.objectStore(DataStore.Bookmarks);
  const imageBlobs = transaction.objectStore(DataStore.ImageBlobs);
  const captureAttempts = transaction.objectStore(DataStore.CaptureAttempts);

  assert.deepEqual(asArray(keys.indexNames), [SchemaIndex.KeysByKind, SchemaIndex.KeysByReference, SchemaIndex.KeysByUuid].sort());
  assert.deepEqual(asArray(history.indexNames), [SchemaIndex.HistoryByKeyReference, SchemaIndex.HistoryByUpdatedAt].sort());
  assert.deepEqual(
    asArray(bookmarks.indexNames),
    [SchemaIndex.BookmarksByKeyReference, SchemaIndex.BookmarksByUpdatedAt, SchemaIndex.BookmarksByUrl].sort(),
  );
  assert.deepEqual(asArray(imageBlobs.indexNames), [SchemaIndex.ImageBlobsByCreatedAt, SchemaIndex.ImageBlobsBySha256].sort());
  assert.deepEqual(asArray(captureAttempts.indexNames), [SchemaIndex.CaptureAttemptsByCreatedAt].sort());

  const metadata = await new Promise((resolve, reject) => {
    const request = transaction.objectStore(DataStore.Metadata).get('schema');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal((metadata as { databaseVersion: number }).databaseVersion, db.version);
  assert.match((metadata as { migratedAt: string }).migratedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('KeysRepository writes complete transactions and reads records back', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new KeysRepository(db);
  const record = storedKeyRecord();

  await repository.put(record);

  assert.deepEqual(await repository.get(record.reference), record);
  assert.equal(await repository.get('history:missing'), undefined);
});

test('HistoryRepository writes complete transactions and reads encrypted records back', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new HistoryRepository(db);
  const record = historyRecord();

  await repository.putEncrypted(record);

  assert.deepEqual(await repository.getEncrypted(record.uuid), record);
  assert.equal(await repository.getEncrypted('missing-history'), undefined);
});

test('BookmarksRepository writes encrypted records and dedupes by URL index', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const record = bookmarkRecord();

  await repository.putEncrypted(record);

  assert.deepEqual(await repository.getEncrypted(record.uuid), record);
  assert.deepEqual(await repository.listEncrypted(), [record]);
  assert.deepEqual(await repository.getEncryptedByUrl(record.url), record);
  assert.equal(await repository.getEncryptedByUrl('https://example.test/missing.jpg'), undefined);
});

test('BlobsRepository stores originals, records fallbacks, and updates usage after delete', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BlobsRepository(db);

  await repository.putOriginal({
    uuid: 'blob-1',
    kind: 'original',
    sourceUrl: 'https://example.test/image.jpg',
    mimeType: 'image/jpeg',
    byteLength: 4,
    sha256: 'hash-1',
    bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    createdAt: '2026-06-18T00:00:00.000Z',
  });
  await repository.recordAttempt({
    uuid: 'attempt-1',
    url: 'https://example.test/missing.jpg',
    status: 'remote-only',
    reason: 'network-error',
    message: 'offline',
    createdAt: '2026-06-18T00:00:01.000Z',
  });

  assert.equal((await repository.get('blob-1'))?.byteLength, 4);
  assert.equal((await repository.getBySha256('hash-1'))?.uuid, 'blob-1');
  const beforeDelete = await repository.getUsage();
  assert.equal(beforeDelete.originalBytes, 4);
  assert.equal(beforeDelete.originalCount, 1);
  assert.equal(beforeDelete.remoteOnlyCount, 1);

  const usage = await repository.delete('blob-1');
  assert.equal(usage.originalBytes, 0);
  assert.equal(usage.originalCount, 0);
  assert.equal(usage.remoteOnlyCount, 1);
});

test('repository transaction failures are surfaced to callers', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new KeysRepository(db);
  const uncloneableRecord = {
    ...storedKeyRecord('history:uncloneable', 'uncloneable'),
    wrapping: {
      mode: 'session',
      algorithm: 'none',
      wrappedKey: () => 'not structured-cloneable',
    },
  } as unknown as StoredKeyRecord<'history'>;

  await assert.rejects(repository.put(uncloneableRecord), (error) => error instanceof DOMException || error instanceof Error);
});

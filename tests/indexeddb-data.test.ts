import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { DataStore, IMAGE_TRAIL_DB_NAME, SchemaIndex } from '../extension/src/data/schema.js';
import { HistoryRepository, type EncryptedHistoryRecord } from '../extension/src/data/repositories/history-repository.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../extension/src/data/repositories/bookmarks-repository.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import { PanelPositionRepository } from '../extension/src/data/repositories/panel-position-repository.js';
import { UrlTemplateRepository } from '../extension/src/data/repositories/url-template-repository.js';
import { DownloadsRepository } from '../extension/src/data/repositories/downloads-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../extension/src/data/repositories/encrypted-pin-thumbnails-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';
import { createAndActivateWrappedBlobKey, lockBlobKey, type ActiveBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import type { UrlTemplateRecord } from '../extension/src/core/url/templates.js';

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

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
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
    queueUpdatedAt: '2026-06-17T00:00:01.000Z',
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

test('BookmarksRepository can index imported data URL bookmarks by a small key', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const session = await createSessionKey('bookmark', 'bookmark-key', '2026-06-20T00:00:00.000Z');
  const dataUrl = `data:image/png;base64,${'a'.repeat(2048)}`;
  const indexUrl = 'image-trail-import:2026-06-20T00:00:00.000Z:photo.png';

  const encrypted = await repository.sealAndPut(
    'imported-photo',
    {
      url: dataUrl,
      title: 'photo.png',
      label: 'photo.png',
      thumbnail: dataUrl,
      bookmarkedAt: '2026-06-20T00:00:00.000Z',
      sourceCompatibility: 'favorites',
    },
    session.key,
    session.reference,
    undefined,
    indexUrl,
  );

  assert.equal(encrypted.url, indexUrl);
  assert.deepEqual(await repository.getEncryptedByUrl(indexUrl), encrypted);
  assert.equal(await repository.getEncryptedByUrl(dataUrl), undefined);
  assert.equal((await repository.openRecord(encrypted, session.key)).url, dataUrl);
});

test('EncryptedPinsRepository seals private pin metadata with the active blob key', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'pin-password',
    uuid: 'protected-pin-key',
    now: '2026-06-21T00:00:00.000Z',
  });
  t.after(() => lockBlobKey());
  const repository = new EncryptedPinsRepository(db);

  const record = await repository.sealAndPut({
    id: 'encrypted-pin-1',
    plainPinId: 'plain-pin-1',
    urlHash: 'a'.repeat(64),
    queueUpdatedAt: '2026-06-21T00:00:02.000Z',
    payload: {
      url: 'https://secret.example.test/private.jpg',
      title: 'private title',
      label: 'private label',
      bookmarkedAt: '2026-06-21T00:00:01.000Z',
      thumbnailId: 'thumbnail-1',
    },
    key: wrapped.active.key,
    keyReference: wrapped.active.reference,
  });

  assert.equal(record.envelope.key.reference, 'blob:protected-pin-key');
  assert.equal(JSON.stringify(record).includes('private title'), false);
  assert.deepEqual(await repository.getByPlainPinId('plain-pin-1'), record);
  assert.deepEqual(await repository.getByUrlHash('a'.repeat(64)), record);
  assert.deepEqual(await repository.getStorageUsage(), {
    totalBytes: new TextEncoder().encode(JSON.stringify(record.envelope)).byteLength,
    blobCount: 1,
  });
  assert.deepEqual(await repository.openRecord(record, wrapped.active.key), {
    url: 'https://secret.example.test/private.jpg',
    title: 'private title',
    label: 'private label',
    bookmarkedAt: '2026-06-21T00:00:01.000Z',
    thumbnailId: 'thumbnail-1',
  });
});

test('EncryptedPinThumbnailsRepository stores encrypted thumbnail bytes and usage', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'thumb-password',
    uuid: 'protected-thumb-key',
    now: '2026-06-21T00:00:00.000Z',
  });
  t.after(() => lockBlobKey());
  const repository = new EncryptedPinThumbnailsRepository(db);
  const bytes = new TextEncoder().encode('thumbnail bytes').buffer;

  const record = await repository.sealAndPut({
    id: 'thumb-1',
    pinId: 'plain-pin-1',
    mimeType: 'image/png',
    bytes,
    key: wrapped.active.key,
    keyReference: wrapped.active.reference,
    now: '2026-06-21T00:00:03.000Z',
  });

  assert.equal(record.pinId, 'plain-pin-1');
  assert.equal(record.byteLength, bytes.byteLength);
  assert.equal(JSON.stringify(record).includes('thumbnail bytes'), false);
  assert.deepEqual(await repository.openRecord(record, wrapped.active.key), {
    dataUrl: 'data:image/png;base64,dGh1bWJuYWlsIGJ5dGVz',
    mimeType: 'image/png',
    byteLength: bytes.byteLength,
  });
  assert.deepEqual(await repository.getStorageUsage(), { totalBytes: record.encryptedByteLength, blobCount: 1 });
});

test('DownloadsRepository writes encrypted records newest first and checks duplicates after decrypting', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new DownloadsRepository(db);
  const session = await createSessionKey('download', 'download-key', '2026-06-19T00:00:00.000Z');

  await repository.sealAndPut(
    'download-old',
    {
      sourceUrl: 'https://example.test/old.jpg',
      filename: 'old.jpg',
      fingerprint: 'a'.repeat(64),
      downloadedAt: '2026-06-19T00:00:01.000Z',
    },
    session.key,
    session.reference,
  );
  await repository.sealAndPut(
    'download-new',
    {
      sourceUrl: 'https://example.test/new.jpg',
      filename: 'new.jpg',
      fingerprint: 'b'.repeat(64),
      downloadedAt: '2026-06-19T00:00:02.000Z',
    },
    session.key,
    session.reference,
  );

  assert.deepEqual(
    (await repository.listEncryptedNewestFirst()).map((record) => record.uuid),
    ['download-new', 'download-old'],
  );

  const fingerprintDuplicate = await repository.findDuplicate(
    { sourceUrl: 'https://example.test/copy.jpg', fingerprint: 'b'.repeat(64) },
    session.key,
  );
  assert.equal(fingerprintDuplicate?.record.uuid, 'download-new');
  assert.equal(fingerprintDuplicate?.matchedBy, 'fingerprint');

  const urlDuplicate = await repository.findDuplicate({ sourceUrl: 'https://example.test/old.jpg' }, session.key);
  assert.equal(urlDuplicate?.record.uuid, 'download-old');
  assert.equal(urlDuplicate?.matchedBy, 'url');
});

test('BookmarksRepository pages encrypted records newest first', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);

  await repository.putEncrypted(bookmarkRecord('bookmark-old'));
  await repository.putEncrypted({
    ...bookmarkRecord('bookmark-new'),
    url: 'https://example.test/new.jpg',
    queueUpdatedAt: '2026-06-17T00:00:03.000Z',
    envelope: { ...bookmarkRecord('bookmark-new').envelope, updatedAt: '2026-06-17T00:00:03.000Z' },
  });
  await repository.putEncrypted({
    ...bookmarkRecord('bookmark-middle'),
    url: 'https://example.test/middle.jpg',
    queueUpdatedAt: '2026-06-17T00:00:02.000Z',
    envelope: { ...bookmarkRecord('bookmark-middle').envelope, updatedAt: '2026-06-17T00:00:02.000Z' },
  });

  assert.equal(await repository.countEncrypted(), 3);
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 0, limit: 2 })).map((record) => record.uuid),
    ['bookmark-new', 'bookmark-middle'],
  );
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 2, limit: 2 })).map((record) => record.uuid),
    ['bookmark-old'],
  );
});

test('BookmarksRepository exposes one older page after the bookmark soft max is exceeded', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const limit = DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax;

  for (let index = 0; index <= limit; index += 1) {
    const id = `bookmark-${String(index).padStart(2, '0')}`;
    await repository.putEncrypted({
      ...bookmarkRecord(id),
      url: `https://example.test/${id}.jpg`,
      envelope: {
        ...bookmarkRecord(id).envelope,
        updatedAt: `2026-06-17T00:00:${String(index).padStart(2, '0')}.000Z`,
      },
    });
  }

  const newestPage = await repository.listEncryptedPage({ offset: 0, limit });
  const olderPage = await repository.listEncryptedPage({ offset: limit, limit });
  const newerAgain = await repository.listEncryptedPage({ offset: 0, limit });

  assert.equal(await repository.countEncrypted(), limit + 1);
  assert.equal(newestPage.length, limit);
  assert.equal(newestPage[0]?.uuid, `bookmark-${String(limit).padStart(2, '0')}`);
  assert.equal(newestPage.at(-1)?.uuid, 'bookmark-01');
  assert.deepEqual(
    olderPage.map((record) => record.uuid),
    ['bookmark-00'],
  );
  assert.deepEqual(
    newerAgain.map((record) => record.uuid),
    newestPage.map((record) => record.uuid),
  );
});

test('IndexedDbBookmarkStore recalls saved bookmarks after a new store instance opens', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/recalled.jpg',
        url: 'https://example.test/recalled.jpg',
        label: 'recalled.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.url, 'https://example.test/recalled.jpg');
    assert.equal(page.hasOlder, false);
    assert.equal(page.hasNewer, false);
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore keeps protected queue order after moving older pins to front', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-order-password',
      uuid: 'pin-order-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const older = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/older.jpg',
        url: 'https://secret.example.test/older.jpg',
        label: 'older.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );
    const newer = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/newer.jpg',
        url: 'https://secret.example.test/newer.jpg',
        label: 'newer.jpg',
        timestamp: '2026-06-21T00:00:02.000Z',
        source: 'bookmark',
      }),
    );

    await store.moveToFront([older.id]);
    const page = await store.loadPage({ offset: 0, limit: 2 });

    assert.deepEqual(
      page.items.map((item) => item.id),
      [older.id, newer.id],
    );
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore removes protected original blobs through relationship rows', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-delete-password',
      uuid: 'pin-delete-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const dbResult = await openImageTrailDb();
  assert.ok(dbResult.db);
  const blobRepo = new BlobsRepository(dbResult.db);
  await blobRepo.put({
    id: 'blob-protected-original',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'iv',
    ciphertext: new ArrayBuffer(4),
    encryptedByteLength: 4,
    createdAt: '2026-06-21T00:00:00.000Z',
    key: active.reference,
    referenceCount: 1,
  });
  dbResult.db.close();

  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/delete-me.jpg',
        url: 'https://secret.example.test/delete-me.jpg',
        label: 'delete-me.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: {
          blobId: 'blob-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:00.000Z',
        },
      }),
    );

    await store.remove(saved);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }

  const verifyResult = await openImageTrailDb();
  assert.ok(verifyResult.db);
  try {
    assert.equal(await new BlobsRepository(verifyResult.db).get('blob-protected-original'), undefined);
  } finally {
    verifyResult.db.close();
  }
});

test('IndexedDbBookmarkStore recalls encrypted bookmark thumbnails after reload', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/thumbnailed.jpg',
        url: 'https://example.test/thumbnailed.jpg',
        label: 'thumbnailed.jpg',
        thumbnail: 'data:image/jpeg;base64,thumbnail',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.thumbnail, 'data:image/jpeg;base64,thumbnail');
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore writes protected pins and locked relationship placeholders', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-store-password',
      uuid: 'pin-store-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  let saved;
  try {
    saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/protected.jpg',
        url: 'https://secret.example.test/protected.jpg',
        title: 'Sensitive title',
        label: 'Sensitive label',
        thumbnail: 'data:image/png;base64,dGh1bWJuYWls',
        width: 640,
        height: 480,
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    assert.equal(saved.url, 'https://secret.example.test/protected.jpg');
    assert.equal(saved.title, 'Sensitive title');
    assert.equal(saved.thumbnail, 'data:image/png;base64,dGh1bWJuYWls');
    assert.equal(saved.protectedPin?.hasEncryptedMetadata, true);
    assert.equal(saved.protectedPin?.hasEncryptedThumbnail, true);
  } finally {
    await store.close();
  }

  assert.ok(saved);
  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    const bookmarkKey = (await new KeysRepository(db.db).listByKind('bookmark')).find(
      (record): record is StoredKeyRecord<'bookmark'> & { readonly key: CryptoKey } =>
        record.kind === 'bookmark' && record.key instanceof CryptoKey,
    );
    assert.ok(bookmarkKey);
    const relationship = await new BookmarksRepository(db.db).open(saved.id, bookmarkKey.key);
    assert.ok(relationship?.protectedPin);
    assert.equal(relationship.url, `image-trail-private:${saved.id}`);
    assert.equal(relationship.title, undefined);
    assert.equal(relationship.thumbnail, undefined);
    assert.equal(relationship.protectedPin.hasEncryptedMetadata, true);
    assert.equal(relationship.protectedPin.hasEncryptedThumbnail, true);
  } finally {
    db.db.close();
  }

  active = null;
  const lockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  try {
    const lockedPage = await lockedStore.loadPage({ offset: 0, limit: 30 });
    assert.equal(lockedPage.items.length, 1);
    assert.equal(lockedPage.items[0]?.id, saved.id);
    assert.equal(lockedPage.items[0]?.privacyStatus, 'locked');
    assert.equal(lockedPage.items[0]?.label, 'Private pin');
    assert.equal(lockedPage.items[0]?.thumbnail, undefined);
    assert.equal(lockedPage.items[0]?.protectedPin?.encryptedPinId, saved.protectedPin?.encryptedPinId);
  } finally {
    await lockedStore.close();
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore round-trips optional bookmark dimensions', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/dimensions.jpg',
        url: 'https://example.test/dimensions.jpg',
        label: 'dimensions.jpg',
        width: 1200,
        height: 800,
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.items[0]?.width, 1200);
    assert.equal(page.items[0]?.height, 800);
  } finally {
    await reloadedStore.close();
  }
});

test('PanelPositionRepository saves positions per hostname', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new PanelPositionRepository(db);

  await repository.put('example.test', { left: 120, top: 48 });
  await repository.put('other.test', { left: 24, top: 36 });

  assert.deepEqual(await repository.get('example.test'), { left: 120, top: 48 });
  assert.deepEqual(await repository.get('other.test'), { left: 24, top: 36 });
  assert.equal(await repository.get('missing.test'), null);
});

test('UrlTemplateRepository saves templates per hostname', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new UrlTemplateRepository(db);
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 1,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image/{query-page}.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'exact',
      pathShapeSignature: 'shape',
      querySignature: 'page:int',
    },
    fields: [
      {
        id: 'q:0:0',
        label: 'query page',
        placeholder: '{query-page}',
        location: 'query',
        tokenKind: 'int',
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: false,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  await repository.put(template);
  await repository.put({ ...template, id: 'other-template', hostname: 'other.test' });

  assert.deepEqual(await repository.listByHostname('example.test'), [template]);
  assert.deepEqual(await repository.listByHostname('other.test'), [{ ...template, id: 'other-template', hostname: 'other.test' }]);
  await repository.delete('example.test', 'template-001');
  assert.deepEqual(await repository.listByHostname('example.test'), []);
});

test('IndexedDbBookmarkStore keeps bookmark order stable when refreshing an existing thumbnail', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/first.jpg',
        url: 'https://example.test/first.jpg',
        label: 'first.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/second.jpg',
        url: 'https://example.test/second.jpg',
        label: 'second.jpg',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    const before = await store.loadPage({ offset: 0, limit: 30 });
    await store.save({ ...before.items[1]!, thumbnail: 'data:image/jpeg;base64,thumbnail' });
    const after = await store.loadPage({ offset: 0, limit: 30 });

    assert.deepEqual(
      after.items.map((item) => item.url),
      before.items.map((item) => item.url),
    );
    assert.equal(after.items[1]?.thumbnail, 'data:image/jpeg;base64,thumbnail');
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore loads recall records after the visible soft max', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 35; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/pin-${index}.jpg`,
          url: `https://example.test/pin-${index}.jpg`,
          label: `pin-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const visible = await store.loadPage({ offset: 0, limit: 30 });
    const recall = await store.loadRecallPage({ offset: 30, limit: 3, scope: 'global' });

    assert.equal(visible.items.length, 30);
    assert.deepEqual(
      recall.items.map((item) => item.url),
      ['https://example.test/pin-4.jpg', 'https://example.test/pin-3.jpg', 'https://example.test/pin-2.jpg'],
    );
    assert.equal(recall.nextOffset, 33);
    assert.equal(recall.hasMore, true);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore loads site-scoped recall records after the visible site soft max', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 6; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/site-${index}.jpg`,
          url: `https://example.test/site-${index}.jpg`,
          label: `site-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index * 2).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
      await store.save(
        createDisplayRecord({
          id: `https://other.test/offsite-${index}.jpg`,
          url: `https://other.test/offsite-${index}.jpg`,
          label: `offsite-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index * 2 + 1).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const visible = await store.loadPage({ offset: 0, limit: 3, scope: 'site', currentPageUrl: 'https://example.test/page' });
    const recall = await store.loadRecallPage({ offset: 3, limit: 2, scope: 'site', currentPageUrl: 'https://example.test/page' });

    assert.deepEqual(
      visible.items.map((item) => item.url),
      ['https://example.test/site-5.jpg', 'https://example.test/site-4.jpg', 'https://example.test/site-3.jpg'],
    );
    assert.deepEqual(
      recall.items.map((item) => item.url),
      ['https://example.test/site-2.jpg', 'https://example.test/site-1.jpg'],
    );
    assert.equal(recall.nextOffset, 5);
    assert.equal(recall.hasMore, true);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore moves recalled records to the front without resealing metadata', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const saved: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const record = await store.save(
        createDisplayRecord({
          id: `https://example.test/move-${index}.jpg`,
          url: `https://example.test/move-${index}.jpg`,
          label: `move-${index}.jpg`,
          timestamp: `2026-06-20T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
      saved.push(record.id);
    }

    const openResult = await openImageTrailDb();
    assert.ok(openResult.db);
    const repository = new BookmarksRepository(openResult.db);
    const before = await repository.getEncrypted(saved[0]!);
    assert.ok(before);
    const recalled = await store.moveToFront([saved[0]!]);
    const after = await repository.getEncrypted(saved[0]!);
    openResult.db.close();

    const page = await store.loadPage({ offset: 0, limit: 3 });
    assert.equal(recalled[0]?.id, saved[0]);
    assert.equal(page.items[0]?.id, saved[0]);
    assert.equal(after?.envelope.updatedAt, before.envelope.updatedAt);
    assert.notEqual(after?.queueUpdatedAt, before.queueUpdatedAt);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore updates imported image bookmarks without duplicating rows', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: '2026-06-20T00:00:00.000Z:imported.png',
        url: 'data:image/png;base64,imported',
        label: 'imported.png',
        thumbnail: 'data:image/png;base64,imported',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    const refreshed = await store.save({ ...saved, thumbnail: 'data:image/png;base64,refreshed' });
    await store.save({
      ...refreshed,
      captureStatus: 'captured',
      blobId: 'blob-001',
      capturedAt: '2026-06-20T00:00:01.000Z',
      storedOriginal: {
        blobId: 'blob-001',
        mimeType: 'image/png',
        byteLength: 8,
        capturedAt: '2026-06-20T00:00:01.000Z',
      },
    });

    const page = await store.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.url, 'data:image/png;base64,imported');
    assert.equal(page.items[0]?.captureStatus, 'captured');
    assert.equal(page.items[0]?.blobId, 'blob-001');
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore paginates visible bookmarks without counting undecryptable legacy rows', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 6; index += 1) {
      await firstStore.save(
        createDisplayRecord({
          id: `https://example.test/visible-${index}.jpg`,
          url: `https://example.test/visible-${index}.jpg`,
          label: `visible-${index}.jpg`,
          timestamp: `2026-06-19T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
    }
  } finally {
    await firstStore.close();
  }

  const openResult = await openImageTrailDb();
  assert.ok(openResult.db);
  try {
    const repository = new BookmarksRepository(openResult.db);
    await repository.putEncrypted({
      ...bookmarkRecord('legacy-hidden-newer'),
      url: 'https://example.test/legacy-hidden-newer.jpg',
      queueUpdatedAt: '2999-01-01T00:00:00.000Z',
      envelope: {
        ...bookmarkRecord('legacy-hidden-newer').envelope,
        updatedAt: '2999-01-01T00:00:00.000Z',
      },
    });
    await repository.putEncrypted({
      ...bookmarkRecord('legacy-hidden-middle'),
      url: 'https://example.test/legacy-hidden-middle.jpg',
      queueUpdatedAt: '2026-06-19T00:00:03.500Z',
      envelope: {
        ...bookmarkRecord('legacy-hidden-middle').envelope,
        updatedAt: '2026-06-19T00:00:03.500Z',
      },
    });
  } finally {
    openResult.db.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const firstPage = await reloadedStore.loadPage({ offset: 0, limit: 3 });
    const secondPage = await reloadedStore.loadPage({ offset: 3, limit: 3 });

    assert.equal(firstPage.total, 6);
    assert.equal(firstPage.items.length, 3);
    assert.equal(firstPage.hasOlder, true);
    assert.equal(firstPage.hasNewer, false);
    assert.equal(secondPage.total, 6);
    assert.equal(secondPage.items.length, 3);
    assert.equal(secondPage.hasOlder, false);
    assert.equal(secondPage.hasNewer, true);
    assert.deepEqual(
      [...firstPage.items, ...secondPage.items].map((item) => item.url).sort(),
      Array.from({ length: 6 }, (_, index) => `https://example.test/visible-${index}.jpg`).sort(),
    );
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore clamps offsets after visible bookmark totals shrink', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 4; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/clamp-${index}.jpg`,
          url: `https://example.test/clamp-${index}.jpg`,
          label: `clamp-${index}.jpg`,
          timestamp: `2026-06-19T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const lastPage = await store.loadPage({ offset: 3, limit: 3 });
    assert.equal(lastPage.offset, 3);
    assert.equal(lastPage.items.length, 1);
    await store.remove(lastPage.items[0]!);

    const clampedPage = await store.loadPage({ offset: 3, limit: 3 });
    assert.equal(clampedPage.total, 3);
    assert.equal(clampedPage.offset, 0);
    assert.equal(clampedPage.items.length, 3);
    assert.equal(clampedPage.hasOlder, false);
    assert.equal(clampedPage.hasNewer, false);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore can scope visible bookmarks to the current site', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg',
        url: 'https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg',
        label: 'duck.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    await store.save(
      createDisplayRecord({
        id: 'https://other.example.test/other.jpg',
        url: 'https://other.example.test/other.jpg',
        label: 'other.jpg',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    const globalPage = await store.loadPage({ offset: 0, limit: 30, scope: 'global', currentPageUrl: 'https://duckduckgo.com/' });
    const sourceSitePage = await store.loadPage({ offset: 0, limit: 30, scope: 'site', currentPageUrl: 'https://cdn.example.test/page' });
    const proxySitePage = await store.loadPage({ offset: 0, limit: 30, scope: 'site', currentPageUrl: 'https://duckduckgo.com/' });

    assert.equal(globalPage.total, 2);
    assert.deepEqual(
      sourceSitePage.items.map((item) => item.url),
      [],
    );
    assert.deepEqual(
      proxySitePage.items.map((item) => item.url),
      ['https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg'],
    );
    assert.equal(sourceSitePage.total, 0);
    assert.equal(proxySitePage.total, 1);
  } finally {
    await store.close();
  }
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

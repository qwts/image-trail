import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../extension/src/data/repositories/encrypted-pin-thumbnails-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';
import { createAndActivateWrappedBlobKey, lockBlobKey, type ActiveBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

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

test('IndexedDbBookmarkStore reports protected original blob ids while locked', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-original-reference-password',
      uuid: 'pin-original-reference-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const unlockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    await unlockedStore.save(
      createDisplayRecord({
        id: 'https://secret.example.test/referenced-original.jpg',
        url: 'https://secret.example.test/referenced-original.jpg',
        label: 'referenced-original.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: {
          blobId: 'blob-locked-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:00.000Z',
        },
      }),
    );
  } finally {
    await unlockedStore.close();
    active = null;
    lockBlobKey();
  }

  const lockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  try {
    assert.equal((await lockedStore.loadOriginalBlobIds()).has('blob-locked-protected-original'), true);
  } finally {
    await lockedStore.close();
  }
});

test('IndexedDbBookmarkStore removes a replaced protected original blob', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-replace-original-password',
      uuid: 'pin-replace-original-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const dbResult = await openImageTrailDb();
  assert.ok(dbResult.db);
  const blobRepo = new BlobsRepository(dbResult.db);
  for (const id of ['blob-old-protected-original', 'blob-new-protected-original']) {
    await blobRepo.put({
      id,
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
  }
  dbResult.db.close();

  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const base = createDisplayRecord({
      id: 'https://secret.example.test/replace-original.jpg',
      url: 'https://secret.example.test/replace-original.jpg',
      label: 'replace-original.jpg',
      timestamp: '2026-06-21T00:00:01.000Z',
      source: 'bookmark',
    });
    await store.save(
      createDisplayRecord({
        ...base,
        storedOriginal: {
          blobId: 'blob-old-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:00.000Z',
        },
      }),
    );
    await store.save(
      createDisplayRecord({
        ...base,
        storedOriginal: {
          blobId: 'blob-new-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:02.000Z',
        },
      }),
    );
    const ids = await store.loadOriginalBlobIds();
    assert.equal(ids.has('blob-old-protected-original'), false);
    assert.equal(ids.has('blob-new-protected-original'), true);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }

  const verifyResult = await openImageTrailDb();
  assert.ok(verifyResult.db);
  try {
    const verifyBlobs = new BlobsRepository(verifyResult.db);
    assert.equal(await verifyBlobs.get('blob-old-protected-original'), undefined);
    assert.notEqual(await verifyBlobs.get('blob-new-protected-original'), undefined);
  } finally {
    verifyResult.db.close();
  }
});

test('IndexedDbBookmarkStore batch removes locked protected backing rows without decrypting private metadata', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-batch-delete-password',
      uuid: 'pin-batch-delete-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const dbResult = await openImageTrailDb();
  assert.ok(dbResult.db);
  await new BlobsRepository(dbResult.db).put({
    id: 'blob-batch-protected-original',
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

  let saved;
  const unlockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    saved = await unlockedStore.save(
      createDisplayRecord({
        id: 'https://secret.example.test/batch-delete.jpg',
        url: 'https://secret.example.test/batch-delete.jpg',
        label: 'batch-delete.jpg',
        thumbnail: 'data:image/png;base64,dGh1bWJuYWls',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: {
          blobId: 'blob-batch-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:00.000Z',
        },
      }),
    );
  } finally {
    await unlockedStore.close();
    active = null;
    lockBlobKey();
  }

  const lockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  try {
    const result = await lockedStore.removeMany([saved.id]);
    assert.equal(result.removedCount, 1);
  } finally {
    await lockedStore.close();
  }

  const verifyResult = await openImageTrailDb();
  assert.ok(verifyResult.db);
  try {
    assert.equal(await new BookmarksRepository(verifyResult.db).getEncrypted(saved.id), undefined);
    assert.equal(await new EncryptedPinsRepository(verifyResult.db).get(saved.protectedPin!.encryptedPinId!), undefined);
    assert.equal(await new EncryptedPinThumbnailsRepository(verifyResult.db).get(saved.protectedPin!.encryptedThumbnailId!), undefined);
    assert.equal(await new BlobsRepository(verifyResult.db).get('blob-batch-protected-original'), undefined);
  } finally {
    verifyResult.db.close();
  }
});

test('IndexedDbBookmarkStore clears protected original relationship while keeping the pin', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-clear-original-password',
      uuid: 'pin-clear-original-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const dbResult = await openImageTrailDb();
  assert.ok(dbResult.db);
  await new BlobsRepository(dbResult.db).put({
    id: 'blob-clear-protected-original',
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
        id: 'https://secret.example.test/clear-original.jpg',
        url: 'https://secret.example.test/clear-original.jpg',
        label: 'clear-original.jpg',
        thumbnail: 'data:image/png;base64,dGh1bWJuYWls',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
        captureStatus: 'captured',
        blobId: 'blob-clear-protected-original',
        storedOriginal: {
          blobId: 'blob-clear-protected-original',
          mimeType: 'image/jpeg',
          byteLength: 4,
          capturedAt: '2026-06-21T00:00:00.000Z',
        },
      }),
    );

    await store.save({
      ...saved,
      captureStatus: undefined,
      blobId: undefined,
      storedOriginal: undefined,
    });

    const page = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.captureStatus, undefined);
    assert.equal(page.items[0]?.storedOriginal, undefined);
    assert.equal(page.items[0]?.protectedPin?.hasStoredOriginal, false);
  } finally {
    await store.close();
    lockBlobKey();
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
    assert.deepEqual(saved.pinSaveStorage, { destination: 'encrypted' });
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

test('IndexedDbBookmarkStore falls back to plaintext when encrypted pin saves are locked', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => null,
    getPinSaveStoragePreference: () => 'encrypted',
  });
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/locked-fallback.jpg',
        url: 'https://secret.example.test/locked-fallback.jpg',
        label: 'locked-fallback.jpg',
        thumbnail: 'data:image/png;base64,bG9ja2VkLXRodW1i',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    assert.deepEqual(saved.pinSaveStorage, { destination: 'plaintext', reason: 'locked' });
    assert.equal(saved.protectedPin, undefined);
    const page = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(page.items[0]?.url, 'https://secret.example.test/locked-fallback.jpg');
    assert.equal(page.items[0]?.thumbnail, 'data:image/png;base64,bG9ja2VkLXRodW1i');
    assert.equal(page.items[0]?.privacyStatus, undefined);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore honors plaintext pin save preference even when unlocked', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-plaintext-password',
      uuid: 'pin-plaintext-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => active,
    getPinSaveStoragePreference: () => 'plaintext',
  });
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/plaintext-setting.jpg',
        url: 'https://secret.example.test/plaintext-setting.jpg',
        label: 'plaintext-setting.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    assert.deepEqual(saved.pinSaveStorage, { destination: 'plaintext', reason: 'setting' });
    assert.equal(saved.protectedPin, undefined);
  } finally {
    await store.close();
    lockBlobKey();
  }

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    assert.deepEqual(await new EncryptedPinsRepository(db.db).getStorageUsage(), { totalBytes: 0, blobCount: 0 });
  } finally {
    db.db.close();
  }
});

test('IndexedDbBookmarkStore preserves existing protected pins when plaintext saves are preferred', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-existing-protected-password',
      uuid: 'pin-existing-protected-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  let preference: 'encrypted' | 'plaintext' = 'encrypted';
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => active,
    getPinSaveStoragePreference: () => preference,
  });
  try {
    const encrypted = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/existing-protected.jpg',
        url: 'https://secret.example.test/existing-protected.jpg',
        label: 'existing-protected.jpg',
        thumbnail: 'data:image/png;base64,Zmlyc3Q=',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );
    preference = 'plaintext';
    const updated = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/existing-protected.jpg',
        url: 'https://secret.example.test/existing-protected.jpg',
        label: 'existing-protected-updated.jpg',
        thumbnail: 'data:image/png;base64,c2Vjb25k',
        timestamp: '2026-06-21T00:00:02.000Z',
        source: 'bookmark',
      }),
    );

    assert.equal(updated.id, encrypted.id);
    assert.deepEqual(updated.pinSaveStorage, { destination: 'encrypted' });
    assert.equal(updated.protectedPin?.encryptedPinId, encrypted.protectedPin?.encryptedPinId);
    assert.equal(updated.label, 'existing-protected-updated.jpg');
    const unlockedPage = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(unlockedPage.items.length, 1);
    assert.equal(unlockedPage.items[0]?.label, 'existing-protected-updated.jpg');
  } finally {
    await store.close();
    lockBlobKey();
  }

  const lockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  try {
    const lockedPage = await lockedStore.loadPage({ offset: 0, limit: 30 });
    assert.equal(lockedPage.items.length, 1);
    assert.equal(lockedPage.items[0]?.privacyStatus, 'locked');
  } finally {
    await lockedStore.close();
  }

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    assert.equal((await new EncryptedPinsRepository(db.db).getStorageUsage()).blobCount, 1);
    assert.equal(await new BookmarksRepository(db.db).countEncrypted(), 1);
  } finally {
    db.db.close();
  }
});

test('IndexedDbBookmarkStore caches merged protected metadata and hydrates only visible thumbnails', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-merge-cache-password',
      uuid: 'pin-merge-cache-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    for (let index = 0; index < 3; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://secret.example.test/cache-${index}.jpg`,
          url: `https://secret.example.test/cache-${index}.jpg`,
          label: `cache-${index}.jpg`,
          thumbnail: `data:image/png;base64,${btoa(`thumb-${index}`)}`,
          timestamp: `2026-06-21T00:00:0${index + 1}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const originalOpenPin = EncryptedPinsRepository.prototype.openRecord;
    const originalOpenThumbnail = EncryptedPinThumbnailsRepository.prototype.openRecord;
    let openedPinMetadata = 0;
    let openedThumbnails = 0;
    EncryptedPinsRepository.prototype.openRecord = function countedOpenPinRecord(
      record,
      key,
    ): ReturnType<EncryptedPinsRepository['openRecord']> {
      openedPinMetadata += 1;
      return originalOpenPin.call(this, record, key);
    };
    EncryptedPinThumbnailsRepository.prototype.openRecord = function countedOpenThumbnailRecord(
      record,
      key,
    ): ReturnType<EncryptedPinThumbnailsRepository['openRecord']> {
      openedThumbnails += 1;
      return originalOpenThumbnail.call(this, record, key);
    };
    try {
      const firstPage = await store.loadPage({ offset: 0, limit: 1 });
      const secondPage = await store.loadPage({ offset: 1, limit: 1 });

      assert.equal(firstPage.items.length, 1);
      assert.equal(secondPage.items.length, 1);
      assert.ok(firstPage.items[0]?.thumbnail);
      assert.ok(secondPage.items[0]?.thumbnail);
      assert.equal(openedPinMetadata, 3);
      assert.equal(openedThumbnails, 2);
    } finally {
      EncryptedPinsRepository.prototype.openRecord = originalOpenPin;
      EncryptedPinThumbnailsRepository.prototype.openRecord = originalOpenThumbnail;
    }
  } finally {
    await store.close();
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore does not cache stale protected merges invalidated during load', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-stale-cache-password',
      uuid: 'pin-stale-cache-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const originalOpenPin = EncryptedPinsRepository.prototype.openRecord;
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/stale-before.jpg',
        url: 'https://secret.example.test/stale-before.jpg',
        label: 'stale-before.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    let releaseMergeOpen!: () => void;
    const mergeOpenStarted = new Promise<void>((resolve) => {
      EncryptedPinsRepository.prototype.openRecord = async function blockedOpenPinRecord(
        record,
        key,
      ): ReturnType<EncryptedPinsRepository['openRecord']> {
        EncryptedPinsRepository.prototype.openRecord = originalOpenPin;
        resolve();
        await new Promise<void>((release) => {
          releaseMergeOpen = release;
        });
        return originalOpenPin.call(this, record, key);
      };
    });
    const staleLoad = store.loadPage({ offset: 0, limit: 30 });
    await mergeOpenStarted;
    await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/stale-after.jpg',
        url: 'https://secret.example.test/stale-after.jpg',
        label: 'stale-after.jpg',
        timestamp: '2026-06-21T00:00:02.000Z',
        source: 'bookmark',
      }),
    );

    releaseMergeOpen();
    await staleLoad;
    const freshPage = await store.loadPage({ offset: 0, limit: 30 });

    assert.equal(freshPage.items.length, 2);
    assert.deepEqual(freshPage.items.map((item) => item.url).sort(), [
      'https://secret.example.test/stale-after.jpg',
      'https://secret.example.test/stale-before.jpg',
    ]);
  } finally {
    EncryptedPinsRepository.prototype.openRecord = originalOpenPin;
    await store.close();
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore keeps protected page loads alive when thumbnail hydration fails', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-thumbnail-failure-password',
      uuid: 'pin-thumbnail-failure-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const originalOpenThumbnail = EncryptedPinThumbnailsRepository.prototype.openRecord;
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/bad-thumbnail.jpg',
        url: 'https://secret.example.test/bad-thumbnail.jpg',
        label: 'bad-thumbnail.jpg',
        thumbnail: 'data:image/png;base64,dGh1bWI=',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );
    EncryptedPinThumbnailsRepository.prototype.openRecord = async function failingOpenThumbnail(): ReturnType<
      EncryptedPinThumbnailsRepository['openRecord']
    > {
      throw new Error('simulated thumbnail open failure');
    };

    const page = await store.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.url, 'https://secret.example.test/bad-thumbnail.jpg');
    assert.equal(page.items[0]?.thumbnail, undefined);
  } finally {
    EncryptedPinThumbnailsRepository.prototype.openRecord = originalOpenThumbnail;
    await store.close();
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore serializes concurrent protected saves for the same URL', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-concurrent-password',
      uuid: 'pin-concurrent-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const [first, second] = await Promise.all([
      store.save(
        createDisplayRecord({
          id: 'https://secret.example.test/concurrent.jpg',
          url: 'https://secret.example.test/concurrent.jpg',
          label: 'concurrent-first.jpg',
          thumbnail: 'data:image/png;base64,Zmlyc3Q=',
          timestamp: '2026-06-21T00:00:01.000Z',
          source: 'bookmark',
        }),
      ),
      store.save(
        createDisplayRecord({
          id: 'https://secret.example.test/concurrent.jpg',
          url: 'https://secret.example.test/concurrent.jpg',
          label: 'concurrent-second.jpg',
          thumbnail: 'data:image/png;base64,c2Vjb25k',
          timestamp: '2026-06-21T00:00:02.000Z',
          source: 'bookmark',
        }),
      ),
    ]);

    assert.equal(first.id, second.id);
    assert.equal(first.protectedPin?.encryptedPinId, second.protectedPin?.encryptedPinId);
    const page = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(page.items.length, 1);
  } finally {
    await store.close();
    lockBlobKey();
  }

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    assert.equal((await new EncryptedPinsRepository(db.db).getStorageUsage()).blobCount, 1);
    assert.equal((await new EncryptedPinThumbnailsRepository(db.db).getStorageUsage()).blobCount, 1);
    assert.equal(await new BookmarksRepository(db.db).countEncrypted(), 1);
  } finally {
    db.db.close();
  }
});

test('IndexedDbBookmarkStore cleans failed protected save attempts before plaintext fallback', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-failed-password',
      uuid: 'pin-failed-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const originalSealAndPut = EncryptedPinsRepository.prototype.sealAndPut;
  EncryptedPinsRepository.prototype.sealAndPut = async function failingSealAndPut(): ReturnType<EncryptedPinsRepository['sealAndPut']> {
    throw new Error('simulated encrypted pin failure');
  };
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => active,
    getPinSaveStoragePreference: () => 'encrypted',
  });
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/failed-fallback.jpg',
        url: 'https://secret.example.test/failed-fallback.jpg',
        label: 'failed-fallback.jpg',
        thumbnail: 'data:image/png;base64,Zg==',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    assert.deepEqual(saved.pinSaveStorage, { destination: 'plaintext', reason: 'failed' });
    assert.equal(saved.protectedPin, undefined);
  } finally {
    await store.close();
    EncryptedPinsRepository.prototype.sealAndPut = originalSealAndPut;
    lockBlobKey();
  }

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    assert.deepEqual(await new EncryptedPinsRepository(db.db).getStorageUsage(), { totalBytes: 0, blobCount: 0 });
    assert.deepEqual(await new EncryptedPinThumbnailsRepository(db.db).getStorageUsage(), { totalBytes: 0, blobCount: 0 });
  } finally {
    db.db.close();
  }
});

test('IndexedDbBookmarkStore finds protected saved rows by URL while unlocked', async () => {
  await deleteImageTrailDb();
  const { active } = await createAndActivateWrappedBlobKey({
    password: 'find-protected-password',
    uuid: 'find-protected-key',
    now: '2026-06-21T00:00:00.000Z',
  });
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: 'https://secret.example.test/find-protected.jpg',
        url: 'https://secret.example.test/find-protected.jpg',
        label: 'find-protected.jpg',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    const found = await store.findByUrl(saved.url);

    assert.equal(found?.id, saved.id);
    assert.equal(found?.url, saved.url);
    assert.equal(found?.privacyStatus, 'unlocked');
    assert.equal(found?.protectedPin?.encryptedPinId, saved.protectedPin?.encryptedPinId);
  } finally {
    await store.close();
    lockBlobKey();
  }
});

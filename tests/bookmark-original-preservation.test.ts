import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { createSaveBookmarkMessage } from '../extension/src/background/messages.js';
import { saveBookmarkRequestSchema } from '../extension/src/background/message-schemas.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createAndActivateWrappedBlobKey, lockBlobKey, type ActiveBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { exportPlainBookmarks } from '../extension/src/data/import-export/bookmarks-export.js';
import { importBookmarks } from '../extension/src/data/import-export/bookmarks-import.js';
import { InteropRecordExportStore } from '../extension/src/data/interop/record-export.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { DataStore } from '../extension/src/data/schema.js';
import type { KeyReference } from '../extension/src/data/crypto/types.js';
import { bookmarkPayloadToDisplayRecord } from '../extension/src/ui/panel/restore-import-preview.js';
import { deleteImageTrailDb, transactionDone } from './indexeddb-test-helpers.js';
import * as v from 'valibot';

const ORIGINAL = {
  blobId: 'blob-preserved-original',
  mimeType: 'image/jpeg',
  byteLength: 4,
  capturedAt: '2026-07-18T00:00:00.000Z',
} as const;

async function putOriginalBlob(key: KeyReference<'blob'>): Promise<void> {
  const opened = await openImageTrailDb();
  assert.ok(opened.db);
  try {
    await new BlobsRepository(opened.db).put({
      id: ORIGINAL.blobId,
      kind: 'original',
      schemaVersion: 1,
      algorithm: 'AES-GCM',
      iv: 'iv',
      ciphertext: new ArrayBuffer(4),
      encryptedByteLength: 4,
      createdAt: ORIGINAL.capturedAt,
      key,
      referenceCount: 1,
    });
  } finally {
    opened.db.close();
  }
}

async function assertOriginalBlobExists(): Promise<void> {
  const opened = await openImageTrailDb();
  assert.ok(opened.db);
  try {
    assert.notEqual(await new BlobsRepository(opened.db).get(ORIGINAL.blobId), undefined);
  } finally {
    opened.db.close();
  }
}

async function assertOriginalBlobMissing(): Promise<void> {
  const opened = await openImageTrailDb();
  assert.ok(opened.db);
  try {
    assert.equal(await new BlobsRepository(opened.db).get(ORIGINAL.blobId), undefined);
  } finally {
    opened.db.close();
  }
}

test('plain bookmark re-save without a blob preserves its captured original', async () => {
  await deleteImageTrailDb();
  await putOriginalBlob(createKeyReference('blob', 'plain-original-key'));
  const store = new IndexedDbBookmarkStore();
  const url = 'https://example.test/plain-preserved.jpg';
  try {
    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );

    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:02.000Z',
        source: 'bookmark',
      }),
    );

    const saved = (await store.loadPage({ offset: 0, limit: 1 })).items[0];
    assert.deepEqual(saved?.storedOriginal, ORIGINAL);
    assert.equal((await store.loadOriginalBlobIds()).has(ORIGINAL.blobId), true);
  } finally {
    await store.close();
  }
  await assertOriginalBlobExists();
});

test('converting a plaintext bookmark to protected storage preserves its captured original', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = null;
  await putOriginalBlob(createKeyReference('blob', 'plain-to-protected-original-key'));
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://example.test/plain-to-protected-preserved.jpg';
  try {
    const plain = await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );
    active = (
      await createAndActivateWrappedBlobKey({
        password: 'plain-to-protected-original-password',
        uuid: 'plain-to-protected-original-key',
        now: '2026-07-18T00:00:02.000Z',
      })
    ).active;

    const protectedPin = await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:03.000Z',
        source: 'bookmark',
      }),
    );

    assert.equal(protectedPin.id, plain.id);
    assert.deepEqual(protectedPin.storedOriginal, ORIGINAL);
    assert.equal(protectedPin.protectedPin?.storedOriginalBlobId, ORIGINAL.blobId);
    assert.equal((await store.loadOriginalBlobIds()).has(ORIGINAL.blobId), true);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }
  await assertOriginalBlobExists();
});

test('explicit clearing during plaintext-to-protected conversion removes the captured original', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = null;
  await putOriginalBlob(createKeyReference('blob', 'plain-to-protected-clear-key'));
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://example.test/plain-to-protected-cleared.jpg';
  try {
    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );
    active = (
      await createAndActivateWrappedBlobKey({
        password: 'plain-to-protected-clear-password',
        uuid: 'plain-to-protected-clear-key',
        now: '2026-07-18T00:00:02.000Z',
      })
    ).active;

    const protectedPin = await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:03.000Z',
        source: 'bookmark',
      }),
      { clearStoredOriginal: true },
    );

    assert.equal(protectedPin.storedOriginal, undefined);
    assert.equal(protectedPin.protectedPin?.hasStoredOriginal, false);
    assert.equal((await store.loadOriginalBlobIds()).has(ORIGINAL.blobId), false);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }
  await assertOriginalBlobMissing();
});

test('plaintext-to-protected conversion removes stale metadata from the locked queue', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = null;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://secret.example.test/plain-then-protected.jpg';
  try {
    const plain = await store.save(
      createDisplayRecord({
        id: url,
        url,
        title: 'Stale plaintext title',
        label: 'Stale plaintext label',
        thumbnail: 'data:image/png;base64,c3RhbGU=',
        timestamp: '2026-06-21T00:00:01.000Z',
        source: 'bookmark',
      }),
    );
    active = (
      await createAndActivateWrappedBlobKey({
        password: 'pin-convert-plaintext-password',
        uuid: 'pin-convert-plaintext-key',
        now: '2026-06-21T00:00:02.000Z',
      })
    ).active;

    const protectedPin = await store.save(
      createDisplayRecord({
        id: url,
        url,
        title: 'Protected title',
        label: 'Protected label',
        thumbnail: 'data:image/png;base64,cHJvdGVjdGVk',
        timestamp: '2026-06-21T00:00:03.000Z',
        source: 'bookmark',
      }),
    );

    assert.equal(protectedPin.id, plain.id);
    assert.deepEqual(protectedPin.pinSaveStorage, { destination: 'encrypted' });
    const unlockedPage = await store.loadPage({ offset: 0, limit: 30 });
    assert.equal(unlockedPage.items.length, 1);
    assert.equal(unlockedPage.items[0]?.title, 'Protected title');
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }

  const lockedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  try {
    const lockedPage = await lockedStore.loadPage({ offset: 0, limit: 30 });
    assert.equal(lockedPage.items.length, 1);
    assert.equal(lockedPage.items[0]?.privacyStatus, 'locked');
    assert.equal(lockedPage.items[0]?.url.startsWith('image-trail-private:'), true);
    assert.equal(lockedPage.items[0]?.title, undefined);
    assert.equal(lockedPage.items[0]?.label, 'Private pin');
    assert.equal(lockedPage.items[0]?.thumbnail, undefined);
  } finally {
    await lockedStore.close();
  }

  const db = await openImageTrailDb();
  assert.ok(db.db);
  try {
    assert.equal(await new BookmarksRepository(db.db).countEncrypted(), 1);
  } finally {
    db.db.close();
  }
});

test('protected bookmark re-save without a blob preserves encrypted metadata and its relationship', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'preserve-protected-original-password',
      uuid: 'preserve-protected-original-key',
      now: '2026-07-18T00:00:00.000Z',
    })
  ).active;
  await putOriginalBlob(active.reference);
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://example.test/protected-preserved.jpg';
  try {
    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );

    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:02.000Z',
        source: 'bookmark',
      }),
    );

    const saved = (await store.loadPage({ offset: 0, limit: 1 })).items[0];
    assert.deepEqual(saved?.storedOriginal, ORIGINAL);
    assert.equal(saved?.protectedPin?.storedOriginalBlobId, ORIGINAL.blobId);
    assert.equal((await store.loadOriginalBlobIds()).has(ORIGINAL.blobId), true);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }
  await assertOriginalBlobExists();
});

test('explicit protected-original clearing still removes metadata and its relationship', async () => {
  await deleteImageTrailDb();
  let active: ActiveBlobKey | null = (
    await createAndActivateWrappedBlobKey({
      password: 'clear-protected-original-password',
      uuid: 'clear-protected-original-key',
      now: '2026-07-18T00:00:00.000Z',
    })
  ).active;
  await putOriginalBlob(active.reference);
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://example.test/protected-cleared.jpg';
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );

    const cleared = { ...saved, captureStatus: undefined, blobId: undefined, storedOriginal: undefined };
    await store.save(cleared, { clearStoredOriginal: true });

    const reloaded = (await store.loadPage({ offset: 0, limit: 1 })).items[0];
    assert.equal(reloaded?.captureStatus, undefined);
    assert.equal(reloaded?.storedOriginal, undefined);
    assert.equal(reloaded?.protectedPin?.hasStoredOriginal, false);

    const message = createSaveBookmarkMessage(cleared, { clearStoredOriginal: true });
    const serializedPayload = JSON.parse(JSON.stringify(message.payload)) as unknown;
    assert.equal(v.safeParse(saveBookmarkRequestSchema, serializedPayload).success, true);
  } finally {
    await store.close();
    active = null;
    lockBlobKey();
  }
  await assertOriginalBlobMissing();
});

test('explicit plain-original clearing preserves interop custody and deletes the original blob', async () => {
  await deleteImageTrailDb();
  await putOriginalBlob(createKeyReference('blob', 'clear-plain-original-key'));
  const store = new IndexedDbBookmarkStore();
  const url = 'https://example.test/plain-cleared.jpg';
  const firstInteropId = '11111111-1111-4111-8111-111111111111';
  const replacementInteropId = '22222222-2222-4222-8222-222222222222';
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );

    const opened = await openImageTrailDb();
    assert.ok(opened.db);
    try {
      const firstReview = await new InteropRecordExportStore(opened.db, { createId: () => firstInteropId }).review([saved.id]);
      assert.equal(firstReview.records[0]?.record.identity.interopId, firstInteropId);
    } finally {
      opened.db.close();
    }

    const cleared = { ...saved, captureStatus: undefined, blobId: undefined, storedOriginal: undefined };
    await store.save(cleared, { clearStoredOriginal: true });

    const reviewed = await openImageTrailDb();
    assert.ok(reviewed.db);
    try {
      const secondReview = await new InteropRecordExportStore(reviewed.db, { createId: () => replacementInteropId }).review([saved.id]);
      assert.equal(secondReview.records[0]?.record.identity.interopId, firstInteropId);
    } finally {
      reviewed.db.close();
    }

    const reloaded = (await store.loadPage({ offset: 0, limit: 1 })).items[0];
    assert.equal(reloaded?.storedOriginal, undefined);
  } finally {
    await store.close();
  }
  await assertOriginalBlobMissing();
});

test('legacy ordinary-index interop custody survives conversion to a protected pin', async () => {
  await deleteImageTrailDb();
  const url = 'https://example.test/legacy-interop.jpg';
  const interopId = '11111111-2222-4333-8444-555555555555';
  const plainStore = new IndexedDbBookmarkStore();
  const legacy = await plainStore.save(
    createDisplayRecord({
      id: url,
      url,
      label: 'legacy-interop.jpg',
      timestamp: '2026-07-18T00:00:01.000Z',
      source: 'bookmark',
    }),
  );
  await plainStore.close();

  const prepared = await openImageTrailDb();
  assert.ok(prepared.db);
  try {
    const review = await new InteropRecordExportStore(prepared.db, { createId: () => interopId }).review([legacy.id]);
    assert.equal(review.records[0]?.record.identity.interopId, interopId);
    const transaction = prepared.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete('bookmarkInteropCustodyPresence:v1');
    await transactionDone(transaction);
    assert.equal(await new BookmarksRepository(prepared.db).getInteropCustodyPresence(), undefined);
  } finally {
    prepared.db.close();
  }

  const { active } = await createAndActivateWrappedBlobKey({
    password: 'legacy-interop-password',
    uuid: 'legacy-interop-key',
    now: '2026-07-18T00:00:02.000Z',
  });
  const protectedStore = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    const converted = await protectedStore.save(
      createDisplayRecord({
        id: url,
        url,
        label: 'legacy-interop-protected.jpg',
        timestamp: '2026-07-18T00:00:03.000Z',
        source: 'bookmark',
      }),
    );
    assert.equal(converted.id, legacy.id);
    assert.ok(converted.protectedPin?.encryptedPinId);

    const verified = await openImageTrailDb();
    assert.ok(verified.db);
    try {
      const encryptedPin = await new EncryptedPinsRepository(verified.db).get(converted.protectedPin.encryptedPinId);
      assert.ok(encryptedPin);
      const payload = await new EncryptedPinsRepository(verified.db).openRecord(encryptedPin, active.key);
      assert.equal(payload.interop?.record.identity.interopId, interopId);
      assert.equal(await new BookmarksRepository(verified.db).countEncrypted(), 1);
      assert.equal(await new BookmarksRepository(verified.db).getInteropCustodyPresence(), true);
    } finally {
      verified.db.close();
    }
  } finally {
    await protectedStore.close();
    lockBlobKey();
  }
});

test('bookmarks-only import over an existing bookmark preserves the local captured original', async () => {
  await deleteImageTrailDb();
  await putOriginalBlob(createKeyReference('blob', 'import-original-key'));
  const store = new IndexedDbBookmarkStore();
  const url = 'https://example.test/import-preserved.jpg';
  try {
    await store.save(
      createDisplayRecord({
        id: url,
        url,
        timestamp: '2026-07-18T00:00:01.000Z',
        source: 'bookmark',
        storedOriginal: ORIGINAL,
      }),
    );

    const exported = exportPlainBookmarks({
      entries: [
        {
          uuid: 'imported-bookmark',
          payload: {
            url,
            bookmarkedAt: '2026-07-18T00:00:02.000Z',
            storedOriginal: {
              ...ORIGINAL,
              blobId: 'external-blob-not-imported',
            },
          },
        },
      ],
    });
    assert.ok(exported.fileContent);
    const imported = await importBookmarks(exported.fileContent, '');
    assert.equal(imported.entries[0]?.payload.storedOriginal, undefined);

    const entry = imported.entries[0];
    assert.ok(entry);
    await store.save(bookmarkPayloadToDisplayRecord(entry.uuid, entry.payload));

    const saved = (await store.loadPage({ offset: 0, limit: 1 })).items[0];
    assert.deepEqual(saved?.storedOriginal, ORIGINAL);
    assert.equal((await store.loadOriginalBlobIds()).has(ORIGINAL.blobId), true);
  } finally {
    await store.close();
  }
  await assertOriginalBlobExists();
});

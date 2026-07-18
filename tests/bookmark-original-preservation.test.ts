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
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import type { KeyReference } from '../extension/src/data/crypto/types.js';
import { bookmarkPayloadToDisplayRecord } from '../extension/src/ui/panel/restore-import-preview.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';
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

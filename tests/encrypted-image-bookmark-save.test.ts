import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

async function activeBlobKey() {
  return { key: await generateAesGcmKey(false), reference: createKeyReference('blob', crypto.randomUUID()) };
}

function record(url: string, thumbnail?: string) {
  return createDisplayRecord({
    id: url,
    url,
    label: 'duplicate.png',
    ...(thumbnail ? { thumbnail } : {}),
    timestamp: '2026-07-20T00:00:00.000Z',
    source: 'bookmark',
  });
}

test('protected import converts a plaintext duplicate without dropping its thumbnail', async (t) => {
  await deleteImageTrailDb();
  const active = await activeBlobKey();
  const store = new IndexedDbBookmarkStore({
    getActiveBlobKey: () => active,
    getPinSaveStoragePreference: () => 'plaintext',
  });
  t.after(async () => {
    await store.close();
    await deleteImageTrailDb();
  });
  const url = 'https://images.example.test/plain-duplicate.png';
  const thumbnail = 'data:image/png;base64,cGxhaW4tdGh1bWI=';
  const plain = await store.save(record(url, thumbnail));
  assert.deepEqual(plain.pinSaveStorage, { destination: 'plaintext', reason: 'setting' });

  const imported = await store.saveProtectedResult(record(url), active);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.record.id, plain.id);
  assert.equal(imported.record.thumbnail, thumbnail);
  assert.equal(imported.record.protectedPin?.hasEncryptedThumbnail, true);
});

test('protected import reuses an encrypted duplicate thumbnail without orphaning it', async (t) => {
  await deleteImageTrailDb();
  const active = await activeBlobKey();
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  t.after(async () => {
    await store.close();
    await deleteImageTrailDb();
  });
  const url = 'https://images.example.test/protected-duplicate.png';
  const thumbnail = 'data:image/png;base64,cHJvdGVjdGVkLXRodWJi';
  const before = await store.save(record(url, thumbnail));
  const thumbnailId = before.protectedPin?.encryptedThumbnailId;
  assert.ok(thumbnailId);

  const imported = await store.saveProtectedResult(record(url), active);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.record.thumbnail, thumbnail);
  assert.equal(imported.record.protectedPin?.encryptedThumbnailId, thumbnailId);
});

test('protected import merges current curated metadata after a stale import draft was created', async (t) => {
  await deleteImageTrailDb();
  const active = await activeBlobKey();
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  t.after(async () => {
    await store.close();
    await deleteImageTrailDb();
  });
  const url = 'https://images.example.test/concurrent-import.png';
  const original = await store.save(record(url));
  const staleImport = createDisplayRecord({
    ...record(url),
    title: 'Stale title',
    label: 'Stale label',
    storedOriginal: {
      blobId: 'new-original',
      mimeType: 'image/png',
      byteLength: 42,
      capturedAt: '2026-07-20T00:00:02.000Z',
      fileName: 'concurrent-import.png',
    },
  });
  await store.save(
    createDisplayRecord({
      ...record(url),
      title: 'Current title',
      label: 'Current label',
      width: 2048,
      height: 1024,
      downloadedAt: '2026-07-20T00:00:03.000Z',
    }),
  );

  const imported = await store.saveProtectedResult(staleImport, active);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.record.title, 'Current title');
  assert.equal(imported.record.label, 'Current label');
  assert.equal(imported.record.width, 2048);
  assert.equal(imported.record.height, 1024);
  assert.equal(imported.record.downloadedAt, '2026-07-20T00:00:03.000Z');
  assert.equal(imported.record.queueUpdatedAt, original.queueUpdatedAt);
  assert.equal(imported.record.storedOriginal?.blobId, 'new-original');
});

test('protected import reports when existing protected metadata committed before its relationship write failed', async (t) => {
  await deleteImageTrailDb();
  const active = await activeBlobKey();
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  const url = 'https://images.example.test/committed-before-failure.png';
  await store.save(record(url));
  const originalSealAndPut = BookmarksRepository.prototype.sealAndPut;
  BookmarksRepository.prototype.sealAndPut = async function failingRelationshipWrite(): ReturnType<BookmarksRepository['sealAndPut']> {
    throw new Error('simulated relationship failure');
  };
  t.after(async () => {
    BookmarksRepository.prototype.sealAndPut = originalSealAndPut;
    await store.close();
    await deleteImageTrailDb();
  });

  const imported = await store.saveProtectedResult(
    createDisplayRecord({
      ...record(url),
      storedOriginal: {
        blobId: 'committed-original',
        mimeType: 'image/png',
        byteLength: 42,
        capturedAt: '2026-07-20T00:00:02.000Z',
        fileName: 'committed-before-failure.png',
      },
    }),
    active,
  );

  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.equal(imported.durableMetadataCommitted, true);
  assert.equal(imported.message, 'simulated relationship failure');
});

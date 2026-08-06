import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
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

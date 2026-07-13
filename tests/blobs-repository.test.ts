import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { IMAGE_TRAIL_DB_NAME } from '../extension/src/data/schema.js';
import { BlobsRepository } from '../extension/src/data/repositories/blobs-repository.js';
import type { StoredBlobRecord } from '../extension/src/data/types.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMAGE_TRAIL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Blocked deleting test database.'));
  });
}

async function openFreshDb(): Promise<IDBDatabase> {
  await deleteDb();
  const result = await openImageTrailDb();
  assert.ok(result.status.ok, `DB open failed: ${result.status.message}`);
  return result.db!;
}

function makeBlobRecord(overrides: Partial<StoredBlobRecord> = {}): StoredBlobRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    kind: overrides.kind ?? 'original',
    schemaVersion: overrides.schemaVersion ?? 1,
    algorithm: overrides.algorithm ?? 'AES-GCM',
    iv: overrides.iv ?? 'AAAAAAAAAAAAAAAA',
    ciphertext: overrides.ciphertext ?? new ArrayBuffer(100),
    encryptedByteLength: overrides.encryptedByteLength ?? 100,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    key: overrides.key ?? createKeyReference('blob', 'blob-key-1'),
    referenceCount: overrides.referenceCount ?? 1,
  };
}

test('BlobsRepository stores and retrieves blob records by id', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  const record = makeBlobRecord({ id: 'blob-1' });
  await repo.put(record);

  const retrieved = await repo.get('blob-1');
  assert.ok(retrieved);
  assert.equal(retrieved.id, 'blob-1');
  assert.equal(retrieved.encryptedByteLength, 100);
  assert.equal(retrieved.key.reference, 'blob:blob-key-1');
});

test('BlobsRepository stores duplicate encrypted captures separately', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  const first = makeBlobRecord({ id: 'blob-a', referenceCount: 1 });
  await repo.put(first);

  const second = makeBlobRecord({ id: 'blob-b', referenceCount: 1 });
  const result = await repo.put(second);

  assert.equal(result.id, 'blob-b');
  assert.equal(result.referenceCount, 1);

  assert.ok(await repo.get('blob-a'));
  assert.ok(await repo.get('blob-b'));
});

test('BlobsRepository finds missing ids without hydrating encrypted records', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  await repo.put(makeBlobRecord({ id: 'present-original', ciphertext: new ArrayBuffer(1_000_000) }));
  repo.get = () => {
    throw new Error('existence checks must not hydrate blob records');
  };

  const missing = await repo.findMissingIds(['missing-a', 'present-original', 'missing-a', 'missing-b']);

  assert.deepEqual(missing, ['missing-a', 'missing-b']);
  assert.deepEqual(await repo.findMissingIds([]), []);
});

test('BlobsRepository decrements reference count and deletes at zero', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  const record = makeBlobRecord({ id: 'blob-rc', referenceCount: 2 });
  await repo.put(record);

  await repo.remove('blob-rc');
  const afterFirst = await repo.get('blob-rc');
  assert.ok(afterFirst);
  assert.equal(afterFirst.referenceCount, 1);

  await repo.remove('blob-rc');
  const afterSecond = await repo.get('blob-rc');
  assert.equal(afterSecond, undefined);
});

test('BlobsRepository remove is a no-op for nonexistent blobs', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  await repo.remove('does-not-exist');
});

test('BlobsRepository deleteMany removes unique ids in one operation', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  await repo.put(makeBlobRecord({ id: 'delete-a', referenceCount: 3 }));
  await repo.put(makeBlobRecord({ id: 'delete-b', referenceCount: 1 }));
  await repo.put(makeBlobRecord({ id: 'keep-c', referenceCount: 1 }));

  const deletedCount = await repo.deleteMany(['delete-a', 'delete-b', 'delete-a']);
  assert.equal(deletedCount, 2);
  assert.equal(await repo.get('delete-a'), undefined);
  assert.equal(await repo.get('delete-b'), undefined);
  assert.ok(await repo.get('keep-c'));
});

test('BlobsRepository reports storage usage across all records', async (t) => {
  const db = await openFreshDb();
  t.after(() => db.close());
  const repo = new BlobsRepository(db);

  const emptyUsage = await repo.getStorageUsage();
  assert.equal(emptyUsage.blobCount, 0);
  assert.equal(emptyUsage.totalBytes, 0);

  await repo.put(makeBlobRecord({ id: 'b1', encryptedByteLength: 500 }));
  await repo.put(makeBlobRecord({ id: 'b2', encryptedByteLength: 300 }));

  const usage = await repo.getStorageUsage();
  assert.equal(usage.blobCount, 2);
  assert.equal(usage.totalBytes, 800);

  await repo.remove('b1');
  const usageAfter = await repo.getStorageUsage();
  assert.equal(usageAfter.blobCount, 1);
  assert.equal(usageAfter.totalBytes, 300);
});

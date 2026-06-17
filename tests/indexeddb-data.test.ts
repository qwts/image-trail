import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { DataStore, IMAGE_TRAIL_DB_NAME, SchemaIndex } from '../extension/src/data/schema.js';
import { HistoryRepository, type EncryptedHistoryRecord } from '../extension/src/data/repositories/history-repository.js';
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

  assert.deepEqual(asArray(db.objectStoreNames), [DataStore.History, DataStore.Keys, DataStore.Metadata].sort());

  const transaction = db.transaction([DataStore.Metadata, DataStore.Keys, DataStore.History], 'readonly');
  const keys = transaction.objectStore(DataStore.Keys);
  const history = transaction.objectStore(DataStore.History);

  assert.deepEqual(asArray(keys.indexNames), [SchemaIndex.KeysByKind, SchemaIndex.KeysByReference, SchemaIndex.KeysByUuid].sort());
  assert.deepEqual(asArray(history.indexNames), [SchemaIndex.HistoryByKeyReference, SchemaIndex.HistoryByUpdatedAt].sort());

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

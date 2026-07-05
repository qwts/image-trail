import assert from 'node:assert/strict';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { IMAGE_TRAIL_DB_NAME } from '../extension/src/data/schema.js';
import type { EncryptedHistoryRecord } from '../extension/src/data/repositories/history-repository.js';
import type { EncryptedBookmarkRecord } from '../extension/src/data/repositories/bookmarks-repository.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';

export async function deleteImageTrailDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IMAGE_TRAIL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Timed out deleting test IndexedDB database.'));
  });
}

export async function openFreshImageTrailDb(): Promise<IDBDatabase> {
  await deleteImageTrailDb();
  const result = await openImageTrailDb();
  assert.equal(result.status.ok, true, result.status.message);
  assert.ok(result.db);
  return result.db;
}

export function asArray(list: DOMStringList): string[] {
  return Array.from({ length: list.length }, (_, index) => list.item(index)).filter((value): value is string => value !== null);
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export function storedKeyRecord(reference: `history:${string}` = 'history:key-001', uuid = 'key-001'): StoredKeyRecord<'history'> {
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

export function bookmarkRecord(uuid = 'bookmark-001'): EncryptedBookmarkRecord {
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

export function historyRecord(uuid = 'history-001'): EncryptedHistoryRecord {
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

import type { StoredKeyRecord } from '../crypto/types.js';
import { DataStore } from '../schema.js';

export class KeysRepository {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: StoredKeyRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Keys, 'readwrite');
    transaction.objectStore(DataStore.Keys).put(record);
    await transactionDone(transaction);
  }

  async get(reference: string): Promise<StoredKeyRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Keys, 'readonly');
    const result = await requestToPromise<StoredKeyRecord | undefined>(transaction.objectStore(DataStore.Keys).get(reference));
    await transactionDone(transaction);
    return result;
  }
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

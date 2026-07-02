import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import type { StoredBlobRecord } from '../types.js';
import { storedBlobRecordSchema } from '../types.schema.js';
import { hydrateRecord, hydrateRecords } from './hydration.js';

export class BlobsRepository {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: StoredBlobRecord): Promise<StoredBlobRecord> {
    const transaction = this.db.transaction(DataStore.Blobs, 'readwrite');
    transaction.objectStore(DataStore.Blobs).put(record);
    await transactionDone(transaction);
    return record;
  }

  async get(id: string): Promise<StoredBlobRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Blobs, 'readonly');
    const result = await requestToPromise<unknown>(transaction.objectStore(DataStore.Blobs).get(id));
    await transactionDone(transaction);
    return hydrateRecord(DataStore.Blobs, storedBlobRecordSchema, result);
  }

  async list(): Promise<readonly StoredBlobRecord[]> {
    const transaction = this.db.transaction(DataStore.Blobs, 'readonly');
    const result = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Blobs).getAll());
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Blobs, storedBlobRecordSchema, result);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    const transaction = this.db.transaction(DataStore.Blobs, 'readwrite');
    const store = transaction.objectStore(DataStore.Blobs);
    if (existing.referenceCount <= 1) {
      store.delete(id);
    } else {
      const updated: StoredBlobRecord = { ...existing, referenceCount: existing.referenceCount - 1 };
      store.put(updated);
    }
    await transactionDone(transaction);
  }

  async deleteMany(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const transaction = this.db.transaction(DataStore.Blobs, 'readwrite');
    const store = transaction.objectStore(DataStore.Blobs);
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) store.delete(id);
    await transactionDone(transaction);
    return uniqueIds.length;
  }

  async getStorageUsage(): Promise<StorageUsageSummary> {
    const transaction = this.db.transaction(DataStore.Blobs, 'readonly');
    const store = transaction.objectStore(DataStore.Blobs);
    const request = store.openCursor();

    let totalBytes = 0;
    let blobCount = 0;

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as StoredBlobRecord;
          totalBytes += record.encryptedByteLength;
          blobCount += 1;
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return { totalBytes, blobCount };
  }
}

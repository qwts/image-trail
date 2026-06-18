import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';

export interface StoredImageBlobRecord {
  readonly uuid: string;
  readonly kind: 'original' | 'thumbnail';
  readonly sourceUrl: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
  readonly createdAt: string;
}

export interface StoredCaptureAttemptRecord {
  readonly uuid: string;
  readonly url: string;
  readonly status: 'remote-only' | 'failed';
  readonly reason: string;
  readonly message: string;
  readonly createdAt: string;
}

export interface BlobStorageUsage {
  readonly originalBytes: number;
  readonly originalCount: number;
  readonly remoteOnlyCount: number;
  readonly failedCount: number;
  readonly updatedAt: string;
}

export class BlobsRepository {
  constructor(private readonly db: IDBDatabase) {}

  async putOriginal(record: StoredImageBlobRecord): Promise<void> {
    const transaction = this.db.transaction([DataStore.ImageBlobs, DataStore.CaptureAttempts, DataStore.StorageStats], 'readwrite');
    transaction.objectStore(DataStore.ImageBlobs).put(record);
    await this.writeUsage(transaction, new Date().toISOString());
    await transactionDone(transaction);
  }

  async get(uuid: string): Promise<StoredImageBlobRecord | undefined> {
    const transaction = this.db.transaction(DataStore.ImageBlobs, 'readonly');
    const result = await requestToPromise<StoredImageBlobRecord | undefined>(transaction.objectStore(DataStore.ImageBlobs).get(uuid));
    await transactionDone(transaction);
    return result;
  }

  async getBySha256(sha256: string): Promise<StoredImageBlobRecord | undefined> {
    const transaction = this.db.transaction(DataStore.ImageBlobs, 'readonly');
    const result = await requestToPromise<StoredImageBlobRecord | undefined>(
      transaction.objectStore(DataStore.ImageBlobs).index(SchemaIndex.ImageBlobsBySha256).get(sha256),
    );
    await transactionDone(transaction);
    return result;
  }

  async delete(uuid: string): Promise<BlobStorageUsage> {
    const transaction = this.db.transaction([DataStore.ImageBlobs, DataStore.CaptureAttempts, DataStore.StorageStats], 'readwrite');
    transaction.objectStore(DataStore.ImageBlobs).delete(uuid);
    const usage = await this.writeUsage(transaction, new Date().toISOString());
    await transactionDone(transaction);
    return usage;
  }

  async recordAttempt(record: StoredCaptureAttemptRecord): Promise<BlobStorageUsage> {
    const transaction = this.db.transaction([DataStore.ImageBlobs, DataStore.CaptureAttempts, DataStore.StorageStats], 'readwrite');
    transaction.objectStore(DataStore.CaptureAttempts).put(record);
    const usage = await this.writeUsage(transaction, new Date().toISOString());
    await transactionDone(transaction);
    return usage;
  }

  async getUsage(): Promise<BlobStorageUsage> {
    const transaction = this.db.transaction([DataStore.ImageBlobs, DataStore.CaptureAttempts], 'readonly');
    const usage = await computeUsage(transaction, new Date().toISOString());
    await transactionDone(transaction);
    return usage;
  }

  private async writeUsage(transaction: IDBTransaction, updatedAt: string): Promise<BlobStorageUsage> {
    const usage = await computeUsage(transaction, updatedAt);
    transaction.objectStore(DataStore.StorageStats).put({ key: 'blobUsage', ...usage });
    return usage;
  }
}

async function computeUsage(transaction: IDBTransaction, updatedAt: string): Promise<BlobStorageUsage> {
  const blobs = await requestToPromise<StoredImageBlobRecord[]>(transaction.objectStore(DataStore.ImageBlobs).getAll());
  const attempts = transaction.objectStoreNames.contains(DataStore.CaptureAttempts)
    ? await requestToPromise<StoredCaptureAttemptRecord[]>(transaction.objectStore(DataStore.CaptureAttempts).getAll())
    : [];
  return {
    originalBytes: blobs.filter((blob) => blob.kind === 'original').reduce((total, blob) => total + blob.byteLength, 0),
    originalCount: blobs.filter((blob) => blob.kind === 'original').length,
    remoteOnlyCount: attempts.filter((attempt) => attempt.status === 'remote-only').length,
    failedCount: attempts.filter((attempt) => attempt.status === 'failed').length,
    updatedAt,
  };
}

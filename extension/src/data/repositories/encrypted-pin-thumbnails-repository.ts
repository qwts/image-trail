import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import { openBlobPayload, sealBlobPayload } from '../crypto/binary-envelope.js';
import type { KeyReference } from '../crypto/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

export interface EncryptedPinThumbnailRecord {
  readonly id: string;
  readonly pinId: string;
  readonly schemaVersion: 1;
  readonly algorithm: 'AES-GCM';
  readonly iv: string;
  readonly ciphertext: ArrayBuffer;
  readonly encryptedByteLength: number;
  readonly byteLength: number;
  readonly createdAt: string;
  readonly key: KeyReference<'blob'>;
}

export interface OpenedEncryptedPinThumbnail {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export class EncryptedPinThumbnailsRepository {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: EncryptedPinThumbnailRecord): Promise<EncryptedPinThumbnailRecord> {
    const transaction = this.db.transaction(DataStore.EncryptedPinThumbnails, 'readwrite');
    transaction.objectStore(DataStore.EncryptedPinThumbnails).put(record);
    await transactionDone(transaction);
    return record;
  }

  async get(id: string): Promise<EncryptedPinThumbnailRecord | undefined> {
    const transaction = this.db.transaction(DataStore.EncryptedPinThumbnails, 'readonly');
    const result = await requestToPromise<EncryptedPinThumbnailRecord | undefined>(
      transaction.objectStore(DataStore.EncryptedPinThumbnails).get(id),
    );
    await transactionDone(transaction);
    return result;
  }

  async remove(id: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.EncryptedPinThumbnails, 'readwrite');
    transaction.objectStore(DataStore.EncryptedPinThumbnails).delete(id);
    await transactionDone(transaction);
  }

  async sealAndPut(input: {
    readonly id: string;
    readonly pinId: string;
    readonly mimeType: string;
    readonly bytes: ArrayBuffer;
    readonly key: CryptoKey;
    readonly keyReference: KeyReference<'blob'>;
    readonly now?: string;
  }): Promise<EncryptedPinThumbnailRecord> {
    const now = input.now ?? new Date().toISOString();
    const sealed = await sealBlobPayload({
      key: input.key,
      aad: {
        id: input.id,
        kind: 'thumbnail',
        schemaVersion: 1,
        algorithm: 'AES-GCM',
        createdAt: now,
        key: input.keyReference,
      },
      metadata: { mimeType: input.mimeType, byteLength: input.bytes.byteLength, sourceUrl: input.pinId, capturedAt: now },
      bytes: input.bytes,
    });
    return this.put({
      id: input.id,
      pinId: input.pinId,
      schemaVersion: 1,
      algorithm: 'AES-GCM',
      iv: sealed.iv,
      ciphertext: sealed.ciphertext,
      encryptedByteLength: sealed.encryptedByteLength,
      byteLength: input.bytes.byteLength,
      createdAt: now,
      key: input.keyReference,
    });
  }

  async openRecord(record: EncryptedPinThumbnailRecord, key: CryptoKey): Promise<OpenedEncryptedPinThumbnail> {
    const opened = await openBlobPayload({
      key,
      iv: record.iv,
      ciphertext: record.ciphertext,
      aad: {
        id: record.id,
        kind: 'thumbnail',
        schemaVersion: record.schemaVersion,
        algorithm: record.algorithm,
        createdAt: record.createdAt,
        key: record.key,
      },
    });
    return {
      dataUrl: `data:${opened.metadata.mimeType};base64,${arrayBufferToBase64(opened.bytes)}`,
      mimeType: opened.metadata.mimeType,
      byteLength: opened.metadata.byteLength,
    };
  }

  async getStorageUsage(): Promise<StorageUsageSummary> {
    const transaction = this.db.transaction(DataStore.EncryptedPinThumbnails, 'readonly');
    const store = transaction.objectStore(DataStore.EncryptedPinThumbnails);
    const request = store.openCursor();

    let totalBytes = 0;
    let blobCount = 0;
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as EncryptedPinThumbnailRecord;
        totalBytes += record.encryptedByteLength;
        blobCount += 1;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    return { totalBytes, blobCount };
  }
}

function arrayBufferToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...view.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

import * as v from 'valibot';
import { openJsonEnvelope, openValidatedJsonEnvelope, sealJsonEnvelope } from '../crypto/envelope.js';
import type { EncryptedEnvelope } from '../crypto/types.js';
import { encryptedEnvelopeSchema } from '../crypto/types.schema.js';
import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import type { DurableBookmarkPayloadV1 } from '../types.js';
import { durableBookmarkPayloadSchema } from '../types.schema.js';
import { hydrateRecord, hydrateRecords } from './hydration.js';

export interface EncryptedBookmarkRecord {
  readonly uuid: string;
  readonly url: string;
  readonly queueUpdatedAt: string;
  readonly envelope: EncryptedEnvelope<{ readonly recordType: 'bookmark' }>;
}

const encryptedBookmarkRecordSchema = v.object({
  uuid: v.string(),
  url: v.string(),
  queueUpdatedAt: v.string(),
  envelope: encryptedEnvelopeSchema('bookmark'),
}) as v.GenericSchema<unknown, EncryptedBookmarkRecord>;

export class BookmarksRepository {
  constructor(private readonly db: IDBDatabase) {}

  async putEncrypted(record: EncryptedBookmarkRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readwrite');
    transaction.objectStore(DataStore.Bookmarks).put(record);
    await transactionDone(transaction);
  }

  async getEncrypted(uuid: string): Promise<EncryptedBookmarkRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<unknown>(transaction.objectStore(DataStore.Bookmarks).get(uuid));
    await transactionDone(transaction);
    return hydrateRecord(DataStore.Bookmarks, encryptedBookmarkRecordSchema, result);
  }

  async listEncrypted(): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Bookmarks).getAll());
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Bookmarks, encryptedBookmarkRecordSchema, result);
  }

  async countEncrypted(): Promise<number> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<number>(transaction.objectStore(DataStore.Bookmarks).count());
    await transactionDone(transaction);
    return result;
  }

  async getStorageUsage(key?: CryptoKey): Promise<StorageUsageSummary> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const request = transaction.objectStore(DataStore.Bookmarks).openCursor();
    let totalBytes = 0;
    let blobCount = 0;
    const envelopes: Array<EncryptedBookmarkRecord['envelope']> = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as EncryptedBookmarkRecord;
        totalBytes += new TextEncoder().encode(JSON.stringify(record.envelope)).byteLength;
        blobCount += 1;
        if (key) envelopes.push(record.envelope);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    let thumbnailCount = 0;
    let thumbnailBytes = 0;
    if (key) {
      for (const envelope of envelopes) {
        try {
          const payload = await openJsonEnvelope<DurableBookmarkPayloadV1>(envelope, key);
          if (payload.thumbnail) {
            thumbnailCount += 1;
            thumbnailBytes += new TextEncoder().encode(payload.thumbnail).byteLength;
          }
        } catch {
          // Unreadable rows still count as queue metadata, but their inline thumbnail size is unknown.
        }
      }
    }
    return { totalBytes, blobCount, thumbnails: { count: thumbnailCount, totalBytes: thumbnailBytes } };
  }

  async listEncryptedPage(input: { readonly offset: number; readonly limit: number }): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const index = transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByQueueUpdatedAt);
    const request = index.openCursor(null, 'prev');
    const result: EncryptedBookmarkRecord[] = [];
    const offset = Math.max(0, input.offset);
    const limit = Math.max(0, input.limit);
    let skipped = 0;

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || result.length >= limit) {
          resolve();
          return;
        }
        if (skipped < offset) {
          skipped += 1;
          cursor.continue();
          return;
        }
        const record = hydrateRecord(DataStore.Bookmarks, encryptedBookmarkRecordSchema, cursor.value);
        if (record) result.push(record);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return result;
  }

  async listEncryptedNewestFirst(): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const index = transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByQueueUpdatedAt);
    const request = index.openCursor(null, 'prev');
    const result: EncryptedBookmarkRecord[] = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = hydrateRecord(DataStore.Bookmarks, encryptedBookmarkRecordSchema, cursor.value);
        if (record) result.push(record);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return result;
  }

  async getEncryptedByUrl(url: string): Promise<EncryptedBookmarkRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<unknown>(transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByUrl).get(url));
    await transactionDone(transaction);
    return hydrateRecord(DataStore.Bookmarks, encryptedBookmarkRecordSchema, result);
  }

  async remove(uuid: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readwrite');
    transaction.objectStore(DataStore.Bookmarks).delete(uuid);
    await transactionDone(transaction);
  }

  async updateQueueUpdatedAt(
    updates: readonly { readonly uuid: string; readonly queueUpdatedAt: string }[],
  ): Promise<readonly EncryptedBookmarkRecord[]> {
    if (updates.length === 0) return [];
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readwrite');
    const store = transaction.objectStore(DataStore.Bookmarks);
    const updated: EncryptedBookmarkRecord[] = [];
    for (const update of updates) {
      const existing = await requestToPromise<EncryptedBookmarkRecord | undefined>(store.get(update.uuid));
      if (!existing) continue;
      const next = { ...existing, queueUpdatedAt: update.queueUpdatedAt };
      store.put(next);
      updated.push(next);
    }
    await transactionDone(transaction);
    return updated;
  }

  async sealAndPut(
    uuid: string,
    payload: DurableBookmarkPayloadV1,
    key: CryptoKey,
    keyReference: EncryptedBookmarkRecord['envelope']['key'],
    now?: string,
    indexUrl = payload.url,
    queueUpdatedAt = now ?? new Date().toISOString(),
  ): Promise<EncryptedBookmarkRecord> {
    const envelope = await sealJsonEnvelope({
      payload,
      payloadVersion: 1,
      key,
      keyReference,
      authenticatedMetadata: { recordType: 'bookmark' as const },
      now,
    });
    const record = { uuid, url: indexUrl, queueUpdatedAt, envelope };
    await this.putEncrypted(record);
    return record;
  }

  async open(uuid: string, key: CryptoKey): Promise<DurableBookmarkPayloadV1 | null> {
    const record = await this.getEncrypted(uuid);
    return record ? openValidatedJsonEnvelope(record.envelope, key, durableBookmarkPayloadSchema) : null;
  }

  async openRecord(record: EncryptedBookmarkRecord, key: CryptoKey): Promise<DurableBookmarkPayloadV1> {
    return openValidatedJsonEnvelope(record.envelope, key, durableBookmarkPayloadSchema);
  }
}

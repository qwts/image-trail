import { openJsonEnvelope, sealJsonEnvelope } from '../crypto/envelope.js';
import type { EncryptedEnvelope } from '../crypto/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import type { DurableBookmarkPayloadV1 } from '../types.js';

export interface EncryptedBookmarkRecord {
  readonly uuid: string;
  readonly url: string;
  readonly envelope: EncryptedEnvelope<{ readonly recordType: 'bookmark' }>;
}

export class BookmarksRepository {
  constructor(private readonly db: IDBDatabase) {}

  async putEncrypted(record: EncryptedBookmarkRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readwrite');
    transaction.objectStore(DataStore.Bookmarks).put(record);
    await transactionDone(transaction);
  }

  async getEncrypted(uuid: string): Promise<EncryptedBookmarkRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<EncryptedBookmarkRecord | undefined>(transaction.objectStore(DataStore.Bookmarks).get(uuid));
    await transactionDone(transaction);
    return result;
  }

  async listEncrypted(): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<EncryptedBookmarkRecord[]>(transaction.objectStore(DataStore.Bookmarks).getAll());
    await transactionDone(transaction);
    return result;
  }

  async countEncrypted(): Promise<number> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<number>(transaction.objectStore(DataStore.Bookmarks).count());
    await transactionDone(transaction);
    return result;
  }

  async listEncryptedPage(input: { readonly offset: number; readonly limit: number }): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const index = transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByUpdatedAt);
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
        result.push(cursor.value as EncryptedBookmarkRecord);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return result;
  }

  async listEncryptedNewestFirst(): Promise<readonly EncryptedBookmarkRecord[]> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const index = transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByUpdatedAt);
    const request = index.openCursor(null, 'prev');
    const result: EncryptedBookmarkRecord[] = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        result.push(cursor.value as EncryptedBookmarkRecord);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return result;
  }

  async getEncryptedByUrl(url: string): Promise<EncryptedBookmarkRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readonly');
    const result = await requestToPromise<EncryptedBookmarkRecord | undefined>(
      transaction.objectStore(DataStore.Bookmarks).index(SchemaIndex.BookmarksByUrl).get(url),
    );
    await transactionDone(transaction);
    return result;
  }

  async remove(uuid: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Bookmarks, 'readwrite');
    transaction.objectStore(DataStore.Bookmarks).delete(uuid);
    await transactionDone(transaction);
  }

  async sealAndPut(
    uuid: string,
    payload: DurableBookmarkPayloadV1,
    key: CryptoKey,
    keyReference: EncryptedBookmarkRecord['envelope']['key'],
    now?: string,
    indexUrl = payload.url,
  ): Promise<EncryptedBookmarkRecord> {
    const envelope = await sealJsonEnvelope({
      payload,
      payloadVersion: 1,
      key,
      keyReference,
      authenticatedMetadata: { recordType: 'bookmark' as const },
      now,
    });
    const record = { uuid, url: indexUrl, envelope };
    await this.putEncrypted(record);
    return record;
  }

  async open(uuid: string, key: CryptoKey): Promise<DurableBookmarkPayloadV1 | null> {
    const record = await this.getEncrypted(uuid);
    return record ? openJsonEnvelope<DurableBookmarkPayloadV1>(record.envelope, key) : null;
  }

  async openRecord(record: EncryptedBookmarkRecord, key: CryptoKey): Promise<DurableBookmarkPayloadV1> {
    return openJsonEnvelope<DurableBookmarkPayloadV1>(record.envelope, key);
  }
}

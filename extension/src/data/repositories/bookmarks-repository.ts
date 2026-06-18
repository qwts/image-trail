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
  ): Promise<EncryptedBookmarkRecord> {
    const envelope = await sealJsonEnvelope({
      payload,
      payloadVersion: 1,
      key,
      keyReference,
      authenticatedMetadata: { recordType: 'bookmark' as const },
    });
    const record = { uuid, url: payload.url, envelope };
    await this.putEncrypted(record);
    return record;
  }

  async open(uuid: string, key: CryptoKey): Promise<DurableBookmarkPayloadV1 | null> {
    const record = await this.getEncrypted(uuid);
    return record ? openJsonEnvelope<DurableBookmarkPayloadV1>(record.envelope, key) : null;
  }
}

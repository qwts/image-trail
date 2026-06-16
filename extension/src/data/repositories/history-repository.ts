import { openJsonEnvelope, sealJsonEnvelope } from '../crypto/envelope.js';
import type { EncryptedEnvelope } from '../crypto/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import type { DurableHistoryPayloadV1 } from '../types.js';

export interface EncryptedHistoryRecord {
  readonly uuid: string;
  readonly envelope: EncryptedEnvelope<{ readonly recordType: 'history' }>;
}

export class HistoryRepository {
  constructor(private readonly db: IDBDatabase) {}

  async putEncrypted(record: EncryptedHistoryRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.History, 'readwrite');
    transaction.objectStore(DataStore.History).put(record);
    await transactionDone(transaction);
  }

  async getEncrypted(uuid: string): Promise<EncryptedHistoryRecord | undefined> {
    const transaction = this.db.transaction(DataStore.History, 'readonly');
    const result = await requestToPromise<EncryptedHistoryRecord | undefined>(transaction.objectStore(DataStore.History).get(uuid));
    await transactionDone(transaction);
    return result;
  }

  async sealAndPut(
    uuid: string,
    payload: DurableHistoryPayloadV1,
    key: CryptoKey,
    keyReference: EncryptedHistoryRecord['envelope']['key'],
  ): Promise<EncryptedHistoryRecord> {
    const envelope = await sealJsonEnvelope({
      payload,
      payloadVersion: 1,
      key,
      keyReference,
      authenticatedMetadata: { recordType: 'history' as const },
    });
    const record = { uuid, envelope };
    await this.putEncrypted(record);
    return record;
  }

  async open(uuid: string, key: CryptoKey): Promise<DurableHistoryPayloadV1 | null> {
    const record = await this.getEncrypted(uuid);
    return record ? openJsonEnvelope<DurableHistoryPayloadV1>(record.envelope, key) : null;
  }
}

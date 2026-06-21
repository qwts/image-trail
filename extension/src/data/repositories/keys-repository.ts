import { assertKeyReference } from '../crypto/key-reference.js';
import type { StoredKeyRecord } from '../crypto/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { SchemaIndex } from '../schema.js';

export class KeysRepository {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: StoredKeyRecord): Promise<void> {
    assertKeyReference(record);
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

  async listByKind(kind: StoredKeyRecord['kind']): Promise<readonly StoredKeyRecord[]> {
    const transaction = this.db.transaction(DataStore.Keys, 'readonly');
    const result = await requestToPromise<StoredKeyRecord[]>(
      transaction.objectStore(DataStore.Keys).index(SchemaIndex.KeysByKind).getAll(kind),
    );
    await transactionDone(transaction);
    return result;
  }

  async remove(reference: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Keys, 'readwrite');
    transaction.objectStore(DataStore.Keys).delete(reference);
    await transactionDone(transaction);
  }
}

import * as v from 'valibot';
import { interopUuidSchema } from '../../core/interop/contract.js';
import { interopKeyIdSchema } from '../../core/interop/pairing.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import { hydrateRecord, hydrateRecords } from './hydration.js';

export interface StoredInteropKeyRecord {
  readonly kind: 'interop';
  readonly uuid: string;
  readonly reference: `interop:${string}`;
  readonly pairingId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly wrapping: { readonly mode: 'indexeddb'; readonly algorithm: 'none' };
  readonly extractable: false;
  readonly key: CryptoKey;
}

const storedInteropKeyRecordSchema = v.pipe(
  v.strictObject({
    kind: v.literal('interop'),
    uuid: interopUuidSchema,
    reference: interopKeyIdSchema,
    pairingId: interopUuidSchema,
    createdAt: v.pipe(v.string(), v.isoTimestamp()),
    updatedAt: v.pipe(v.string(), v.isoTimestamp()),
    wrapping: v.strictObject({ mode: v.literal('indexeddb'), algorithm: v.literal('none') }),
    extractable: v.literal(false),
    key: v.instance(CryptoKey),
  }),
  v.check((record) => record.reference === `interop:${record.uuid}`, 'Interop key reference must match its UUID.'),
);

export class InteropKeysRepository {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: StoredInteropKeyRecord): Promise<void> {
    const parsed = v.parse(storedInteropKeyRecordSchema, record);
    const transaction = this.db.transaction(DataStore.Keys, 'readwrite');
    transaction.objectStore(DataStore.Keys).put(parsed);
    await transactionDone(transaction);
  }

  async get(reference: string): Promise<StoredInteropKeyRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Keys, 'readonly');
    const result = await requestToPromise<unknown>(transaction.objectStore(DataStore.Keys).get(reference));
    await transactionDone(transaction);
    return hydrateRecord(DataStore.Keys, storedInteropKeyRecordSchema, result);
  }

  async list(): Promise<readonly StoredInteropKeyRecord[]> {
    const transaction = this.db.transaction(DataStore.Keys, 'readonly');
    const result = await requestToPromise<unknown[]>(
      transaction.objectStore(DataStore.Keys).index(SchemaIndex.KeysByKind).getAll('interop'),
    );
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Keys, storedInteropKeyRecordSchema, result);
  }
}

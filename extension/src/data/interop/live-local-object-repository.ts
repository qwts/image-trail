import * as v from 'valibot';

import { interopTimestampSchema, interopUuidSchema, sha256Schema } from '../../core/interop/contract.js';
import { InteropTransportError, assertSafeInteropPath, sha256, type InteropObjectPage } from '../../core/interop/transport.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';

const liveLocalObjectRecordSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  operationId: interopUuidSchema,
  path: v.pipe(v.string(), v.minLength(1)),
  sha256: sha256Schema,
  bytes: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  ciphertext: v.instance(ArrayBuffer),
  createdAt: interopTimestampSchema,
});

type LiveLocalObjectRecord = v.InferOutput<typeof liveLocalObjectRecordSchema>;

function objectId(operationId: string, path: string): string {
  return `${operationId}\u0000${path}`;
}

function sameBytes(left: ArrayBuffer, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return new Uint8Array(left).every((byte, index) => byte === right[index]);
}

function notFound(path: string): InteropTransportError {
  return new InteropTransportError(`Live local encrypted object is unavailable: ${path}`, 'not-found', false);
}

/** Durable, operation-scoped staging for ciphertext received from Overlook.
 * Resolving put is the durability boundary before the live session sends ACK. */
export class IndexedDbLiveLocalObjectRepository {
  readonly #operationId: string;

  constructor(
    private readonly db: IDBDatabase,
    operationId: string,
  ) {
    this.#operationId = v.parse(interopUuidSchema, operationId);
  }

  async put(pathInput: string, bytesInput: Uint8Array, expectedSha256: string): Promise<void> {
    const path = assertSafeInteropPath(pathInput);
    const bytes = bytesInput.slice();
    try {
      const digest = await sha256(bytes);
      if (digest !== v.parse(sha256Schema, expectedSha256)) {
        throw new InteropTransportError('Live local ciphertext failed repository verification.', 'corrupt', false);
      }
      const candidate = v.parse(liveLocalObjectRecordSchema, {
        id: objectId(this.#operationId, path),
        operationId: this.#operationId,
        path,
        sha256: digest,
        bytes: bytes.byteLength,
        ciphertext: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        createdAt: new Date().toISOString(),
      });
      const transaction = this.db.transaction(DataStore.LiveLocalObjects, 'readwrite');
      const store = transaction.objectStore(DataStore.LiveLocalObjects);
      const priorValue = await requestToPromise<unknown>(store.get(candidate.id));
      if (priorValue !== undefined) {
        const prior = v.parse(liveLocalObjectRecordSchema, priorValue);
        if (prior.sha256 !== candidate.sha256 || prior.bytes !== candidate.bytes || !sameBytes(prior.ciphertext, bytes)) {
          transaction.abort();
          throw new InteropTransportError('Live local object identity was replayed with different ciphertext.', 'corrupt', false);
        }
      } else {
        store.add(candidate);
      }
      await transactionDone(transaction);
    } finally {
      bytes.fill(0);
    }
  }

  async get(pathInput: string): Promise<Uint8Array> {
    const path = assertSafeInteropPath(pathInput);
    const record = await this.read(path);
    if (!record) throw notFound(path);
    return new Uint8Array(record.ciphertext.slice(0));
  }

  async list(prefixInput: string, cursor: string | null): Promise<InteropObjectPage> {
    const prefix = assertSafeInteropPath(prefixInput);
    if (cursor !== null) throw new InteropTransportError('Live local repository does not accept an unknown list cursor.', 'corrupt', false);
    const records = await this.records();
    return {
      entries: records
        .filter((record) => record.path.startsWith(prefix))
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((record) => ({ path: record.path, bytes: record.bytes })),
      nextCursor: null,
    };
  }

  async delete(pathInput: string): Promise<void> {
    const path = assertSafeInteropPath(pathInput);
    const transaction = this.db.transaction(DataStore.LiveLocalObjects, 'readwrite');
    transaction.objectStore(DataStore.LiveLocalObjects).delete(objectId(this.#operationId, path));
    await transactionDone(transaction);
  }

  async quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: null }> {
    const records = await this.records();
    return { usedBytes: records.reduce((total, record) => total + record.bytes, 0), totalBytes: null };
  }

  async verify(pathInput: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const path = assertSafeInteropPath(pathInput);
    const record = await this.read(path);
    if (!record) throw notFound(path);
    if ((await sha256(new Uint8Array(record.ciphertext))) !== record.sha256 || record.ciphertext.byteLength !== record.bytes) {
      throw new InteropTransportError('Durable live local ciphertext failed verification.', 'corrupt', false);
    }
    return { sha256: record.sha256, bytes: record.bytes };
  }

  async clear(): Promise<void> {
    const transaction = this.db.transaction(DataStore.LiveLocalObjects, 'readwrite');
    const store = transaction.objectStore(DataStore.LiveLocalObjects);
    const keys = await requestToPromise<IDBValidKey[]>(
      store.index(SchemaIndex.LiveLocalObjectsByOperationId).getAllKeys(this.#operationId),
    );
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  }

  private async read(path: string): Promise<LiveLocalObjectRecord | undefined> {
    const transaction = this.db.transaction(DataStore.LiveLocalObjects, 'readonly');
    const value = await requestToPromise<unknown>(
      transaction.objectStore(DataStore.LiveLocalObjects).get(objectId(this.#operationId, path)),
    );
    await transactionDone(transaction);
    return value === undefined ? undefined : v.parse(liveLocalObjectRecordSchema, value);
  }

  private async records(): Promise<readonly LiveLocalObjectRecord[]> {
    const transaction = this.db.transaction(DataStore.LiveLocalObjects, 'readonly');
    const values = await requestToPromise<unknown[]>(
      transaction.objectStore(DataStore.LiveLocalObjects).index(SchemaIndex.LiveLocalObjectsByOperationId).getAll(this.#operationId),
    );
    await transactionDone(transaction);
    return values.map((value) => v.parse(liveLocalObjectRecordSchema, value));
  }
}

import * as v from 'valibot';

import { interopTimestampSchema, interopUuidSchema, sha256Schema } from '../../core/interop/contract.js';
import type { InteropCounts } from '../../core/interop/messages.js';
import { SYNC_FIELDS, type SyncField } from '../../core/interop/sync-resolution.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import { hydrateRecords } from '../repositories/hydration.js';
import type { SecureSyncItem } from './secure-sync-outbox-repository.js';

const categorySchema = v.picklist(['eligible', 'duplicate', 'conflict', 'delete-review']);
const receiptSchema = v.strictObject({
  messageId: interopUuidSchema,
  sessionId: interopUuidSchema,
  interopId: interopUuidSchema,
  sequence: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  path: v.pipe(v.string(), v.minLength(1)),
  ciphertextHash: sha256Schema,
  ciphertext: v.instance(ArrayBuffer),
  category: categorySchema,
  conflictFields: v.pipe(v.array(v.picklist(SYNC_FIELDS)), v.readonly()),
  receivedAt: interopTimestampSchema,
});

export type SecureSyncInboxReceipt = v.InferOutput<typeof receiptSchema>;

export interface SecureSyncInboundReview {
  readonly received: number;
  readonly counts: InteropCounts;
  readonly conflicts: readonly { readonly interopId: string; readonly fields: readonly SyncField[] }[];
}

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function countKey(category: SecureSyncItem['reviewCategory']): keyof InteropCounts {
  return category === 'metadata-only' ? 'metadataOnly' : category;
}

function inboundCountKey(category: SecureSyncInboxReceipt['category']): keyof InteropCounts {
  return category === 'delete-review' ? 'conflict' : category;
}

export class SecureSyncInboxRepository {
  constructor(private readonly db: IDBDatabase) {}

  async record(input: Omit<SecureSyncInboxReceipt, 'ciphertext'> & { readonly ciphertext: Uint8Array }): Promise<void> {
    const candidate = v.parse(receiptSchema, {
      ...input,
      ciphertext: input.ciphertext.buffer.slice(input.ciphertext.byteOffset, input.ciphertext.byteOffset + input.ciphertext.byteLength),
    });
    const transaction = this.db.transaction(DataStore.SecureSyncInbox, 'readwrite');
    const store = transaction.objectStore(DataStore.SecureSyncInbox);
    const previous = await requestToPromise<unknown>(store.get(candidate.messageId));
    const sessionRows = await requestToPromise<unknown[]>(store.index(SchemaIndex.SecureSyncInboxBySessionId).getAll(candidate.sessionId));
    const sequenceCollision = hydrateRecords(DataStore.SecureSyncInbox, receiptSchema, sessionRows).some(
      (receipt) => receipt.sequence === candidate.sequence && receipt.messageId !== candidate.messageId,
    );
    if (sequenceCollision) {
      transaction.abort();
      throw new Error('Sync inbox sequence was reused by a different message.');
    }
    if (previous === undefined) store.add(candidate);
    else {
      const stored = v.parse(receiptSchema, previous);
      if (
        stored.sessionId !== candidate.sessionId ||
        stored.interopId !== candidate.interopId ||
        stored.sequence !== candidate.sequence ||
        stored.path !== candidate.path ||
        stored.ciphertextHash !== candidate.ciphertextHash ||
        !sameBytes(stored.ciphertext, candidate.ciphertext)
      ) {
        transaction.abort();
        throw new Error('Sync inbox message identity was replayed with different ciphertext.');
      }
      store.put({ ...candidate, receivedAt: stored.receivedAt });
    }
    await transactionDone(transaction);
  }

  async review(sessionId: string, baseCounts: InteropCounts, items: readonly SecureSyncItem[]): Promise<SecureSyncInboundReview> {
    const receipts = await this.receipts(sessionId);
    const latest = new Map<string, SecureSyncInboxReceipt>();
    for (const receipt of receipts) {
      const previous = latest.get(receipt.interopId);
      if (!previous || receipt.sequence > previous.sequence) latest.set(receipt.interopId, receipt);
    }
    const itemByInteropId = new Map(items.map((item) => [item.interopId, item]));
    const counts = { ...baseCounts };
    const conflicts: Array<{ interopId: string; fields: readonly SyncField[] }> = [];
    for (const receipt of latest.values()) {
      const item = itemByInteropId.get(receipt.interopId);
      if (!item) throw new Error('Sync inbox receipt is outside the reviewed selection.');
      const previousKey = countKey(item.reviewCategory);
      counts[previousKey] = Math.max(0, counts[previousKey] - 1);
      counts[inboundCountKey(receipt.category)] += 1;
      if (receipt.category === 'conflict' || receipt.category === 'delete-review') {
        conflicts.push({ interopId: receipt.interopId, fields: receipt.conflictFields });
      }
    }
    return { received: latest.size, counts, conflicts };
  }

  private async receipts(sessionId: string): Promise<readonly SecureSyncInboxReceipt[]> {
    const transaction = this.db.transaction(DataStore.SecureSyncInbox, 'readonly');
    const values = await requestToPromise<unknown[]>(
      transaction.objectStore(DataStore.SecureSyncInbox).index(SchemaIndex.SecureSyncInboxBySessionId).getAll(sessionId),
    );
    await transactionDone(transaction);
    return hydrateRecords(DataStore.SecureSyncInbox, receiptSchema, values).sort((left, right) => left.sequence - right.sequence);
  }
}

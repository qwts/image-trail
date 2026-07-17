import * as v from 'valibot';

import { interopReviewCategorySchema, interopTimestampSchema, interopUuidSchema } from '../../core/interop/contract.js';
import { interopCountsSchema, type InteropCounts } from '../../core/interop/messages.js';
import type { InteropProviderId } from '../../core/interop/runtime-state.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import { hydrateRecord, hydrateRecords } from '../repositories/hydration.js';
import type { SyncField } from '../../core/interop/sync-resolution.js';

const providerSchema = v.picklist(['pcloud', 'google-drive', 'icloud-drive']);
const phaseSchema = v.picklist(['transferring', 'reviewing', 'paused', 'cancelled', 'failed']);
const nullableTimestamp = v.nullable(interopTimestampSchema);

const sessionSchema = v.strictObject({
  sessionId: interopUuidSchema,
  pairingId: interopUuidSchema,
  provider: providerSchema,
  phase: phaseSchema,
  requested: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  unsupported: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  createdAt: interopTimestampSchema,
  updatedAt: interopTimestampSchema,
});

const itemSchema = v.strictObject({
  id: v.string(),
  sessionId: interopUuidSchema,
  interopId: interopUuidSchema,
  sourceLocalId: v.pipe(v.string(), v.minLength(1)),
  messageId: interopUuidSchema,
  reviewCategory: interopReviewCategorySchema,
  state: v.picklist(['queued', 'delivered']),
  createdAt: interopTimestampSchema,
  deliveredAt: nullableTimestamp,
});

const outboxSchema = v.strictObject({
  messageId: interopUuidSchema,
  sessionId: interopUuidSchema,
  interopId: interopUuidSchema,
  sequence: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  path: v.pipe(v.string(), v.minLength(1)),
  ciphertext: v.instance(ArrayBuffer),
  createdAt: interopTimestampSchema,
  deliveredAt: nullableTimestamp,
});

export type SecureSyncSession = v.InferOutput<typeof sessionSchema>;
export type SecureSyncItem = v.InferOutput<typeof itemSchema>;
export type SecureSyncOutboxRecord = v.InferOutput<typeof outboxSchema>;

export interface SecureSyncQueueItem {
  readonly interopId: string;
  readonly sourceLocalId: string;
  readonly messageId: string;
  readonly sequence: number;
  readonly path: string;
  readonly reviewCategory: SecureSyncItem['reviewCategory'];
  readonly ciphertext: Uint8Array;
}

export interface SecureSyncProgress {
  readonly session: SecureSyncSession;
  readonly counts: InteropCounts;
  readonly delivered: number;
  readonly pending: number;
  readonly inbound?:
    | {
        readonly received: number;
        readonly counts: InteropCounts;
        readonly conflicts: readonly { readonly interopId: string; readonly fields: readonly SyncField[] }[];
      }
    | undefined;
}

const STORES = [DataStore.SecureSyncSessions, DataStore.SecureSyncItems, DataStore.SecureSyncOutbox];

function itemId(sessionId: string, interopId: string): string {
  return `${sessionId}:${interopId}`;
}

function countsFor(session: SecureSyncSession, items: readonly SecureSyncItem[]): InteropCounts {
  const counts: InteropCounts = {
    total: session.requested,
    eligible: 0,
    duplicate: 0,
    conflict: 0,
    metadataOnly: 0,
    unsupported: session.unsupported,
    skipped: 0,
    failed: 0,
    acknowledged: 0,
    finalized: 0,
  };
  for (const item of items) counts[item.reviewCategory === 'metadata-only' ? 'metadataOnly' : item.reviewCategory] += 1;
  return v.parse(interopCountsSchema, counts);
}

export class SecureSyncOutboxRepository {
  constructor(private readonly db: IDBDatabase) {}

  async queueBatch(input: {
    readonly sessionId: string;
    readonly pairingId: string;
    readonly provider: InteropProviderId;
    readonly requested: number;
    readonly unsupported: number;
    readonly items: readonly SecureSyncQueueItem[];
    readonly at: string;
  }): Promise<void> {
    if (input.items.length === 0) throw new Error('Secure Sync outbox batch cannot be empty.');
    const transaction = this.db.transaction(STORES, 'readwrite');
    const sessions = transaction.objectStore(DataStore.SecureSyncSessions);
    const items = transaction.objectStore(DataStore.SecureSyncItems);
    const outbox = transaction.objectStore(DataStore.SecureSyncOutbox);
    const candidate = v.parse(sessionSchema, {
      sessionId: input.sessionId,
      pairingId: input.pairingId,
      provider: input.provider,
      phase: 'transferring',
      requested: input.requested,
      unsupported: input.unsupported,
      createdAt: input.at,
      updatedAt: input.at,
    });
    const existing = hydrateRecord(
      DataStore.SecureSyncSessions,
      sessionSchema,
      await requestToPromise<unknown>(sessions.get(input.sessionId)),
    );
    if (existing && JSON.stringify({ ...existing, phase: 'transferring', updatedAt: input.at }) !== JSON.stringify(candidate)) {
      transaction.abort();
      throw new Error('Secure Sync session identity was replayed with different choices.');
    }
    sessions.put(existing ?? candidate);
    for (const queued of input.items) {
      const item = v.parse(itemSchema, {
        id: itemId(input.sessionId, queued.interopId),
        sessionId: input.sessionId,
        interopId: queued.interopId,
        sourceLocalId: queued.sourceLocalId,
        messageId: queued.messageId,
        reviewCategory: queued.reviewCategory,
        state: 'queued',
        createdAt: input.at,
        deliveredAt: null,
      });
      const row = v.parse(outboxSchema, {
        messageId: queued.messageId,
        sessionId: input.sessionId,
        interopId: queued.interopId,
        sequence: queued.sequence,
        path: queued.path,
        ciphertext: queued.ciphertext.buffer.slice(
          queued.ciphertext.byteOffset,
          queued.ciphertext.byteOffset + queued.ciphertext.byteLength,
        ),
        createdAt: input.at,
        deliveredAt: null,
      });
      if (
        (await requestToPromise(items.getKey(item.id))) !== undefined ||
        (await requestToPromise(outbox.getKey(row.messageId))) !== undefined
      ) {
        transaction.abort();
        throw new Error('Secure Sync message identity was replayed.');
      }
      items.add(item);
      outbox.add(row);
    }
    await transactionDone(transaction);
  }

  async progress(sessionId: string): Promise<SecureSyncProgress | null> {
    const transaction = this.db.transaction(STORES, 'readonly');
    const session = hydrateRecord(
      DataStore.SecureSyncSessions,
      sessionSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.SecureSyncSessions).get(sessionId)),
    );
    const items = await this.itemsIn(transaction, sessionId);
    const outbox = await this.outboxIn(transaction, sessionId);
    await transactionDone(transaction);
    if (!session) return null;
    const pending = outbox.filter((row) => row.deliveredAt === null).length;
    return { session, counts: countsFor(session, items), delivered: items.length - pending, pending };
  }

  async pending(sessionId: string): Promise<readonly SecureSyncOutboxRecord[]> {
    const transaction = this.db.transaction(DataStore.SecureSyncOutbox, 'readonly');
    const rows = await this.outboxIn(transaction, sessionId);
    await transactionDone(transaction);
    return rows.filter((row) => row.deliveredAt === null);
  }

  async items(sessionId: string): Promise<readonly SecureSyncItem[]> {
    const transaction = this.db.transaction(DataStore.SecureSyncItems, 'readonly');
    const rows = await this.itemsIn(transaction, sessionId);
    await transactionDone(transaction);
    return rows;
  }

  async messages(sessionId: string): Promise<readonly SecureSyncOutboxRecord[]> {
    const transaction = this.db.transaction(DataStore.SecureSyncOutbox, 'readonly');
    const rows = await this.outboxIn(transaction, sessionId);
    await transactionDone(transaction);
    return rows;
  }

  async markDelivered(messageId: string, at: string): Promise<void> {
    const transaction = this.db.transaction(STORES, 'readwrite');
    const outbox = transaction.objectStore(DataStore.SecureSyncOutbox);
    const row = hydrateRecord(DataStore.SecureSyncOutbox, outboxSchema, await requestToPromise<unknown>(outbox.get(messageId)));
    if (row && row.deliveredAt === null) {
      outbox.put({ ...row, deliveredAt: at });
      const items = transaction.objectStore(DataStore.SecureSyncItems);
      const item = hydrateRecord(
        DataStore.SecureSyncItems,
        itemSchema,
        await requestToPromise<unknown>(items.get(itemId(row.sessionId, row.interopId))),
      );
      if (item) items.put({ ...item, state: 'delivered', deliveredAt: at });
      const remaining = await requestToPromise<unknown[]>(outbox.index(SchemaIndex.SecureSyncOutboxBySessionId).getAll(row.sessionId));
      if (
        remaining.every(
          (value) => v.parse(outboxSchema, value).messageId === messageId || v.parse(outboxSchema, value).deliveredAt !== null,
        )
      ) {
        const sessions = transaction.objectStore(DataStore.SecureSyncSessions);
        const session = hydrateRecord(
          DataStore.SecureSyncSessions,
          sessionSchema,
          await requestToPromise<unknown>(sessions.get(row.sessionId)),
        );
        if (session && session.phase === 'transferring') sessions.put({ ...session, phase: 'reviewing', updatedAt: at });
      }
    }
    await transactionDone(transaction);
  }

  async control(sessionId: string, action: 'pause' | 'resume' | 'cancel', at: string): Promise<SecureSyncSession> {
    const transaction = this.db.transaction([DataStore.SecureSyncSessions, DataStore.SecureSyncOutbox], 'readwrite');
    const store = transaction.objectStore(DataStore.SecureSyncSessions);
    const session = hydrateRecord(DataStore.SecureSyncSessions, sessionSchema, await requestToPromise<unknown>(store.get(sessionId)));
    if (!session) throw new Error('Secure Sync session is unavailable.');
    if (session.phase === 'cancelled') throw new Error('Cancelled Sync sessions cannot resume.');
    const rows =
      action === 'resume'
        ? await requestToPromise<unknown[]>(
            transaction.objectStore(DataStore.SecureSyncOutbox).index(SchemaIndex.SecureSyncOutboxBySessionId).getAll(sessionId),
          )
        : [];
    const pending = rows.some((value) => v.parse(outboxSchema, value).deliveredAt === null);
    const phase = action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : pending ? 'transferring' : 'reviewing';
    const updated = v.parse(sessionSchema, { ...session, phase, updatedAt: at });
    store.put(updated);
    await transactionDone(transaction);
    return updated;
  }

  private async itemsIn(transaction: IDBTransaction, sessionId: string): Promise<readonly SecureSyncItem[]> {
    const values = await requestToPromise<unknown[]>(
      transaction.objectStore(DataStore.SecureSyncItems).index(SchemaIndex.SecureSyncItemsBySessionId).getAll(sessionId),
    );
    return hydrateRecords(DataStore.SecureSyncItems, itemSchema, values);
  }

  private async outboxIn(transaction: IDBTransaction, sessionId: string): Promise<readonly SecureSyncOutboxRecord[]> {
    const values = await requestToPromise<unknown[]>(
      transaction.objectStore(DataStore.SecureSyncOutbox).index(SchemaIndex.SecureSyncOutboxBySessionId).getAll(sessionId),
    );
    return hydrateRecords(DataStore.SecureSyncOutbox, outboxSchema, values).sort((left, right) => left.sequence - right.sequence);
  }
}

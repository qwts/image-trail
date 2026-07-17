import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { hydrateRecord } from '../repositories/hydration.js';
import { DataStore } from '../schema.js';
import type { MoveAcknowledgementEnvelope } from './move-journal-records.js';
import {
  moveItemId,
  moveJournalRecordSchema,
  moveReceiptId,
  moveReceiptRecordSchema,
  type MoveJournalRecord,
  type MoveReceiptRecord,
} from './move-journal-types.js';
import {
  acknowledged,
  finalizable,
  phaseFor,
  secureMoveItemSchema,
  secureMoveItemsIn,
  type SecureMoveItem,
} from './secure-move-outbox-repository.js';

const ACKNOWLEDGEMENT_STORES = [DataStore.MoveJournals, DataStore.MoveItems, DataStore.MoveReceipts, DataStore.MoveAudit];

export class SecureMoveAcknowledgementRepository {
  constructor(private readonly db: IDBDatabase) {}

  async apply(input: {
    readonly acknowledgement: MoveAcknowledgementEnvelope;
    readonly canFinalize: boolean;
    readonly at: string;
  }): Promise<void> {
    const acknowledgement = input.acknowledgement;
    const transaction = this.db.transaction(ACKNOWLEDGEMENT_STORES, 'readwrite');
    const receipts = transaction.objectStore(DataStore.MoveReceipts);
    const receiptId = moveReceiptId(acknowledgement.header.pairingId, acknowledgement.header.messageId);
    const existingReceipt = hydrateRecord(
      DataStore.MoveReceipts,
      moveReceiptRecordSchema,
      await requestToPromise<unknown>(receipts.get(receiptId)),
    );
    if (existingReceipt) {
      if (existingReceipt.transferId !== acknowledgement.header.transferId) {
        transaction.abort();
        throw new Error('Move acknowledgement identity was replayed across transfers.');
      }
      await transactionDone(transaction);
      return;
    }
    const items = transaction.objectStore(DataStore.MoveItems);
    const item = hydrateRecord(
      DataStore.MoveItems,
      secureMoveItemSchema,
      await requestToPromise<unknown>(items.get(moveItemId(acknowledgement.header.transferId, acknowledgement.payload.recordInteropId))),
    );
    if (!item) {
      transaction.abort();
      throw new Error('Move acknowledgement does not match a queued source item.');
    }
    const accepted = acknowledgement.payload.status === 'accepted';
    const keepAccepted = item.acknowledgedAt !== null;
    if (!keepAccepted) {
      items.put({
        ...item,
        state: accepted ? 'acknowledged' : 'rejected',
        targetLocalId: acknowledgement.payload.targetLocalId,
        metadataPersisted: acknowledgement.payload.metadataPersisted,
        originalVerification: acknowledgement.payload.originalVerification,
        acknowledgementMessageId: acknowledgement.header.messageId,
        acknowledgedMessageIds: [...acknowledgement.payload.acknowledgedMessageIds],
        error: acknowledgement.payload.errors,
        acknowledgedAt: accepted ? input.at : null,
      } satisfies SecureMoveItem);
    }
    receipts.put({
      id: receiptId,
      pairingId: acknowledgement.header.pairingId,
      messageId: acknowledgement.header.messageId,
      transferId: acknowledgement.header.transferId,
      responseMessageId: null,
      receivedAt: input.at,
    } satisfies MoveReceiptRecord);
    transaction.objectStore(DataStore.MoveAudit).put({
      eventKey: `${acknowledgement.header.messageId}:${accepted ? 'acknowledged' : 'rejected'}`,
      transferId: acknowledgement.header.transferId,
      interopId: acknowledgement.payload.recordInteropId,
      event: accepted ? 'acknowledged' : 'rejected',
      details: {
        acknowledgementMessageId: acknowledgement.header.messageId,
        canFinalize: input.canFinalize,
        ignoredAfterAccepted: keepAccepted,
      },
      createdAt: input.at,
    });
    const journal = hydrateRecord(
      DataStore.MoveJournals,
      moveJournalRecordSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveJournals).get(acknowledgement.header.transferId)),
    );
    if (!journal) {
      transaction.abort();
      throw new Error('Move acknowledgement has no durable source journal.');
    }
    const updatedItems = await secureMoveItemsIn(transaction, acknowledgement.header.transferId);
    transaction.objectStore(DataStore.MoveJournals).put({
      ...journal,
      phase: phaseFor(updatedItems),
      lastSequence: Math.max(journal.lastSequence, acknowledgement.header.sequence),
      updatedAt: input.at,
    } satisfies MoveJournalRecord);
    await transactionDone(transaction);
  }

  async pendingFinalization(transferId: string): Promise<readonly SecureMoveItem[]> {
    const transaction = this.db.transaction(DataStore.MoveItems, 'readonly');
    const items = await secureMoveItemsIn(transaction, transferId);
    await transactionDone(transaction);
    return items.filter(finalizable);
  }

  markFinalizing(transferId: string, interopId: string, at: string): Promise<void> {
    return this.updateFinalization(transferId, interopId, 'finalizing', null, at);
  }

  markFinalized(transferId: string, interopId: string, at: string): Promise<void> {
    return this.updateFinalization(transferId, interopId, 'finalized', at, at);
  }

  markFinalizationFailed(transferId: string, interopId: string, error: unknown, at: string): Promise<void> {
    return this.updateFinalization(transferId, interopId, 'failed', null, at, error);
  }

  private async updateFinalization(
    transferId: string,
    interopId: string,
    state: 'finalizing' | 'finalized' | 'failed',
    finalizedAt: string | null,
    at: string,
    error: unknown = null,
  ): Promise<void> {
    const transaction = this.db.transaction([DataStore.MoveJournals, DataStore.MoveItems, DataStore.MoveAudit], 'readwrite');
    const items = transaction.objectStore(DataStore.MoveItems);
    const item = hydrateRecord(
      DataStore.MoveItems,
      secureMoveItemSchema,
      await requestToPromise<unknown>(items.get(moveItemId(transferId, interopId))),
    );
    if (!item || !acknowledged(item)) {
      transaction.abort();
      throw new Error('Move source finalization requires an accepted acknowledgement.');
    }
    items.put({ ...item, state, finalizedAt, error } satisfies SecureMoveItem);
    const journalStore = transaction.objectStore(DataStore.MoveJournals);
    const journal = hydrateRecord(
      DataStore.MoveJournals,
      moveJournalRecordSchema,
      await requestToPromise<unknown>(journalStore.get(transferId)),
    );
    if (!journal) {
      transaction.abort();
      throw new Error('Move journal disappeared during source finalization.');
    }
    const updatedItems = await secureMoveItemsIn(transaction, transferId);
    journalStore.put({ ...journal, phase: phaseFor(updatedItems), updatedAt: at } satisfies MoveJournalRecord);
    transaction.objectStore(DataStore.MoveAudit).put({
      eventKey: `${transferId}:${interopId}:${state}`,
      transferId,
      interopId,
      event: state === 'finalized' ? 'finalized' : state === 'failed' ? 'failed' : 'finalizing',
      details: error,
      createdAt: at,
    });
    await transactionDone(transaction);
  }
}

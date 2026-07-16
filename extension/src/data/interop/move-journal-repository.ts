import type { InteropReviewCategory, InteropTransferPhase } from '../../core/interop/contract.js';
import { parseInteropEnvelope, type InteropEnvelope } from '../../core/interop/messages.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecord } from '../repositories/hydration.js';
import {
  moveItemId,
  moveItemRecordSchema,
  moveJournalRecordSchema,
  moveOutboxRecordSchema,
  moveReceiptId,
  moveReceiptRecordSchema,
  type MoveItemRecord,
  type MoveJournalRecord,
  type MoveOriginalVerification,
  type MoveOutboxRecord,
  type MoveReceiptRecord,
  type StoredMoveAuditEvent,
  type StoredMoveJournal,
} from './move-journal-types.js';
import {
  acknowledgementMoveAudit,
  appliedMoveItem,
  isMoveAcknowledgementEnvelope,
  isMoveRecordEnvelope,
  hydrateRequiredMove,
  moveFinalizationPhase,
  queuedMoveItem,
  receivedMoveAudit,
  sameMoveValue,
  targetMoveItem,
} from './move-journal-records.js';
import {
  getMoveItem,
  getMoveJournal,
  listMoveAudit,
  listMoveItems,
  listMoveItemsIn,
  listPendingFinalization,
  listPendingOutbox,
} from './move-journal-queries.js';

const JOURNAL_STORES = [DataStore.MoveJournals, DataStore.MoveItems, DataStore.MoveOutbox, DataStore.MoveReceipts, DataStore.MoveAudit];

export class MoveJournalError extends Error {
  override readonly name = 'MoveJournalError';
}

export class MoveJournalRepository {
  constructor(private readonly db: IDBDatabase) {}

  async queueRequest(envelopeInput: InteropEnvelope, at: string): Promise<StoredMoveJournal> {
    const envelope = parseInteropEnvelope(envelopeInput);
    if (envelope.header.operation !== 'move' || !isMoveRecordEnvelope(envelope)) {
      throw new MoveJournalError('Move outbox accepts only canonical Move record messages.');
    }
    const transaction = this.db.transaction(JOURNAL_STORES, 'readwrite');
    const journal = await this.ensureJournal(transaction, envelope, 'awaiting-acknowledgement', at);
    const items = transaction.objectStore(DataStore.MoveItems);
    const id = moveItemId(envelope.header.transferId, envelope.payload.record.identity.interopId);
    const existing = hydrateRecord(DataStore.MoveItems, moveItemRecordSchema, await requestToPromise<unknown>(items.get(id)));
    const item = existing ?? queuedMoveItem(envelope);
    if (
      item.sourceMessageId !== envelope.header.messageId ||
      item.reviewCategory !== envelope.payload.reviewCategory ||
      !sameMoveValue(item.record, envelope.payload.record) ||
      !sameMoveValue(item.albums, envelope.payload.albums)
    ) {
      transaction.abort();
      throw new MoveJournalError('Move item identity was replayed with different content.');
    }
    items.put(item);
    transaction.objectStore(DataStore.MoveJournals).put({
      ...journal,
      phase: item.state === 'queued' ? 'awaiting-acknowledgement' : journal.phase,
      lastSequence: Math.max(journal.lastSequence, envelope.header.sequence),
      updatedAt: item.state === 'queued' ? at : journal.updatedAt,
    } satisfies MoveJournalRecord);
    await this.putOutbox(transaction, envelope, at);
    await this.putAudit(transaction, {
      eventKey: `${envelope.header.messageId}:queued`,
      transferId: envelope.header.transferId,
      interopId: envelope.payload.record.identity.interopId,
      event: 'queued',
      details: { sourceMessageId: envelope.header.messageId },
      createdAt: at,
    });
    await transactionDone(transaction);
    return this.requireJournal(envelope.header.transferId);
  }

  async recordTargetAcknowledgement(input: {
    readonly request: InteropEnvelope;
    readonly acknowledgement: InteropEnvelope;
    readonly reviewCategory: InteropReviewCategory;
    readonly targetLocalId: string | null;
    readonly metadataPersisted: boolean;
    readonly originalVerification: Exclude<MoveOriginalVerification, 'pending'>;
    readonly error: unknown;
    readonly at: string;
  }): Promise<StoredMoveJournal> {
    const request = parseInteropEnvelope(input.request);
    const acknowledgement = parseInteropEnvelope(input.acknowledgement);
    if (!isMoveRecordEnvelope(request) || !isMoveAcknowledgementEnvelope(acknowledgement)) {
      throw new MoveJournalError('Move receipt requires a record request and acknowledgement response.');
    }
    const accepted = acknowledgement.payload.status === 'accepted';
    const transaction = this.db.transaction(JOURNAL_STORES, 'readwrite');
    const journal = await this.ensureJournal(transaction, request, accepted ? 'acknowledged' : 'failed', input.at);
    const items = transaction.objectStore(DataStore.MoveItems);
    const id = moveItemId(request.header.transferId, request.payload.record.identity.interopId);
    const existing = hydrateRecord(DataStore.MoveItems, moveItemRecordSchema, await requestToPromise<unknown>(items.get(id)));
    if (
      existing &&
      (existing.sourceMessageId !== request.header.messageId ||
        existing.reviewCategory !== request.payload.reviewCategory ||
        !sameMoveValue(existing.record, request.payload.record) ||
        !sameMoveValue(existing.albums, request.payload.albums))
    ) {
      transaction.abort();
      throw new MoveJournalError('Move item identity was replayed with different content.');
    }
    items.put(targetMoveItem(request, acknowledgement, input));
    const receipts = transaction.objectStore(DataStore.MoveReceipts);
    const receiptId = moveReceiptId(request.header.pairingId, request.header.messageId);
    const previous = hydrateRecord(
      DataStore.MoveReceipts,
      moveReceiptRecordSchema,
      await requestToPromise<unknown>(receipts.get(receiptId)),
    );
    if (previous?.responseMessageId) await this.markDeliveredIn(transaction, previous.responseMessageId, input.at);
    await this.putOutbox(transaction, acknowledgement, input.at);
    receipts.put({
      id: receiptId,
      pairingId: request.header.pairingId,
      messageId: request.header.messageId,
      transferId: request.header.transferId,
      responseMessageId: acknowledgement.header.messageId,
      receivedAt: input.at,
    } satisfies MoveReceiptRecord);
    await this.putAudit(transaction, receivedMoveAudit(request, input));
    await this.putAudit(transaction, acknowledgementMoveAudit(acknowledgement, accepted, input.at));
    transaction.objectStore(DataStore.MoveJournals).put({
      ...journal,
      phase: accepted ? 'acknowledged' : 'failed',
      lastSequence: Math.max(journal.lastSequence, acknowledgement.header.sequence),
      updatedAt: input.at,
    } satisfies MoveJournalRecord);
    await transactionDone(transaction);
    return this.requireJournal(request.header.transferId);
  }

  async applyAcknowledgement(input: {
    readonly acknowledgement: InteropEnvelope;
    readonly error: unknown;
    readonly at: string;
  }): Promise<StoredMoveJournal> {
    const acknowledgement = parseInteropEnvelope(input.acknowledgement);
    if (!isMoveAcknowledgementEnvelope(acknowledgement)) throw new MoveJournalError('Expected a Move acknowledgement message.');
    const transaction = this.db.transaction(JOURNAL_STORES, 'readwrite');
    const item = await this.requireItemIn(transaction, acknowledgement.header.transferId, acknowledgement.payload.recordInteropId);
    const accepted = acknowledgement.payload.status === 'accepted';
    const receipt: MoveReceiptRecord = {
      id: moveReceiptId(acknowledgement.header.pairingId, acknowledgement.header.messageId),
      pairingId: acknowledgement.header.pairingId,
      messageId: acknowledgement.header.messageId,
      transferId: acknowledgement.header.transferId,
      responseMessageId: null,
      receivedAt: input.at,
    };
    transaction.objectStore(DataStore.MoveReceipts).put(receipt);
    if (item.acknowledgedAt === null) {
      transaction.objectStore(DataStore.MoveItems).put(appliedMoveItem(item, acknowledgement, input.error, input.at));
      const journal = await this.requireJournalIn(transaction, acknowledgement.header.transferId);
      const queued = await this.queuedCount(transaction, acknowledgement.header.transferId, item.id);
      transaction.objectStore(DataStore.MoveJournals).put({
        ...journal,
        phase: accepted ? (queued === 0 ? 'acknowledged' : 'awaiting-acknowledgement') : 'failed',
        lastSequence: Math.max(journal.lastSequence, acknowledgement.header.sequence),
        updatedAt: input.at,
      } satisfies MoveJournalRecord);
    }
    await this.putAudit(transaction, acknowledgementMoveAudit(acknowledgement, accepted, input.at, item.acknowledgedAt !== null));
    await transactionDone(transaction);
    return this.requireJournal(acknowledgement.header.transferId);
  }

  async markFinalizing(transferId: string, interopId: string, at: string): Promise<void> {
    await this.updateFinalization(transferId, interopId, at, 'finalizing', null, null);
  }

  async markFinalized(transferId: string, interopId: string, at: string): Promise<void> {
    await this.updateFinalization(transferId, interopId, at, 'finalized', null, at);
  }

  async markFinalizationFailed(transferId: string, interopId: string, error: unknown, at: string): Promise<void> {
    await this.updateFinalization(transferId, interopId, at, 'failed', error, null);
  }

  async getJournal(transferId: string): Promise<StoredMoveJournal | undefined> {
    return getMoveJournal(this.db, transferId);
  }

  async getItem(transferId: string, interopId: string): Promise<MoveItemRecord | undefined> {
    return getMoveItem(this.db, transferId, interopId);
  }

  async items(transferId: string): Promise<readonly MoveItemRecord[]> {
    return listMoveItems(this.db, transferId);
  }

  async pendingFinalization(transferId: string): Promise<readonly MoveItemRecord[]> {
    return listPendingFinalization(this.db, transferId);
  }

  async responseForReceipt(pairingId: string, messageId: string): Promise<InteropEnvelope | undefined> {
    const transaction = this.db.transaction([DataStore.MoveReceipts, DataStore.MoveOutbox], 'readonly');
    const receipt = hydrateRecord(
      DataStore.MoveReceipts,
      moveReceiptRecordSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveReceipts).get(moveReceiptId(pairingId, messageId))),
    );
    const outbox = receipt?.responseMessageId
      ? hydrateRecord(
          DataStore.MoveOutbox,
          moveOutboxRecordSchema,
          await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveOutbox).get(receipt.responseMessageId)),
        )
      : undefined;
    await transactionDone(transaction);
    return outbox?.envelope;
  }

  async hasReceipt(pairingId: string, messageId: string, transferId: string): Promise<boolean> {
    const transaction = this.db.transaction(DataStore.MoveReceipts, 'readonly');
    const receipt = hydrateRecord(
      DataStore.MoveReceipts,
      moveReceiptRecordSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveReceipts).get(moveReceiptId(pairingId, messageId))),
    );
    await transactionDone(transaction);
    if (!receipt) return false;
    if (receipt.transferId !== transferId) throw new MoveJournalError('Move replay identity was reused across transfers.');
    return true;
  }

  async pendingOutbox(transferId: string): Promise<readonly InteropEnvelope[]> {
    return listPendingOutbox(this.db, transferId);
  }

  async markDelivered(messageId: string, at: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.MoveOutbox, 'readwrite');
    await this.markDeliveredIn(transaction, messageId, at);
    await transactionDone(transaction);
  }

  async audit(transferId: string): Promise<readonly StoredMoveAuditEvent[]> {
    return listMoveAudit(this.db, transferId);
  }

  private async requireJournal(transferId: string): Promise<StoredMoveJournal> {
    const journal = await this.getJournal(transferId);
    if (!journal) throw new MoveJournalError(`Move journal ${transferId} does not exist.`);
    return journal;
  }

  private async ensureJournal(
    transaction: IDBTransaction,
    envelope: InteropEnvelope,
    phase: InteropTransferPhase,
    at: string,
  ): Promise<MoveJournalRecord> {
    const store = transaction.objectStore(DataStore.MoveJournals);
    const existing = hydrateRecord(
      DataStore.MoveJournals,
      moveJournalRecordSchema,
      await requestToPromise<unknown>(store.get(envelope.header.transferId)),
    );
    const journal =
      existing ??
      ({
        transferId: envelope.header.transferId,
        pairingId: envelope.header.pairingId,
        sourceProduct: envelope.header.sourceProduct,
        targetProduct: envelope.header.targetProduct,
        phase,
        lastSequence: envelope.header.sequence,
        createdAt: at,
        updatedAt: at,
      } satisfies MoveJournalRecord);
    if (
      journal.pairingId !== envelope.header.pairingId ||
      journal.sourceProduct !== envelope.header.sourceProduct ||
      journal.targetProduct !== envelope.header.targetProduct
    ) {
      transaction.abort();
      throw new MoveJournalError('Move message does not match the durable transfer identity.');
    }
    store.put(journal);
    return journal;
  }

  private async requireJournalIn(transaction: IDBTransaction, transferId: string): Promise<MoveJournalRecord> {
    return hydrateRequiredMove(
      DataStore.MoveJournals,
      moveJournalRecordSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveJournals).get(transferId)),
      `Move journal ${transferId} does not exist.`,
    );
  }

  private async requireItemIn(transaction: IDBTransaction, transferId: string, interopId: string): Promise<MoveItemRecord> {
    return hydrateRequiredMove(
      DataStore.MoveItems,
      moveItemRecordSchema,
      await requestToPromise<unknown>(transaction.objectStore(DataStore.MoveItems).get(moveItemId(transferId, interopId))),
      'Move acknowledgement does not match a queued source item.',
    );
  }

  private async itemsIn(transaction: IDBTransaction, transferId: string): Promise<readonly MoveItemRecord[]> {
    return listMoveItemsIn(transaction, transferId);
  }

  private async queuedCount(transaction: IDBTransaction, transferId: string, replacingId: string): Promise<number> {
    const items = await this.itemsIn(transaction, transferId);
    return items.filter((item) => item.id !== replacingId && item.state === 'queued').length;
  }

  private async putOutbox(transaction: IDBTransaction, envelope: InteropEnvelope, at: string): Promise<void> {
    const store = transaction.objectStore(DataStore.MoveOutbox);
    const existing = hydrateRecord(
      DataStore.MoveOutbox,
      moveOutboxRecordSchema,
      await requestToPromise<unknown>(store.get(envelope.header.messageId)),
    );
    if (existing && !sameMoveValue(existing.envelope, envelope)) {
      transaction.abort();
      throw new MoveJournalError('Move outbox message id was reused with different content.');
    }
    store.put(
      existing ?? {
        messageId: envelope.header.messageId,
        transferId: envelope.header.transferId,
        sequence: envelope.header.sequence,
        envelope,
        createdAt: at,
        deliveredAt: null,
      },
    );
  }

  private async putAudit(transaction: IDBTransaction, event: StoredMoveAuditEvent): Promise<void> {
    const store = transaction.objectStore(DataStore.MoveAudit);
    if ((await requestToPromise<IDBValidKey | undefined>(store.getKey(event.eventKey))) === undefined) store.put(event);
  }

  private async markDeliveredIn(transaction: IDBTransaction, messageId: string, at: string): Promise<void> {
    const store = transaction.objectStore(DataStore.MoveOutbox);
    const row = hydrateRecord(DataStore.MoveOutbox, moveOutboxRecordSchema, await requestToPromise<unknown>(store.get(messageId)));
    if (row && row.deliveredAt === null) store.put({ ...row, deliveredAt: at } satisfies MoveOutboxRecord);
  }

  private async updateFinalization(
    transferId: string,
    interopId: string,
    at: string,
    state: 'finalizing' | 'finalized' | 'failed',
    error: unknown,
    finalizedAt: string | null,
  ): Promise<void> {
    const transaction = this.db.transaction(JOURNAL_STORES, 'readwrite');
    const item = await this.requireItemIn(transaction, transferId, interopId);
    if (item.acknowledgedAt === null) {
      transaction.abort();
      throw new MoveJournalError('Move finalization requires an accepted acknowledgement.');
    }
    transaction.objectStore(DataStore.MoveItems).put({ ...item, state, error, finalizedAt: finalizedAt ?? item.finalizedAt });
    const journal = await this.requireJournalIn(transaction, transferId);
    const items = (await this.itemsIn(transaction, transferId)).map((entry) =>
      entry.id === item.id ? { ...entry, state, error, finalizedAt: finalizedAt ?? entry.finalizedAt } : entry,
    );
    const phase = moveFinalizationPhase(items, state);
    transaction.objectStore(DataStore.MoveJournals).put({ ...journal, phase, updatedAt: at } satisfies MoveJournalRecord);
    await this.putAudit(transaction, {
      eventKey: state === 'failed' ? `${transferId}:${interopId}:failed:${at}` : `${transferId}:${interopId}:${state}`,
      transferId,
      interopId,
      event: state,
      details: error ?? {},
      createdAt: at,
    });
    await transactionDone(transaction);
  }
}

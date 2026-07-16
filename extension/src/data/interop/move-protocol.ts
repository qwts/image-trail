import type { InteropProduct } from '../../core/interop/contract.js';
import { parseInteropEnvelope, type InteropEnvelope, type InteropError } from '../../core/interop/messages.js';
import type { InteropRecord } from '../../core/interop/records.js';
import type { StoredOriginalReference } from '../types.js';
import type { InteropRecordTranslationStore } from './record-translation.js';
import {
  isMoveAcknowledgementEnvelope,
  isMoveRecordEnvelope,
  sameMoveValue,
  type MoveAcknowledgementEnvelope,
} from './move-journal-records.js';
import { MoveJournalError, type MoveJournalRepository } from './move-journal-repository.js';
import type { MoveOriginalVerification, StoredMoveJournal } from './move-journal-types.js';

export interface MoveOriginalVerificationResult {
  readonly verified: boolean;
  readonly targetLocalId: string | null;
  readonly verifiedOriginal?: StoredOriginalReference | undefined;
  readonly verifiedThumbnailDataUrl?: string | undefined;
}

export interface MoveOriginalVerifier {
  verify(record: InteropRecord): Promise<MoveOriginalVerificationResult>;
}

export type MoveSourceOriginalAction = 'remove-after-verified-copy' | 'preserve-original';

export interface MoveSourceFinalizer {
  finalize(input: {
    readonly transferId: string;
    readonly sourceLocalId: string;
    readonly targetLocalId: string | null;
    readonly record: InteropRecord;
    readonly originalAction: MoveSourceOriginalAction;
  }): Promise<void>;
}

export interface MoveFinalizationResult {
  readonly finalized: number;
  readonly failed: number;
  readonly journal: StoredMoveJournal;
}

export class MoveProtocolError extends Error {
  override readonly name = 'MoveProtocolError';
}

interface MoveProtocolOptions {
  readonly now?: (() => string) | undefined;
  readonly createMessageId?: (() => string) | undefined;
}

type MoveTranslationTarget = Pick<InteropRecordTranslationStore, 'preview' | 'importRecord'>;

function originalVerificationFor(record: InteropRecord): Exclude<MoveOriginalVerification, 'pending' | 'verified'> {
  return record.original.state === 'metadata-only' ? 'metadata-only' : 'unavailable';
}

function acceptedCategory(category: Awaited<ReturnType<MoveTranslationTarget['preview']>>['category']): boolean {
  return category === 'eligible' || category === 'duplicate' || category === 'metadata-only';
}

function moveError(error: unknown): { readonly message: string } {
  return { message: error instanceof Error ? error.message : 'Move operation failed.' };
}

export class MoveProtocolService {
  readonly #now: () => string;
  readonly #createMessageId: () => string;

  constructor(
    private readonly localProduct: InteropProduct,
    private readonly journals: MoveJournalRepository,
    private readonly translation: MoveTranslationTarget,
    options: MoveProtocolOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createMessageId = options.createMessageId ?? (() => crypto.randomUUID());
  }

  async queue(requestInput: InteropEnvelope): Promise<StoredMoveJournal> {
    const request = this.requireRecordRequest(requestInput);
    if (request.header.sourceProduct !== this.localProduct) {
      throw new MoveProtocolError('Only the source product may queue a Move request.');
    }
    return this.journals.queueRequest(request, this.#now());
  }

  async receive(requestInput: InteropEnvelope, verifier: MoveOriginalVerifier): Promise<MoveAcknowledgementEnvelope> {
    const request = this.requireRecordRequest(requestInput);
    if (request.header.targetProduct !== this.localProduct) {
      throw new MoveProtocolError('Only the target product may receive a Move request.');
    }
    const replayed = await this.journals.responseForReceipt(request.header.pairingId, request.header.messageId);
    if (replayed) await this.assertReplayIdentity(request, replayed);
    if (
      replayed &&
      isMoveAcknowledgementEnvelope(replayed) &&
      (replayed.payload.status === 'accepted' || !replayed.payload.errors.some((error) => error.retryable))
    ) {
      return replayed;
    }

    const at = this.#now();
    const translationInput = {
      record: request.payload.record,
      albums: request.payload.albums,
      reviewCategory: request.payload.reviewCategory,
      receivedAt: at,
    };
    const preview = await this.translation.preview(translationInput);
    let verification: MoveOriginalVerificationResult | null = null;
    let originalVerification: Exclude<MoveOriginalVerification, 'pending'> = originalVerificationFor(request.payload.record);
    let verificationError: InteropError | null = null;

    if (request.payload.record.original.state === 'available' && acceptedCategory(preview.category)) {
      try {
        verification = await verifier.verify(request.payload.record);
        if (verification.verified) originalVerification = 'verified';
        else verificationError = verificationFailure(request.payload.record.identity.interopId);
      } catch (error) {
        verificationError = verificationFailure(
          request.payload.record.identity.interopId,
          error instanceof Error ? error.message : undefined,
        );
      }
    }

    const imported = await this.translation.importRecord({
      ...translationInput,
      reviewCategory: preview.category,
      verifiedOriginal: verification?.verified ? verification.verifiedOriginal : undefined,
      verifiedThumbnailDataUrl: verification?.verified ? verification.verifiedThumbnailDataUrl : undefined,
    });
    const metadataPersisted = imported.persisted || (imported.category === 'duplicate' && imported.existingPinId !== null);
    const originalSatisfied = request.payload.record.original.state !== 'available' || originalVerification === 'verified';
    const accepted = metadataPersisted && acceptedCategory(imported.category) && originalSatisfied;
    const categoryError = acceptedCategory(imported.category)
      ? null
      : ({
          code: 'unsupported-record',
          message: `Move target classified the record as ${imported.category}.`,
          retryable: imported.category === 'conflict',
          recordInteropId: request.payload.record.identity.interopId,
        } satisfies InteropError);
    const errors = [categoryError, verificationError].filter((error): error is InteropError => error !== null);
    const acknowledgement = parseInteropEnvelope({
      header: {
        ...request.header,
        messageId: this.#createMessageId(),
        sourceProduct: request.header.targetProduct,
        targetProduct: request.header.sourceProduct,
        kind: 'acknowledgement',
        createdAt: at,
      },
      payload: {
        kind: 'acknowledgement',
        schemaVersion: 1,
        status: accepted ? 'accepted' : 'rejected',
        recordInteropId: request.payload.record.identity.interopId,
        targetLocalId: verification?.targetLocalId ?? imported.pinId ?? imported.existingPinId,
        metadataPersisted,
        originalVerification,
        acknowledgedMessageIds: [request.header.messageId],
        errors,
      },
    });
    if (!isMoveAcknowledgementEnvelope(acknowledgement)) throw new MoveProtocolError('Move acknowledgement construction failed.');
    await this.journals.recordTargetAcknowledgement({
      request,
      acknowledgement,
      reviewCategory: imported.category,
      targetLocalId: acknowledgement.payload.targetLocalId,
      metadataPersisted,
      originalVerification,
      error: errors.length === 0 ? null : errors,
      at,
    });
    return acknowledgement;
  }

  async acknowledge(acknowledgementInput: InteropEnvelope): Promise<StoredMoveJournal> {
    const acknowledgement = parseInteropEnvelope(acknowledgementInput);
    if (acknowledgement.header.operation !== 'move' || !isMoveAcknowledgementEnvelope(acknowledgement)) {
      throw new MoveProtocolError('Expected a canonical Move acknowledgement.');
    }
    if (acknowledgement.header.targetProduct !== this.localProduct) {
      throw new MoveProtocolError('Only the source product may apply a Move acknowledgement.');
    }
    const existing = await this.journals.getJournal(acknowledgement.header.transferId);
    if (!existing) throw new MoveProtocolError('Move acknowledgement has no durable source journal.');
    if (
      existing.pairingId !== acknowledgement.header.pairingId ||
      existing.sourceProduct !== acknowledgement.header.targetProduct ||
      existing.targetProduct !== acknowledgement.header.sourceProduct
    ) {
      throw new MoveProtocolError('Move acknowledgement does not match the source transfer identity.');
    }
    if (
      await this.journals.hasReceipt(acknowledgement.header.pairingId, acknowledgement.header.messageId, acknowledgement.header.transferId)
    ) {
      return existing;
    }
    const item = await this.journals.getItem(acknowledgement.header.transferId, acknowledgement.payload.recordInteropId);
    if (!item) throw new MoveProtocolError('Move acknowledgement does not match a queued item.');
    if (!acknowledgement.payload.acknowledgedMessageIds.includes(item.sourceMessageId)) {
      throw new MoveProtocolError('Move acknowledgement does not cover the queued source message.');
    }
    if (acknowledgement.payload.status === 'accepted') this.assertDurableAcknowledgement(item.record, acknowledgement);
    return this.journals.applyAcknowledgement({
      acknowledgement,
      error: acknowledgement.payload.errors.length === 0 ? null : acknowledgement.payload.errors,
      at: this.#now(),
    });
  }

  async resumeFinalization(transferId: string, finalizer: MoveSourceFinalizer): Promise<MoveFinalizationResult> {
    const journal = await this.journals.getJournal(transferId);
    if (!journal) throw new MoveProtocolError(`Move journal ${transferId} does not exist.`);
    if (journal.sourceProduct !== this.localProduct) throw new MoveProtocolError('Only the source product may finalize Move items.');
    let finalized = 0;
    let failed = 0;
    for (const item of await this.journals.pendingFinalization(transferId)) {
      if (item.record.original.state === 'available' && item.originalVerification !== 'verified') {
        throw new MoveProtocolError('Source deletion guard requires verified target original custody.');
      }
      await this.journals.markFinalizing(transferId, item.interopId, this.#now());
      try {
        await finalizer.finalize({
          transferId,
          sourceLocalId: item.sourceLocalId,
          targetLocalId: item.targetLocalId,
          record: item.record,
          originalAction: item.record.original.state === 'available' ? 'remove-after-verified-copy' : 'preserve-original',
        });
        await this.journals.markFinalized(transferId, item.interopId, this.#now());
        finalized += 1;
      } catch (error) {
        await this.journals.markFinalizationFailed(transferId, item.interopId, moveError(error), this.#now());
        failed += 1;
      }
    }
    const updated = await this.journals.getJournal(transferId);
    if (!updated) throw new MoveJournalError(`Move journal ${transferId} disappeared during finalization.`);
    return { finalized, failed, journal: updated };
  }

  private requireRecordRequest(input: InteropEnvelope) {
    const request = parseInteropEnvelope(input);
    if (request.header.operation !== 'move' || !isMoveRecordEnvelope(request)) {
      throw new MoveProtocolError('Expected a canonical Move record request.');
    }
    return request;
  }

  private async assertReplayIdentity(
    request: ReturnType<MoveProtocolService['requireRecordRequest']>,
    replayed: InteropEnvelope,
  ): Promise<void> {
    if (
      replayed.header.transferId !== request.header.transferId ||
      replayed.header.pairingId !== request.header.pairingId ||
      replayed.header.sourceProduct !== request.header.targetProduct ||
      replayed.header.targetProduct !== request.header.sourceProduct
    ) {
      throw new MoveProtocolError('Move replay identity was reused across transfer identities.');
    }
    const item = await this.journals.getItem(request.header.transferId, request.payload.record.identity.interopId);
    if (
      !item ||
      item.sourceMessageId !== request.header.messageId ||
      item.reviewCategory !== request.payload.reviewCategory ||
      !sameMoveValue(item.record, request.payload.record) ||
      !sameMoveValue(item.albums, request.payload.albums)
    ) {
      throw new MoveProtocolError('Move replay identity was reused with different content.');
    }
  }

  private assertDurableAcknowledgement(record: InteropRecord, acknowledgement: MoveAcknowledgementEnvelope): void {
    if (!acknowledgement.payload.metadataPersisted) {
      throw new MoveProtocolError('Accepted Move acknowledgement did not prove metadata durability.');
    }
    if (record.original.state === 'available') {
      if (acknowledgement.payload.originalVerification !== 'verified') {
        throw new MoveProtocolError('Accepted Move acknowledgement did not prove original durability.');
      }
      return;
    }
    if (acknowledgement.payload.originalVerification !== originalVerificationFor(record)) {
      throw new MoveProtocolError('Move acknowledgement falsely claimed original custody.');
    }
  }
}

function verificationFailure(recordInteropId: string, message = 'Target original verification failed.'): InteropError {
  return { code: 'partial-failure', message, retryable: true, recordInteropId };
}

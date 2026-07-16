import type { InteropConflictAction, InteropProduct } from '../../core/interop/contract.js';
import { parseInteropEnvelope, type InteropEnvelope } from '../../core/interop/messages.js';
import type { InteropRecord } from '../../core/interop/records.js';
import {
  analyzeSyncRecords,
  resolveSyncConflicts,
  type SyncAnalysis,
  type SyncApplyOutcome,
  type SyncField,
} from '../../core/interop/sync-resolution.js';
import type { SyncJournalRepository } from './sync-journal-repository.js';
import type { SyncDeleteDecision, SyncDirection, SyncItemRecord, SyncScope, SyncSessionRecord } from './sync-journal-types.js';

export interface SyncApplyRequest extends SyncApplyOutcome {
  readonly sessionId: string;
  readonly interopId: string;
  readonly deleteApproved: boolean;
}

export interface SyncRecordApplier {
  apply(input: SyncApplyRequest): Promise<void>;
}

interface SyncProtocolOptions {
  readonly now?: (() => string) | undefined;
}

export class SyncProtocolError extends Error {
  override readonly name = 'SyncProtocolError';
}

function singleRecordAnalysis(record: InteropRecord): SyncAnalysis {
  return { category: record.deletedAt === null ? 'eligible' : 'delete-review', merged: record, conflicts: [] };
}

function sameParticipants(session: SyncSessionRecord, source: InteropProduct, target: InteropProduct): boolean {
  return (
    (session.sourceProduct === source && session.targetProduct === target) ||
    (session.direction === 'two-way' && session.sourceProduct === target && session.targetProduct === source)
  );
}

function hasTombstone(item: SyncItemRecord): boolean {
  return (
    (item.imageTrailRecord !== null && item.imageTrailRecord.deletedAt !== null) ||
    (item.overlookRecord !== null && item.overlookRecord.deletedAt !== null)
  );
}

export class SyncProtocolService {
  readonly #now: () => string;

  constructor(
    private readonly localProduct: InteropProduct,
    private readonly repository: SyncJournalRepository,
    options: SyncProtocolOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  start(input: {
    readonly sessionId: string;
    readonly pairingId: string;
    readonly sourceProduct: InteropProduct;
    readonly targetProduct: InteropProduct;
    readonly direction: SyncDirection;
    readonly scope: SyncScope;
  }): Promise<SyncSessionRecord> {
    if (input.sourceProduct !== this.localProduct && input.targetProduct !== this.localProduct) {
      throw new SyncProtocolError('Local product must participate in the Sync session.');
    }
    return this.repository.createSession({ ...input, at: this.#now() });
  }

  async receive(sessionId: string, envelopeInput: InteropEnvelope, localRecord: InteropRecord | null): Promise<SyncItemRecord> {
    const envelope = parseInteropEnvelope(envelopeInput);
    if (envelope.header.operation !== 'sync' || envelope.payload.kind !== 'record') {
      throw new SyncProtocolError('Sync receive accepts only canonical Sync record messages.');
    }
    const session = await this.repository.getSession(sessionId);
    if (session === undefined) throw new SyncProtocolError('Sync session does not exist.');
    if (
      envelope.header.transferId !== sessionId ||
      session.pairingId !== envelope.header.pairingId ||
      !sameParticipants(session, envelope.header.sourceProduct, envelope.header.targetProduct) ||
      envelope.header.targetProduct !== this.localProduct
    ) {
      throw new SyncProtocolError('Sync message does not match the durable session identity.');
    }
    const replay = await this.repository.itemForReceipt(envelope.header.pairingId, envelope.header.messageId, envelope);
    if (replay !== undefined) return replay;

    const remoteRecord = envelope.payload.record;
    if (localRecord !== null && localRecord.identity.interopId !== remoteRecord.identity.interopId) {
      throw new SyncProtocolError('Local and remote Sync records must share one canonical identity.');
    }
    const imageTrailRecord = envelope.header.sourceProduct === 'image-trail' ? remoteRecord : localRecord;
    const overlookRecord = envelope.header.sourceProduct === 'overlook' ? remoteRecord : localRecord;
    const analysis =
      imageTrailRecord === null || overlookRecord === null
        ? singleRecordAnalysis(remoteRecord)
        : analyzeSyncRecords(imageTrailRecord, overlookRecord);
    const item = await this.repository.putItem({ sessionId, imageTrailRecord, overlookRecord, analysis, at: this.#now() });
    await this.repository.recordReceipt(sessionId, envelope, this.#now());
    return item;
  }

  decide(
    sessionId: string,
    interopId: string,
    field: SyncField,
    action: InteropConflictAction,
    applyToAll = false,
  ): Promise<SyncItemRecord> {
    return this.repository.decide(sessionId, interopId, field, action, applyToAll, this.#now());
  }

  reviewDelete(sessionId: string, interopId: string, decision: SyncDeleteDecision): Promise<SyncItemRecord> {
    return this.repository.reviewDelete(sessionId, interopId, decision, this.#now());
  }

  pause(sessionId: string): Promise<SyncSessionRecord> {
    return this.repository.setControl(sessionId, 'pause', this.#now());
  }

  resume(sessionId: string): Promise<SyncSessionRecord> {
    return this.repository.setControl(sessionId, 'resume', this.#now());
  }

  cancel(sessionId: string): Promise<SyncSessionRecord> {
    return this.repository.setControl(sessionId, 'cancel', this.#now());
  }

  disconnect(sessionId: string): Promise<SyncSessionRecord> {
    return this.repository.setControl(sessionId, 'disconnect', this.#now());
  }

  async apply(sessionId: string, interopId: string, applier: SyncRecordApplier): Promise<SyncItemRecord> {
    await this.repository.activeSession(sessionId);
    const item = await this.repository.getItem(sessionId, interopId);
    if (item === undefined) throw new SyncProtocolError('Sync item does not exist.');
    if (item.state === 'applied' || item.state === 'skipped') return item;
    if (item.state === 'duplicate') return this.repository.markApplied(sessionId, interopId, this.#now());
    if (item.state !== 'eligible' && item.state !== 'ready') {
      throw new SyncProtocolError('Sync item still requires conflict or delete review.');
    }
    if (hasTombstone(item) && item.deleteDecision !== 'apply') {
      throw new SyncProtocolError('Sync deletion requires explicit approval.');
    }
    const outcome =
      item.imageTrailRecord === null || item.overlookRecord === null
        ? { primary: item.analysis.merged, secondary: null }
        : resolveSyncConflicts(item.analysis, item.imageTrailRecord, item.overlookRecord, item.decisions);
    try {
      await applier.apply({ ...outcome, sessionId, interopId, deleteApproved: item.deleteDecision === 'apply' });
      return await this.repository.markApplied(sessionId, interopId, this.#now());
    } catch (error) {
      await this.repository.markFailed(
        sessionId,
        interopId,
        { message: error instanceof Error ? error.message : 'Sync apply failed.' },
        this.#now(),
      );
      throw error;
    }
  }
}

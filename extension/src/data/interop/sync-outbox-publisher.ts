import { INTEROP_CONTRACT_VERSION, INTEROP_MAGIC } from '../../core/interop/contract.js';
import { parseInteropEnvelope } from '../../core/interop/messages.js';
import { EncryptedInteropTransport, type InteropObjectStore } from '../../core/interop/transport.js';
import type { ActiveBlobKey } from '../crypto/blob-keyring.js';
import type { StoredInteropKeyRecord } from '../repositories/interop-keys-repository.js';
import { InteropRecordExportStore } from './record-export.js';
import { sealInteropMessage } from './sealed-message.js';
import { SecureSyncOutboxRepository, type SecureSyncProgress, type SecureSyncQueueItem } from './secure-sync-outbox-repository.js';
import { syncMessagePath } from './sync-paths.js';

export class SyncOutboxPublishError extends Error {
  override readonly name = 'SyncOutboxPublishError';

  constructor(
    message: string,
    readonly progress: SecureSyncProgress,
    readonly sourceError: unknown,
  ) {
    super(message);
  }
}

export class SyncOutboxPublisher {
  constructor(
    private readonly db: IDBDatabase,
    private readonly store: InteropObjectStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async start(input: {
    readonly sessionId: string;
    readonly provider: 'pcloud' | 'google-drive' | 'icloud-drive';
    readonly recordIds: readonly string[];
    readonly pairing: StoredInteropKeyRecord;
    readonly activeBlobKey: ActiveBlobKey | null;
  }): Promise<SecureSyncProgress> {
    const reviewed = await new InteropRecordExportStore(this.db, { now: this.now, createId: this.createId }).review(
      input.recordIds,
      input.activeBlobKey,
      { includeOriginalBytes: false },
    );
    if (reviewed.records.length === 0) throw new Error('No supported Image Trail records were available for Sync.');
    const createdAt = this.now();
    const queued: SecureSyncQueueItem[] = [];
    const sensitive: Uint8Array[] = [];
    try {
      let sequence = 0;
      for (const item of reviewed.records) {
        sequence += 1;
        const messageId = this.createId();
        const envelope = parseInteropEnvelope({
          header: {
            magic: INTEROP_MAGIC,
            contractVersion: INTEROP_CONTRACT_VERSION,
            messageId,
            transferId: input.sessionId,
            pairingId: input.pairing.pairingId,
            sourceProduct: 'image-trail',
            targetProduct: 'overlook',
            operation: 'sync',
            kind: 'record',
            createdAt,
            sequence,
          },
          payload: {
            kind: 'record',
            schemaVersion: 1,
            record: item.record,
            albums: item.albums,
            reviewCategory: item.reviewCategory,
          },
        });
        const ciphertext = await sealInteropMessage(envelope, input.pairing);
        sensitive.push(ciphertext);
        queued.push({
          interopId: item.record.identity.interopId,
          sourceLocalId: item.localId,
          messageId,
          sequence,
          path: syncMessagePath(sequence, messageId),
          reviewCategory: item.reviewCategory,
          ciphertext,
        });
      }
      await new SecureSyncOutboxRepository(this.db).queueBatch({
        sessionId: input.sessionId,
        pairingId: input.pairing.pairingId,
        provider: input.provider,
        requested: reviewed.requested,
        unsupported: reviewed.unsupported,
        items: queued,
        at: createdAt,
      });
    } finally {
      for (const bytes of sensitive) bytes.fill(0);
      for (const item of reviewed.records) item.original?.bytes.fill(0);
    }
    return this.publish(input.sessionId, input.pairing);
  }

  async resume(sessionId: string, pairing: StoredInteropKeyRecord): Promise<SecureSyncProgress> {
    await new SecureSyncOutboxRepository(this.db).control(sessionId, 'resume', this.now());
    return this.publish(sessionId, pairing);
  }

  status(sessionId: string): Promise<SecureSyncProgress | null> {
    return new SecureSyncOutboxRepository(this.db).progress(sessionId);
  }

  async control(sessionId: string, action: 'pause' | 'cancel'): Promise<SecureSyncProgress> {
    const repository = new SecureSyncOutboxRepository(this.db);
    await repository.control(sessionId, action, this.now());
    const progress = await repository.progress(sessionId);
    if (!progress) throw new Error('Secure Sync session disappeared.');
    return progress;
  }

  private async publish(sessionId: string, pairing: StoredInteropKeyRecord): Promise<SecureSyncProgress> {
    const repository = new SecureSyncOutboxRepository(this.db);
    const initial = await repository.progress(sessionId);
    if (!initial || initial.session.pairingId !== pairing.pairingId) throw new Error('Sync outbox does not match pairing custody.');
    const transport = new EncryptedInteropTransport(this.store);
    for (const row of await repository.pending(sessionId)) {
      const current = await repository.progress(sessionId);
      if (!current || current.session.phase === 'paused' || current.session.phase === 'cancelled') break;
      try {
        const ciphertext = new Uint8Array(row.ciphertext.slice(0));
        try {
          await transport.upload({ pairingId: pairing.pairingId, transferId: sessionId }, row.path, ciphertext);
        } finally {
          ciphertext.fill(0);
        }
        await repository.markDelivered(row.messageId, this.now());
      } catch (error) {
        const progress = await repository.progress(sessionId);
        if (!progress) throw error;
        throw new SyncOutboxPublishError('Sync snapshot upload is incomplete and can be resumed.', progress, error);
      }
    }
    const progress = await repository.progress(sessionId);
    if (!progress) throw new Error('Secure Sync session disappeared after publication.');
    return progress;
  }
}

import type { InteropProviderId } from '../core/interop/runtime-state.js';
import type { InteropObjectStore } from '../core/interop/transport.js';
import { MoveOutboxPublisher, readMoveOutboxProgress, type MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import { MoveAcknowledgementReconciler, type MoveSourceRecordFinalizer } from '../data/interop/move-acknowledgement-reconciler.js';
import { InteropKeysRepository, type StoredInteropKeyRecord } from '../data/repositories/interop-keys-repository.js';
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';

export class InteropMoveSetupError extends Error {
  override readonly name = 'InteropMoveSetupError';

  constructor(
    message: string,
    readonly code: 'wrong-key' | 'provider-unavailable' | 'interrupted',
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class InteropMoveRuntime {
  constructor(
    private readonly getDb: () => Promise<IDBDatabase | null>,
    private readonly openProvider: (provider: InteropProviderId) => Promise<InteropObjectStore | null>,
    private readonly getActiveBlobKey: () => Promise<ActiveBlobKey | null>,
    private readonly finalizer: MoveSourceRecordFinalizer,
  ) {}

  async start(input: {
    readonly provider: InteropProviderId;
    readonly transferId: string;
    readonly recordIds: readonly string[];
  }): Promise<MoveOutboxProgress> {
    const db = await this.requireDb();
    const pairing = await this.pairing(db);
    if (!pairing) throw new InteropMoveSetupError('Import the Overlook pairing key before starting interoperability.', 'wrong-key', false);
    const store = await this.requireProvider(input.provider);
    return new MoveOutboxPublisher(db, store).start({
      transferId: input.transferId,
      recordIds: input.recordIds,
      pairing,
      activeBlobKey: await this.getActiveBlobKey(),
    });
  }

  async resume(input: {
    readonly provider: InteropProviderId;
    readonly transferId: string;
    readonly total: number;
    readonly allowFinalization: boolean;
  }): Promise<MoveOutboxProgress> {
    const db = await this.requireDb();
    const progress = await readMoveOutboxProgress(db, input.transferId, input.total);
    if (!progress) throw new InteropMoveSetupError('The interrupted Move journal is unavailable.', 'interrupted', false);
    const pairing = await this.pairing(db, progress.journal.pairingId);
    if (!pairing) throw new InteropMoveSetupError('The Move journal pairing key is unavailable.', 'wrong-key', false);
    const store = await this.requireProvider(input.provider);
    await new MoveOutboxPublisher(db, store).resume(input.transferId, pairing, input.total);
    return new MoveAcknowledgementReconciler(db, store, this.finalizer).reconcile({
      transferId: input.transferId,
      total: input.total,
      pairing,
      allowFinalization: input.allowFinalization,
    });
  }

  async status(input: {
    readonly transferId: string;
    readonly total: number;
    readonly provider?: InteropProviderId | undefined;
    readonly allowFinalization?: boolean | undefined;
  }): Promise<MoveOutboxProgress | null> {
    const db = await this.getDb();
    if (!db) return null;
    const progress = await readMoveOutboxProgress(db, input.transferId, input.total);
    if (!progress || !input.provider) return progress;
    const pairing = await this.pairing(db, progress.journal.pairingId);
    if (!pairing) throw new InteropMoveSetupError('The Move journal pairing key is unavailable.', 'wrong-key', false);
    const store = await this.requireProvider(input.provider);
    return new MoveAcknowledgementReconciler(db, store, this.finalizer).reconcile({
      transferId: input.transferId,
      total: input.total,
      pairing,
      allowFinalization: input.allowFinalization ?? false,
    });
  }

  private async requireDb(): Promise<IDBDatabase> {
    const db = await this.getDb();
    if (!db) throw new InteropMoveSetupError('Interop journal storage is unavailable.', 'interrupted', true);
    return db;
  }

  private async requireProvider(provider: InteropProviderId): Promise<InteropObjectStore> {
    const store = await this.openProvider(provider);
    if (!store) {
      throw new InteropMoveSetupError('The selected provider cannot publish encrypted Move objects yet.', 'provider-unavailable', false);
    }
    return store;
  }

  private async pairing(db: IDBDatabase, pairingId?: string): Promise<StoredInteropKeyRecord | null> {
    const records = await new InteropKeysRepository(db).list();
    if (pairingId) return records.find((record) => record.pairingId === pairingId) ?? null;
    return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }
}

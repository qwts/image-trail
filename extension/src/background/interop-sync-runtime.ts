import type { InteropProviderId } from '../core/interop/runtime-state.js';
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { SyncOutboxPublisher } from '../data/interop/sync-outbox-publisher.js';
import { SecureSyncOutboxRepository, type SecureSyncProgress } from '../data/interop/secure-sync-outbox-repository.js';
import { SyncInboxScanner } from '../data/interop/sync-inbox-scanner.js';
import { InteropKeysRepository, type StoredInteropKeyRecord } from '../data/repositories/interop-keys-repository.js';
import type { InteropProviderOpenContext, InteropRuntimeProviderStore } from './interop-runtime-dependencies.js';

export class InteropSyncSetupError extends Error {
  override readonly name = 'InteropSyncSetupError';

  constructor(
    message: string,
    readonly code: 'wrong-key' | 'provider-unavailable' | 'interrupted',
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class InteropSyncRuntime {
  constructor(
    private readonly getDb: () => Promise<IDBDatabase | null>,
    private readonly openProvider: (
      provider: InteropProviderId,
      context: InteropProviderOpenContext,
    ) => Promise<InteropRuntimeProviderStore | null>,
    private readonly getActiveBlobKey: () => Promise<ActiveBlobKey | null>,
  ) {}

  async start(input: {
    readonly provider: InteropProviderId;
    readonly sessionId: string;
    readonly remoteSessionId: string;
    readonly recordIds: readonly string[];
  }): Promise<SecureSyncProgress> {
    const db = await this.requireDb();
    const pairing = await this.pairing(db);
    if (!pairing) throw new InteropSyncSetupError('Import the Overlook pairing key before starting Sync.', 'wrong-key', false);
    const store = await this.requireProvider(input.provider, {
      operation: 'sync',
      operationId: input.sessionId,
      remoteSessionId: input.remoteSessionId,
      pairingId: pairing.pairingId,
      recordIds: input.recordIds,
    });
    const activeBlobKey = await this.getActiveBlobKey();
    const progress = await new SyncOutboxPublisher(db, store).start({
      ...input,
      pairing,
      activeBlobKey,
    });
    await store.commit?.();
    return progress;
  }

  async resume(
    provider: InteropProviderId,
    sessionId: string,
    remoteSessionId: string,
    recordIds: readonly string[],
  ): Promise<SecureSyncProgress> {
    const db = await this.requireDb();
    const progress = await new SecureSyncOutboxRepository(db).progress(sessionId);
    if (!progress) throw new InteropSyncSetupError('The interrupted Sync session is unavailable.', 'interrupted', false);
    if (progress.session.provider !== provider) {
      throw new InteropSyncSetupError('The Sync session provider changed after review.', 'interrupted', false);
    }
    const pairing = await this.pairing(db, progress.session.pairingId);
    if (!pairing) throw new InteropSyncSetupError('The Sync session pairing key is unavailable.', 'wrong-key', false);
    const store = await this.requireProvider(provider, {
      operation: 'sync',
      operationId: sessionId,
      remoteSessionId,
      pairingId: pairing.pairingId,
      recordIds,
    });
    await new SyncOutboxPublisher(db, store).resume(sessionId, pairing);
    await store.commit?.();
    const refreshed = await new SyncInboxScanner(db, store).refresh(sessionId, pairing, await this.getActiveBlobKey());
    await store.clearStaged?.();
    return refreshed;
  }

  async status(
    sessionId: string,
    provider?: InteropProviderId,
    remoteSessionId?: string,
    recordIds?: readonly string[],
  ): Promise<SecureSyncProgress | null> {
    const db = await this.getDb();
    if (!db) return null;
    const progress = await new SecureSyncOutboxRepository(db).progress(sessionId);
    if (!progress || !provider || !remoteSessionId || !recordIds) return progress;
    if (progress.session.provider !== provider) {
      throw new InteropSyncSetupError('The Sync session provider changed after review.', 'interrupted', false);
    }
    const pairing = await this.pairing(db, progress.session.pairingId);
    if (!pairing) throw new InteropSyncSetupError('The Sync session pairing key is unavailable.', 'wrong-key', false);
    const store = await this.requireProvider(provider, {
      operation: 'sync',
      operationId: sessionId,
      remoteSessionId,
      pairingId: pairing.pairingId,
      recordIds,
    });
    await store.commit?.();
    const refreshed = await new SyncInboxScanner(db, store).refresh(sessionId, pairing, await this.getActiveBlobKey());
    await store.clearStaged?.();
    return refreshed;
  }

  async control(sessionId: string, action: 'pause' | 'cancel'): Promise<SecureSyncProgress> {
    const db = await this.requireDb();
    const repository = new SecureSyncOutboxRepository(db);
    await repository.control(sessionId, action, new Date().toISOString());
    const progress = await repository.progress(sessionId);
    if (!progress) throw new InteropSyncSetupError('Secure Sync session disappeared.', 'interrupted', false);
    return progress;
  }

  private async requireDb(): Promise<IDBDatabase> {
    const db = await this.getDb();
    if (!db) throw new InteropSyncSetupError('Secure Sync journal storage is unavailable.', 'interrupted', true);
    return db;
  }

  private async requireProvider(provider: InteropProviderId, context: InteropProviderOpenContext): Promise<InteropRuntimeProviderStore> {
    const store = await this.openProvider(provider, context);
    if (!store)
      throw new InteropSyncSetupError('The selected provider cannot publish encrypted Sync objects yet.', 'provider-unavailable', false);
    return store;
  }

  private async pairing(db: IDBDatabase, pairingId?: string): Promise<StoredInteropKeyRecord | null> {
    const records = await new InteropKeysRepository(db).list();
    if (pairingId) return records.find((record) => record.pairingId === pairingId) ?? null;
    return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }
}

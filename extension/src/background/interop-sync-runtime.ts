import type { InteropProviderId } from '../core/interop/runtime-state.js';
import type { InteropObjectStore } from '../core/interop/transport.js';
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { SyncOutboxPublisher } from '../data/interop/sync-outbox-publisher.js';
import { SecureSyncOutboxRepository, type SecureSyncProgress } from '../data/interop/secure-sync-outbox-repository.js';
import { SyncInboxScanner } from '../data/interop/sync-inbox-scanner.js';
import { InteropKeysRepository, type StoredInteropKeyRecord } from '../data/repositories/interop-keys-repository.js';

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
    private readonly openProvider: (provider: InteropProviderId) => Promise<InteropObjectStore | null>,
    private readonly getActiveBlobKey: () => Promise<ActiveBlobKey | null>,
  ) {}

  async start(input: {
    readonly provider: InteropProviderId;
    readonly sessionId: string;
    readonly recordIds: readonly string[];
  }): Promise<SecureSyncProgress> {
    const db = await this.requireDb();
    const pairing = await this.pairing(db);
    if (!pairing) throw new InteropSyncSetupError('Import the Overlook pairing key before starting Sync.', 'wrong-key', false);
    const store = await this.requireProvider(input.provider);
    const activeBlobKey = await this.getActiveBlobKey();
    return new SyncOutboxPublisher(db, store).start({
      ...input,
      pairing,
      activeBlobKey,
    });
  }

  async resume(provider: InteropProviderId, sessionId: string): Promise<SecureSyncProgress> {
    const db = await this.requireDb();
    const store = await this.requireProvider(provider);
    const progress = await new SyncOutboxPublisher(db, store).status(sessionId);
    if (!progress) throw new InteropSyncSetupError('The interrupted Sync session is unavailable.', 'interrupted', false);
    if (progress.session.provider !== provider) {
      throw new InteropSyncSetupError('The Sync session provider changed after review.', 'interrupted', false);
    }
    const pairing = await this.pairing(db, progress.session.pairingId);
    if (!pairing) throw new InteropSyncSetupError('The Sync session pairing key is unavailable.', 'wrong-key', false);
    await new SyncOutboxPublisher(db, store).resume(sessionId, pairing);
    return new SyncInboxScanner(db, store).refresh(sessionId, pairing, await this.getActiveBlobKey());
  }

  async status(sessionId: string, provider?: InteropProviderId): Promise<SecureSyncProgress | null> {
    const db = await this.getDb();
    if (!db) return null;
    const progress = await new SecureSyncOutboxRepository(db).progress(sessionId);
    if (!progress || !provider) return progress;
    if (progress.session.provider !== provider) {
      throw new InteropSyncSetupError('The Sync session provider changed after review.', 'interrupted', false);
    }
    const pairing = await this.pairing(db, progress.session.pairingId);
    if (!pairing) throw new InteropSyncSetupError('The Sync session pairing key is unavailable.', 'wrong-key', false);
    return new SyncInboxScanner(db, await this.requireProvider(provider)).refresh(sessionId, pairing, await this.getActiveBlobKey());
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

  private async requireProvider(provider: InteropProviderId): Promise<InteropObjectStore> {
    const store = await this.openProvider(provider);
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

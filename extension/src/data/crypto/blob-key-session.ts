import type {
  SessionInactivityTimeoutMinutes,
  SessionLockReason,
  SessionUnlockClock,
  SessionUnlockSnapshot,
} from '../runtime/session-unlock.js';
import { SessionUnlockState } from '../runtime/session-unlock.js';
import type { KeyReference } from './types.js';
import { getCrypto } from './webcrypto.js';

const SESSION_STORAGE_KEY = 'imageTrail.activeBlobKey.v1';

export interface BlobKeySessionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  setAccessLevel?(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void>;
}

interface StoredBlobKeySession {
  readonly version: 1;
  readonly keyReference: KeyReference<'blob'>;
  readonly rawKey: string;
  readonly unlockedAt: string;
  readonly lastActivityAt: string;
  readonly timeoutMinutes: SessionInactivityTimeoutMinutes;
}

export interface ActiveBlobKeySession {
  readonly reference: KeyReference<'blob'>;
  readonly key: CryptoKey;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isTimeout(value: unknown): value is SessionInactivityTimeoutMinutes {
  return value === 5 || value === 10 || value === 15 || value === 'never';
}

function parseStoredSession(value: unknown): StoredBlobKeySession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredBlobKeySession>;
  const reference = candidate.keyReference;
  if (
    candidate.version !== 1 ||
    !reference ||
    reference.kind !== 'blob' ||
    typeof reference.uuid !== 'string' ||
    reference.reference !== `blob:${reference.uuid}` ||
    typeof candidate.rawKey !== 'string' ||
    typeof candidate.unlockedAt !== 'string' ||
    typeof candidate.lastActivityAt !== 'string' ||
    !isTimeout(candidate.timeoutMinutes)
  ) {
    return null;
  }
  return candidate as StoredBlobKeySession;
}

async function importActiveKey(rawKey: string, crypto: Crypto): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(rawKey) as BufferSource, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Owns the in-memory unlocked key and its MV3-session-only recovery record. */
export class BlobKeySession {
  private readonly state: SessionUnlockState<'blob'>;
  private storage: BlobKeySessionStorage | null = null;
  private storageTrusted: Promise<boolean> = Promise.resolve(false);
  private rawKey: string | null = null;
  private restoreAttempted = false;
  private recoveryFailure = false;

  constructor(
    clock?: SessionUnlockClock,
    private readonly crypto: Crypto = getCrypto(),
    private readonly onSessionChanged: (snapshot: SessionUnlockSnapshot<'blob'>) => void = () => undefined,
  ) {
    this.state = new SessionUnlockState<'blob'>(clock, () => this.expirePersistedSession());
  }

  configureStorage(storage?: BlobKeySessionStorage): void {
    this.storage = storage ?? null;
    this.restoreAttempted = false;
    this.recoveryFailure = !storage;
    this.storageTrusted = storage ? this.confirmTrustedStorage(storage) : Promise.resolve(false);
  }

  peek(): ActiveBlobKeySession | null {
    const active = this.state.activeKey;
    return active ? { reference: active.keyReference, key: active.key } : null;
  }

  async restore(): Promise<ActiveBlobKeySession | null> {
    const active = this.peek();
    if (active || this.restoreAttempted) return active;
    const storage = await this.trustedStorage();
    this.restoreAttempted = true;
    if (!storage) return null;
    try {
      const value = (await storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY];
      if (value === undefined) return null;
      const stored = parseStoredSession(value);
      if (!stored) {
        this.recoveryFailure = true;
        await this.clearPersistedSession();
        return null;
      }
      const key = await importActiveKey(stored.rawKey, this.crypto);
      this.rawKey = stored.rawKey;
      if (!this.state.restore(stored.keyReference, key, stored)) {
        await this.clearPersistedSession();
        return null;
      }
      this.onSessionChanged(this.state.snapshot);
      return this.peek();
    } catch {
      this.recoveryFailure = true;
      await this.clearPersistedSession();
      return null;
    }
  }

  async unlock(
    keyReference: KeyReference<'blob'>,
    extractableKey: CryptoKey,
    now: string | undefined,
    timeoutMinutes: SessionInactivityTimeoutMinutes,
  ): Promise<ActiveBlobKeySession> {
    const raw = new Uint8Array(await this.crypto.subtle.exportKey('raw', extractableKey));
    this.rawKey = bytesToBase64(raw);
    const key = await importActiveKey(this.rawKey, this.crypto);
    this.state.unlock(keyReference, key, now, timeoutMinutes);
    this.restoreAttempted = true;
    this.recoveryFailure = false;
    if (!(await this.persist())) this.recoveryFailure = true;
    this.onSessionChanged(this.state.snapshot);
    return { reference: keyReference, key };
  }

  async recordActivity(): Promise<boolean> {
    if (!(await this.restore()) || !this.state.recordActivity()) return false;
    await this.persist();
    return true;
  }

  async updateTimeout(timeoutMinutes: SessionInactivityTimeoutMinutes): Promise<boolean> {
    if (!(await this.restore()) || !this.state.updateTimeout(timeoutMinutes)) return false;
    await this.persist();
    return true;
  }

  async lock(reason: SessionLockReason = 'manual'): Promise<void> {
    this.state.lock(reason);
    this.restoreAttempted = true;
    await this.clearPersistedSession();
    this.onSessionChanged(this.state.snapshot);
  }

  get snapshot(): SessionUnlockSnapshot<'blob'> {
    return this.state.snapshot;
  }

  get restoreFailed(): boolean {
    return this.recoveryFailure;
  }

  private async persist(): Promise<boolean> {
    const snapshot = this.state.snapshot;
    if (!this.rawKey || snapshot.status !== 'unlocked') return false;
    const storage = await this.trustedStorage();
    if (!storage) return false;
    const record: StoredBlobKeySession = {
      version: 1,
      keyReference: snapshot.keyReference,
      rawKey: this.rawKey,
      unlockedAt: snapshot.unlockedAt,
      lastActivityAt: snapshot.lastActivityAt,
      timeoutMinutes: snapshot.timeoutMinutes,
    };
    try {
      await storage.set({ [SESSION_STORAGE_KEY]: record });
      return true;
    } catch {
      this.recoveryFailure = true;
      this.storageTrusted = Promise.resolve(false);
      await this.clearPersistedSession();
      return false;
    }
  }

  private expirePersistedSession(): void {
    this.restoreAttempted = true;
    void this.clearPersistedSession();
    this.onSessionChanged(this.state.snapshot);
  }

  private async clearPersistedSession(): Promise<void> {
    this.rawKey = null;
    try {
      await this.storage?.remove(SESSION_STORAGE_KEY);
    } catch {
      this.recoveryFailure = true;
    }
  }

  private async confirmTrustedStorage(storage: BlobKeySessionStorage): Promise<boolean> {
    try {
      if (!storage.setAccessLevel) throw new Error('Session storage access-level hardening is unavailable.');
      await storage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      return true;
    } catch {
      this.recoveryFailure = true;
      try {
        await storage.remove(SESSION_STORAGE_KEY);
      } catch {
        // Recovery remains disabled and locked even when cleanup is blocked.
      }
      return false;
    }
  }

  private async trustedStorage(): Promise<BlobKeySessionStorage | null> {
    return this.storage && (await this.storageTrusted) ? this.storage : null;
  }
}

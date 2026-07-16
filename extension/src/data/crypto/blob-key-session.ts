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
  private rawKey: string | null = null;
  private restoreAttempted = false;
  private recoveryFailure = false;

  constructor(
    clock?: SessionUnlockClock,
    private readonly crypto: Crypto = getCrypto(),
  ) {
    this.state = new SessionUnlockState<'blob'>(clock, () => this.expirePersistedSession());
  }

  configureStorage(storage: BlobKeySessionStorage): void {
    this.storage = storage;
    this.restoreAttempted = false;
    this.recoveryFailure = false;
    void storage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  }

  peek(): ActiveBlobKeySession | null {
    const active = this.state.activeKey;
    return active ? { reference: active.keyReference, key: active.key } : null;
  }

  async restore(): Promise<ActiveBlobKeySession | null> {
    const active = this.peek();
    if (active || this.restoreAttempted || !this.storage) return active;
    this.restoreAttempted = true;
    try {
      const value = (await this.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY];
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
    await this.persist();
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
  }

  get snapshot(): SessionUnlockSnapshot<'blob'> {
    return this.state.snapshot;
  }

  get restoreFailed(): boolean {
    return this.recoveryFailure;
  }

  private async persist(): Promise<void> {
    const snapshot = this.state.snapshot;
    if (!this.storage || !this.rawKey || snapshot.status !== 'unlocked') return;
    const record: StoredBlobKeySession = {
      version: 1,
      keyReference: snapshot.keyReference,
      rawKey: this.rawKey,
      unlockedAt: snapshot.unlockedAt,
      lastActivityAt: snapshot.lastActivityAt,
      timeoutMinutes: snapshot.timeoutMinutes,
    };
    await this.storage.set({ [SESSION_STORAGE_KEY]: record });
  }

  private expirePersistedSession(): void {
    this.restoreAttempted = true;
    void this.clearPersistedSession();
  }

  private async clearPersistedSession(): Promise<void> {
    this.rawKey = null;
    await this.storage?.remove(SESSION_STORAGE_KEY);
  }
}

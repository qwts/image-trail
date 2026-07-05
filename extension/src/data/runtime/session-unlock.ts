import type { KeyReference } from '../crypto/types.js';

export type SessionUnlockSnapshot =
  { readonly status: 'locked' } | { readonly status: 'unlocked'; readonly keyReference: KeyReference; readonly unlockedAt: string };

interface ActiveSessionUnlock {
  readonly keyReference: KeyReference;
  readonly key: CryptoKey;
  readonly unlockedAt: string;
}

export class SessionUnlockState {
  private active: ActiveSessionUnlock | null = null;

  unlock(keyReference: KeyReference, key: CryptoKey, now = new Date().toISOString()): void {
    this.active = { keyReference, key, unlockedAt: now };
  }

  lock(): void {
    this.active = null;
  }

  get snapshot(): SessionUnlockSnapshot {
    if (!this.active) return { status: 'locked' };
    return {
      status: 'unlocked',
      keyReference: this.active.keyReference,
      unlockedAt: this.active.unlockedAt,
    };
  }

  getActiveKey(reference: KeyReference): CryptoKey | null {
    if (!this.active || this.active.keyReference.reference !== reference.reference) return null;
    return this.active.key;
  }
}

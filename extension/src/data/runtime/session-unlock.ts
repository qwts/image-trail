import type { KeyReference } from '../crypto/types.js';

export type SessionUnlockSnapshot =
  | { readonly status: 'locked' }
  | { readonly status: 'unlocked'; readonly keyReference: KeyReference; readonly unlockedAt: string };

export class SessionUnlockState {
  private active: Extract<SessionUnlockSnapshot, { status: 'unlocked' }> | null = null;

  unlock(keyReference: KeyReference, now = new Date().toISOString()): void {
    this.active = { status: 'unlocked', keyReference, unlockedAt: now };
  }

  lock(): void {
    this.active = null;
  }

  get snapshot(): SessionUnlockSnapshot {
    return this.active ?? { status: 'locked' };
  }
}

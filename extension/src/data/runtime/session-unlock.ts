import type { KeyKind, KeyReference } from '../crypto/types.js';
import { DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES, type SessionInactivityTimeoutMinutes } from '../../core/secure-session-policy.js';

export type { SessionInactivityTimeoutMinutes } from '../../core/secure-session-policy.js';
export { DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES } from '../../core/secure-session-policy.js';
export type SessionLockReason = 'manual' | 'timeout';

export interface SessionUnlockClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: SessionUnlockClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const handle = globalThis.setTimeout(callback, delayMs);
    const nodeHandle = handle as unknown as { unref?: () => void };
    nodeHandle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SessionUnlockSnapshot<K extends KeyKind = KeyKind> =
  | { readonly status: 'locked'; readonly reason?: SessionLockReason | undefined }
  | {
      readonly status: 'unlocked';
      readonly keyReference: KeyReference<K>;
      readonly unlockedAt: string;
      readonly lastActivityAt: string;
      readonly timeoutMinutes: SessionInactivityTimeoutMinutes;
      readonly expiresAt: string | null;
    };

interface ActiveSessionUnlock<K extends KeyKind> {
  readonly keyReference: KeyReference<K>;
  readonly key: CryptoKey;
  readonly unlockedAt: string;
  lastActivityAtMs: number;
  timeoutMinutes: SessionInactivityTimeoutMinutes;
}

export class SessionUnlockState<K extends KeyKind = KeyKind> {
  private active: ActiveSessionUnlock<K> | null = null;
  private expirationHandle: unknown = null;
  private lastLockReason: SessionLockReason | undefined;

  constructor(
    private readonly clock: SessionUnlockClock = systemClock,
    private readonly onTimeout: () => void = () => {},
  ) {}

  unlock(
    keyReference: KeyReference<K>,
    key: CryptoKey,
    now: string | number = this.clock.now(),
    timeoutMinutes: SessionInactivityTimeoutMinutes = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  ): void {
    const nowMs = typeof now === 'number' ? now : Date.parse(now);
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : this.clock.now();
    this.active = {
      keyReference,
      key,
      unlockedAt: new Date(safeNowMs).toISOString(),
      lastActivityAtMs: safeNowMs,
      timeoutMinutes,
    };
    this.lastLockReason = undefined;
    this.scheduleExpiration();
  }

  restore(
    keyReference: KeyReference<K>,
    key: CryptoKey,
    session: {
      readonly unlockedAt: string;
      readonly lastActivityAt: string;
      readonly timeoutMinutes: SessionInactivityTimeoutMinutes;
    },
  ): boolean {
    const unlockedAtMs = Date.parse(session.unlockedAt);
    const lastActivityAtMs = Date.parse(session.lastActivityAt);
    if (!Number.isFinite(unlockedAtMs) || !Number.isFinite(lastActivityAtMs)) return false;
    this.active = {
      keyReference,
      key,
      unlockedAt: new Date(unlockedAtMs).toISOString(),
      lastActivityAtMs,
      timeoutMinutes: session.timeoutMinutes,
    };
    this.lastLockReason = undefined;
    if (this.expireIfNeeded(this.clock.now())) return false;
    this.scheduleExpiration();
    return true;
  }

  lock(reason: SessionLockReason = 'manual'): void {
    this.cancelExpiration();
    this.active = null;
    this.lastLockReason = reason;
  }

  recordActivity(now = this.clock.now()): boolean {
    if (!this.active || this.expireIfNeeded(now)) return false;
    this.active.lastActivityAtMs = now;
    this.scheduleExpiration();
    return true;
  }

  updateTimeout(timeoutMinutes: SessionInactivityTimeoutMinutes, now = this.clock.now()): boolean {
    if (!this.active || this.expireIfNeeded(now)) return false;
    this.active.timeoutMinutes = timeoutMinutes;
    if (this.expireIfNeeded(now)) return false;
    this.scheduleExpiration();
    return true;
  }

  get snapshot(): SessionUnlockSnapshot<K> {
    this.expireIfNeeded(this.clock.now());
    if (!this.active) return this.lastLockReason ? { status: 'locked', reason: this.lastLockReason } : { status: 'locked' };
    const expiresAtMs = this.expiresAtMs(this.active);
    return {
      status: 'unlocked',
      keyReference: this.active.keyReference,
      unlockedAt: this.active.unlockedAt,
      lastActivityAt: new Date(this.active.lastActivityAtMs).toISOString(),
      timeoutMinutes: this.active.timeoutMinutes,
      expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    };
  }

  getActiveKey(reference: KeyReference<K>): CryptoKey | null {
    this.expireIfNeeded(this.clock.now());
    if (!this.active || this.active.keyReference.reference !== reference.reference) return null;
    return this.active.key;
  }

  get activeKey(): { readonly keyReference: KeyReference<K>; readonly key: CryptoKey } | null {
    this.expireIfNeeded(this.clock.now());
    if (!this.active) return null;
    return { keyReference: this.active.keyReference, key: this.active.key };
  }

  private expiresAtMs(active: ActiveSessionUnlock<K>): number | null {
    return active.timeoutMinutes === 'never' ? null : active.lastActivityAtMs + active.timeoutMinutes * 60_000;
  }

  private expireIfNeeded(now: number): boolean {
    if (!this.active) return false;
    const expiresAt = this.expiresAtMs(this.active);
    if (expiresAt === null || now < expiresAt) return false;
    this.lock('timeout');
    this.onTimeout();
    return true;
  }

  private scheduleExpiration(): void {
    this.cancelExpiration();
    if (!this.active) return;
    const expiresAt = this.expiresAtMs(this.active);
    if (expiresAt === null) return;
    this.expirationHandle = this.clock.setTimeout(
      () => {
        this.expirationHandle = null;
        this.expireIfNeeded(this.clock.now());
      },
      Math.max(0, expiresAt - this.clock.now()),
    );
  }

  private cancelExpiration(): void {
    if (this.expirationHandle === null) return;
    this.clock.clearTimeout(this.expirationHandle);
    this.expirationHandle = null;
  }
}

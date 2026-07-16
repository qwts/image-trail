import { createKeyReference } from './key-reference.js';
import { PBKDF2_ITERATIONS, unwrapKeyWithPassword, wrapKeyWithPassword } from './password-wrap.js';
import type { KeyReference, StoredKeyRecord } from './types.js';
import { generateAesGcmKey } from './webcrypto.js';
import { BlobKeySession, type BlobKeySessionStorage } from './blob-key-session.js';
import {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  type SessionInactivityTimeoutMinutes,
  type SessionLockReason,
  type SessionUnlockSnapshot,
} from '../runtime/session-unlock.js';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export interface ActiveBlobKey {
  readonly reference: KeyReference<'blob'>;
  readonly key: CryptoKey;
}

export interface WrappedBlobKey {
  readonly active: ActiveBlobKey;
  readonly metadata: StoredKeyRecord<'blob'>;
}

const blobKeySession = new BlobKeySession();

export function configureBlobKeySessionStorage(storage: BlobKeySessionStorage): void {
  blobKeySession.configureStorage(storage);
}

export function getActiveBlobKey(): ActiveBlobKey | null {
  return blobKeySession.peek();
}

export function restoreActiveBlobKey(): Promise<ActiveBlobKey | null> {
  return blobKeySession.restore();
}

export function lockBlobKey(reason: SessionLockReason = 'manual'): Promise<void> {
  return blobKeySession.lock(reason);
}

export function recordBlobKeyActivity(): Promise<boolean> {
  return blobKeySession.recordActivity();
}

export function updateBlobKeyInactivityTimeout(timeoutMinutes: SessionInactivityTimeoutMinutes): Promise<boolean> {
  return blobKeySession.updateTimeout(timeoutMinutes);
}

export function getBlobKeySessionSnapshot(): SessionUnlockSnapshot<'blob'> {
  return blobKeySession.snapshot;
}

export function didBlobKeySessionRestoreFail(): boolean {
  return blobKeySession.restoreFailed;
}

export async function createAndActivateWrappedBlobKey(input: {
  readonly password: string;
  readonly uuid?: string;
  readonly now?: string;
  readonly timeoutMinutes?: SessionInactivityTimeoutMinutes;
}): Promise<WrappedBlobKey> {
  const uuid = input.uuid ?? crypto.randomUUID();
  const now = input.now ?? new Date().toISOString();
  const reference = createKeyReference('blob', uuid);
  const extractableKey = await generateAesGcmKey(true);
  const wrapped = await wrapKeyWithPassword(extractableKey, input.password);
  const metadata: StoredKeyRecord<'blob'> = {
    ...reference,
    createdAt: now,
    updatedAt: now,
    wrapping: {
      mode: 'password',
      algorithm: 'AES-GCM',
      salt: toBase64(wrapped.salt),
      iv: toBase64(wrapped.iv),
      iterations: wrapped.iterations,
      wrappedKey: toBase64(wrapped.wrappedKey),
    },
    extractable: false,
  };
  const active = await blobKeySession.unlock(
    reference,
    extractableKey,
    now,
    input.timeoutMinutes ?? DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  );
  return { active, metadata };
}

export async function activateWrappedBlobKey(
  metadata: StoredKeyRecord<'blob'>,
  password: string,
  timeoutMinutes: SessionInactivityTimeoutMinutes = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
): Promise<ActiveBlobKey> {
  if (metadata.wrapping.mode !== 'password' || metadata.wrapping.algorithm !== 'AES-GCM') {
    throw new Error('Blob key is not password wrapped.');
  }
  if (!metadata.wrapping.wrappedKey || !metadata.wrapping.iv || !metadata.wrapping.salt || !metadata.wrapping.iterations) {
    throw new Error('Blob key wrapping metadata is incomplete.');
  }
  const extractableKey = await unwrapKeyWithPassword(
    fromBase64(metadata.wrapping.wrappedKey),
    fromBase64(metadata.wrapping.iv),
    password,
    fromBase64(metadata.wrapping.salt),
    metadata.wrapping.iterations,
    true,
  );
  return blobKeySession.unlock(metadata, extractableKey, undefined, timeoutMinutes);
}

export { PBKDF2_ITERATIONS };

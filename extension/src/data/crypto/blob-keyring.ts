import { createKeyReference } from './key-reference.js';
import { PBKDF2_ITERATIONS, unwrapKeyWithPassword, wrapKeyWithPassword } from './password-wrap.js';
import type { KeyReference, StoredKeyRecord } from './types.js';
import { generateAesGcmKey } from './webcrypto.js';

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

let activeBlobKey: ActiveBlobKey | null = null;

export function getActiveBlobKey(): ActiveBlobKey | null {
  return activeBlobKey;
}

export function lockBlobKey(): void {
  activeBlobKey = null;
}

export async function createAndActivateWrappedBlobKey(input: {
  readonly password: string;
  readonly uuid?: string;
  readonly now?: string;
}): Promise<WrappedBlobKey> {
  const uuid = input.uuid ?? crypto.randomUUID();
  const now = input.now ?? new Date().toISOString();
  const reference = createKeyReference('blob', uuid);
  const extractableKey = await generateAesGcmKey(true);
  const wrapped = await wrapKeyWithPassword(extractableKey, input.password);
  const activeKey = await unwrapKeyWithPassword(wrapped.wrappedKey, wrapped.iv, input.password, wrapped.salt, wrapped.iterations, false);
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
  activeBlobKey = { reference, key: activeKey };
  return { active: activeBlobKey, metadata };
}

export async function activateWrappedBlobKey(metadata: StoredKeyRecord<'blob'>, password: string): Promise<ActiveBlobKey> {
  if (metadata.wrapping.mode !== 'password' || metadata.wrapping.algorithm !== 'AES-GCM') {
    throw new Error('Blob key is not password wrapped.');
  }
  if (!metadata.wrapping.wrappedKey || !metadata.wrapping.iv || !metadata.wrapping.salt || !metadata.wrapping.iterations) {
    throw new Error('Blob key wrapping metadata is incomplete.');
  }
  const key = await unwrapKeyWithPassword(
    fromBase64(metadata.wrapping.wrappedKey),
    fromBase64(metadata.wrapping.iv),
    password,
    fromBase64(metadata.wrapping.salt),
    metadata.wrapping.iterations,
    false,
  );
  activeBlobKey = { reference: metadata, key };
  return activeBlobKey;
}

export { PBKDF2_ITERATIONS };

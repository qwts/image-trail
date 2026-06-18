import { getCrypto } from './webcrypto.js';

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTE_LENGTH = 16;
const DERIVED_KEY_BITS = 256;

export interface PasswordDeriveParams {
  readonly salt: Uint8Array;
  readonly iterations: number;
}

export function createPasswordSalt(crypto: Crypto = getCrypto()): Uint8Array {
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(password);
  return getCrypto().subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey']);
}

export async function deriveWrappingKey(password: string, params: PasswordDeriveParams): Promise<CryptoKey> {
  const baseKey = await importPasswordKey(password);
  return getCrypto().subtle.deriveKey(
    { name: 'PBKDF2', salt: params.salt as BufferSource, iterations: params.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: DERIVED_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function deriveEncryptionKey(password: string, params: PasswordDeriveParams): Promise<CryptoKey> {
  const baseKey = await importPasswordKey(password);
  return getCrypto().subtle.deriveKey(
    { name: 'PBKDF2', salt: params.salt as BufferSource, iterations: params.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: DERIVED_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapKeyWithPassword(
  keyToWrap: CryptoKey,
  password: string,
  salt: Uint8Array = createPasswordSalt(),
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ wrappedKey: Uint8Array; iv: Uint8Array; salt: Uint8Array; iterations: number }> {
  const wrappingKey = await deriveWrappingKey(password, { salt, iterations });
  const iv = new Uint8Array(12);
  getCrypto().getRandomValues(iv);
  const wrapped = await getCrypto().subtle.wrapKey('raw', keyToWrap, wrappingKey, { name: 'AES-GCM', iv: iv as BufferSource });
  return { wrappedKey: new Uint8Array(wrapped), iv, salt, iterations };
}

export async function unwrapKeyWithPassword(
  wrappedKey: Uint8Array,
  iv: Uint8Array,
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(password, { salt, iterations });
  return getCrypto().subtle.unwrapKey(
    'raw',
    wrappedKey as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: DERIVED_KEY_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

export { PBKDF2_ITERATIONS };

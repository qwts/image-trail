import * as v from 'valibot';
import {
  INTEROP_PAIRING_FORMAT_VERSION,
  interopPairingBundleSchema,
  interopPairingPayloadSchema,
  type InteropPairingBundle,
} from '../../core/interop/pairing.js';
import { getCrypto } from '../crypto/webcrypto.js';

const PAIRING_AAD_CONTEXT = 'overlook-image-trail/pairing/v1';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class InteropPairingError extends Error {
  override readonly name = 'InteropPairingError';
}

export interface OpenedInteropPairing {
  readonly pairingId: string;
  readonly keyId: `interop:${string}`;
  readonly key: CryptoKey;
  readonly createdAt: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeCanonicalBase64(value: string, expectedLength: number | undefined, name: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new InteropPairingError(`Invalid ${name}.`);
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytesToBase64(bytes) !== value || (expectedLength !== undefined && bytes.byteLength !== expectedLength)) {
    bytes.fill(0);
    throw new InteropPairingError(`Invalid ${name}.`);
  }
  return bytes;
}

function pairingAad(bundle: InteropPairingBundle): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      context: PAIRING_AAD_CONTEXT,
      magic: bundle.magic,
      formatVersion: bundle.formatVersion,
      pairingId: bundle.pairingId,
      keyId: bundle.keyId,
      createdAt: bundle.createdAt,
      kdf: bundle.kdf,
      cipher: { name: bundle.cipher.name, iv: bundle.cipher.iv },
    }),
  );
}

async function derivePairingKey(password: string, salt: Uint8Array, crypto: Crypto): Promise<CryptoKey> {
  const normalized = new TextEncoder().encode(password.normalize('NFKC'));
  try {
    const baseKey = await crypto.subtle.importKey('raw', normalized as BufferSource, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  } finally {
    normalized.fill(0);
  }
}

function parsePairingBundle(value: unknown): InteropPairingBundle {
  if (typeof value === 'object' && value !== null && 'formatVersion' in value && value.formatVersion !== INTEROP_PAIRING_FORMAT_VERSION) {
    throw new InteropPairingError('Unsupported pairing bundle version.');
  }
  const parsed = v.safeParse(interopPairingBundleSchema, value);
  if (!parsed.success) throw new InteropPairingError('Invalid pairing bundle.');
  return parsed.output;
}

export async function openInteropPairingBundle(
  value: unknown,
  password: string,
  crypto: Crypto = getCrypto(),
): Promise<OpenedInteropPairing> {
  if (password.length === 0) throw new InteropPairingError('Pairing password is required.');
  const bundle = parsePairingBundle(value);
  const salt = decodeCanonicalBase64(bundle.kdf.salt, SALT_BYTES, 'pairing salt');
  const iv = decodeCanonicalBase64(bundle.cipher.iv, IV_BYTES, 'pairing IV');
  const sealed = decodeCanonicalBase64(bundle.cipher.ciphertext, undefined, 'pairing ciphertext');
  const aad = pairingAad(bundle);
  let plaintext: Uint8Array | null = null;
  let rawKey: Uint8Array | null = null;
  try {
    const pairingKey = await derivePairingKey(password, salt, crypto);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
      pairingKey,
      sealed as BufferSource,
    );
    plaintext = new Uint8Array(decrypted);
    const payloadValue: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    const payload = v.parse(interopPairingPayloadSchema, payloadValue);
    if (payload.pairingId !== bundle.pairingId || payload.keyId !== bundle.keyId || payload.createdAt !== bundle.createdAt) {
      throw new InteropPairingError('Pairing payload did not match its authenticated header.');
    }
    rawKey = decodeCanonicalBase64(payload.interopKey, KEY_BYTES, 'interoperability key');
    const key = await crypto.subtle.importKey('raw', rawKey as BufferSource, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    return { pairingId: payload.pairingId, keyId: payload.keyId, key, createdAt: payload.createdAt };
  } catch (error) {
    if (error instanceof InteropPairingError) throw error;
    throw new InteropPairingError('Unable to open pairing bundle.');
  } finally {
    plaintext?.fill(0);
    rawKey?.fill(0);
    salt.fill(0);
    iv.fill(0);
    sealed.fill(0);
    aad.fill(0);
  }
}

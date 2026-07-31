import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const IDENTITY_KEY_BYTES = 32;
const IDENTITY_KEY_PATTERN = /^[0-9a-f]{64}$/u;

export function createUrlTemplateIdentityKey(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(IDENTITY_KEY_BYTES)));
}

export function isUrlTemplateIdentityKey(value: string): boolean {
  return IDENTITY_KEY_PATTERN.test(value);
}

export function deriveUrlTemplateIdentity(identityKey: string, literalSignature: string): string {
  if (!isUrlTemplateIdentityKey(identityKey)) throw new Error('Invalid URL-template identity key.');
  const encoder = new TextEncoder();
  return bytesToHex(hmac(sha256, encoder.encode(identityKey), encoder.encode(literalSignature)));
}

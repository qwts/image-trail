import * as v from 'valibot';
import { assertKeyReference } from './key-reference.js';
import type { EncryptedEnvelope, KeyReference } from './types.js';
import { createAesGcmIv, decryptAesGcm, encryptAesGcm } from './webcrypto.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function aad(metadata: Record<string, unknown>, payloadVersion: number, key: KeyReference): Uint8Array {
  assertKeyReference(key);
  return encoder.encode(JSON.stringify({ metadata, payloadVersion, key }));
}

export async function sealJsonEnvelope<TPayload, TMetadata extends Record<string, unknown>>(input: {
  readonly payload: TPayload;
  readonly payloadVersion: number;
  readonly key: CryptoKey;
  readonly keyReference: KeyReference;
  readonly authenticatedMetadata: TMetadata;
  readonly now?: string;
}): Promise<EncryptedEnvelope<TMetadata>> {
  const iv = createAesGcmIv();
  const ciphertext = await encryptAesGcm(
    input.key,
    encoder.encode(JSON.stringify(input.payload)),
    iv,
    aad(input.authenticatedMetadata, input.payloadVersion, input.keyReference),
  );
  const timestamp = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    payloadVersion: input.payloadVersion,
    algorithm: 'AES-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    key: input.keyReference,
    createdAt: timestamp,
    updatedAt: timestamp,
    authenticatedMetadata: input.authenticatedMetadata,
  };
}

export async function openJsonEnvelope<TPayload>(envelope: EncryptedEnvelope, key: CryptoKey): Promise<TPayload> {
  if (envelope.schemaVersion !== 1 || envelope.algorithm !== 'AES-GCM') throw new Error('Unsupported encrypted envelope.');
  const plaintext = await decryptAesGcm(
    key,
    fromBase64(envelope.ciphertext),
    fromBase64(envelope.iv),
    aad(envelope.authenticatedMetadata, envelope.payloadVersion, envelope.key),
  );
  return JSON.parse(decoder.decode(plaintext)) as TPayload;
}

/**
 * Decrypts an envelope and validates the decrypted JSON payload against `schema`,
 * throwing when it does not conform (callers already treat a throw here as an
 * unreadable/quarantined row). Returns the original parsed payload unchanged so
 * unknown forward-compat fields survive a decrypt/modify/re-seal round-trip.
 */
export async function openValidatedJsonEnvelope<TPayload>(
  envelope: EncryptedEnvelope,
  key: CryptoKey,
  schema: v.GenericSchema<unknown, TPayload>,
): Promise<TPayload> {
  const payload = await openJsonEnvelope<unknown>(envelope, key);
  if (!v.is(schema, payload)) {
    throw new Error('Decrypted envelope payload failed schema validation.');
  }
  return payload as TPayload;
}

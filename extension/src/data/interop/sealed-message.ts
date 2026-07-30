import * as v from 'valibot';

import { interopUuidSchema } from '../../core/interop/contract.js';
import { parseInteropEnvelope, type InteropEnvelope } from '../../core/interop/messages.js';
import { getCrypto } from '../crypto/webcrypto.js';
import type { StoredInteropKeyRecord } from '../repositories/interop-keys-repository.js';

const SEALED_MESSAGE_MAGIC = 'OVERLOOK-IMAGE-TRAIL-SEALED-MESSAGE';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const canonicalBase64Schema = v.pipe(
  v.string(),
  v.check((value) => {
    try {
      return btoa(atob(value)) === value;
    } catch {
      return false;
    }
  }, 'Value must be canonical base64.'),
);
const ivSchema = v.pipe(canonicalBase64Schema, v.regex(/^[A-Za-z0-9+/]{16}$/u, 'AES-GCM IV must encode exactly 12 bytes.'));

const sealedMessageSchema = v.strictObject({
  magic: v.literal(SEALED_MESSAGE_MAGIC),
  schemaVersion: v.literal(1),
  pairingId: interopUuidSchema,
  transferId: interopUuidSchema,
  messageId: interopUuidSchema,
  keyId: v.pipe(v.string(), v.regex(/^interop:[0-9a-f-]+$/iu)),
  cipher: v.strictObject({
    name: v.literal('AES-GCM'),
    iv: ivSchema,
    ciphertext: canonicalBase64Schema,
  }),
});

type SealedMessage = v.InferOutput<typeof sealedMessageSchema>;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function authenticatedHeader(
  value: Omit<SealedMessage, 'cipher'> & { readonly cipher: { readonly name: 'AES-GCM'; readonly iv: string } },
): Uint8Array {
  return encoder.encode(JSON.stringify({ context: 'overlook-image-trail/message/v1', ...value }));
}

function header(envelope: InteropEnvelope, key: StoredInteropKeyRecord, iv: string) {
  if (envelope.header.pairingId !== key.pairingId) throw new Error('Interop message pairing does not match key custody.');
  return {
    magic: SEALED_MESSAGE_MAGIC,
    schemaVersion: 1 as const,
    pairingId: envelope.header.pairingId,
    transferId: envelope.header.transferId,
    messageId: envelope.header.messageId,
    keyId: key.reference,
    cipher: { name: 'AES-GCM' as const, iv },
  } as const;
}

export async function sealInteropMessage(
  envelopeInput: InteropEnvelope,
  key: StoredInteropKeyRecord,
  crypto: Crypto = getCrypto(),
): Promise<Uint8Array> {
  const envelope = parseInteropEnvelope(envelopeInput);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = header(envelope, key, base64(iv));
  const aad = authenticatedHeader(value);
  const plaintext = encoder.encode(JSON.stringify(envelope));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
      key.key,
      plaintext as BufferSource,
    );
    return encoder.encode(JSON.stringify({ ...value, cipher: { ...value.cipher, ciphertext: base64(new Uint8Array(ciphertext)) } }));
  } finally {
    plaintext.fill(0);
    aad.fill(0);
    iv.fill(0);
  }
}

export async function openInteropMessage(
  sealedBytes: Uint8Array,
  key: StoredInteropKeyRecord,
  crypto: Crypto = getCrypto(),
): Promise<InteropEnvelope> {
  let sealed: SealedMessage;
  try {
    sealed = v.parse(sealedMessageSchema, JSON.parse(decoder.decode(sealedBytes)) as unknown);
  } catch {
    throw new Error('Encrypted interop message is invalid.');
  }
  if (sealed.pairingId !== key.pairingId || sealed.keyId !== key.reference) {
    throw new Error('Encrypted interop message does not match key custody.');
  }
  const iv = bytes(sealed.cipher.iv);
  const ciphertext = bytes(sealed.cipher.ciphertext);
  const aad = authenticatedHeader({ ...sealed, cipher: { name: sealed.cipher.name, iv: sealed.cipher.iv } });
  let plaintext: Uint8Array | null = null;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
        key.key,
        ciphertext as BufferSource,
      ),
    );
    const envelope = parseInteropEnvelope(JSON.parse(decoder.decode(plaintext)) as unknown);
    if (
      envelope.header.pairingId !== sealed.pairingId ||
      envelope.header.transferId !== sealed.transferId ||
      envelope.header.messageId !== sealed.messageId
    ) {
      throw new Error('Encrypted interop message identity does not match its authenticated header.');
    }
    return envelope;
  } catch (error) {
    if (error instanceof Error && error.message.includes('authenticated header')) throw error;
    throw new Error('Encrypted interop message could not be opened.', { cause: error });
  } finally {
    plaintext?.fill(0);
    ciphertext.fill(0);
    iv.fill(0);
    aad.fill(0);
  }
}

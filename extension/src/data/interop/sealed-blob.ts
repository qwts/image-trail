import * as v from 'valibot';

import { interopUuidSchema, sha256Schema } from '../../core/interop/contract.js';
import type { InteropBlobReference } from '../../core/interop/records.js';
import { getCrypto } from '../crypto/webcrypto.js';
import type { StoredInteropKeyRecord } from '../repositories/interop-keys-repository.js';

const SEALED_BLOB_MAGIC = 'OVERLOOK-IMAGE-TRAIL-SEALED-BLOB';
const MAX_HEADER_BYTES = 8 * 1024;
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

const sealedBlobHeaderSchema = v.strictObject({
  magic: v.literal(SEALED_BLOB_MAGIC),
  schemaVersion: v.literal(1),
  pairingId: interopUuidSchema,
  keyId: v.pipe(v.string(), v.regex(/^interop:[0-9a-f-]+$/iu)),
  cipher: v.strictObject({ name: v.literal('AES-GCM'), iv: ivSchema }),
});

const sealedBlobDescriptorSchema = v.strictObject({
  schemaVersion: v.literal(1),
  transferId: interopUuidSchema,
  recordInteropId: interopUuidSchema,
  role: v.literal('original'),
  blobId: v.pipe(v.string(), v.minLength(1)),
  mimeType: v.pipe(v.string(), v.minLength(1)),
  byteLength: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  contentHash: sha256Schema,
});

export type SealedInteropBlobHeader = v.InferOutput<typeof sealedBlobHeaderSchema>;
export type SealedInteropBlobDescriptor = v.InferOutput<typeof sealedBlobDescriptorSchema>;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function digest(bytes: Uint8Array, crypto: Crypto): Promise<string> {
  const value = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeFile(header: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const output = new Uint8Array(4 + header.byteLength + ciphertext.byteLength);
  new DataView(output.buffer).setUint32(0, header.byteLength, false);
  output.set(header, 4);
  output.set(ciphertext, 4 + header.byteLength);
  return output;
}

function decodeFile(file: Uint8Array): { readonly headerBytes: Uint8Array; readonly ciphertext: Uint8Array } {
  if (file.byteLength < 4) throw new Error('Encrypted interop blob is too short.');
  const headerLength = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0, false);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || headerLength > file.byteLength - 4) {
    throw new Error('Encrypted interop blob header is invalid.');
  }
  return { headerBytes: file.slice(4, 4 + headerLength), ciphertext: file.slice(4 + headerLength) };
}

export async function sealInteropBlob(input: {
  readonly pairing: StoredInteropKeyRecord;
  readonly transferId: string;
  readonly recordInteropId: string;
  readonly blob: InteropBlobReference & { readonly state: 'available' };
  readonly bytes: Uint8Array;
  readonly crypto?: Crypto | undefined;
}): Promise<Uint8Array> {
  const crypto = input.crypto ?? getCrypto();
  if (input.bytes.byteLength !== input.blob.byteLength || (await digest(input.bytes, crypto)) !== input.blob.contentHash) {
    throw new Error('Interop original bytes do not match the canonical blob reference.');
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = v.parse(sealedBlobHeaderSchema, {
    magic: SEALED_BLOB_MAGIC,
    schemaVersion: 1,
    pairingId: input.pairing.pairingId,
    keyId: input.pairing.reference,
    cipher: { name: 'AES-GCM', iv: base64(iv) },
  });
  const descriptor = v.parse(sealedBlobDescriptorSchema, {
    schemaVersion: 1,
    transferId: input.transferId,
    recordInteropId: input.recordInteropId,
    role: 'original',
    blobId: input.blob.blobId,
    mimeType: input.blob.mimeType,
    byteLength: input.blob.byteLength,
    contentHash: input.blob.contentHash,
  });
  const headerBytes = encoder.encode(JSON.stringify(header));
  const descriptorBytes = encoder.encode(JSON.stringify(descriptor));
  if (headerBytes.byteLength > MAX_HEADER_BYTES) throw new Error('Encrypted interop blob header is too large.');
  if (descriptorBytes.byteLength > MAX_HEADER_BYTES) throw new Error('Encrypted interop blob descriptor is too large.');
  const plaintext = encodeFile(descriptorBytes, input.bytes);
  try {
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: headerBytes as BufferSource, tagLength: 128 },
        input.pairing.key,
        plaintext as BufferSource,
      ),
    );
    return encodeFile(headerBytes, ciphertext);
  } finally {
    plaintext.fill(0);
    descriptorBytes.fill(0);
    headerBytes.fill(0);
    iv.fill(0);
  }
}

export async function openInteropBlob(
  file: Uint8Array,
  pairing: StoredInteropKeyRecord,
  crypto: Crypto = getCrypto(),
): Promise<{
  readonly header: SealedInteropBlobHeader;
  readonly descriptor: SealedInteropBlobDescriptor;
  readonly bytes: Uint8Array;
}> {
  const decoded = decodeFile(file);
  let header: SealedInteropBlobHeader;
  try {
    header = v.parse(sealedBlobHeaderSchema, JSON.parse(decoder.decode(decoded.headerBytes)) as unknown);
  } catch {
    throw new Error('Encrypted interop blob header is invalid.');
  }
  if (header.pairingId !== pairing.pairingId || header.keyId !== pairing.reference) {
    throw new Error('Encrypted interop blob does not match key custody.');
  }
  const iv = fromBase64(header.cipher.iv);
  let plaintext: Uint8Array | null = null;
  let descriptorBytes: Uint8Array | null = null;
  let bytes: Uint8Array | null = null;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: decoded.headerBytes as BufferSource, tagLength: 128 },
        pairing.key,
        decoded.ciphertext as BufferSource,
      ),
    );
    const opened = decodeFile(plaintext);
    descriptorBytes = opened.headerBytes;
    bytes = opened.ciphertext;
    const descriptor = v.parse(sealedBlobDescriptorSchema, JSON.parse(decoder.decode(descriptorBytes)) as unknown);
    if (bytes.byteLength !== descriptor.byteLength || (await digest(bytes, crypto)) !== descriptor.contentHash) {
      throw new Error('Encrypted interop blob content verification failed.');
    }
    return { header, descriptor, bytes };
  } catch (error) {
    bytes?.fill(0);
    if (error instanceof Error && error.message.includes('content verification')) throw error;
    throw new Error('Encrypted interop blob could not be opened.', { cause: error });
  } finally {
    plaintext?.fill(0);
    descriptorBytes?.fill(0);
    decoded.ciphertext.fill(0);
    decoded.headerBytes.fill(0);
    iv.fill(0);
  }
}

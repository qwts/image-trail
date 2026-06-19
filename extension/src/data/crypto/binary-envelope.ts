import type { KeyReference } from './types.js';
import { assertKeyReference } from './key-reference.js';
import { createAesGcmIv, decryptAesGcm, encryptAesGcm } from './webcrypto.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface BlobPayloadMetadata {
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sourceUrl: string;
  readonly capturedAt: string;
}

export interface BlobAadMetadata {
  readonly id: string;
  readonly kind: 'original' | 'thumbnail';
  readonly schemaVersion: 1;
  readonly algorithm: 'AES-GCM';
  readonly createdAt: string;
  readonly key: KeyReference<'blob'>;
}

export interface SealedBlobPayload {
  readonly iv: string;
  readonly ciphertext: ArrayBuffer;
  readonly encryptedByteLength: number;
}

export interface OpenedBlobPayload {
  readonly metadata: BlobPayloadMetadata;
  readonly bytes: ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function aad(input: BlobAadMetadata): Uint8Array {
  assertKeyReference(input.key);
  return encoder.encode(
    JSON.stringify({
      id: input.id,
      kind: input.kind,
      schemaVersion: input.schemaVersion,
      algorithm: input.algorithm,
      createdAt: input.createdAt,
      key: input.key,
    }),
  );
}

function encodePayload(metadata: BlobPayloadMetadata, bytes: ArrayBuffer): Uint8Array {
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const imageBytes = new Uint8Array(bytes);
  const payload = new Uint8Array(4 + metadataBytes.byteLength + imageBytes.byteLength);
  new DataView(payload.buffer).setUint32(0, metadataBytes.byteLength, false);
  payload.set(metadataBytes, 4);
  payload.set(imageBytes, 4 + metadataBytes.byteLength);
  return payload;
}

function decodePayload(payload: Uint8Array): OpenedBlobPayload {
  if (payload.byteLength < 4) throw new Error('Encrypted blob payload is too short.');
  const metadataLength = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, false);
  if (metadataLength > payload.byteLength - 4) throw new Error('Encrypted blob payload metadata is malformed.');
  const metadataBytes = payload.slice(4, 4 + metadataLength);
  const bytes = payload.slice(4 + metadataLength);
  return {
    metadata: JSON.parse(decoder.decode(metadataBytes)) as BlobPayloadMetadata,
    bytes: exactArrayBuffer(bytes),
  };
}

export async function sealBlobPayload(input: {
  readonly key: CryptoKey;
  readonly aad: BlobAadMetadata;
  readonly metadata: BlobPayloadMetadata;
  readonly bytes: ArrayBuffer;
}): Promise<SealedBlobPayload> {
  const iv = createAesGcmIv();
  const ciphertext = await encryptAesGcm(input.key, encodePayload(input.metadata, input.bytes), iv, aad(input.aad));
  return {
    iv: toBase64(iv),
    ciphertext: exactArrayBuffer(ciphertext),
    encryptedByteLength: ciphertext.byteLength,
  };
}

export async function openBlobPayload(input: {
  readonly key: CryptoKey;
  readonly iv: string;
  readonly ciphertext: ArrayBuffer;
  readonly aad: BlobAadMetadata;
}): Promise<OpenedBlobPayload> {
  const plaintext = await decryptAesGcm(input.key, new Uint8Array(input.ciphertext), fromBase64(input.iv), aad(input.aad));
  return decodePayload(plaintext);
}

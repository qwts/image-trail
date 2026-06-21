import type { KeyReference } from '../crypto/types.js';
import { createAesGcmIv, decryptAesGcm, encryptAesGcm } from '../crypto/webcrypto.js';
import { buildExportFileHeader, fromBase64, parseExportFile, serializeExportFile, toBase64 } from './encrypted-file-format.js';
import type { ExportFileEnvelope } from './encrypted-file-format.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const unsafeFileNameCharacter = /[<>:"/\\|?*]/u;

export interface EncryptedImageExportInput {
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
  readonly sourceUrl: string;
  readonly fileName: string;
  readonly key: CryptoKey;
  readonly keyReference: KeyReference<'blob'>;
  readonly now?: string;
}

export interface EncryptedImageExportResult {
  readonly fileContent: string;
  readonly fileName: string;
}

export interface EncryptedImageImportResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly sourceUrl: string;
  readonly fileName: string;
  readonly keyReference: string;
}

export interface EncryptedImageFileHeaderResult {
  readonly envelope: ExportFileEnvelope;
  readonly keyReference: string;
}

interface EncryptedImagePayload {
  readonly schemaVersion: 1;
  readonly mimeType: string;
  readonly sourceUrl: string;
  readonly fileName: string;
  readonly data: string;
}

export async function createEncryptedImageFile(input: EncryptedImageExportInput): Promise<EncryptedImageExportResult> {
  const now = input.now ?? new Date().toISOString();
  const iv = createAesGcmIv();
  const payload: EncryptedImagePayload = {
    schemaVersion: 1,
    mimeType: input.mimeType,
    sourceUrl: input.sourceUrl,
    fileName: input.fileName,
    data: toBase64(new Uint8Array(input.bytes)),
  };
  const ciphertext = await encryptAesGcm(input.key, encoder.encode(JSON.stringify(payload)), iv, aad(input.keyReference.reference));
  const header = buildExportFileHeader({
    payloadType: 'image',
    algorithm: 'AES-GCM',
    wrappingMode: 'indexeddb',
    keyKind: 'blob',
    keyReference: input.keyReference.reference,
    salt: new Uint8Array(),
    iv,
    iterations: 0,
    recordCount: 1,
    now,
  });

  return {
    fileContent: serializeExportFile({ header, payload: toBase64(ciphertext) }),
    fileName: encryptedImageFileName(input.fileName, now),
  };
}

export async function openEncryptedImageFile(
  fileContent: string,
  key: CryptoKey,
  expectedKeyReference: string,
): Promise<EncryptedImageImportResult> {
  const { envelope } = parseEncryptedImageFileHeader(fileContent);
  if (envelope.header.keyReference !== expectedKeyReference) {
    throw new Error(`Unlock ${envelope.header.keyReference} before importing this encrypted image.`);
  }
  const plaintext = await decryptAesGcm(
    key,
    fromBase64(envelope.payload),
    fromBase64(envelope.header.iv),
    aad(envelope.header.keyReference),
  );
  const payload = JSON.parse(decoder.decode(plaintext)) as Partial<EncryptedImagePayload>;
  if (
    payload.schemaVersion !== 1 ||
    typeof payload.mimeType !== 'string' ||
    !payload.mimeType.startsWith('image/') ||
    typeof payload.sourceUrl !== 'string' ||
    typeof payload.fileName !== 'string' ||
    typeof payload.data !== 'string'
  ) {
    throw new Error('Encrypted image payload is invalid.');
  }
  return {
    bytes: fromBase64(payload.data),
    mimeType: payload.mimeType,
    sourceUrl: payload.sourceUrl,
    fileName: payload.fileName,
    keyReference: envelope.header.keyReference,
  };
}

export function parseEncryptedImageFileHeader(fileContent: string): EncryptedImageFileHeaderResult {
  const envelope = parseExportFile(fileContent);
  if (envelope.header.payloadType !== 'image') {
    throw new Error(`Unexpected payload type: ${envelope.header.payloadType}.`);
  }
  if (envelope.header.keyKind !== 'blob') {
    throw new Error(`Unexpected key kind: ${envelope.header.keyKind}.`);
  }
  return { envelope, keyReference: envelope.header.keyReference };
}

function encryptedImageFileName(fileName: string, now: string): string {
  const clean = Array.from(fileName.replace(/\.image-trail-encrypted\.json$/u, ''), (character) =>
    (character.codePointAt(0) ?? 0) < 32 || unsafeFileNameCharacter.test(character) ? '_' : character,
  )
    .join('')
    .trim();
  return `${clean || `image-trail-image-${now.slice(0, 10)}`}.image-trail-encrypted.json`;
}

function aad(keyReference: string): Uint8Array {
  return encoder.encode(JSON.stringify({ payloadType: 'image', keyKind: 'blob', keyReference }));
}

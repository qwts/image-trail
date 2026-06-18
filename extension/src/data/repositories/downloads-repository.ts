import { createAesGcmIv, encryptAesGcm, decryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import {
  buildExportFileHeader,
  serializeExportFile,
  parseExportFile,
  toBase64,
  fromBase64,
} from '../import-export/encrypted-file-format.js';

export interface EncryptedDownloadInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly sourceUrl: string;
  readonly password: string;
  readonly now?: string;
}

export interface EncryptedDownloadResult {
  readonly fileContent: string;
  readonly fileName: string;
}

export async function createEncryptedDownload(input: EncryptedDownloadInput): Promise<EncryptedDownloadResult> {
  const { data, mimeType, sourceUrl, password, now = new Date().toISOString() } = input;

  const salt = createPasswordSalt();
  const iterations = 600_000;
  const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });

  const payloadJson = JSON.stringify({ mimeType, sourceUrl, data: toBase64(data) });
  const plaintext = new TextEncoder().encode(payloadJson);
  const iv = createAesGcmIv();
  const ciphertext = await encryptAesGcm(encryptionKey, plaintext, iv);

  const header = buildExportFileHeader({
    payloadType: 'mixed',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: `export:${crypto.randomUUID()}`,
    salt,
    iv,
    iterations,
    recordCount: 1,
    now,
  });

  const fileContent = serializeExportFile({ header, payload: toBase64(ciphertext) });

  let fileName: string;
  try {
    const url = new URL(sourceUrl);
    const baseName = url.pathname.split('/').filter(Boolean).at(-1) ?? 'download';
    fileName = `${baseName}.encrypted.json`;
  } catch {
    fileName = `image-trail-download-${now.slice(0, 10)}.encrypted.json`;
  }

  return { fileContent, fileName };
}

export interface DecryptedDownloadResult {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly sourceUrl: string;
}

export async function openEncryptedDownload(
  fileContent: string,
  password: string,
): Promise<DecryptedDownloadResult> {
  const envelope = parseExportFile(fileContent);
  const salt = fromBase64(envelope.header.salt);
  const iv = fromBase64(envelope.header.iv);
  const ciphertext = fromBase64(envelope.payload);

  const encryptionKey = await deriveEncryptionKey(password, {
    salt,
    iterations: envelope.header.iterations,
  });

  const plaintext = await decryptAesGcm(encryptionKey, ciphertext, iv);
  const decoded = new TextDecoder().decode(plaintext);
  const parsed = JSON.parse(decoded) as { mimeType: string; sourceUrl: string; data: string };

  return {
    data: fromBase64(parsed.data),
    mimeType: parsed.mimeType,
    sourceUrl: parsed.sourceUrl,
  };
}

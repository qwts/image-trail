import { createAesGcmIv, encryptAesGcm, getCrypto } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { RecoverableDataStatus } from '../types.js';
import { buildExportFileHeader, serializeExportFile, toBase64, type ExportFileEnvelope } from './encrypted-file-format.js';

export interface KeyExportInput {
  readonly key: CryptoKey;
  readonly keyReference: string;
  readonly keyKind: 'history' | 'bookmark' | 'root' | 'metadata' | 'export';
  readonly password: string;
  readonly now?: string;
}

export interface KeyExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
}

export async function exportKeyWithPassword(input: KeyExportInput): Promise<KeyExportResult> {
  const { key, keyReference, keyKind, password, now = new Date().toISOString() } = input;

  if (!key.extractable) {
    return {
      status: {
        ok: false,
        code: 'encryption-failed',
        message: 'Key is not extractable. Generate an extractable key for export.',
      },
    };
  }

  try {
    const rawKey = await getCrypto().subtle.exportKey('raw', key);
    const rawBytes = new Uint8Array(rawKey);

    const salt = createPasswordSalt();
    const iterations = 600_000;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });

    const iv = createAesGcmIv();
    const ciphertext = await encryptAesGcm(encryptionKey, rawBytes, iv);

    const header = buildExportFileHeader({
      payloadType: 'keys',
      algorithm: 'AES-GCM',
      wrappingMode: 'password',
      keyKind,
      keyReference,
      salt,
      iv,
      iterations,
      recordCount: 1,
      now,
    });

    const envelope: ExportFileEnvelope = {
      header,
      payload: toBase64(ciphertext),
    };

    const fileContent = serializeExportFile(envelope);
    const datePart = now.slice(0, 10);
    const fileName = `image-trail-key-${keyKind}-${datePart}.json`;

    return {
      status: { ok: true, code: 'ok', message: 'Key exported successfully.' },
      fileContent,
      fileName,
    };
  } catch (cause) {
    return {
      status: { ok: false, code: 'encryption-failed', message: 'Failed to export key.', cause },
    };
  }
}

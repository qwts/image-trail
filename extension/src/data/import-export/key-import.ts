import { decryptAesGcm, getCrypto } from '../crypto/webcrypto.js';
import { deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { KeyKind } from '../crypto/types.js';
import type { RecoverableDataStatus } from '../types.js';
import { fromBase64, parseExportFile } from './encrypted-file-format.js';

export interface KeyImportResult {
  readonly status: RecoverableDataStatus;
  readonly key?: CryptoKey;
  readonly keyReference?: string;
  readonly keyKind?: KeyKind;
}

export async function importKeyWithPassword(
  fileContent: string,
  password: string,
): Promise<KeyImportResult> {
  let envelope;
  try {
    envelope = parseExportFile(fileContent);
  } catch {
    return { status: { ok: false, code: 'decryption-failed', message: 'Invalid key export file format.' } };
  }

  if (envelope.header.payloadType !== 'keys') {
    return { status: { ok: false, code: 'decryption-failed', message: `Unexpected payload type: ${envelope.header.payloadType}.` } };
  }

  try {
    const salt = fromBase64(envelope.header.salt);
    const iv = fromBase64(envelope.header.iv);
    const ciphertext = fromBase64(envelope.payload);

    const encryptionKey = await deriveEncryptionKey(password, {
      salt,
      iterations: envelope.header.iterations,
    });

    const rawKeyBytes = await decryptAesGcm(encryptionKey, ciphertext, iv);

    const key = await getCrypto().subtle.importKey(
      'raw',
      rawKeyBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );

    return {
      status: { ok: true, code: 'ok', message: 'Key imported successfully.' },
      key,
      keyReference: envelope.header.keyReference,
      keyKind: envelope.header.keyKind as KeyKind,
    };
  } catch {
    return {
      status: { ok: false, code: 'decryption-failed', message: 'Key import failed. Wrong password or corrupted file.' },
    };
  }
}

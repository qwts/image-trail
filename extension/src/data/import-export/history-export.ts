import { createAesGcmIv, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableHistoryPayloadV1, RecoverableDataStatus } from '../types.js';
import { buildExportFileHeader, serializeExportFile, toBase64, type ExportFileEnvelope } from './encrypted-file-format.js';
import { serializePlainRecordsExport } from './plain-records-format.js';

export interface HistoryExportEntry {
  readonly uuid: string;
  readonly payload: DurableHistoryPayloadV1;
}

export interface HistoryExportInput {
  readonly entries: readonly HistoryExportEntry[];
  readonly password: string;
  readonly now?: string;
}

export interface HistoryExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
}

export async function exportEncryptedHistory(input: HistoryExportInput): Promise<HistoryExportResult> {
  const { entries, password, now = new Date().toISOString() } = input;

  if (entries.length === 0) {
    return {
      status: { ok: false, code: 'not-found', message: 'No records to export.' },
    };
  }

  try {
    const salt = createPasswordSalt();
    const iterations = 600_000;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });

    const plaintext = new TextEncoder().encode(JSON.stringify(entries));
    const iv = createAesGcmIv();
    const ciphertext = await encryptAesGcm(encryptionKey, plaintext, iv);

    const header = buildExportFileHeader({
      payloadType: 'history',
      algorithm: 'AES-GCM',
      wrappingMode: 'password',
      keyKind: 'export',
      keyReference: `export:${crypto.randomUUID()}`,
      salt,
      iv,
      iterations,
      recordCount: entries.length,
      now,
    });

    const envelope: ExportFileEnvelope = {
      header,
      payload: toBase64(ciphertext),
    };

    const fileContent = serializeExportFile(envelope);
    const datePart = now.slice(0, 10);
    const fileName = `image-trail-history-${datePart}.json`;

    return {
      status: { ok: true, code: 'ok', message: `Exported ${entries.length} record(s).` },
      fileContent,
      fileName,
    };
  } catch (cause) {
    return {
      status: {
        ok: false,
        code: 'encryption-failed',
        message: `Failed to encrypt history export${cause instanceof Error ? `: ${cause.message}` : '.'}`,
        cause,
      },
    };
  }
}

export function exportPlainHistory(input: Omit<HistoryExportInput, 'password'>): HistoryExportResult {
  const { entries, now = new Date().toISOString() } = input;
  if (entries.length === 0) {
    return {
      status: { ok: false, code: 'not-found', message: 'No records to export.' },
    };
  }

  return {
    status: { ok: true, code: 'ok', message: `Exported ${entries.length} plaintext record(s).` },
    fileContent: serializePlainRecordsExport({ payloadType: 'history', entries, now }),
    fileName: `image-trail-history-${now.slice(0, 10)}.plain.json`,
  };
}

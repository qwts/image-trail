import { createAesGcmIv, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus } from '../types.js';
import { buildExportFileHeader, serializeExportFile, toBase64, type ExportFileEnvelope } from './encrypted-file-format.js';
import { serializePlainRecordsExport } from './plain-records-format.js';

export interface BookmarksExportEntry {
  readonly uuid: string;
  readonly payload: DurableBookmarkPayloadV1;
}

export interface BookmarksExportInput {
  readonly entries: readonly BookmarksExportEntry[];
  readonly password: string;
  readonly now?: string;
}

export interface BookmarksExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
}

export async function exportEncryptedBookmarks(input: BookmarksExportInput): Promise<BookmarksExportResult> {
  const { entries, password, now = new Date().toISOString() } = input;
  if (entries.length === 0) {
    return { status: { ok: false, code: 'not-found', message: 'No bookmarks to export.' } };
  }

  try {
    const salt = createPasswordSalt();
    const iterations = 600_000;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });
    const plaintext = new TextEncoder().encode(JSON.stringify(entries));
    const iv = createAesGcmIv();
    const ciphertext = await encryptAesGcm(encryptionKey, plaintext, iv);
    const header = buildExportFileHeader({
      payloadType: 'bookmarks',
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
    const envelope: ExportFileEnvelope = { header, payload: toBase64(ciphertext) };
    const fileContent = serializeExportFile(envelope);
    const fileName = `image-trail-bookmarks-${now.slice(0, 10)}.json`;
    return { status: { ok: true, code: 'ok', message: `Exported ${entries.length} bookmark(s).` }, fileContent, fileName };
  } catch (cause) {
    return {
      status: {
        ok: false,
        code: 'encryption-failed',
        message: `Failed to encrypt bookmarks export${cause instanceof Error ? `: ${cause.message}` : '.'}`,
        cause,
      },
    };
  }
}

export function exportPlainBookmarks(input: Omit<BookmarksExportInput, 'password'>): BookmarksExportResult {
  const { entries, now = new Date().toISOString() } = input;
  if (entries.length === 0) {
    return { status: { ok: false, code: 'not-found', message: 'No bookmarks to export.' } };
  }
  return {
    status: { ok: true, code: 'ok', message: `Exported ${entries.length} plaintext bookmark(s).` },
    fileContent: serializePlainRecordsExport({ payloadType: 'bookmarks', entries, now }),
    fileName: `image-trail-bookmarks-${now.slice(0, 10)}.plain.json`,
  };
}

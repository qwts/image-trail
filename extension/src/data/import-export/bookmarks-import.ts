import { decryptAesGcm } from '../crypto/webcrypto.js';
import { deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus } from '../types.js';
import { fromBase64, parseExportFile } from './encrypted-file-format.js';
import { parsePlainRecordsExport } from './plain-records-format.js';

export interface BookmarksImportEntry {
  readonly uuid: string;
  readonly payload: DurableBookmarkPayloadV1;
}

export interface BookmarksImportResult {
  readonly status: RecoverableDataStatus;
  readonly entries: readonly BookmarksImportEntry[];
  readonly skipped: readonly string[];
  readonly plaintext: boolean;
  readonly externalOriginalCount: number;
}

export async function importBookmarks(fileContent: string, password: string): Promise<BookmarksImportResult> {
  const plain = tryImportPlainBookmarks(fileContent);
  if (plain) return { ...plain, plaintext: true };

  const fail = (message: string): BookmarksImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    plaintext: false,
    externalOriginalCount: 0,
  });

  let envelope;
  try {
    envelope = parseExportFile(fileContent);
  } catch {
    return fail('Invalid export file format.');
  }

  if (envelope.header.payloadType !== 'bookmarks' && envelope.header.payloadType !== 'mixed') {
    return fail(`Unexpected payload type: ${envelope.header.payloadType}.`);
  }

  try {
    const salt = fromBase64(envelope.header.salt);
    const iv = fromBase64(envelope.header.iv);
    const ciphertext = fromBase64(envelope.payload);
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations: envelope.header.iterations });
    const plaintext = await decryptAesGcm(encryptionKey, ciphertext, iv);
    return { ...parseBookmarkEntries(JSON.parse(new TextDecoder().decode(plaintext))), plaintext: false };
  } catch {
    return fail('Decryption failed. Wrong password or corrupted file.');
  }
}

function tryImportPlainBookmarks(fileContent: string): Omit<BookmarksImportResult, 'plaintext'> | null {
  try {
    const envelope = parsePlainRecordsExport(fileContent);
    if (envelope.payloadType !== 'bookmarks') return null;
    return parseBookmarkEntries(envelope.entries);
  } catch {
    return null;
  }
}

function parseBookmarkEntries(parsed: unknown): Omit<BookmarksImportResult, 'plaintext'> {
  const fail = (message: string): Omit<BookmarksImportResult, 'plaintext'> => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    externalOriginalCount: 0,
  });
  if (!Array.isArray(parsed)) return fail('Bookmark payload is not an array.');

  const entries: BookmarksImportEntry[] = [];
  const skipped: string[] = [];
  let externalOriginalCount = 0;
  for (const item of parsed) {
    if (isValidBookmarkEntry(item)) {
      if (item.payload.storedOriginal) externalOriginalCount += 1;
      entries.push(stripExternalBlobReference(item));
    } else {
      skipped.push(typeof item === 'object' && item !== null && 'uuid' in item ? String(item.uuid) : 'unknown');
    }
  }
  return {
    status: {
      ok: true,
      code: 'ok',
      message: `Imported ${entries.length} bookmark(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.`,
    },
    entries,
    skipped,
    externalOriginalCount,
  };
}

function isValidBookmarkEntry(value: unknown): value is BookmarksImportEntry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.uuid !== 'string') return false;
  if (typeof obj.payload !== 'object' || obj.payload === null) return false;
  const payload = obj.payload as Record<string, unknown>;
  return typeof payload.url === 'string' && typeof payload.bookmarkedAt === 'string';
}

function stripExternalBlobReference(entry: BookmarksImportEntry): BookmarksImportEntry {
  const { storedOriginal: _storedOriginal, capturedAt: _capturedAt, ...payload } = entry.payload;
  return { ...entry, payload };
}

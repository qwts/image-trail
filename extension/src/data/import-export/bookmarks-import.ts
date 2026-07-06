import * as v from 'valibot';
import { decryptAesGcm } from '../crypto/webcrypto.js';
import { deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus } from '../types.js';
import { durableBookmarkPayloadSchema } from '../types.schema.js';
import { fromBase64, parseExportFile } from './encrypted-file-format.js';
import { fullBackupPayloadFromUnknown, type FullBackupBlobKeyBackup, type PortableStoredBlobRecord } from './full-backup.js';
import type { AlbumBackupEntry } from '../albums-controller.js';
import { parsePlainRecordsExport } from './plain-records-format.js';
import { firstIssueReason } from './schema-issues.js';
import { createImportValidationReport, type ImportValidationReport } from './validation-report.js';

const bookmarkImportEntrySchema = v.object({
  uuid: v.string(),
  payload: durableBookmarkPayloadSchema,
});

export interface BookmarksImportEntry {
  readonly uuid: string;
  readonly payload: DurableBookmarkPayloadV1;
}

export interface BookmarksImportResult {
  readonly status: RecoverableDataStatus;
  readonly entries: readonly BookmarksImportEntry[];
  readonly skipped: readonly string[];
  readonly validationReport: ImportValidationReport;
  readonly plaintext: boolean;
  readonly externalOriginalCount: number;
  readonly fullBackup: boolean;
  readonly originalBlobs: readonly PortableStoredBlobRecord[];
  readonly blobKeyBackups: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds: readonly string[];
  readonly albums: readonly AlbumBackupEntry[];
}

type BasicBookmarksImportResult = Pick<
  BookmarksImportResult,
  'status' | 'entries' | 'skipped' | 'validationReport' | 'externalOriginalCount'
>;

export async function importBookmarks(fileContent: string, password: string): Promise<BookmarksImportResult> {
  const plain = tryImportPlainBookmarks(fileContent);
  if (plain) return { ...plain, plaintext: true };

  const fail = (message: string): BookmarksImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    validationReport: createImportValidationReport([]),
    plaintext: false,
    externalOriginalCount: 0,
    fullBackup: false,
    originalBlobs: [],
    blobKeyBackups: [],
    missingOriginalBlobIds: [],
    albums: [],
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
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    const fullBackup = fullBackupPayloadFromUnknown(parsed);
    if (fullBackup) {
      const backedOriginalBlobIds = new Set(fullBackup.originalBlobs.map((record) => record.id));
      const parsedBookmarks = parseBookmarkEntries(fullBackup.bookmarks, { preserveOriginalReferences: true });
      const entries = parsedBookmarks.entries.map((entry) => stripMissingFullBackupOriginalReference(entry, backedOriginalBlobIds));
      return {
        ...parsedBookmarks,
        entries,
        externalOriginalCount: bookmarkEntriesOriginalReferenceCount(entries),
        plaintext: false,
        fullBackup: true,
        originalBlobs: fullBackup.originalBlobs,
        blobKeyBackups: fullBackup.blobKeyBackups,
        missingOriginalBlobIds: fullBackup.missingOriginalBlobIds,
        albums: fullBackup.albums,
      };
    }
    return {
      ...parseBookmarkEntries(parsed, { preserveOriginalReferences: false }),
      plaintext: false,
      fullBackup: false,
      originalBlobs: [],
      blobKeyBackups: [],
      missingOriginalBlobIds: [],
      albums: [],
    };
  } catch {
    return fail('Decryption failed. Wrong password or corrupted file.');
  }
}

function tryImportPlainBookmarks(fileContent: string): Omit<BookmarksImportResult, 'plaintext'> | null {
  try {
    const envelope = parsePlainRecordsExport(fileContent);
    if (envelope.payloadType !== 'bookmarks') return null;
    return {
      ...parseBookmarkEntries(envelope.entries, { preserveOriginalReferences: false }),
      fullBackup: false,
      originalBlobs: [],
      blobKeyBackups: [],
      missingOriginalBlobIds: [],
      albums: [],
    };
  } catch {
    return null;
  }
}

function parseBookmarkEntries(parsed: unknown, options: { readonly preserveOriginalReferences: boolean }): BasicBookmarksImportResult {
  const fail = (message: string): BasicBookmarksImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    validationReport: createImportValidationReport([]),
    externalOriginalCount: 0,
  });
  if (!Array.isArray(parsed)) return fail('Bookmark payload is not an array.');

  const entries: BookmarksImportEntry[] = [];
  const skipped: string[] = [];
  const rejectionReasons: string[] = [];
  let externalOriginalCount = 0;
  for (const item of parsed) {
    const rejectionReason = bookmarkEntryRejectionReason(item);
    if (!rejectionReason) {
      const entry = item as BookmarksImportEntry;
      if (entry.payload.storedOriginal) externalOriginalCount += 1;
      entries.push(options.preserveOriginalReferences ? entry : stripExternalBlobReference(entry));
    } else {
      skipped.push(typeof item === 'object' && item !== null && 'uuid' in item ? String(item.uuid) : 'unknown');
      rejectionReasons.push(rejectionReason);
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
    validationReport: createImportValidationReport(rejectionReasons),
    externalOriginalCount,
  };
}

function bookmarkEntryRejectionReason(value: unknown): string | null {
  const result = v.safeParse(bookmarkImportEntrySchema, value);
  return result.success ? null : firstIssueReason(result.issues, 'Invalid bookmark entry');
}

function stripExternalBlobReference(entry: BookmarksImportEntry): BookmarksImportEntry {
  const { storedOriginal: _storedOriginal, capturedAt: _capturedAt, ...payload } = entry.payload;
  return { ...entry, payload };
}

function stripMissingFullBackupOriginalReference(
  entry: BookmarksImportEntry,
  backedOriginalBlobIds: ReadonlySet<string>,
): BookmarksImportEntry {
  const storedOriginalMissing = !!entry.payload.storedOriginal && !backedOriginalBlobIds.has(entry.payload.storedOriginal.blobId);
  const protectedOriginalMissing =
    !!entry.payload.protectedPin?.storedOriginalBlobId && !backedOriginalBlobIds.has(entry.payload.protectedPin.storedOriginalBlobId);
  if (!storedOriginalMissing && !protectedOriginalMissing) return entry;

  const { storedOriginal: _storedOriginal, capturedAt: _capturedAt, ...payloadWithoutStoredOriginal } = entry.payload;
  if (!protectedOriginalMissing || !payloadWithoutStoredOriginal.protectedPin) return { ...entry, payload: payloadWithoutStoredOriginal };

  const { storedOriginalBlobId: _storedOriginalBlobId, ...protectedPinWithoutStoredOriginal } = payloadWithoutStoredOriginal.protectedPin;
  return {
    ...entry,
    payload: {
      ...payloadWithoutStoredOriginal,
      protectedPin: {
        ...protectedPinWithoutStoredOriginal,
        hasStoredOriginal: false,
      },
    },
  };
}

function bookmarkEntriesOriginalReferenceCount(entries: readonly BookmarksImportEntry[]): number {
  return entries.filter((entry) => entry.payload.storedOriginal || entry.payload.protectedPin?.storedOriginalBlobId).length;
}

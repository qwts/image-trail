import * as v from 'valibot';
import { createAesGcmIv, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { AlbumBackupEntry } from '../albums-controller.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus, StoredBlobRecord } from '../types.js';
import { buildExportFileHeader, serializeExportFile, toBase64, fromBase64, type ExportFileEnvelope } from './encrypted-file-format.js';
import { fullBackupPayloadSchema } from './full-backup.schema.js';
import { summarizeIssues } from './schema-issues.js';

export interface FullBackupBookmarkEntry {
  readonly uuid: string;
  readonly payload: DurableBookmarkPayloadV1;
}

export interface PortableStoredBlobRecord {
  readonly id: string;
  readonly kind: StoredBlobRecord['kind'];
  readonly schemaVersion: 1;
  readonly algorithm: StoredBlobRecord['algorithm'];
  readonly iv: string;
  readonly ciphertext: string;
  readonly encryptedByteLength: number;
  readonly createdAt: string;
  readonly key: StoredBlobRecord['key'];
  readonly referenceCount: number;
}

export interface FullBackupPayloadV1 {
  readonly schemaVersion: 1 | 2;
  readonly bookmarks: readonly FullBackupBookmarkEntry[];
  readonly originalBlobs: readonly PortableStoredBlobRecord[];
  readonly blobKeyBackups: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds: readonly string[];
  readonly albums: readonly AlbumBackupEntry[];
}

export interface FullBackupBlobKeyBackup {
  readonly keyReference: string;
  readonly fileContent: string;
}

export interface FullBackupExportInput {
  readonly bookmarks: readonly FullBackupBookmarkEntry[];
  readonly albums?: readonly AlbumBackupEntry[];
  readonly originalBlobs: readonly StoredBlobRecord[];
  readonly blobKeyBackups?: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds?: readonly string[];
  readonly password: string;
  readonly now?: string;
}

export interface FullBackupExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
  readonly originalBlobCount?: number;
  readonly missingOriginalBlobCount?: number;
}

export async function exportEncryptedFullBackup(input: FullBackupExportInput): Promise<FullBackupExportResult> {
  const { bookmarks, originalBlobs, password, now = new Date().toISOString(), albums = [] } = input;
  if (bookmarks.length === 0 && albums.length === 0) {
    return { status: { ok: false, code: 'not-found', message: 'No bookmarks or albums to export.' } };
  }

  try {
    const salt = createPasswordSalt();
    const iterations = 600_000;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });
    const payload: FullBackupPayloadV1 = {
      schemaVersion: 2,
      bookmarks,
      albums,
      originalBlobs: originalBlobs.map(portableStoredBlobRecord),
      blobKeyBackups: input.blobKeyBackups ?? [],
      missingOriginalBlobIds: input.missingOriginalBlobIds ?? [],
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
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
      recordCount: bookmarks.length,
      now,
    });
    const envelope: ExportFileEnvelope = { header, payload: toBase64(ciphertext) };
    const fileContent = serializeExportFile(envelope);
    return {
      status: {
        ok: true,
        code: 'ok',
        message: fullBackupExportMessage(bookmarks.length, originalBlobs.length, albums.length, input.missingOriginalBlobIds?.length ?? 0),
      },
      fileContent,
      fileName: `image-trail-full-backup-${now.slice(0, 10)}.json`,
      originalBlobCount: originalBlobs.length,
      missingOriginalBlobCount: input.missingOriginalBlobIds?.length ?? 0,
    };
  } catch (cause) {
    return {
      status: {
        ok: false,
        code: 'encryption-failed',
        message: `Failed to encrypt full backup${cause instanceof Error ? `: ${cause.message}` : '.'}`,
        cause,
      },
    };
  }
}

function fullBackupExportMessage(
  bookmarkCount: number,
  originalBlobCount: number,
  albumCount: number,
  missingOriginalBlobCount: number,
): string {
  const base = `Exported ${bookmarkCount} bookmark(s) and ${originalBlobCount} encrypted original(s).`;
  const albums = albumCount > 0 ? ` Included ${albumCount} album(s).` : '';
  const missing =
    missingOriginalBlobCount > 0
      ? ` ${missingOriginalBlobCount} referenced original(s) were missing and will restore as metadata-only.`
      : '';
  return `${base}${albums}${missing}`;
}

export function portableStoredBlobRecord(record: StoredBlobRecord): PortableStoredBlobRecord {
  const ciphertext = storedBlobCiphertextBytes(record);
  if (ciphertext.byteLength !== record.encryptedByteLength) {
    throw new Error('Encrypted original bytes did not match recorded byte length.');
  }
  return {
    id: record.id,
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    algorithm: record.algorithm,
    iv: record.iv,
    ciphertext: toBase64(ciphertext),
    encryptedByteLength: record.encryptedByteLength,
    createdAt: record.createdAt,
    key: record.key,
    referenceCount: record.referenceCount,
  };
}

export function storedBlobRecordFromPortable(record: PortableStoredBlobRecord): StoredBlobRecord {
  const ciphertext = fromBase64(record.ciphertext);
  if (ciphertext.byteLength !== record.encryptedByteLength) {
    throw new Error('Encrypted original backup bytes did not match recorded byte length.');
  }
  const copiedCiphertext = new ArrayBuffer(ciphertext.byteLength);
  new Uint8Array(copiedCiphertext).set(ciphertext);
  return {
    ...record,
    ciphertext: copiedCiphertext,
  };
}

function storedBlobCiphertextBytes(record: StoredBlobRecord): Uint8Array {
  const ciphertext = (record as { readonly ciphertext: unknown }).ciphertext;
  if (ciphertext instanceof ArrayBuffer) return new Uint8Array(ciphertext);
  if (ArrayBuffer.isView(ciphertext)) return new Uint8Array(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
  throw new Error('Encrypted original bytes were not available for backup.');
}

export type FullBackupParseResult =
  | { readonly ok: true; readonly payload: FullBackupPayloadV1 }
  | { readonly ok: false; readonly reason: string; readonly issues: readonly string[] };

/**
 * Validates a decoded full-backup payload against {@link fullBackupPayloadSchema},
 * returning a structured error (with per-issue paths) instead of a bare `null`.
 * `originalBlobs`/`blobKeyBackups` are validated element by element; bookmark
 * entries are validated per item downstream so one bad bookmark is skipped, not fatal.
 */
export function parseFullBackupPayload(value: unknown): FullBackupParseResult {
  const result = v.safeParse(fullBackupPayloadSchema, value);
  if (!result.success) {
    return { ok: false, reason: 'invalid-full-backup', issues: summarizeIssues(result.issues) };
  }
  return { ok: true, payload: result.output };
}

export function fullBackupPayloadFromUnknown(value: unknown): FullBackupPayloadV1 | null {
  const result = parseFullBackupPayload(value);
  return result.ok ? result.payload : null;
}

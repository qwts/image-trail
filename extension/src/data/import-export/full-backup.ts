import { createAesGcmIv, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus, StoredBlobRecord } from '../types.js';
import type { KeyReference } from '../crypto/types.js';
import { buildExportFileHeader, serializeExportFile, toBase64, fromBase64, type ExportFileEnvelope } from './encrypted-file-format.js';

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
  readonly schemaVersion: 1;
  readonly bookmarks: readonly FullBackupBookmarkEntry[];
  readonly originalBlobs: readonly PortableStoredBlobRecord[];
  readonly blobKeyBackups: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds: readonly string[];
}

export interface FullBackupBlobKeyBackup {
  readonly keyReference: string;
  readonly fileContent: string;
}

export interface FullBackupExportInput {
  readonly bookmarks: readonly FullBackupBookmarkEntry[];
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
  const { bookmarks, originalBlobs, password, now = new Date().toISOString() } = input;
  if (bookmarks.length === 0) {
    return { status: { ok: false, code: 'not-found', message: 'No bookmarks to export.' } };
  }

  try {
    const salt = createPasswordSalt();
    const iterations = 600_000;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });
    const payload: FullBackupPayloadV1 = {
      schemaVersion: 1,
      bookmarks,
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
        message: fullBackupExportMessage(bookmarks.length, originalBlobs.length, input.missingOriginalBlobIds?.length ?? 0),
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

function fullBackupExportMessage(bookmarkCount: number, originalBlobCount: number, missingOriginalBlobCount: number): string {
  const base = `Exported ${bookmarkCount} bookmark(s) and ${originalBlobCount} encrypted original(s).`;
  if (missingOriginalBlobCount === 0) return base;
  return `${base} ${missingOriginalBlobCount} referenced original(s) were missing and will restore as metadata-only.`;
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

export function bookmarksFromFullBackupPayload(value: unknown): readonly FullBackupBookmarkEntry[] | null {
  return fullBackupPayloadFromUnknown(value)?.bookmarks ?? null;
}

export function fullBackupPayloadFromUnknown(value: unknown): FullBackupPayloadV1 | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as {
    schemaVersion?: unknown;
    bookmarks?: unknown;
    originalBlobs?: unknown;
    blobKeyBackups?: unknown;
    missingOriginalBlobIds?: unknown;
  };
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.bookmarks)) return null;
  if (!Array.isArray(payload.originalBlobs) || !Array.isArray(payload.blobKeyBackups)) return null;
  if (!payload.originalBlobs.every(isPortableStoredBlobRecord)) return null;
  if (!payload.blobKeyBackups.every(isFullBackupBlobKeyBackup)) return null;
  return {
    schemaVersion: 1,
    bookmarks: payload.bookmarks as readonly FullBackupBookmarkEntry[],
    originalBlobs: payload.originalBlobs,
    blobKeyBackups: payload.blobKeyBackups,
    missingOriginalBlobIds: Array.isArray(payload.missingOriginalBlobIds)
      ? payload.missingOriginalBlobIds.filter((blobId): blobId is string => typeof blobId === 'string')
      : [],
  };
}

function isPortableStoredBlobRecord(value: unknown): value is PortableStoredBlobRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PortableStoredBlobRecord>;
  return (
    typeof record.id === 'string' &&
    record.kind === 'original' &&
    record.schemaVersion === 1 &&
    record.algorithm === 'AES-GCM' &&
    typeof record.iv === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.encryptedByteLength === 'number' &&
    Number.isFinite(record.encryptedByteLength) &&
    record.encryptedByteLength >= 0 &&
    typeof record.createdAt === 'string' &&
    isBlobKeyReference(record.key) &&
    typeof record.referenceCount === 'number' &&
    Number.isFinite(record.referenceCount) &&
    record.referenceCount >= 0
  );
}

function isBlobKeyReference(value: unknown): value is KeyReference<'blob'> {
  if (!value || typeof value !== 'object') return false;
  const reference = value as Partial<KeyReference<'blob'>>;
  return (
    reference.kind === 'blob' &&
    typeof reference.uuid === 'string' &&
    reference.uuid.length > 0 &&
    reference.reference === `blob:${reference.uuid}`
  );
}

function isFullBackupBlobKeyBackup(value: unknown): value is FullBackupBlobKeyBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Partial<FullBackupBlobKeyBackup>;
  return typeof backup.keyReference === 'string' && backup.keyReference.startsWith('blob:') && typeof backup.fileContent === 'string';
}

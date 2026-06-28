import { createAesGcmIv, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableBookmarkPayloadV1, RecoverableDataStatus, StoredBlobRecord } from '../types.js';
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
}

export interface FullBackupBlobKeyBackup {
  readonly keyReference: string;
  readonly fileContent: string;
}

export interface FullBackupExportInput {
  readonly bookmarks: readonly FullBackupBookmarkEntry[];
  readonly originalBlobs: readonly StoredBlobRecord[];
  readonly blobKeyBackups?: readonly FullBackupBlobKeyBackup[];
  readonly password: string;
  readonly now?: string;
}

export interface FullBackupExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
  readonly originalBlobCount?: number;
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
        message: `Exported ${bookmarks.length} bookmark(s) and ${originalBlobs.length} encrypted original(s).`,
      },
      fileContent,
      fileName: `image-trail-full-backup-${now.slice(0, 10)}.json`,
      originalBlobCount: originalBlobs.length,
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

export function portableStoredBlobRecord(record: StoredBlobRecord): PortableStoredBlobRecord {
  return {
    id: record.id,
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    algorithm: record.algorithm,
    iv: record.iv,
    ciphertext: toBase64(new Uint8Array(record.ciphertext)),
    encryptedByteLength: record.encryptedByteLength,
    createdAt: record.createdAt,
    key: record.key,
    referenceCount: record.referenceCount,
  };
}

export function storedBlobRecordFromPortable(record: PortableStoredBlobRecord): StoredBlobRecord {
  const ciphertext = fromBase64(record.ciphertext);
  const copiedCiphertext = new ArrayBuffer(ciphertext.byteLength);
  new Uint8Array(copiedCiphertext).set(ciphertext);
  return {
    ...record,
    ciphertext: copiedCiphertext,
  };
}

export function bookmarksFromFullBackupPayload(value: unknown): readonly FullBackupBookmarkEntry[] | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as { schemaVersion?: unknown; bookmarks?: unknown };
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.bookmarks)) return null;
  return payload.bookmarks as readonly FullBackupBookmarkEntry[];
}

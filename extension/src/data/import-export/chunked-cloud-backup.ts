import * as v from 'valibot';
import type { AlbumBackupEntry } from '../albums-controller.js';
import { createAesGcmIv, decryptAesGcm, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey, PBKDF2_ITERATIONS } from '../crypto/password-wrap.js';
import { PCLOUD_BACKUP_PART_SUFFIX } from '../../core/cloud/pcloud-provider.js';
import {
  buildExportFileHeader,
  fromBase64,
  parseExportFile,
  serializeExportFile,
  toBase64,
  type ExportFileEnvelope,
} from './encrypted-file-format.js';
import { cloudBackupManifestSchema, cloudBackupPartEnvelopeSchema, cloudBackupPartPayloadSchema } from './chunked-cloud-backup.schema.js';
import type { FullBackupBlobKeyBackup, FullBackupBookmarkEntry, PortableStoredBlobRecord } from './full-backup.js';

export const CLOUD_BACKUP_RECORD_TARGET_BYTES = 512 * 1024;
const CLOUD_BACKUP_PART_MAGIC = 'IMAGE-TRAIL-CLOUD-PART';
const CLOUD_BACKUP_FORMAT_VERSION = 1;

export type CloudBackupPartKind = 'metadata' | 'records' | 'original';

export interface CloudBackupPartReference {
  readonly partId: string;
  readonly kind: CloudBackupPartKind;
  readonly restoreOrder: number;
  readonly fileId: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly originalBlobId?: string | undefined;
}

export interface CloudBackupManifestV1 {
  readonly schemaVersion: 1;
  readonly backupId: string;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly albumCount: number;
  readonly originalCount: number;
  readonly originalBytes: number;
  readonly missingOriginalCount: number;
  readonly parts: readonly CloudBackupPartReference[];
}

interface CloudBackupPartPayloadBase {
  readonly schemaVersion: 1;
  readonly backupId: string;
  readonly partId: string;
}

export interface CloudBackupMetadataPartV1 extends CloudBackupPartPayloadBase {
  readonly kind: 'metadata';
  readonly albums: readonly AlbumBackupEntry[];
  readonly blobKeyBackups: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds: readonly string[];
}

export interface CloudBackupRecordsPartV1 extends CloudBackupPartPayloadBase {
  readonly kind: 'records';
  readonly bookmarks: readonly unknown[];
}

export interface CloudBackupOriginalPartV1 extends CloudBackupPartPayloadBase {
  readonly kind: 'original';
  readonly originalBlob: PortableStoredBlobRecord;
}

export type CloudBackupPartPayload = CloudBackupMetadataPartV1 | CloudBackupRecordsPartV1 | CloudBackupOriginalPartV1;

export interface CloudBackupPartEnvelope {
  readonly magic: typeof CLOUD_BACKUP_PART_MAGIC;
  readonly formatVersion: typeof CLOUD_BACKUP_FORMAT_VERSION;
  readonly backupId: string;
  readonly partId: string;
  readonly kind: CloudBackupPartKind;
  readonly iv: string;
  readonly payload: string;
}

export interface CloudBackupCryptoSession {
  readonly backupId: string;
  readonly salt: Uint8Array;
  readonly iterations: number;
  readonly encryptionKey: CryptoKey;
}

export interface DecryptedCloudBackupManifest {
  readonly manifest: CloudBackupManifestV1;
  readonly session: CloudBackupCryptoSession;
}

export async function createCloudBackupCryptoSession(password: string, backupId = crypto.randomUUID()): Promise<CloudBackupCryptoSession> {
  const salt = createPasswordSalt();
  const iterations = PBKDF2_ITERATIONS;
  return {
    backupId,
    salt,
    iterations,
    encryptionKey: await deriveEncryptionKey(password, { salt, iterations }),
  };
}

export function cloudBackupPartFileName(backupId: string, restoreOrder: number, kind: CloudBackupPartKind): string {
  const safeBackupId = backupId.replaceAll(/[^a-zA-Z0-9-]/gu, '').slice(0, 36);
  return `image-trail-cloud-${safeBackupId}-${String(restoreOrder).padStart(6, '0')}-${kind}${PCLOUD_BACKUP_PART_SUFFIX}`;
}

export function chunkCloudBackupBookmarks(
  bookmarks: readonly FullBackupBookmarkEntry[],
  targetBytes = CLOUD_BACKUP_RECORD_TARGET_BYTES,
): readonly (readonly FullBackupBookmarkEntry[])[] {
  if (!Number.isSafeInteger(targetBytes) || targetBytes < 1) throw new Error('Cloud backup record-part size must be positive.');
  const chunks: FullBackupBookmarkEntry[][] = [];
  let current: FullBackupBookmarkEntry[] = [];
  let currentBytes = 2;
  for (const bookmark of bookmarks) {
    const bookmarkBytes = new TextEncoder().encode(JSON.stringify(bookmark)).byteLength;
    const separatorBytes = current.length === 0 ? 0 : 1;
    if (current.length > 0 && currentBytes + separatorBytes + bookmarkBytes > targetBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(bookmark);
    currentBytes += (current.length === 1 ? 0 : 1) + bookmarkBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function encryptCloudBackupPart(session: CloudBackupCryptoSession, payload: CloudBackupPartPayload): Promise<string> {
  assertPartIdentity(payload, session.backupId);
  const iv = createAesGcmIv();
  const identity = partIdentity(payload.backupId, payload.partId, payload.kind);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await encryptAesGcm(session.encryptionKey, plaintext, iv, identity);
  const envelope: CloudBackupPartEnvelope = {
    magic: CLOUD_BACKUP_PART_MAGIC,
    formatVersion: CLOUD_BACKUP_FORMAT_VERSION,
    backupId: payload.backupId,
    partId: payload.partId,
    kind: payload.kind,
    iv: toBase64(iv),
    payload: toBase64(ciphertext),
  };
  return JSON.stringify(envelope);
}

export async function decryptCloudBackupPart(
  fileContent: string,
  session: CloudBackupCryptoSession,
  expected: Pick<CloudBackupPartReference, 'partId' | 'kind'>,
): Promise<CloudBackupPartPayload> {
  const parsed: unknown = JSON.parse(fileContent);
  const envelopeResult = v.safeParse(cloudBackupPartEnvelopeSchema, parsed);
  if (!envelopeResult.success) throw new Error('Invalid cloud backup part envelope.');
  const envelope = envelopeResult.output;
  if (envelope.backupId !== session.backupId || envelope.partId !== expected.partId || envelope.kind !== expected.kind) {
    throw new Error('Cloud backup part identity did not match its manifest reference.');
  }
  const plaintext = await decryptAesGcm(
    session.encryptionKey,
    fromBase64(envelope.payload),
    fromBase64(envelope.iv),
    partIdentity(envelope.backupId, envelope.partId, envelope.kind),
  );
  const payloadResult = v.safeParse(cloudBackupPartPayloadSchema, JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
  if (!payloadResult.success) throw new Error('Invalid decrypted cloud backup part.');
  const payload = payloadResult.output;
  if (payload.backupId !== envelope.backupId || payload.partId !== envelope.partId || payload.kind !== envelope.kind) {
    throw new Error('Decrypted cloud backup part identity did not match its envelope.');
  }
  return payload;
}

export async function encryptCloudBackupManifest(session: CloudBackupCryptoSession, manifest: CloudBackupManifestV1): Promise<string> {
  validateCloudBackupManifest(manifest);
  if (manifest.backupId !== session.backupId) throw new Error('Cloud backup manifest used the wrong backup id.');
  const iv = createAesGcmIv();
  const plaintext = new TextEncoder().encode(JSON.stringify(manifest));
  const ciphertext = await encryptAesGcm(session.encryptionKey, plaintext, iv);
  const envelope: ExportFileEnvelope = {
    header: buildExportFileHeader({
      payloadType: 'cloud-backup-manifest',
      algorithm: 'AES-GCM',
      wrappingMode: 'password',
      keyKind: 'export',
      keyReference: `cloud-backup:${manifest.backupId}`,
      salt: session.salt,
      iv,
      iterations: session.iterations,
      recordCount: manifest.recordCount,
      now: manifest.createdAt,
    }),
    payload: toBase64(ciphertext),
  };
  return serializeExportFile(envelope);
}

export async function decryptCloudBackupManifest(fileContent: string, password: string): Promise<DecryptedCloudBackupManifest> {
  const envelope = parseExportFile(fileContent);
  if (envelope.header.payloadType !== 'cloud-backup-manifest') throw new Error('Not a chunked cloud backup manifest.');
  const salt = fromBase64(envelope.header.salt);
  const encryptionKey = await deriveEncryptionKey(password, { salt, iterations: envelope.header.iterations });
  const plaintext = await decryptAesGcm(encryptionKey, fromBase64(envelope.payload), fromBase64(envelope.header.iv));
  const result = v.safeParse(cloudBackupManifestSchema, JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
  if (!result.success) throw new Error('Invalid decrypted cloud backup manifest.');
  validateCloudBackupManifest(result.output);
  if (
    envelope.header.keyReference !== `cloud-backup:${result.output.backupId}` ||
    envelope.header.recordCount !== result.output.recordCount
  ) {
    throw new Error('Cloud backup manifest header did not match its payload.');
  }
  return {
    manifest: result.output,
    session: {
      backupId: result.output.backupId,
      salt,
      iterations: envelope.header.iterations,
      encryptionKey,
    },
  };
}

export function isChunkedCloudBackupManifest(fileContent: string): boolean {
  try {
    return parseExportFile(fileContent).header.payloadType === 'cloud-backup-manifest';
  } catch {
    return false;
  }
}

export function validateCloudBackupManifest(manifest: CloudBackupManifestV1): void {
  const sorted = [...manifest.parts].sort((left, right) => left.restoreOrder - right.restoreOrder);
  const partIds = new Set<string>();
  const fileIds = new Set<number>();
  let metadataCount = 0;
  let recordCount = 0;
  let originalCount = 0;
  for (const [index, part] of sorted.entries()) {
    if (part.restoreOrder !== index) throw new Error('Cloud backup part ordering is incomplete.');
    if (partIds.has(part.partId) || fileIds.has(part.fileId)) throw new Error('Cloud backup manifest contains duplicate part references.');
    if (part.fileName !== cloudBackupPartFileName(manifest.backupId, part.restoreOrder, part.kind)) {
      throw new Error('Cloud backup manifest referenced an unexpected part filename.');
    }
    partIds.add(part.partId);
    fileIds.add(part.fileId);
    if (part.kind === 'metadata') metadataCount += 1;
    if (part.kind === 'records') recordCount += 1;
    if (part.kind === 'original') {
      originalCount += 1;
      if (!part.originalBlobId) throw new Error('Cloud backup original part omitted its blob id.');
    } else if (part.originalBlobId !== undefined) {
      throw new Error('Cloud backup non-original part included an original blob id.');
    }
  }
  if (metadataCount !== 1) throw new Error('Cloud backup manifest must contain one metadata part.');
  if (manifest.recordCount > 0 && recordCount === 0) throw new Error('Cloud backup manifest omitted record parts.');
  if (manifest.originalCount !== originalCount) throw new Error('Cloud backup original count did not match its parts.');
}

function assertPartIdentity(payload: CloudBackupPartPayload, backupId: string): void {
  if (payload.schemaVersion !== 1 || payload.backupId !== backupId || !payload.partId) {
    throw new Error('Cloud backup part identity is invalid.');
  }
}

function partIdentity(backupId: string, partId: string, kind: CloudBackupPartKind): Uint8Array {
  return new TextEncoder().encode(`${CLOUD_BACKUP_PART_MAGIC}\u0000${backupId}\u0000${partId}\u0000${kind}`);
}

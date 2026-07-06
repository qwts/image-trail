import * as v from 'valibot';
import type { AlbumBackupEntry } from '../albums-controller.js';
import { keyReferenceForKind } from '../crypto/types.schema.js';
import type { FullBackupBlobKeyBackup, FullBackupPayloadV1, PortableStoredBlobRecord } from './full-backup.js';

const nonNegativeNumber = v.pipe(v.number(), v.finite(), v.minValue(0));

/** Mirrors the former `isPortableStoredBlobRecord` guard: blob originals only. */
export const portableStoredBlobRecordSchema = v.object({
  id: v.string(),
  kind: v.literal('original'),
  schemaVersion: v.literal(1),
  algorithm: v.literal('AES-GCM'),
  iv: v.string(),
  ciphertext: v.string(),
  encryptedByteLength: nonNegativeNumber,
  createdAt: v.string(),
  key: keyReferenceForKind('blob'),
  referenceCount: nonNegativeNumber,
}) as v.GenericSchema<unknown, PortableStoredBlobRecord>;

export const fullBackupBlobKeyBackupSchema = v.object({
  keyReference: v.pipe(v.string(), v.startsWith('blob:')),
  fileContent: v.string(),
}) as v.GenericSchema<unknown, FullBackupBlobKeyBackup>;

export const albumBackupEntrySchema = v.object({
  id: v.string(),
  name: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  recordIds: v.pipe(v.array(v.string()), v.readonly()),
}) as v.GenericSchema<unknown, AlbumBackupEntry>;

/**
 * Envelope-level schema. `originalBlobs`/`blobKeyBackups` are validated element
 * by element (parity with the former hand-rolled guard); `bookmarks` are kept as
 * an array here and validated per entry downstream (`parseBookmarkEntries`) so a
 * single corrupt bookmark is skipped and reported, not fatal to the whole restore.
 * `missingOriginalBlobIds` defaults to `[]` when absent, matching the old code.
 * `albums` also defaults to `[]` so v1 full backups continue to import.
 */
export const fullBackupPayloadSchema = v.object({
  schemaVersion: v.union([v.literal(1), v.literal(2)]),
  bookmarks: v.pipe(v.array(v.unknown()), v.readonly()),
  albums: v.optional(v.pipe(v.array(albumBackupEntrySchema), v.readonly()), () => []),
  originalBlobs: v.pipe(v.array(portableStoredBlobRecordSchema), v.readonly()),
  blobKeyBackups: v.pipe(v.array(fullBackupBlobKeyBackupSchema), v.readonly()),
  // Non-essential list: coerce anything non-array to [] and filter junk entries down to
  // strings rather than failing the whole restore, matching the former lenient behavior.
  missingOriginalBlobIds: v.optional(
    v.pipe(
      v.unknown(),
      v.transform((value) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])),
      v.readonly(),
    ),
    () => [],
  ),
}) as v.GenericSchema<unknown, FullBackupPayloadV1>;

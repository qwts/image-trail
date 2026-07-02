import * as v from 'valibot';
import { keyReferenceForKind } from '../crypto/types.schema.js';
import { durableBookmarkPayloadSchema } from '../types.schema.js';
import type { FullBackupBlobKeyBackup, FullBackupBookmarkEntry, FullBackupPayloadV1, PortableStoredBlobRecord } from './full-backup.js';

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

/** Documents the canonical bookmark-entry shape; entries are validated per-item downstream with skip semantics. */
export const fullBackupBookmarkEntrySchema = v.object({
  uuid: v.string(),
  payload: durableBookmarkPayloadSchema,
}) as v.GenericSchema<unknown, FullBackupBookmarkEntry>;

/**
 * Envelope-level schema. `originalBlobs`/`blobKeyBackups` are validated element
 * by element (parity with the former hand-rolled guard); `bookmarks` are kept as
 * an array here and validated per entry downstream (`parseBookmarkEntries`) so a
 * single corrupt bookmark is skipped and reported, not fatal to the whole restore.
 * `missingOriginalBlobIds` defaults to `[]` when absent, matching the old code.
 */
export const fullBackupPayloadSchema = v.object({
  schemaVersion: v.literal(1),
  bookmarks: v.pipe(v.array(v.unknown()), v.readonly()),
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

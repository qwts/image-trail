import * as v from 'valibot';
import type {
  CloudBackupManifestV1,
  CloudBackupPartEnvelope,
  CloudBackupPartPayload,
  CloudBackupPartReference,
} from './chunked-cloud-backup.js';
import { albumBackupEntrySchema, fullBackupBlobKeyBackupSchema, portableStoredBlobRecordSchema } from './full-backup.schema.js';

const nonNegativeInteger = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0));
const positiveInteger = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1));
const sha256 = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));

export const cloudBackupPartReferenceSchema = v.object({
  partId: v.string(),
  kind: v.picklist(['metadata', 'records', 'original']),
  restoreOrder: nonNegativeInteger,
  fileId: positiveInteger,
  fileName: v.string(),
  sizeBytes: nonNegativeInteger,
  sha256,
  originalBlobId: v.optional(v.string()),
}) as v.GenericSchema<unknown, CloudBackupPartReference>;

export const cloudBackupManifestSchema = v.object({
  schemaVersion: v.literal(1),
  backupId: v.string(),
  createdAt: v.string(),
  recordCount: nonNegativeInteger,
  albumCount: nonNegativeInteger,
  originalCount: nonNegativeInteger,
  originalBytes: nonNegativeInteger,
  missingOriginalCount: nonNegativeInteger,
  parts: v.pipe(v.array(cloudBackupPartReferenceSchema), v.readonly()),
}) as v.GenericSchema<unknown, CloudBackupManifestV1>;

export const cloudBackupPartEnvelopeSchema = v.object({
  magic: v.literal('IMAGE-TRAIL-CLOUD-PART'),
  formatVersion: v.literal(1),
  backupId: v.string(),
  partId: v.string(),
  kind: v.picklist(['metadata', 'records', 'original']),
  iv: v.string(),
  payload: v.string(),
}) as v.GenericSchema<unknown, CloudBackupPartEnvelope>;

const partBase = {
  schemaVersion: v.literal(1),
  backupId: v.string(),
  partId: v.string(),
};

export const cloudBackupPartPayloadSchema = v.variant('kind', [
  v.object({
    ...partBase,
    kind: v.literal('metadata'),
    albums: v.pipe(v.array(albumBackupEntrySchema), v.readonly()),
    blobKeyBackups: v.pipe(v.array(fullBackupBlobKeyBackupSchema), v.readonly()),
    missingOriginalBlobIds: v.pipe(v.array(v.string()), v.readonly()),
  }),
  v.object({
    ...partBase,
    kind: v.literal('records'),
    bookmarks: v.pipe(v.array(v.unknown()), v.readonly()),
  }),
  v.object({
    ...partBase,
    kind: v.literal('original'),
    originalBlob: portableStoredBlobRecordSchema,
  }),
]) as v.GenericSchema<unknown, CloudBackupPartPayload>;

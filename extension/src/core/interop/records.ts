import * as v from 'valibot';
import {
  interopFieldRevisionsSchema,
  interopIdentitySchema,
  interopProductSchema,
  interopRevisionVectorSchema,
  interopTimestampSchema,
  interopUuidSchema,
  sha256Schema,
} from './contract.js';
import { interopJsonObjectSchema } from './json.js';

const positiveIntegerSchema = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1));
const nonNegativeIntegerSchema = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0));
const nonEmptyStringSchema = v.pipe(v.string(), v.minLength(1));

export const interopDimensionsSchema = v.strictObject({
  width: positiveIntegerSchema,
  height: positiveIntegerSchema,
});

export const interopTimestampsSchema = v.strictObject({
  bookmarkedAt: v.nullable(interopTimestampSchema),
  capturedAt: v.nullable(interopTimestampSchema),
  downloadedAt: v.nullable(interopTimestampSchema),
  takenAt: v.nullable(interopTimestampSchema),
  importedAt: v.nullable(interopTimestampSchema),
});

const availableBlobSchema = v.strictObject({
  state: v.literal('available'),
  blobId: nonEmptyStringSchema,
  mimeType: nonEmptyStringSchema,
  byteLength: nonNegativeIntegerSchema,
  contentHash: sha256Schema,
});

const unavailableBlobSchema = v.strictObject({
  state: v.picklist(['metadata-only', 'unavailable']),
  blobId: v.null(),
  mimeType: v.nullable(nonEmptyStringSchema),
  byteLength: v.nullable(nonNegativeIntegerSchema),
  contentHash: v.nullable(sha256Schema),
  reason: v.picklist(['not-captured', 'missing', 'provider-unavailable', 'unsupported-format']),
});

export const interopBlobReferenceSchema = v.variant('state', [availableBlobSchema, unavailableBlobSchema]);

export const interopRoundTripMetadataSchema = v.strictObject({
  imageTrail: interopJsonObjectSchema,
  overlook: interopJsonObjectSchema,
});

export const interopRecordSchema = v.strictObject({
  schemaVersion: v.literal(1),
  identity: interopIdentitySchema,
  revision: interopRevisionVectorSchema,
  fieldRevisions: interopFieldRevisionsSchema,
  recordKind: v.picklist(['web-bookmark', 'photo']),
  title: v.nullable(nonEmptyStringSchema),
  label: v.nullable(nonEmptyStringSchema),
  sourceUrl: v.nullable(v.pipe(v.string(), v.url())),
  dimensions: v.nullable(interopDimensionsSchema),
  timestamps: interopTimestampsSchema,
  sourceCompatibility: v.nullable(nonEmptyStringSchema),
  original: interopBlobReferenceSchema,
  thumbnail: interopBlobReferenceSchema,
  albumIds: v.array(interopUuidSchema),
  roundTripMetadata: interopRoundTripMetadataSchema,
  deletedAt: v.nullable(interopTimestampSchema),
});

export const interopAlbumMemberSchema = v.strictObject({
  recordInteropId: interopUuidSchema,
  position: nonNegativeIntegerSchema,
  revision: interopRevisionVectorSchema,
});

export const interopAlbumSchema = v.strictObject({
  schemaVersion: v.literal(1),
  interopId: interopUuidSchema,
  origin: v.strictObject({
    product: interopProductSchema,
    localId: nonEmptyStringSchema,
  }),
  revision: interopRevisionVectorSchema,
  name: nonEmptyStringSchema,
  members: v.array(interopAlbumMemberSchema),
  roundTripMetadata: interopRoundTripMetadataSchema,
  deletedAt: v.nullable(interopTimestampSchema),
});

export type InteropBlobReference = v.InferOutput<typeof interopBlobReferenceSchema>;
export type InteropRecord = v.InferOutput<typeof interopRecordSchema>;
export type InteropAlbum = v.InferOutput<typeof interopAlbumSchema>;

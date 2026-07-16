import * as v from 'valibot';
import { interopReviewCategorySchema } from '../core/interop/contract.js';
import { interopAlbumSchema, interopRecordSchema } from '../core/interop/records.js';
import type { Assert, MutuallyAssignable } from '../core/schema-assert.js';
import { storedOriginalReferenceSchema } from '../core/image/capture-result.schema.js';
import { encryptionAlgorithmSchema, keyReferenceForKind } from './crypto/types.schema.js';
import type {
  DurableBookmarkPayloadV1,
  DurableDownloadPayloadV1,
  DurableEncryptedPinPayloadV1,
  DurableHistoryPayloadV1,
  ProtectedPinRelationshipV1,
  StoredBlobRecord,
} from './types.js';

export const storedBlobRecordSchema = v.object({
  id: v.string(),
  kind: v.picklist(['original', 'thumbnail']),
  schemaVersion: v.literal(1),
  algorithm: encryptionAlgorithmSchema,
  iv: v.string(),
  ciphertext: v.instance(ArrayBuffer),
  encryptedByteLength: v.number(),
  createdAt: v.string(),
  key: keyReferenceForKind('blob'),
  referenceCount: v.number(),
}) as v.GenericSchema<unknown, StoredBlobRecord>;

export const protectedPinRelationshipSchema = v.object({
  schemaVersion: v.literal(1),
  plainPinId: v.string(),
  encryptedPinId: v.optional(v.string()),
  encryptedThumbnailId: v.optional(v.string()),
  storedOriginalBlobId: v.optional(v.string()),
  queueUpdatedAt: v.string(),
  hasEncryptedMetadata: v.boolean(),
  hasEncryptedThumbnail: v.boolean(),
  hasStoredOriginal: v.boolean(),
});

export const durableHistoryPayloadSchema = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  label: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  capturedAt: v.string(),
  captureStatus: v.picklist(['remote-only', 'downloaded', 'failed']),
  storedOriginal: v.optional(storedOriginalReferenceSchema),
});

export const durableBookmarkPayloadSchema = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  label: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  bookmarkedAt: v.string(),
  downloadedAt: v.optional(v.string()),
  capturedAt: v.optional(v.string()),
  sourceCompatibility: v.optional(v.literal('favorites')),
  storedOriginal: v.optional(storedOriginalReferenceSchema),
  protectedPin: v.optional(protectedPinRelationshipSchema),
  interop: v.optional(
    v.object({
      schemaVersion: v.literal(1),
      record: interopRecordSchema,
      albums: v.pipe(v.array(interopAlbumSchema), v.readonly()),
      reviewCategory: interopReviewCategorySchema,
    }),
  ),
});

export const durableEncryptedPinPayloadSchema = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  label: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  bookmarkedAt: v.string(),
  downloadedAt: v.optional(v.string()),
  capturedAt: v.optional(v.string()),
  sourceCompatibility: v.optional(v.literal('favorites')),
  storedOriginal: v.optional(storedOriginalReferenceSchema),
  thumbnailId: v.optional(v.string()),
});

export const durableDownloadPayloadSchema = v.object({
  sourceUrl: v.string(),
  filename: v.string(),
  originalFilename: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  byteLength: v.optional(v.number()),
  fingerprint: v.optional(v.string()),
  downloadedAt: v.string(),
  sourceRecordUuid: v.optional(v.string()),
  fileFormatVersion: v.optional(v.number()),
});

type _AssertProtectedPinRelationship = Assert<
  MutuallyAssignable<v.InferOutput<typeof protectedPinRelationshipSchema>, ProtectedPinRelationshipV1>
>;
type _AssertDurableHistoryPayload = Assert<MutuallyAssignable<v.InferOutput<typeof durableHistoryPayloadSchema>, DurableHistoryPayloadV1>>;
type _AssertDurableBookmarkPayload = Assert<
  MutuallyAssignable<v.InferOutput<typeof durableBookmarkPayloadSchema>, DurableBookmarkPayloadV1>
>;
type _AssertDurableEncryptedPinPayload = Assert<
  MutuallyAssignable<v.InferOutput<typeof durableEncryptedPinPayloadSchema>, DurableEncryptedPinPayloadV1>
>;
type _AssertDurableDownloadPayload = Assert<
  MutuallyAssignable<v.InferOutput<typeof durableDownloadPayloadSchema>, DurableDownloadPayloadV1>
>;

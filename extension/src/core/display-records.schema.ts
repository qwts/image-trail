import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from './schema-assert.js';
import { captureStatusSchema, storedOriginalReferenceSchema } from './image/capture-result.schema.js';
import type { ImageDisplayRecord } from './display-records.js';

export const imageDisplayRecordSchema = v.object({
  id: v.string(),
  url: v.string(),
  title: v.optional(v.string()),
  label: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  timestamp: v.string(),
  queueUpdatedAt: v.optional(v.string()),
  pinnedAt: v.optional(v.string()),
  pinnedRecordId: v.optional(v.string()),
  downloadedAt: v.optional(v.string()),
  capturedAt: v.optional(v.string()),
  source: v.optional(v.picklist(['history', 'bookmark', 'favorites'])),
  captureStatus: v.optional(captureStatusSchema),
  blobId: v.optional(v.string()),
  storedOriginal: v.optional(storedOriginalReferenceSchema),
  pinSaveStorage: v.optional(
    v.object({
      destination: v.picklist(['encrypted', 'plaintext']),
      reason: v.optional(v.picklist(['setting', 'locked', 'unavailable', 'failed'])),
    }),
  ),
  privacyStatus: v.optional(v.picklist(['locked', 'unlocked'])),
  protectedPin: v.optional(
    v.object({
      plainPinId: v.string(),
      encryptedPinId: v.optional(v.string()),
      encryptedThumbnailId: v.optional(v.string()),
      storedOriginalBlobId: v.optional(v.string()),
      hasEncryptedMetadata: v.boolean(),
      hasEncryptedThumbnail: v.boolean(),
      hasStoredOriginal: v.boolean(),
    }),
  ),
});

type _AssertImageDisplayRecord = Assert<MutuallyAssignable<v.InferOutput<typeof imageDisplayRecordSchema>, ImageDisplayRecord>>;
